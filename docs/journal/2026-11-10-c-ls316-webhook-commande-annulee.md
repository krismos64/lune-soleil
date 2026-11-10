# 10 novembre 2026 : webhook de paiement sur une commande annulée, LS-316

Suite de LS-315, `2026-11-10-b-ls315-reprise-annulation.md`.

## LS-315 clos sur son dernier critère

Le bandeau de la fiche produit est désormais mesuré de bout en bout, PR #652 :
pièce publiée amorcée dans `commande.setup.ts` (catégorie dédiée, rang 9315,
stock 100, réservations rendues dans un `finally`), cas positif et cas négatif,
la réservation d'un autre client ne faisant pas paraître le bandeau. Suite de
bout en bout complète : **2818 tests verts**, 92 sauts conditionnels, 9,1 min ;
la pièce publiée de plus ne casse aucun test public. Mutation du cas négatif
détectée.

## LS-316, fait

Défaut relevé par `ls-critical-reviewer` pendant LS-315 : `confirmerPaiement`
lisait la commande sans verrou et écrivait `CONFIRMEE` sans garde.

- **Verrous** : variantes puis commande, avant la lecture du statut. Ordre de
  l'annulation et de la libération ; le verrou de commande sérialise avec la
  réconciliation, qui annule sans toucher aux variantes.
- **Commande lue `ANNULEE`** : paiement enregistré, aucune sortie de stock,
  réservations laissées à la libération, aucune facture, alerte
  `PAIEMENT_SUR_COMMANDE_ANNULEE`.
- **Confirmation** par `updateMany` gardé sur `EN_ATTENTE_PAIEMENT`.
- **Verrou de commande en `FOR NO KEY UPDATE`**, après la revue de
  `ls-critical-reviewer` : en `FOR UPDATE`, il bloquait l'insertion de
  tentative d'un démarrage de paiement concurrent, qui tenait les réservations
  que le webhook attendait. Interblocage introduit par la première version de
  LS-316, test rouge puis vert, mutation détectée.

**Preuves** : trois tests d'intégration écrits avant le code, **rouges sur
l'ancien code et verts avec la correction**, mesuré en remettant
`webhook-paiement.ts` de `main`. Quatre mutations ajoutées au script, toutes
détectées ; 221 au total.

## Ce qui a dérapé, et pourquoi

- **Worktree sans `.env`** : LS-316 a été écrit dans un worktree pendant que la
  suite de bout en bout tournait, mais ses tests d'intégration exigent
  `DATABASE_URL`, que seul le `.env` porte et que Claude ne lit pas. Les tests
  ont tourné une fois le worktree rapatrié dans le dépôt principal.
- **Deux mutations ont d'abord raté**, la même leçon que LS-315 : le rejeu du
  webhook absorbait l'interblocage né d'un ordre de verrous inverse, et une
  suppression de réservations n'était vue par aucun compte. `lock_timeout` sur la
  connexion d'imitation et compte des réservations au constat.
- **Deux assertions globales sur la base éphémère partagée**, trouvées en
  mesurant cinq fois `npm run test` : `compterAlertes` dans
  `annulation-client` (écrit pour LS-315) et cinq lectures de toute la table
  `paiement` dans `paiement-session`, ancien défaut. L'une a échoué une fois sur
  cinq, l'autre une fois sur quatre. Restreintes à la commande du test ; la
  suite d'intégration passe ensuite cinq fois sur cinq.
- **Instabilité non traitée** : `tests/composant/gestion-passkeys-ls295.test.tsx`,
  « bascule vers la confirmation quand la route refuse faute de preuve », a
  échoué une fois sur cinq dans `npm run test`. Composant sans base, sans
  rapport avec LS-316 ; non diagnostiqué.

## Mise en production

- PR #653, CI verte au premier passage, les contrôles de la CI ayant tous été
  lancés en local avant de pousser. Fusionnée en rebase, `main` à `7094aa4`.
- Déploiement run 42911391830, sans migration : image `7094aa4…` en service,
  aucune erreur au journal, pages en 200, `/api/webhooks/paiement` sans
  signature en 400.

## Signalé dans la soirée, LS-317

Christophe a relevé qu'un client à la commande expédiée affichait 0 commande et
0 € dans l'administration. Ce n'est pas une panne : son adresse n'est jamais
confirmée, et le parcours 6 ne rattache une commande qu'à une adresse vérifiée.
L'administration ne le montre pas, ni sur la fiche client ni sur la fiche
commande, et le montant commandé compte les annulations. **LS-317** créé ;
arbitrage : exclure les commandes annulées du montant.

## Prochaine étape

1. LS-317.
2. LS-291.

## État des tickets

- **LS-315** : Terminé, les neuf critères remplis.
- **LS-316** : Terminé, en production.
- **LS-317** : créé, À faire.
