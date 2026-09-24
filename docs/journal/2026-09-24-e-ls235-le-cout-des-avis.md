# 24 septembre 2026, fin de soirée : LS-252 close, LS-235 réduit son coût

Suite de `2026-09-24-d`.

## Le nocturne est vert

Nocturne **36011272260**, lancé à la main après la PR 491 : bout en bout
**2243 passés**, `180 mutations, 180 detectees`, aucune étape en échec. Étape des
preuves en **2 h 05**, job en **2 h 22**. **LS-252 est close.**

## La marge était de 20 %, pas du double

Borne de 150 min pour 125 mesurées. La durée par cas, imprimée depuis LS-252, a
nommé la cause : médiane 9 s, mais **seize cas à 104 s**, tous sur
`avis.sequential.test.ts`, 53 tests relancés en entier à chaque cas.

Trois options présentées à Christophe, il a retenu la recommandée : **réduire le
coût** plutôt que relever la borne. Chaque cas ne lance plus que le test attendu,
`vitest -t`, nom échappé en expression régulière. Isolé, le test des avis prend
**3,6 s au lieu de 64**.

**Le risque fermé avec lui** : un test isolé qui dépendait de ses voisins
échouerait sans la mutation, et sa détection serait vide. Le script rejoue donc
le test sans mutation quand le filtre a joué, et rend RATE s'il échoue. Prouvé
en cassant exprès le test du cas 2, sur une copie réduite du script.

## Mesures locales

```
avant   180 mutations, 180 detectees   3507 s
apres   180 mutations, 180 detectees   1902 s, mediane 4 s, max 265 s
```

## Ce qui a dérapé

- une première preuve du témoin n'injectait rien, le nom du test ayant une
  suite, « meme vente web activee » : `git diff --stat` vide l'a montré avant
  toute conclusion
- une vérification des porteurs à la main a cru à un repli sur la suite
  entière : `\s` n'existe pas dans le `sed` de macOS, le motif extrait était
  faux

## État des tickets

**LS-252** close. **LS-235** : critères 1 à 7 faits ; reste à mesurer la durée
réelle de l'étape sur le runner avec le filtre par nom, attendue autour de
65 min pour une borne de 150.

## Prochaine étape

1. Le nocturne suivant, lancé à la main après fusion, pour mesurer
2. LS-250, les 41 `grep -q` restants sous `pipefail`

## Mesuré sur le runner, LS-235 close

Nocturne **36039763238**, lancé à la main après la PR 494 : vert, bout en bout
2255 passés, `180 mutations, 180 detectees`. **Étape en 1 h 22 contre 2 h 05**,
job en 1 h 40, somme des cas 3096 s contre 5768, témoin compris.

La borne de 150 min ne laissait que 1,83 fois ce temps : elle passe à **165**,
le double de 82 min, et le plafond du job à **200**. Dimensionnées sur une mesure
de runner, pour la première fois depuis l'ouverture de LS-235.
