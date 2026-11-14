# 14 novembre 2026 : nocturne 101, débordement de Paramètres à 390 px

## Demande

Christophe demande l'état du projet. Le hook de démarrage signale l'issue #647
ouverte : le contrôle nocturne a échoué le 13 novembre (run 43397530900).
Christophe valide la correction.

## Diagnostic, mesuré

- Un seul échec sur 2954 : `gabarit-titre-ls228.spec.ts:101`, `mobile-390`,
  `/administration/parametres` déborde de **6 px**, retry compris. L'image
  et ses contrôles de sécurité ont été sautés derrière lui.
- Non reproduit sur le poste : 11 tests sur 11 verts sous les polices macOS.
- Cause : la grille des deux dates de la période annoncée (amendement de
  LS-319 du 13 novembre) passait à `1fr 1fr` dès 390 px. `1fr` ne descend pas
  sous la largeur minimale du champ de date, qui dépend de la police. Mesuré à
  390 px, 358 px disponibles : 164 px par champ en police système, 180 px sous
  Verdana, soit environ 176 px sous DejaVu Sans du runner (2 × 176 + 12 = 364).
- Second défaut, du test : le `h1` est rendu hors du `<Suspense>` de l'écran,
  et le test mesurait dès qu'il était visible. Une sonde lancée juste après le
  chargement a mesuré l'armature de chargement, champs à 0 px : la mesure
  pouvait porter sur le squelette, qui ne déborde jamais.

## Fait

- `parametres.module.css` : `.champs` en
  `repeat(auto-fit, minmax(min(100%, 12rem), 1fr))`, deux colonnes seulement
  si elles tiennent, quelle que soit la police.
- `gabarit-titre-ls228.spec.ts` : la mesure attend la disparition de l'annonce
  « Chargement … » de `ChargementAdministration`, sur les seize écrans
  d'administration.

## Preuves

- Mutation, police des champs forcée en Verdana à 390 px : ancien CSS
  **14 px** de débordement (prédit 372 moins 358), nouveau CSS **0 px** aux
  quatre largeurs, sous Verdana et sous la police d'origine.
- Bout en bout : `gabarit-titre-ls228` et `parametres-administration`, 157
  passés aux quatre largeurs ; `parametres-administration` seul, 61 passés.
- Types, lint, mise en forme et `verifier-regles.sh` au vert.

## Ce qui a dérapé

- Ma première piste visait bien la grille, mais la première mesure l'a
  semblé réfuter (champs à 0 px) : elle avait mesuré le squelette. C'est ce
  faux zéro qui a révélé le second défaut, celui du test.
- Le connecteur Atlassian de claude.ai est refusé (transport SSE retiré par
  Atlassian, passage au point d'accès v2 à faire) : Jira se lit par le greffon
  Atlassian.

## Reste

- Fermer #647 sur le premier nocturne vert après fusion. Le nocturne 102,
  lancé le 14 à 08:27 UTC sur l'ancien `main`, rougira sur ce même test.

## État des tickets

- LS-319 : reste Terminé, correctif rattaché par commentaire, aucun ticket
  neuf (défaut de la même story, corrigé sans nouveau ticket).
