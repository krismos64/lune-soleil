# ADR-024 : la réservation et la commande sont écrites dans une seule transaction

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 29 juillet 2026 |
| Décideur | Christophe Mostefaoui |
| Complète | ADR-006, qui décide *comment* réserver et non *quand* |
| Ticket | LS-53 |

## Contexte

ADR-006 a tranché le mécanisme de réservation : un `UPDATE` conditionnel atomique
sur `quantiteReservee`, prouvé par prototype. Il ne dit rien du **moment** où la
réservation est écrite par rapport à la commande.

Le parcours 1 décrit un ordre séquentiel : réservation à l'étape 4, commande à
l'étape 5. Le modèle logique l'a traduit fidèlement par un
`Reservation.commandeId` nullable, seule façon de représenter l'intervalle entre
les deux écritures.

Cet intervalle est le problème. Une panne du serveur ou de la base entre l'étape
4 et l'étape 5 laisse une **réservation orpheline** : la quantité réservée est
incrémentée, aucune commande ne la justifie, et rien ne permet de savoir à qui
elle appartenait.

La pièce reste indisponible jusqu'à l'expiration, trente minutes. Le client qui
réessaie immédiatement reçoit « cette pièce vient d'être vendue » alors qu'il est
le seul à la vouloir. Sur une variante à un exemplaire, le jalon technique du
projet, l'achat est bloqué une demi-heure par un incident qui a duré une seconde.

Le parcours 1 affirmait par ailleurs déjà que « les étapes 4 à 7 sont
transactionnelles ». Le schéma ne le garantissait pas.

## Décision

**La commande, ses lignes et ses réservations sont écrites dans une seule
transaction.** `Reservation.commandeId` devient obligatoire.

Une réservation sans commande n'a aucun sens métier. Le schéma ne doit donc pas
pouvoir la représenter : rendre l'état absurde impossible en base vaut mieux que
compter sur le code applicatif pour ne jamais le produire.

L'ordre à l'intérieur de la transaction reste celui d'ADR-006 : l'`UPDATE`
conditionnel décide de la disponibilité, et un refus annule la transaction
entière plutôt que de laisser une commande sans stock.

**La session de paiement se crée après le `COMMIT`**, jamais à l'intérieur.

## Ce que la vérification préalable a établi

Trois règles auraient pu dépendre de réservations sans commande. Aucune n'en
dépend, vérification faite avant de trancher.

| Règle | Ce qu'elle contrôle | Dépend de `commandeId` ? |
|---|---|---|
| S5, vente externe | une réservation active **sur la variante** | non |
| S3, purge | `expireA` dépassé | non |
| Parcours 1 | déclare les étapes 4 à 7 transactionnelles | non, il exige l'inverse |

Le lien obligatoire ne casse donc aucune règle existante.

## Pourquoi la session de paiement reste hors transaction

Deux motifs, et le second est le plus important.

**Un appel réseau dans une transaction tient les verrous.** L'`UPDATE`
conditionnel prend un verrou de ligne implicite maintenu jusqu'au `COMMIT`.
Attendre la réponse du prestataire à l'intérieur ferait durer ce verrou le temps
d'un aller-retour HTTP, sur la ligne de variante la plus convoitée du catalogue.
C'est le problème d'interblocage de LS-50 aggravé d'un facteur mille.

**Un échec du prestataire ne doit pas effacer la commande.** Si la création de
session échoue à l'intérieur de la transaction, le rollback supprime commande,
lignes et réservations. Le client a rempli un formulaire pour rien et le stock
n'a jamais été protégé. En plaçant l'appel après le `COMMIT`, l'échec laisse une
commande `EN_ATTENTE_PAIEMENT` que la réconciliation traite comme n'importe
quelle autre, et une réservation qui expire normalement.

## Alternatives écartées

**Garder `commandeId` nullable.** Aucun coût immédiat, le trou demeure. Écarté :
le défaut se manifeste précisément sur le cas que le projet a désigné comme son
jalon technique, la pièce à un exemplaire.

**Introduire un identifiant de panier ou de tentative** auquel la réservation se
rattache avant la commande. Fonctionne, et c'est la solution des sites qui
séparent réellement les deux moments, par exemple quand un panier survit
plusieurs jours.

Écarté ici pour deux raisons. L'entité représenterait un état qui ne dure que le
temps d'écrire quelques lignes, quelques millisecondes. Et elle ajouterait une
table, une clé étrangère et une purge supplémentaires à un modèle qui en compte
déjà vingt-cinq, sans traiter le cas nominal mieux que la transaction unique.

Le cahier des charges écarte explicitement la généralisation prématurée : ce
projet n'est pas un produit réutilisable.

**Compenser applicativement**, en supprimant la réservation dans un bloc de
rattrapage si la création de commande échoue. Écarté : un bloc de rattrapage ne
s'exécute pas quand le processus meurt, ce qui est exactement le scénario à
couvrir.

## Conséquences

| Élément | Avant | Après |
|---|---|---|
| `Reservation.commandeId` | `String?` | `String` |
| Clé étrangère vers `Commande` | `SetNull` | `Restrict` |
| Étapes 4 et 5 du parcours 1 | séquentielles | fusionnées en une transaction |
| Session de paiement | non précisé | après le `COMMIT`, explicitement |

Le passage en `Restrict` suit mécaniquement : `SetNull` existait pour faire
survivre une réservation à la disparition de sa commande, ce qui est désormais
impossible. `Restrict` interdit en outre de supprimer une commande portant encore
des réservations, cohérent avec les dix-sept autres clés étrangères du modèle
rangées dans cette politique.

**La purge ne change pas.** La règle S3 cherche `expireA` dépassé sans regarder
la commande. Une commande abandonnée reste `EN_ATTENTE_PAIEMENT` pendant que sa
réservation est purgée, ce qui est exactement le cas d'erreur « abandon du
paiement » déjà décrit au parcours 1.

**Ce qui ne change pas** : l'`UPDATE` conditionnel d'ADR-006, les trois `CHECK`
de non-négativité, les quatre clés d'idempotence de la décision D, la règle S5.

## Lien avec LS-50

LS-50 corrige un défaut distinct sur la même transaction : deux paniers portant
les mêmes variantes dans un ordre opposé s'interbloquent, reproduit sur
PostgreSQL 18.

Les deux décisions se combinent. La transaction unique décidée ici traitera les
variantes dans l'ordre déterministe qu'exige LS-50, et le même test de
concurrence couvrira les deux propriétés.

Elles sont séparées parce que leur moment diffère : celle-ci change une colonne
et précède la migration initiale, celle de LS-50 suppose un service de
réservation qui n'existe pas encore.
