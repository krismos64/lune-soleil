# 9 septembre 2026, l : LS-210, le bug n'était pas dans le projet

Cinq voies avaient échoué sur la même erreur opaque. La sixième a consisté à
cesser de chercher la cause dans le projet.

## Ce qui bloquait, et depuis quand

Trois vulnérabilités `vitest` en dépendance de développement, avis
GHSA-82fw-gwwq-j7x9, un chemin de traversée dans `@vitest/mocker`. Le nocturne
était rouge dessus depuis le 8 septembre, et le critère 3 de LS-139 attendait.

Toutes les tentatives finissaient là :

```
npm error Cannot read properties of null (reading 'edgesOut')
```

## Le geste qui a trouvé la cause

Réduire jusqu'à ce qu'il ne reste rien du projet. Un `package.json` de six
lignes :

```json
{
  "name": "essai", "version": "1.0.0",
  "devDependencies": { "vitest": "^4.1.11", "@vitest/coverage-v8": "^4.1.11" }
}
```

`npm install --package-lock-only` y rend la **même erreur**. Il ne restait ni
`better-auth`, ni les neuf overrides, ni le lock du projet : le défaut est dans
**npm 10.9.8**, celui qu'embarque Node 22.23.2.

```
npm 10.9.8   ->  Cannot read properties of null (reading 'edgesOut')
npx npm@11   ->  vitest 4.1.11 partout, found 0 vulnerabilities
```

**Trois hypothèses avaient été écartées en chemin**, chacune par une mesure :
le lock existant (une reconstruction complète échoue aussi), `better-auth` qui
dépend de vitest (absent du cas minimal), et un conflit de pair
(`peer vitest@"4.1.10" from @vitest/coverage-v8@4.1.10` apparaissait dans les
avertissements, mais npm 11 le résout sans peine).

## Le correctif n'était pas un saut de version

**4.1.11**, une version corrective sur la branche déjà installée. `^4.1.10`
l'autorisait depuis le départ : rien n'était à décider, seul le bug de npm
empêchait d'y arriver. Il n'a jamais été question de monter en 5.0.0, ni de
poser un override.

C'est le contraire du cas documenté dans la fiche sur les avis de sécurité, où
suivre l'avis à la lettre avait cassé ESLint. Ici l'avis désignait une version
que le projet acceptait déjà.

## Ce qu'il fallait vérifier avant de conclure

**Le lock produit par npm 11 doit rester utilisable par npm 10**, que la CI
emploie via `npm ci`. Vérifié plutôt que supposé :

```
lockfileVersion : 3            (inchangé)
npm -v          : 10.9.8
npm ci          : added 691 packages ... found 0 vulnerabilities
```

Le dépôt reste donc sur npm 10, et `packageManager` n'a pas été touché.
L'arbitrage de Christophe était explicite sur ce point : utiliser npm 11 le temps
de l'opération plutôt que changer l'outillage du projet.

**`npm update` ne suffit pas, même en npm 11** : le lock fige les versions et
`update` les respecte. Seule l'installation explicite `vitest@^4.1.11` passe.

## État des tickets

**LS-210 est close.** `npm audit` rend zéro.

**LS-139 : le critère 3 est le dernier**, et il tombe avec LS-210. Tous les
autres critères sont faits.

## Prochaine étape

Clore LS-139, dont les sept critères seront alors satisfaits, et vérifier que le
nocturne repasse au vert sur sa prochaine exécution plutôt que de le supposer :
c'est cette même erreur qui avait fait croire que `npm audit` passait, alors que
l'étape était **sautée** et non en échec.

**Cette vérification a payé, session `m`.** L'audit est bien passé au vert, et le
nocturne est resté rouge sur autre chose : huit tests que j'avais cassés en
retirant les `loading.tsx`, cinq heures plus tôt. LS-139 n'était donc pas
closable, contrairement à ce que ce journal laissait attendre.
