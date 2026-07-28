---
paths:
  - "prisma/**"
  - "src/repositories/**/*.ts"
  - "src/services/**/*.ts"
---

# Base de données, transactions et stock

PostgreSQL 18, Prisma 7. Vérifier la documentation Prisma 7 via Context7 avant
d'utiliser une API : c'est une majeure récente.

## Réservation de stock, le point le plus critique du modèle

La variante porte une `quantiteReservee` dénormalisée, protégée par une
contrainte de base. La réservation se fait en **une seule instruction atomique**,
sans verrou explicite ni risque d'interblocage.

```sql
UPDATE variante
SET quantite_reservee = quantite_reservee + :qte
WHERE id = :variante
  AND archivee_a IS NULL
  AND vente_web_activee = true
  AND quantite_physique - quantite_reservee >= :qte
RETURNING id;
```

`archivee_a IS NULL` fait partie de la condition, pas d'une lecture préalable.
Entre une lecture et l'écriture, l'archivage peut survenir : un client ayant la
fiche ouverte réserverait alors une pièce retirée du catalogue.

Aucune ligne retournée signifie un refus métier explicite, présenté sans jargon
technique au client.

Règles associées :

- La ligne de réservation avec sa date d'expiration est insérée **dans la même
  transaction**.
- La contrainte `CHECK` en base est la dernière ligne de défense si le code
  échoue.
- Libérer une réservation expirée décrémente la quantité réservée et supprime la
  ligne dans une transaction unique.
- Convertir une réservation en vente crée le mouvement, décrémente la quantité
  physique et la quantité réservée, dans la même transaction.
- Le niveau `READ COMMITTED` suffit : le verrou de ligne implicite de l'`UPDATE`
  conditionnel garantit l'exclusion mutuelle.

## Une variante ne se supprime jamais

Elle s'archive, `archivee_a` renseignée. Supprimer une variante libérerait sa
référence, qui pourrait être réattribuée à une autre pièce : les avis et les
statistiques de l'ancienne remonteraient alors sur la nouvelle.

Deux drapeaux d'indisponibilité coexistent et ne se remplacent pas.
`vente_web_activee` est opérationnel et réversible, le temps d'un marché.
`archivee_a` est catalogue et définitif.

**Archivée l'emporte toujours** : une variante archivée n'est ni réservable ni
achetable en ligne quelle que soit la valeur de `vente_web_activee`. Elle reste
vendable en main propre, son stock physique existant toujours.

Archiver ne crée aucun mouvement de stock, et l'archivage est refusé tant qu'une
réservation active existe, même règle que pour la vente externe.

## Stock physique et vente web

Deux notions distinctes, à ne jamais confondre.

Stock disponible à la vente web = 0 si la vente web est désactivée, sinon
quantité physique moins réservations actives, jamais sous zéro.

Suspendre la vente web **ne crée aucun mouvement de stock**. Seule une vente
réelle, web ou externe, décrémente la quantité physique.

Une vente externe est **refusée** tant qu'une réservation active existe sur la
variante. L'administratrice peut annuler explicitement la réservation après
confirmation. Sans cette règle, une pièce vendue sur un marché pendant qu'un
client paie en ligne produit une commande payée sans stock.

## Contraintes minimales attendues

```
UNIQUE  produit.slug, categorie.slug, variante.reference, commande.numero,
        facture.numero, avoir.numero, facture.commande_id,
        evenement_webhook.identifiant_fournisseur, verrou_tache.nom,
        jeton_acces.empreinte, media.identifiant_fournisseur, utilisateur.email
CHECK   quantite_physique >= 0
CHECK   quantite_reservee >= 0
CHECK   quantite_physique - quantite_reservee >= 0
CHECK   quantite_ligne > 0
CHECK   facture.montant_avoir_centimes <= facture.montant_total_centimes
INDEX   statut, date, utilisateur, commande, reference, expiration
```

## Unicités partielles, l'idempotence porte sur l'effet

**L'unicité de l'identifiant d'événement Stripe ne suffit pas.** Elle protège du
rejeu du même événement, pas du croisement entre le webhook et la réconciliation,
qui sont deux chemins d'entrée distincts vers le même effet métier.

Le scénario, démontré en LS-12 : la réconciliation régularise une commande au
bout de soixante minutes, puis le webhook arrive enfin, retardé chez le
prestataire. Son identifiant n'a jamais été vu, rien ne le rejette, il recrée le
mouvement de stock. Sur une variante à plusieurs exemplaires, aucune erreur ne se
déclenche et le stock est faux en silence.

Quatre clés, chacune sur un effet de l'étape de confirmation :

```
UNIQUE paiement (commande_id)                    WHERE statut = 'REUSSI'
UNIQUE mouvement_stock (commande_id, variante_id) WHERE type = 'VENTE_WEB'
UNIQUE facture (commande_id)
UNIQUE journal_email (commande_id, modele)        WHERE origine = 'SYSTEME'
UNIQUE media (produit_id)                         WHERE ordre = 1
```

La clé du mouvement porte **la variante et pas seulement la commande**. Un panier
à deux articles décrémente deux variantes, donc produit deux mouvements. Une
unicité sur la seule commande rendrait tout panier multi-articles impossible à
confirmer.

La clé de l'email filtre sur `origine = SYSTEME` pour laisser passer le renvoi
manuel après échec, prévu au parcours 1.

Référence : `docs/architecture/MODELE-CONCEPTUEL.md`, décision D.

Toute relation possédée porte une clé étrangère avec politique de suppression
explicite. L'archivage remplace la suppression destructive.

## Transactions critiques

Ces opérations exigent une transaction, sans exception :

1. Réservation concurrente du dernier exemplaire
2. Traitement d'un événement de paiement : idempotence, paiement, commande,
   conversion de réservation, mouvement de stock
3. Attribution d'un numéro de facture ou d'avoir
4. Remboursement, avoir et réintégration de stock
5. Vente externe avec contrôle de réservation active
6. Rattachement d'une commande sans compte à un compte vérifié

## Types

Euro en **centimes entiers**, jamais de flottant. Horodatage en UTC, converti
sur Europe/Paris à l'affichage seulement. Identifiants techniques non
prédictibles, distincts des numéros métier lisibles. Email normalisé pour les
rapprochements mais jamais utilisé comme clé technique.

Les champs fiscaux (`taxRate`, `taxAmount`, `priceIncludesTax`) existent et
valent zéro : l'entreprise est en franchise en base de TVA. Un franchissement
futur du seuil devient un paramétrage, pas une migration de données historiques.

## Numérotation comptable

Deux séquences distinctes, factures et avoirs. Numéro attribué **au moment de la
création, dans la transaction**, jamais réservé à l'avance. Aucun numéro réutilisé,
aucun trou créé par une opération normale. Une facture n'est créée qu'après
confirmation du paiement.

## Migrations

Générées et revues en développement, appliquées en préproduction puis en
production. Jamais de synchronisation de schéma sans migration.

Une migration destructive se fait en deux temps : ajouter avant de supprimer,
déployer le code compatible, migrer les données, retirer l'ancien schéma dans une
version ultérieure. Le retour à une image précédente ne répare pas une migration
destructive.

Sauvegarde systématique avant toute migration de production.

**Les migrations de production passent par `./scripts/migrate-production.sh`**,
jamais par `prisma migrate deploy` appelé directement.

Ce script porte deux garde-fous automatiques : une sauvegarde vérifiée avant
toute migration, et l'arrêt sur détection d'une instruction destructive (`DROP`,
`TRUNCATE`, `DELETE FROM`, renommage), qui exige alors `--confirm-destructive`.

Une migration additive passe seule. Une migration destructive demande un accord
explicite, parce qu'elle ne se répare pas par un retour arrière.

## SQL brut

Limité aux cas où l'ORM ne suffit pas, en particulier l'`UPDATE` conditionnel de
réservation. Toujours paramétré, relu et couvert par un test de concurrence.
