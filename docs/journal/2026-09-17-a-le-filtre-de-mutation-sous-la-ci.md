# 17 septembre 2026, le filtre qui ne voyait rien sur le runner

Session courte, déclenchée par un nocturne rouge. Christophe demande de corriger
sans ticket ni PR, et de pousser sur `main` par exception.

## Le rouge

Nocturne de 7h02, étape « Preuves par mutation lourdes » en échec :

```
  6 mutations, 6 NON detectees ou detectees ailleurs
```

Les six cas de `verifier-etats-non-nominaux-mutation.sh` en RATE, chacun avec la
même forme :

```
  RATE  l'etat vide des declinaisons change de texte -> echec constate, mais PAS sur le test attendu
          attendu : les trois etats vides de l'editeur sont rendus et nommes
          echecs reels :

```

La liste d'échecs réels est **vide** sur les six. Le nocturne de la veille, avant
le correctif LS-233, en rapportait **un seul**. Le correctif a donc cassé les
cinq qui passaient.

## Ce que le filtre faisait

LS-233 avait ancré le filtre des lignes d'échec pour écarter la barre de
progression de Playwright, `········×F`, qui ne nomme aucun test :

```bash
grep -E '^[[:space:]]*(×|✘)[[:space:]]' "$TMP/sortie.txt"
```

L'ancre est juste. Elle ne suffit pas, et le commentaire qui l'accompagnait
affirmait avoir confronté « la sortie réelle des deux lanceurs » : la sortie
**locale**, pas celle du runner.

## Ce que la mesure a donné

Les deux lanceurs changent de format en intégration continue.

`playwright.config.ts` porte `reporter: process.env.CI ? "github" : "list"`. Le
reporter `github` n'imprime ni ligne `✘ nom`, ni barre de progression. Mesuré sur
un test jetable :

```
  1) [mobile-320] › tests/forme.spec.ts:3:5 › le panneau d'archivage s'ouvre...
::error file=...,title=[mobile-320] › ... › le panneau d'archivage s'ouvre...
```

Vitest ajoute son reporter `github-actions` dès que `GITHUB_ACTIONS` est posé. Il
ne remplace pas le `default`, il s'y **ajoute** : la ligne `× nom` reste. Mesuré
aussi, et c'est ce qui a écarté une première hypothèse.

Les quatre formes réelles :

```
✘   9 [mobile-320] › fichier.spec.ts:58:7 › le nom du test   Playwright list
  1) [mobile-320] › fichier.spec.ts:3:5 › le nom du test     Playwright github
 × un cas qui echoue                                         Vitest local
::error file=...,title=[composant] ... > le nom du test,...  Vitest github
```

Et celle à ne pas retenir, `········×F`.

## La virgule encodée

Vitest encode la virgule du nom de test dans `title=` :

```
title=[composant] ... > sans aucune categorie%2C l'ecran dit quoi faire et ou
```

Un motif attendu qui porte une virgule, et trois des six en portent une, ne se
retrouverait pas sans décodage. Playwright ne l'encode pas dans sa ligne
numérotée. Le filtre décode `%2C`.

## Les deux verts du 16 ne prouvaient rien

Avant LS-233, le grep nu retenait la barre de progression. Les cas 5 et 6
passaient donc pour détectés sur une suite de points qui ne nomme aucun test. Le
rouge était faux dans un sens, puis dans l'autre : un garde-fou qui se trompe en
vert est plus coûteux qu'un garde-fou absent.

## Ce qui a coûté le plus de temps

Pas la cause, le **diagnostic**. Six cas en RATE avec « echecs reels : » suivi de
rien, et rien dans le rapport ne permettait de dire si le test était aveugle ou si
le filtre l'était. Quinze lignes de sortie brute auraient tranché en une minute.

Le rapport les imprime désormais quand le filtre ne reconnaît aucune forme.
Prouvé par mutation du filtre lui-même : neutralisé, le script affiche bien la
trace d'erreur Vitest au lieu du vide.

## Les deux autres scripts

`verifier-tests-mutation.sh` et `verifier-reintegration-stock-mutation.sh`
portaient le même filtre. Le commentaire du second affirmait que le défaut ne
l'atteignait pas puisqu'il ne lance que Vitest : faux, Vitest bascule aussi sur
le runner. Les trois sont alignés.

## Preuve

Script complet, les deux bases en place :

```
  6 mutations, 6 detectees par le test attendu
```

Contrôle négatif vérifié : un test passé au vert n'est pas confondu avec un
échec.

## Dérive assumée

Christophe demandait un push direct sur `main`, sans PR. `main` porte
`enforce_admins: true` et GitHub a refusé :

```
remote: - Changes must be made through a pull request.
```

Signalé plutôt que contourné : lever la protection pour ce correctif aurait
désactivé le contrôle vert sur le dépôt entier. Passé par la PR 451, chemin
normal, fusionnée en rebase.

## Prochaine étape

Le nocturne du 18 tranche : c'est lui qui prouve le correctif dans les conditions
où le défaut est apparu. La preuve locale ne couvre pas le reporter `github`, que
seule la CI active.
