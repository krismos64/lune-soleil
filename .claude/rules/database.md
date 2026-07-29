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
sans verrou explicite.

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
- **Un panier à plusieurs variantes les traite par identifiant croissant.** Le
  verrou implicite est tenu jusqu'au `COMMIT` : deux paniers portant les mêmes
  pièces dans un ordre opposé s'interbloquent. Reproduit sur PostgreSQL 18,
  `docs/prototypes/interblocage-panier.sh`. Trier rend l'ordre de prise
  identique pour tous, et l'un attend au lieu de bloquer.
- Traiter malgré tout l'erreur `40P01` : un interblocage reste possible avec une
  transaction concurrente qui touche les mêmes lignes par un autre chemin. La
  réponse est de rejouer, jamais d'ignorer.

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
        evenement_fournisseur.identifiant_fournisseur, verrou_tache.nom,
        jeton_acces.empreinte, media.identifiant_fournisseur, utilisateur.email
CHECK   quantite_physique >= 0
CHECK   quantite_reservee >= 0
CHECK   quantite_physique - quantite_reservee >= 0
CHECK   ligne_commande.quantite > 0
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
UNIQUE paiement (commande_id)                    WHERE statut IN ('REUSSI',
                                                    'PARTIELLEMENT_REMBOURSE',
                                                    'REMBOURSE')
UNIQUE mouvement_stock (commande_id, variante_id) WHERE type = 'VENTE_WEB'
UNIQUE facture (commande_id)
UNIQUE journal_email (commande_id, modele)        WHERE statut = 'ENVOYE'
                                                    AND origine IN ('SYSTEME','RECONCILIATION')
UNIQUE media (produit_id)                         WHERE ordre = 1
```

La clé du mouvement porte **la variante et pas seulement la commande**. Un panier
à deux articles décrémente deux variantes, donc produit deux mouvements. Une
unicité sur la seule commande rendrait tout panier multi-articles impossible à
confirmer.

La clé du paiement porte **les trois états d'encaissement et non le seul
`REUSSI`**, correction de LS-45. Un remboursement ne rend pas la commande
impayée : filtrer sur `REUSSI` seul laissait le paiement sortir du filtre en
passant à `PARTIELLEMENT_REMBOURSE`, et un second `REUSSI` redevenait insérable.
Mesuré sur PostgreSQL 18.4, 3220 centimes encaissés sur une commande de 1610.
Ne jamais raccourcir ce prédicat, y compris si un état est ajouté à l'enum :
un état d'encaissement de plus doit entrer dans le filtre.

La clé de l'email porte trois conditions, corrigées par LS-13 : `statut = 'ENVOYE'`
laisse la retentative possible après un échec, règle E4, `RECONCILIATION` ferme le
second chemin de la décision D, et exclure `ADMIN` laisse passer le renvoi
manuel après échec, prévu au parcours 1.

**Cette clé protège la base, pas l'appel au fournisseur.** Si le fournisseur
envoie l'email et que le processus tombe avant d'écrire la ligne `ENVOYE`, la
reprise ne trouve rien qui la bloque et le client reçoit un doublon. Le
mécanisme qui ferme ce trou, outbox transactionnelle ou clé d'idempotence
fournisseur, est à décider en **LS-51**, avant la phase 4. Ne pas coder l'envoi
d'email en supposant l'index suffisant.

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
7. Dépôt d'un avis : création de l'avis et consommation de l'invitation, le jeton
   passant à utilisé dans la même transaction. Sans cela, un jeton rejoué crée un
   second avis sur la même ligne de commande
8. Renvoi d'une invitation d'avis : **révocation de l'ancien jeton** par
   `revoqueA`, insertion du nouveau **avant** la mise à jour de
   `InvitationAvis.jetonAccesId`, et incrément de `nombreEnvois`, quatre
   écritures. `dernierEnvoiA` est renseigné **après**, hors transaction, l'envoi
   d'email ne pouvant pas y appartenir
9. Choix d'une adresse par défaut dans le carnet : retirer le drapeau de
   l'ancienne **avant** de le poser sur la nouvelle
10. Suppression d'un compte : marquer `Commande.dissocieA` sur ses commandes
    **avant** de supprimer le compte, puis laisser les politiques de clé
    étrangère traiter les six autres références qui en portent une,
    `ReponseAvis.auteurId` étant en `RESTRICT` assumé

Les points 7 à 9 viennent du périmètre ajouté par LS-37, avis et carnet
d'adresses. Le point 10 vient de LS-41.

**Le point 10 existe parce qu'une politique de clé étrangère ne sait pas écrire
un champ.** `ON DELETE SET NULL` remet `Commande.utilisateurId` à nul, il ne
renseigne pas `dissocieA`. Une commande dissociée sans ce marquage redevient
« sans propriétaire », donc éligible au rattachement du parcours 6 : l'historique
et les factures d'un client parti rouvriraient à quiconque contrôle ensuite la
même adresse email. L'ordre est imposé, marquer après suppression est impossible
puisque le lien a disparu.

`nombreEnvois` compte les **tentatives**, pas les succès : il est incrémenté
avant l'appel au fournisseur et sert à borner le renvoi. La preuve d'envoi vit
dans `JournalEmail`, jamais dans ces deux champs. En cas de divergence, le
journal a raison.

**Révoquer un jeton renseigne `revoqueA`, jamais `utiliseA`.** Ce dernier signifie
que l'action a eu lieu, l'avis déposé : un jeton révoqué marqué consommé ferait
afficher « avis déjà déposé » à un client qui n'a rien déposé. Un jeton valide
n'est ni expiré, ni consommé, ni révoqué, les trois conditions ensemble.

L'ordre du point 8 compte aussi, pour une autre raison que le point 9. Le nouveau
jeton s'insère avant la mise à jour du pointeur, sinon la clé étrangère échoue.
Aucun ordre ne produit ici de violation d'unicité, le nouveau jeton n'étant
référencé par personne avant l'`UPDATE`.

**La révocation de l'ancien jeton du point 8 n'est pas une précaution contre une
panne, elle ferme le chemin nominal.** `JetonAcces` est une entité propre avec sa
propre expiration : remplacer `InvitationAvis.jetonAccesId` ne touche pas
l'ancienne ligne, qui reste valide et non consommée jusqu'à son terme. Un client
qui demande un renvoi le 10 août parce qu'il ne retrouve plus le premier email
laisse un jeton actif jusqu'au 24. Sur une boîte partagée ou un poste familial,
le premier lien dépose l'avis à sa place, la vérification portant sur une
empreinte toujours valide. Chaque renvoi réussi produit cet orphelin tant que
l'ancien jeton n'est pas révoqué dans la même transaction.

L'ordre du point 9 n'est pas un détail de style. Un index unique est vérifié
**ligne à ligne**, pas en fin de transaction. Poser le nouveau drapeau avant de
retirer l'ancien produit une erreur d'unicité qui avorte la transaction : le
client ne peut plus changer son adresse par défaut.

Regrouper les deux en une seule instruction ne sauve pas. La vérification portant
sur chaque ligne écrite et non sur l'instruction, un
`UPDATE ... SET est_par_defaut = (id = :cible)` réussit ou échoue selon l'ordre
de parcours des lignes : il passe quand l'ancienne adresse par défaut est écrite
avant la nouvelle, il lève une violation d'unicité dans le cas contraire.
Vérifié sur PostgreSQL 18.4, la même instruction réussit dans un sens de bascule
et échoue dans l'autre.

Une instruction qui marche en développement et casse en production selon l'ordre
physique des lignes est plus dangereuse qu'une instruction qui échoue toujours.

Une contrainte `DEFERRABLE INITIALLY DEFERRED` lèverait la question, mais un
index partiel se crée par `CREATE UNIQUE INDEX` et un index ne se diffère pas,
seule une contrainte le peut. L'ordre des écritures est donc la seule parade,
ce qui la rend non contournable. Même piège que la permutation de rangs de
médias.

## Types

Euro en **centimes entiers**, jamais de flottant. Horodatage en UTC, converti
sur Europe/Paris à l'affichage seulement. Identifiants techniques non
prédictibles, distincts des numéros métier lisibles. Email normalisé pour les
rapprochements mais jamais utilisé comme clé technique.

**La fiscalité tient dans un seul champ**, `Commande.montantTaxeCentimes`, en
centimes entiers comme tout montant. Il vaut zéro : l'entreprise est en franchise
en base de TVA, article 293 B du CGI.

Il n'existe **ni taux, ni booléen d'inclusion de taxe**, et il ne faut pas en
ajouter. La mention obligatoire sur les documents est textuelle, portée par
l'instantané légal de la facture, voir `payments.md`.

Un franchissement futur du seuil devient un paramétrage, pas une migration de
données historiques.

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
