# 4 octobre 2026 : LS-260, l'accueil animé porté, ADR-045 corrigé

Suite de `2026-10-04-b`.

## Ce qui a été fait

**L'accueil animé est porté** d'après la maquette validée, versée dans
`docs/prototypes/accueil-animee/` avec ses écarts écrits. Assemblage arbitré
par Christophe : bannière du 23 septembre retirée de l'accueil, et **fusion**
plutôt que maquette stricte, donc dans cet ordre :

1. héros animé, emblème en SVG et CSS sans script, titre visible au premier
   rendu ;
2. bandeau de réassurance réel, à la place des trois « promesses » de la
   maquette ;
3. dernières créations, inclinées et reflétées au survol sur ordinateur ;
4. scène du matin à la nuit, pilotée par le défilement ;
5. entrée par catégorie, conservée ;
6. bandeau défilant ;
7. sceau, le logo réel et le texte éditorial conservé.

Composants neufs dans `src/components/` : `EmblemeAnime` et `PoussiereOr`,
serveur ; `SceneCycle`, `AnimationsBornees`, `ApparitionAuDefilement`,
`ReactionPointeur` et le hook `useMouvementAutorise`, client, un par
comportement. Jetons `--ls-or-*`, `--ls-ciel-*` et `--ls-texte-nuit` dans
`tokens.css`. Playwright tourne en mouvement réduit par défaut, et
`accueil-animation-ls260.spec.ts` couvre le mode animé.

`logo-sceau.jpg` et la copie de la maquette portaient un bloc EXIF, retiré
avant de les versionner.

## Mesures

LCP et CLS, profil mobile, réseau à environ 200 Ko/s, processeur ralenti
quatre fois, cinq passages, médiane, même machine :

| | FCP | LCP | élément | CLS |
|---|---|---|---|---|
| avant | 368 ms | 360 à 380 ms | la bannière | 0 |
| après | 430 à 480 ms | identique au FCP | le titre | 0 |

La cause est mesurée : 6 Ko de plus à recevoir avant la première peinture,
HTML compressé de 6 977 à 10 551 octets et CSS de la page de 4 544 à 7 022.
Masquer chaque élément neuf sans ralentir le réseau ne change pas le FCP,
136 ms partout : ce sont des octets, pas du rendu. Le script de la page ne
grossit que de 6,5 Ko décompressés. **Christophe a accepté l'écart** le
4 octobre 2026, critère 10 rempli avec écart mesuré et accepté.

## Ce qui a dérapé

- **ADR-045 citait WCAG 2.2.2 à moitié.** Il bornait les animations à dix
  secondes, quand le critère ne dispense du moyen d'arrêt qu'en cinq secondes
  au plus. Relevé par `ls-frontend-revue` avant la fusion, corrigé par un
  paragraphe daté de l'ADR, la règle et le code.
- **Un fond qui passe du clair au foncé croise une teinte où aucun texte ne
  tient 4,5:1**, au mieux 3,37:1 avec les deux couleurs du projet. La scène
  laissait une phrase visible pendant ce passage. Les fenêtres de phrases
  sont désormais calculées sur la bande du texte, et le principe est écrit
  dans `frontend-design.md`.
- **`aria-hidden` sur les phrases hors fenêtre** les retirait aux lecteurs
  d'écran, qui ne font pas défiler la page. Retiré, et le principe est écrit
  dans la règle.
- **La préférence de mouvement n'était lue qu'au montage.** Le hook la suit
  désormais pendant la visite.
- **`reducedMotion` n'est pas une option directe de `use`** dans la version
  de Playwright du projet : il vit sous `contextOptions`. La construction de
  Next.js, qui vérifie aussi `playwright.config.ts`, l'a refusé.
- **Ma première mesure de poids du script comptait 97 Ko de trop** : elle
  additionnait le préchargement des pages liées pendant quatre secondes. La
  comparaison des scripts chargés, version par version, donne 6,5 Ko.

## Preuves

- Les trois défauts de la revue rejoués par mutation, chacun attrapé par le
  test prévu et par lui seul : `aria-hidden` remis, borne à dix secondes,
  fenêtres d'origine.
- Contrôles textuels de la CI au vert, types et lint au vert.
- **Suite de bout en bout complète en local**, mouvement réduit compris :
  2 279 réussis et 70 ignorés, code 0. Le nocturne du matin comptait
  2 255 et les mêmes 70 ignorés : l'écart est exactement les six tests neufs
  aux quatre largeurs.

## Prochaine étape

LS-261, le socle commun : en-tête, menu mobile plein écran, pied de page. Il
débloque LS-262 et LS-263. LS-264, le « nous » de marque de « Notre univers »,
attend un arbitrage de libellé.

## État des tickets

LS-260 close à la fusion. LS-261 à LS-263 à faire. LS-264 ouvert, sous LS-22.
LS-258 en cours jusqu'au 17 octobre.
