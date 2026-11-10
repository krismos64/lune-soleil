# ADR-050 : le client annule sa commande en attente, et l'annulation rend le stock

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 10 novembre 2026 |
| Décideur | Christophe Mostefaoui |
| Complète | ADR-024 (commande et réservation atomiques), ADR-032 (une seule session ouverte) |
| Ticket | LS-315 |

## Contexte

Mesuré en production le 10 novembre 2026 : un client a quitté la page de
paiement autrement que par son bouton de retour. Il a trouvé un panier vide,
effacé au commit de la commande, et sa pièce unique affichée épuisée, réservée
par sa propre commande. Aucun écran ne menait à cette commande, et la pièce n'est
revenue en vente qu'à 15:20 UTC, par la tâche de libération.

Jusqu'ici, **la réconciliation est le seul chemin d'annulation**, et elle ne
touche jamais au stock : la tâche de libération rend les réservations échues, et
elle seule (`reconciliation-paiements.ts`). Un client ne peut donc ni renoncer ni
récupérer son panier avant trente minutes.

Rendre la pièce tout de suite oblige l'annulation à libérer le stock elle-même,
ce qui ajoute un quatrième chemin concurrent sur les mêmes lignes que le webhook
de confirmation, la tâche de libération et le réessai de paiement.

## Décision

**Le client annule une commande `EN_ATTENTE_PAIEMENT` désignée par le cookie
signé `ls_commande`, et l'annulation libère ses réservations dans la même
transaction que le changement de statut.** Le panier est reconstruit après le
commit à partir des lignes de la commande, revalidé contre le catalogue.

L'ordre suivant est la décision ; chaque étape ferme un croisement précis.

1. **Sous le verrou de la commande**, relever les sessions de paiement que la
   commande porte. L'identité vient du cookie signé seul, invariant 2.
2. **Hors transaction, expirer chaque session chez Stripe**, ADR-024 interdisant
   de tenir un verrou pendant un appel réseau. Stripe sert d'arbitre : une
   session expirée ne peut plus être payée.
   - `DEJA_FERMEE` : relire la session. Payée, l'annulation est **refusée**,
     « paiement en cours de confirmation », et le webhook ou la réconciliation
     confirme. Expirée, on continue.
   - prestataire indisponible : l'annulation est **refusée**, rien ne change.
3. **Une transaction**, dans l'ordre de verrous du webhook et de la libération :
   variantes de la commande par identifiant croissant, puis commande, puis
   réservations.
   - passage en `ANNULEE` sous la garde `WHERE statut = 'EN_ATTENTE_PAIEMENT'` ;
     aucune ligne touchée, rien d'autre ne s'écrit ;
   - relecture des sessions : une session rattachée depuis l'étape 1 annule
     l'opération, le client réessaie ;
   - `DELETE ... RETURNING` des réservations, et décrément de
     `quantite_reservee` **de ce qui a été supprimé seulement** ;
   - historisation, origine **`CLIENT`**, valeur d'enum ajoutée.
4. **Le rattachement d'une session au réessai vérifie le statut** sous le verrou
   de commande qu'il prend déjà. Une commande qui n'est plus en attente fait
   expirer la session qu'il vient de créer.

**Aucune alerte n'est levée vers l'exploitante**, arbitrage du 10 novembre 2026 :
renoncer n'est pas une anomalie. La commande annulée reste visible avec son
historique.

## Alternatives écartées

**Annuler sans rendre le stock, laisser la libération s'en charger.** Respecte la
règle actuelle, mais la pièce resterait épuisée jusqu'à trente minutes : c'est le
défaut mesuré, non corrigé.

**Ramener la réservation à « expirée maintenant » et laisser la tâche la
libérer.** Évite d'écrire sur `variante` hors de la tâche, mais la pièce reste
indisponible jusqu'au cycle suivant, cinq minutes au pire, et l'écran ne peut pas
dire « votre panier est rendu » sur une pièce qu'un autre ne peut pas encore
acheter.

**Annuler d'abord, expirer la session ensuite.** Une session payée dans
l'intervalle produit un paiement sur commande annulée, que le webhook ne traite
pas toujours proprement (voir Risques), pour un cas que l'ordre inverse rend
impossible.

**Ne pas reconstruire le panier, seulement annuler.** Le client devrait retrouver
chaque pièce au catalogue : sur un achat de plusieurs pièces uniques, il en perd
une à la première hésitation.

**Réutiliser l'origine `SYSTEME`.** Aucune migration, mais l'historique ne
distingue plus une renonciation d'un traitement automatique.

## Conséquences

- `OrigineEcriture` gagne `CLIENT`, migration additive.
- `payments.md` et le commentaire de `reconciliation-paiements.ts` cessent de
  dire que la réconciliation est le seul chemin d'annulation.
- `database.md` gagne une transaction critique : annulation par le client,
  statut, réservations et `quantite_reservee` ensemble.
- `PARCOURS.md` porte l'étape « reprendre ou annuler une commande en attente ».
- Tests d'intégration : annulation contre webhook de la même commande, contre la
  tâche de libération, contre un réessai en vol, double annulation, panne du
  prestataire, cookie d'une autre commande.

## Risques

**Double décrément avec la tâche de libération**, si les deux suppriment la même
réservation échue. Atténué par l'ordre de verrous commun et par le décrément
borné à ce que le `DELETE` a rendu : la seconde transaction ne trouve plus rien.

**Interblocage avec le webhook**, qui prend la variante puis la commande. L'ordre
de l'étape 3 est le même ; le rejeu borné de `database.md` couvre le reste.

**Paiement accepté par Stripe sur une session expirée.** Aucun chemin ne
l'atteint : le client ne reçoit l'URL que d'une session rattachée à une
commande encore en attente, et toute session rattachée est soit expirée par
l'étape 2, soit vue par la relecture de l'étape 3. Si le cas se produisait
quand même, le webhook ne lèverait pas toujours l'alerte
`PAIEMENT_SUR_COMMANDE_ANNULEE`, relevé par `ls-critical-reviewer` le
10 novembre 2026. `confirmerPaiement` lit le statut sans verrou et écrit
`CONFIRMEE` sans garde : un webhook qui a lu la commande avant l'annulation la
ramène à `CONFIRMEE`. Et si la pièce a été réservée de nouveau, la sortie de
stock heurte `chk_variante_pas_de_survente`, l'événement échoue en boucle et
l'alerte ne part jamais. La même faiblesse vaut pour un webhook tardif après une
annulation par la réconciliation : son durcissement relève du webhook,
LS-316.

**Complément du 10 novembre 2026, LS-316** : ce filet est fermé. Le webhook
verrouille les variantes puis la commande avant de lire son statut, et une
commande lue `ANNULEE` enregistre le paiement sans sortir de stock ni émettre de
facture, l'alerte `PAIEMENT_SUR_COMMANDE_ANNULEE` partant toujours.

**Délai de l'appel d'expiration**, jusqu'à vingt secondes. Le bouton passe en
attente, un second clic est absorbé par la garde sur le statut.
