# 10 septembre 2026, g : le contrôle qui dormait depuis trois jours

LS-213 annonçait un travail de trente minutes. Elle en a pris le double, à cause
d'un effet de bord que la correction elle-même a produit.

## Le défaut

`verifier-prefetch-administration.sh` existait depuis le 7 septembre, écrit par
LS-166 avec sa preuve par mutation sur quatre sens. Il n'était **branché dans
aucun workflow**, et trois liens le violaient sur `main` pendant ce temps.

Motif « contrôle jamais déclenché », déjà rencontré avec
`verifier-actions-sensibles.sh` qui dormait depuis LS-81. Un contrôle écrit,
prouvé, et déclenché par rien ne garde rien.

## Ce qui est livré

Les trois liens portent `prefetch={false}` : les quatre filtres de période des
factures, le fil d'Ariane de la fiche produit, le renvoi vers les catégories.

Le contrôle est branché en étape `9s bis`, à côté de son voisin thématique. **La
CI joue désormais 49 contrôles au lieu de 48.**

## L'effet de bord, et il est instructif

Corriger les trois liens a **cassé `verifier-navigation-client-mutation.sh`**.

Ses motifs citaient les balises sous leur forme littérale d'une seule ligne.
L'ajout de `prefetch={false}` a fait passer les balises sur trois lignes sous
Prettier, et les substitutions ont cessé de trouver leur cible.

**Le script annonçait alors « non détecté » et accusait le contrôle**, quand
c'était la mutation qui n'avait rien muté. Motif « correction échouée en
silence », déjà connu ici.

Trois mutations sur quatre sont tombées d'un coup. Sans les 49 contrôles joués en
local, la régression partait en CI.

Les motifs suivent désormais la forme réelle, et le commentaire dit pourquoi ils
ne citent plus la balise entière.

## Le quatrième critère, mesuré plutôt qu'estimé

Le ticket demandait de chercher si d'autres contrôles étaient dans le même cas.
Sur **85** scripts `verifier-*`, **35** ne sont référencés par aucun workflow.

Le chiffre brut trompe : **26 sont des scripts `-mutation`**, qui prouvent les
contrôles et n'ont pas vocation à tourner à chaque pull request.

Restent **neuf contrôles réels**. Six ne peuvent pas tourner en CI, visant la
production ou exigeant un accès SSH ou des variables absentes. **Deux sont verts
et jouables tels quels** : `verifier-emetteur-facture.sh` et
`verifier-graphie-marque.sh`.

Le second est celui dont le dépôt retient qu'il laissait passer quatre défauts
réels du dépôt malgré quatre mutations réussies. Il n'a pas été branché ici :
cela dépasse le périmètre de LS-213, et glisser deux contrôles de plus dans une
correction mérite un arbitrage propre.

## Un échec préexistant, signalé et non traité

`tests/e2e/navigation-administration.spec.ts:662`, « le tableau d'expédition
porte trois colonnes comptées juste », échoue à `mobile-320`.

**Vérifié sur `main` avant la PR** : l'échec la précède. Il porte sur un tableau
d'expédition, sans rapport avec les liens touchés. Il mérite son ticket.

## Vérifications

```
npm run type-check     vert
npm run lint           vert
npm run format:check   vert
npm run test           1314 passed, 85 fichiers
49 controles           0 en echec
verifier-navigation-client-mutation.sh   4 sur 4
```

Le contrôle **détecte** le défaut d'origine, vérifié en retirant l'attribut d'un
des trois liens : une pull request qui le réintroduirait serait rejetée, ce qui
n'était pas le cas ce matin.

## Prochaine étape

Deux tickets à ouvrir selon l'arbitrage de Christophe : brancher les deux
contrôles jouables, et l'échec de bout en bout préexistant.

LS-212, les codes de récupération, reste le seul critère ouvert de l'amorçage.
Elle demande un ADR avant tout code, le plugin `twoFactor` de Better Auth
imposant un secret TOTP dont ADR-021 ne veut pas.
