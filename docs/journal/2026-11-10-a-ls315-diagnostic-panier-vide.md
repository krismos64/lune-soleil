# 10 novembre 2026 : pièce épuisée et panier vide après un paiement abandonné, LS-315

## Demande

Christophe : un client a essayé une commande, l'article s'affiche épuisé et son
panier est vide.

## Diagnostic en production, lecture seule

- Commande `61f5cd77-…` posée à 14:48:07 UTC, restée `EN_ATTENTE_PAIEMENT`,
  réservation d'un exemplaire de `FLEURDOREE` jusqu'à 15:18:07 UTC.
- `quantite_reservee` à 1 sur une variante à un exemplaire : « épuisé ».
- Libérée par la tâche de 15:20:03 UTC : `quantite_reservee` à 0, aucun
  mouvement de stock, `quantite_physique` intacte. Les passages de 15:10 et
  15:15 avaient libéré 0 réservation, celle-ci étant encore valide.
- La commande reste `EN_ATTENTE_PAIEMENT` jusqu'à ce que la réconciliation lise
  la session Stripe expirée, comportement voulu (LS-120).

Réservation, libération et réconciliation ont fonctionné comme prévu.

## Le défaut de parcours

Le panier est effacé au commit de la commande. Seul le bouton de retour de
Stripe ramène vers `/commande/confirmation?retour=abandon` et son bouton de
reprise. Par le retour arrière du navigateur ou `/panier`, le client trouve un
panier vide, sa pièce épuisée par sa propre réservation, et aucun lien vers sa
commande ni moyen de la libérer.

## Décision

Arbitrage de Christophe : un seul ticket pour les deux volets, reprise de la
commande en attente et annulation qui rend le panier. **LS-315**, sous LS-7,
priorité haute, critères avec test négatif, concurrence contre le webhook,
idempotence et panne de Stripe.

## Prochaine étape

- LS-315 : répondre aux quinze questions de la zone critique, trancher le
  besoin d'un ADR pour la transition d'annulation par le client.
- Fermeture de #647 toujours à confirmer après le nocturne de cette nuit.

## État des tickets

LS-315 créé, À faire. Aucun code modifié, aucune écriture en base.
