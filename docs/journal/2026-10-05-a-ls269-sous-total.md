# 5 octobre 2026 : LS-269, sous-total affiché confronté à la commande

Suite de `2026-10-04-l`.

## Ce qui a été fait

- **LS-269** : le récapitulatif du tunnel transmet le sous-total des articles
  qu'il affiche. `passerCommande` le compare au sous-total figé sous verrou et
  lève `SousTotalChangeError` sur tout écart, ce qui annule la transaction
  entière. L'écran affiche le nouveau montant puis redessine le récapitulatif.
- **Gardes de montant déplacées après la réservation**, celle du sous-total et
  celle du port de LS-98. `revalider` ramène la quantité au disponible quand la
  commande réserve la quantité du cookie : avec la garde placée avant, une pièce
  manquante en relais affichait « les frais de port ont changé » au lieu de
  nommer la pièce. Un test le prouvait rouge avant la correction.
- **Montants présentés validés par Zod** dans `passerCommandeAction`
  (invariant 7). Le port de LS-98 était typé `number` sans aucune validation.
- Tests : quatre cas d'intégration dans `commande-transaction.sequential`, et
  un test de bout en bout, `sous-total-tunnel-ls269.spec.ts`, sur quatre
  largeurs. Trois mutations les font rougir : garde neutralisée, gardes
  replacées avant la réservation, écran qui ne transmet plus le sous-total.
- `PARCOURS.md` : nouveau cas d'erreur « montant changé » à l'étape 4.
- `.claude/rules/database.md` : la garde du sous-total et l'ordre après la
  réservation rejoignent celle du port.

## Ce qui a dérapé

- La mutation côté écran a laissé passer une commande qui a réservé la pièce de
  test. L'assertion `quantite_reservee = 0` dépendait donc des exécutions
  précédentes : elle compare maintenant avant et après le clic.

## Découvert

- **LS-270**, créé : un produit archivé ou dépublié reste commandable depuis un
  panier existant. `SQL_RESERVER` ne vérifie que la variante. Le défaut est
  antérieur à LS-269 et a été relevé par la revue critique.

## Prochaine étape

LS-270, en zone critique (réservation). LS-258 : l'exemption `braces` échoit le
17 octobre 2026.

## État des tickets

LS-269 close, fusionnée par la PR #523, non déployée. LS-270 à faire. LS-258 en cours. Comptes relevés dans Jira : 236 terminés sur 260 hors epics, 10 En cours et 14 À faire.
