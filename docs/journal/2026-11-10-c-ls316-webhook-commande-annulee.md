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

## Prochaine étape

1. Revue `ls-critical-reviewer` de LS-316, PR, fusion.
2. Déploiement du code, sans migration, sur accord de Christophe.
3. LS-291.

## État des tickets

- **LS-315** : Terminé, les neuf critères remplis.
- **LS-316** : En cours, revue et production à faire.
