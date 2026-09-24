# 24 septembre 2026, suite : le premier nocturne complet, et ce qu'il a dit

Suite de `2026-09-24-a`. Le nocturne 35967594574 est le premier à porter la
PR 488, et **l'étape des preuves lourdes est allée au bout pour la première
fois** : 2 h 05, sous la borne de 150 min. Il sort pourtant rouge, pour deux
causes sans lien entre elles.

## LS-253, un vrai débordement à 320 px, PR 489

`/administration/produits` déborde de **35 px** à 320 px sur le runner, et deux
tests échouent, retentative comprise. Sur macOS, ils passent.

La cause a été **mesurée**, pas déduite. L'administration utilise `system-ui` :
SF Pro sur Mac, **DejaVu Sans** sur le runner, plus large. Reproduction dans
l'image `mcr.microsoft.com/playwright:v1.62.1-noble` avec `fonts-dejavu-core`,
contre le serveur local et sa base peuplée par la suite complète, en appliquant
l'algorithme exact de `debordementHorizontal` : **35 px, la valeur du runner**,
sur `.corps` de la carte produit.

`.corps` portait `flex: 1`, donc une base nulle : il ne forçait jamais le retour
à la ligne. La case de sélection de LS-242 lui a pris 56 px, et il ne restait
qu'environ 43 px. `flex: 1 1 8rem` fait passer le badge à la ligne. Après le
correctif, aux quatre largeurs sous Linux, aucun fautif ; capture à 320 px relue.

Trois pièges payés en route :

- l'image Playwright retombe sur **WenQuanYi** faute de DejaVu, ce qui donnait
  0 px et une fausse piste de données
- la première mesure a été prise sous l'écran de chargement du `<Suspense>`,
  motif déjà en mémoire
- le cookie `__Secure-` ne part en HTTP que vers `127.0.0.1` : un relais TCP
  dans la sonde a remplacé `host.docker.internal`

## LS-252, cinq RATE propres au runner

Aucun ne se reproduisait en local. Trois causes distinctes :

- **trois cas à deux-points** : sur le runner, seule l'annotation `::error`
  nommait le test, et GitHub y encode `:` en `%3A`. Le filtre ne décodait que
  `%2C`. Prouvé sur une sortie de type runner : ancien filtre RATE, nouveau OK.
  Le même décodage partiel dormait dans deux autres scripts, alignés
- **le cas 112 produisait du SQL invalide** : une condition ajoutée après le
  `WHERE` laissait un `RETURNING` derrière un `SELECT`. Corrigé, il est resté
  **vert sur son test attendu** : la garde `quantite_reservee >= ...` masquait la
  perte d'idempotence. Le vrai danger est un **second acheteur** dont la
  réservation serait libérée par la ligne échue survivante, soit une double
  vente. Le test « ne libere pas la reservation d'un nouvel acheteur de la meme
  piece » l'exige, rouge sous mutation sur `reservee: 0`
- **deux listes vides** que ce poste ne reproduit pas, même sous
  `CI=true GITHUB_ACTIONS=true`. La branche RATE imprime désormais les 40
  dernières lignes de la sortie brute quand la liste est vide : le prochain
  nocturne dira la cause

## Ce qui a dérapé

- une URL de base passée **en argument** de `psql`, ce que `CLAUDE.md` proscrit :
  base de test locale, commande en échec, mais le geste était faux
- `grep` est ici un alias d'`ugrep`, qui a refusé un motif `$'\e\['` : les
  mesures fines passent par `/usr/bin/grep`
- zsh ne découpe pas une variable non guillemetée : un premier rejeu a passé deux
  fichiers porteurs comme un seul filtre, et Vitest n'a rien trouvé

## État des tickets

**LS-253** : critères 1 et 2 faits, le 3 attend le nocturne. PR 489.

**LS-252** : trois des cinq RATE du runner corrigés et prouvés, un quatrième
devenu un test de double vente. Deux attendent leur sortie brute. Reste le
verdict du runner.

**LS-235** : critère 7, le nocturne au vert, attend les deux PR.

## Prochaine étape

1. Fusionner les deux PR, puis relire le nocturne suivant, sortie brute des deux
   cas à liste vide comprise
2. Resserrer les bornes sur la durée par cas du runner, désormais imprimée
3. Proposé : le contrôle à sec des expressions de mutation par PR
