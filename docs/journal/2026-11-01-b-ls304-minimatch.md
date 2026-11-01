# 1er novembre 2026 : nocturne rouge, minimatch en 11.x, LS-304

Issue #612 : nocturnes du 31 octobre et du 1er novembre en échec à l'étape
« Verdict de l'audit des dépendances ». 17 vulnérabilités modérées, toutes de
`minimatch` inférieur à 11.0.1 (GHSA-g3hv-75wg-m249, déni de service), par la
chaîne ESLint.

## Fait

- Override `minimatch` passé de `^10.2.6` à `^11.0.1`, aucun correctif en
  10.x. Résolu en 11.0.3, avec une dépendance nouvelle,
  `@isaacs/nonrecursive-glob-match` 1.0.3, du même auteur.
- Commentaire de l'override de `package.json` complété.
- Le reste du diff du verrou est un recalcul d'indicateurs par npm
  (`devOptional` devenu `dev`), sans version changée ; le Dockerfile lance un
  `npm ci` complet, l'image n'en dépend pas.

## Preuves

```
npm ls minimatch --omit=dev        (empty), outillage seul
npm audit                          found 0 vulnerabilities
npm run lint                       vert ; faute injectée : 1 error signalée
fichiers lus par ESLint            548 en 10.x, 548 en 11.x, aucun ignoré lu
npm run type-check                 vert
npm run build                      vert
npm run test                       119 fichiers, 1888 tests passés
```

## Prochaine étape

- Nocturne du 2 novembre : vert attendu, **étape de bout en bout exécutée**
  et non sautée ; fermer #612 et clore LS-304 sur cette preuve.
- CGV et politique de confidentialité, LS-28, chemin critique de l'ouverture.

## État des tickets

- **LS-304** en cours jusqu'au nocturne vert.
