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

- **La commande, ses lignes et ses réservations s'écrivent dans une seule
  transaction**, ADR-024. `Reservation.commandeId` est obligatoire : une
  réservation sans commande n'existe pas en base. Un refus de l'`UPDATE`
  conditionnel annule la transaction entière, aucune commande ne subsiste sans
  son stock.
- **La session de paiement se crée après le `COMMIT`, jamais dedans.** Un appel
  réseau à l'intérieur tiendrait le verrou de ligne pendant tout
  l'aller-retour, et son échec effacerait la commande par rollback. Après le
  commit, un échec laisse une commande `EN_ATTENTE_PAIEMENT` que la
  réconciliation traite normalement.
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
  identique pour tous, et l'un attend au lieu de bloquer. Porté par
  `ordonnerLignes` dans `src/services/reservation.ts`, LS-50, avec une
  comparaison binaire et non `localeCompare`, dont l'ordre dépend de la locale.
- Traiter malgré tout l'interblocage : il reste possible avec une transaction
  concurrente qui touche les mêmes lignes par un autre chemin. La réponse est de
  rejouer, jamais d'ignorer, et le rejeu est **borné**, trois tentatives.
  **Trois formes désignent le même événement** : `40P01` rendu par le pilote
  `pg`, `P2034` par l'API typée de Prisma, et `P2010` par une requête **brute**,
  qui enfouit le `40P01` dans `meta.driverAdapterError.cause.code`. La
  réservation passant par `$queryRawUnsafe`, **c'est la troisième forme qu'elle
  reçoit** : ne tester que les deux premières rend le rejeu inatteignable.
  Ne pas traiter `P2010` seul comme un interblocage, il couvre toute erreur de
  requête brute : c'est le `40P01` imbriqué qui décide.
- **Un refus métier sort de la transaction par une exception, jamais par un
  `return`.** `$transaction` valide dès que la fonction rend une valeur et
  n'annule que si elle lève. Un `return` laisse committer les lignes déjà
  réservées, gelant une pièce disponible pour une commande refusée.

## Verrou de tâche planifiée, LS-72

Deux tâches tourneront : la libération des réservations expirées toutes les cinq
minutes, la réconciliation des paiements tous les quarts d'heure. Sans verrou,
deux instances les exécuteraient simultanément, et **pour la libération cela
décrémenterait `quantiteReservee` deux fois** : du stock disparaîtrait sans
qu'aucune vente ne l'explique.

**La prise de verrou tient en une seule instruction**, même principe que
l'`UPDATE` conditionnel de réservation :

```sql
INSERT INTO verrou_tache (id, nom, acquis_a, expire_a)
VALUES ($1, $2, now(), now() + make_interval(secs => $3::double precision))
ON CONFLICT (nom) DO UPDATE
  SET id = EXCLUDED.id, acquis_a = EXCLUDED.acquis_a, expire_a = EXCLUDED.expire_a
  WHERE verrou_tache.expire_a < now()
RETURNING id
```

Le `WHERE` du `DO UPDATE` est le cœur : il n'écrase un verrou existant **que
s'il a expiré**. Le retirer laisse la reprise d'un verrou expiré fonctionner,
donc les tests naïfs restent verts, pendant que le verrou ne protège plus rien.

**`now()` est l'horloge de PostgreSQL, jamais celle de Node.** Deux conteneurs
dont les horloges dérivent compareraient des instants incomparables, et la
fenêtre de reprise s'ouvrirait trop tôt sur l'un d'eux.

**Le relâchement porte sur le jeton du détenteur**, `WHERE nom = $1 AND id = $2`.
Sans cette condition, une instance en retard dont le verrou a expiré supprimerait
le verrou de sa remplaçante, qui continuerait à travailler en croyant l'avoir :
deux exécutions simultanées, exactement ce que la table empêche.

**Le relâchement vit dans un `finally`.** Une tâche qui lève garderait sinon son
verrou jusqu'à l'expiration, et une exception récurrente bloquerait la tâche pour
toujours, chaque cycle reprenant le verrou pour ré-échouer.

**La durée du verrou n'est pas la période de la tâche.** Elle borne le temps
pendant lequel une instance morte bloque la suivante : nettement supérieure à la
durée d'exécution normale, et inférieure à plusieurs périodes. Dix minutes pour
une tâche qui tourne toutes les cinq minutes et s'exécute en quelques secondes.

**Ne pas exécuter la tâche si la prise de verrou échoue** (base injoignable) :
sauter un cycle est sans conséquence, exécuter sans verrou rouvre la double
exécution.

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

## Une vente externe porte toujours son montant

`mouvement_stock.prix_unitaire_fige_centimes` est **obligatoire sur
`VENTE_EXTERNE`**, garanti par `chk_mouvement_vente_externe_prix`. C'est le prix
réellement encaissé sur le marché, remise comprise, figé au moment de la vente.

```sql
CHECK (type <> 'VENTE_EXTERNE' OR prix_unitaire_fige_centimes IS NOT NULL)
```

**Ne jamais reconstruire ce montant depuis `variante.prix_centimes`.** C'est le
prix actuel du catalogue : l'utiliser pour une vente passée viole l'invariant 3,
au même titre que recalculer une facture depuis le catalogue. Une révision de prix
gonflerait rétroactivement le chiffre d'affaires d'un mois clos, et une remise de
stand n'apparaît jamais au catalogue.

Le total encaissé vaut `quantite * prix_unitaire_fige_centimes`, il n'est **pas**
stocké : deux colonnes de la même ligne. Même motif que le total de ligne écarté
de `ligne_commande`, un montant redondant se désynchronise sans qu'aucune
contrainte ne le détecte.

**La contrainte est une implication, pas une équivalence**, contrairement aux deux
`CHECK` de mode de livraison d'ADR-025. Un prix reste légitime sur un `RETOUR` ou
un `AJUSTEMENT` : c'est ce qui rend possible le mouvement compensateur qui corrige
une vente externe erronée, un mouvement de stock étant immuable. Ne pas
« resserrer » cette contrainte en équivalence, cela casserait la correction.

## Un mouvement ne se compense qu'une fois, S15 et ADR-030

Une vente externe erronée se corrige par un mouvement **inverse**, jamais par une
modification : S4 rend le journal immuable. La règle S14 le dit depuis LS-63,
sans rien dire de la **répétition** de cette correction.

`mouvement_stock.compense_id` porte le lien vers le mouvement corrigé, et un
index unique partiel le rend unique :

```sql
CREATE UNIQUE INDEX mouvement_compense_unique ON mouvement_stock (compense_id) WHERE compense_id IS NOT NULL;
```

Sans lui, un double clic ou deux onglets ouverts font remonter le stock de deux
pièces là où une seule était partie, et le journal porte deux corrections en
apparence légitimes. **La garantie vient de la base** : deux corrections
simultanées ne peuvent pas passer toutes les deux, là où un contrôle applicatif
les laisserait passer entre son `SELECT` et son `INSERT`.

**Le prédicat n'est pas une garantie fonctionnelle ici**, et l'affirmer serait
faux : PostgreSQL traite les `NULL` comme distincts, donc un index sans `WHERE`
rejetterait exactement les mêmes lignes. Mesuré le 18 août 2026, une mutation le
retirant n'a fait rougir aucun contrôle. Sa vertu est d'éviter d'indexer pour
rien un journal qui ne fait que croître. Savoir ce qu'un prédicat garantit
**avant** d'écrire un contrôle qui prétend le vérifier.

Le compensateur est de type `RETOUR`, porte le même prix figé que l'original et
un `motif` obligatoire. **Un compensateur ne se compense pas** : la chaîne
s'arrête à un maillon, le service le refuse.

## Un inventaire constate, il ne contrôle pas les réservations

L'ajustement d'inventaire ne porte **aucun** contrôle applicatif de réservation,
contrairement à la vente externe, et l'asymétrie est voulue : un inventaire
constate la réalité physique, refuser de l'enregistrer parce qu'un client paie
obligerait à mentir sur le stock réel.

`chk_variante_pas_de_survente` rattrape le seul cas dangereux, un physique
passant sous les réservations. **Son refus doit être traduit en valeur**, jamais
laissé remonter en exception : l'exploitante lirait « opération indisponible » au
lieu de comprendre qu'un paiement est en cours sur une pièce qu'elle ne retrouve
pas. La détection porte sur le **nom de la contrainte**, `P2010` couvrant toute
erreur de requête brute.

Détail et arbitrage dans `docs/architecture/MODELE-CONCEPTUEL.md`, domaine 2, et
règles de calcul dans `docs/architecture/STATISTIQUES.md`.

## Contraintes minimales attendues

```
UNIQUE  produit.slug, categorie.slug, variante.reference, commande.numero,
        facture.numero, avoir.numero, facture.commande_id,
        evenement_fournisseur.identifiant_fournisseur, verrou_tache.nom,
        jeton_acces.empreinte, media.identifiant_fournisseur, utilisateur.email
UNIQUE  categorie.ordre                          DEFERRABLE INITIALLY DEFERRED, C24
CHECK   categorie.ordre >= 1
CHECK   length(trim(categorie.nom)) > 0
CHECK   quantite_physique >= 0
CHECK   quantite_reservee >= 0
CHECK   quantite_physique - quantite_reservee >= 0
CHECK   ligne_commande.quantite > 0
CHECK   facture.montant_avoir_centimes <= facture.montant_total_centimes
CHECK   type <> 'VENTE_EXTERNE' OR prix_unitaire_fige_centimes IS NOT NULL
CHECK   commande.total_centimes = sous_total_centimes
                               + frais_port_centimes + montant_taxe_centimes, C28
CHECK   compteur_numero.dernier >= 1, C27
PK      compteur_numero (type, annee)                            ADR-031
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

1. Création d'une commande : commande, lignes figées, incréments de
   `quantiteReservee` et lignes de réservation, tout ensemble, ADR-024. La
   session de paiement reste **hors** de cette transaction
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
    étrangère traiter les **onze** autres références qui en portent une,
    `ReponseAvis.auteurId` étant en `RESTRICT` assumé. Livré par LS-95,
    `services/suppression-compte.ts`

Les points 7 à 9 viennent du périmètre ajouté par LS-37, avis et carnet
d'adresses. Le point 10 vient de LS-41.

**Le compte du point 10 disait « six » jusqu'au 13 août 2026.** Il était juste
quand LS-41 l'a écrit, et les tables ajoutées depuis ne l'ont pas fait suivre :
il y en a **douze au total**, mesurées sur la base et non recomptées de mémoire.
Un test de LS-95 interroge `information_schema` et vérifie la cardinalité, ce qui
rend ce compte mesuré plutôt qu'affirmé ; l'ajout d'une référence sans politique
explicite y rougit. Une telle référence vaut `RESTRICT` par défaut, donc
**bloque toute suppression de compte**, et une table vide ne le révèle par aucun
test fonctionnel : seule la lecture du schéma l'attrape.

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

### La permutation de rangs de médias, mesurée, C9

`media_principal_unique` est un **index partiel** filtré sur `ordre = 1`, pas une
contrainte : il n'est donc pas différable, contrairement à C22 sur les sections
de fiche produit. Vérifié le 14 août 2026 en interrogeant le catalogue système de
PostgreSQL, la table `media` ne porte aucune contrainte d'unicité, seulement cet
index.

Conséquence mesurée sur PostgreSQL 18.4, le **même échange réussit dans un sens
et échoue dans l'autre** :

```
m1 au rang 1, m2 au rang 2

VERT   UPDATE m1 -> 2  puis  UPDATE m2 -> 1      le rang 1 est libéré d'abord
ROUGE  UPDATE m1 -> 1  puis  UPDATE m2 -> 2
       ERROR: duplicate key value violates unique constraint
              "media_principal_unique"
```

**La transaction ne sauve pas**, l'index étant vérifié ligne à ligne et non au
`COMMIT`. C'est plus dangereux qu'un échec systématique : un réordonnancement
écrit sans y penser marche selon l'ordre de parcours des lignes, donc peut
passer en développement et casser en production.

**La parade est d'écrire le rang 1 en dernier.** Le service de médias trie donc
ses écritures pour que la ligne qui quitte le rang 1 soit mise à jour avant celle
qui le prend. Ne pas « simplifier » cette boucle en un parcours naïf de la liste,
et ne jamais employer d'`ON CONFLICT` : aucun `ON CONFLICT` ne peut arbitrer sur
un index partiel de ce type.

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

## Numérotation des documents

**Trois** séquences distinctes, commandes, factures et avoirs, remises à zéro
chaque année. Numéro attribué **au moment de la création, dans la transaction**,
jamais réservé à l'avance, règle F4. Aucun numéro réutilisé, aucun trou créé par
une opération normale. Une facture n'est créée qu'après confirmation du paiement.

**Le mécanisme est la table `CompteurNumero`**, ADR-031 et règle C27 : une ligne
par type et par année, incrémentée par `INSERT ... ON CONFLICT DO UPDATE ...
RETURNING`. Le verrou de ligne fait que la transaction annulée rend son numéro.

**Ne pas remplacer par une `SEQUENCE` PostgreSQL.** Elle n'est pas
transactionnelle : un `nextval` consommé par une transaction annulée est perdu,
et sur ce catalogue de pièces uniques le refus de stock est un cas **fréquent**,
donc chaque refus créerait un trou.

**L'année vient de `now()`, jamais de l'horloge Node**, même règle que le verrou
de tâche. Deux conteneurs décalés au passage d'année écriraient l'un
`C-2027-0001`, l'autre `C-2026-0043`.

**L'ordre de prise des verrous n'est pas libre** : le compteur se prend **avant**
les variantes, jamais entre deux réservations. L'inverser dans un seul chemin
crée un cycle, une transaction tenant la variante et attendant le compteur
pendant qu'une autre fait l'inverse.

Conséquence mesurée le 25 août 2026 : le compteur **sérialise** les commandes
concurrentes dès leur première instruction. C'est lui, et non le tri de
`ordonnerLignes`, qui ferme la fenêtre d'interblocage entre deux commandes. Le
tri reste nécessaire pour les cycles avec un chemin **tiers**, vente externe ou
libération de réservations.

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

Ce script porte deux garde-fous automatiques : l'arrêt sur détection d'une
instruction destructive (`DROP`, `TRUNCATE`, `DELETE FROM`, renommage), qui exige
alors `--confirm-destructive`, et une sauvegarde vérifiée avant toute migration.

Une migration additive passe seule. Une migration destructive demande un accord
explicite, parce qu'elle ne se répare pas par un retour arrière.

**La détection lit le SQL des fichiers de migration non appliqués**, pas la sortie
de `prisma migrate status` qui ne contient que des noms de fichiers. La liste des
migrations déjà appliquées vient de la table d'historique interne de Prisma, celle
que `migrate deploy` tient à jour et qui ne figure pas dans `schema.prisma`.

**Un garde-fou qui ne peut pas conclure bloque.** Base injoignable, migration sans
`migration.sql` : le script s'arrête au lieu de supposer que tout va bien. LS-42 a
corrigé l'inverse, une détection en mode fail-open qui annonçait « migration
additive » y compris devant un `DROP TABLE`.

`./scripts/verifier-migration-mutation.sh` le prouve sur dix cas, sans base réelle.
Lancé contre la version d'avant LS-42, il échoue sur sept d'entre eux.

## SQL brut

Limité aux cas où l'ORM ne suffit pas, en particulier l'`UPDATE` conditionnel de
réservation. Toujours paramétré, relu et couvert par un test de concurrence.
