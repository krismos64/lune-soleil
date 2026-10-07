# 7 octobre 2026 : LS-276, chargeurs SVG et PDF de libvips bloqués

Suite de `2026-10-07-e`.

## Ce qui a été fait

- **Mesuré avant de coder**, sur `sharp` 0.35.5 : un SVG précédé de plus de
  1024 octets de commentaire franchissait la signature et **librsvg le
  décodait**, `format: svg`, avant que le contrôle d'après décodage ne le
  refuse. Un SVG compressé n'est pas lisible depuis la mémoire, même sans
  blocage. Le chargeur PDF n'est pas compilé dans la libvips livrée.
- **`sharp.block`** sur `VipsForeignLoadSvg` et `VipsForeignLoadPdf`, par
  `integrations/medias/chargeurs-bloques.ts` : appelé depuis `register()` dans
  `instrumentation.ts`, avant la première requête, ce qui couvre
  `next/image`, et au chargement de `traitement.ts`. Une ligne de journal le
  constate au démarrage.
- **Le message** : un SVG refusé par libvips, décalé ou compressé, ressort en
  format refusé. La recherche porte sur tout le fichier, le gzip est
  décompressé par Node et borné à 1 Mo, jamais par libvips.
- **Tests** : blocage, message, et second filet éprouvé blocage levé.
  Trois mutations vues, cas 75 du nocturne réaligné, cas 75 bis et ter
  ajoutés ; `securite.md` et le README suivent.
- **Vérifié** : Vitest complet 1775 sur 1775 ; e2e des pages à images 162 ;
  build et `next start` : journal du blocage, `/_next/image` sert JPEG et PNG.

## Dérives

- **Context7 n'est pas connecté** dans la session : l'API vient de la source
  de `sharp` 0.35.5 et `register()` de la documentation embarquée de
  Next.js 16, toutes deux propres aux versions du projet.
- **Le cas 75 du nocturne serait devenu « raté »** : son test passait par le
  refus de libvips une fois le blocage posé. Le second filet a désormais son
  propre test, qui lève le blocage le temps de l'exercer.
- **Ordre des tests** : celui du second filet repose le blocage en sortant ;
  placé avant le test du blocage, il aurait masqué la mutation qui retire le
  blocage du module. Les tests du blocage passent en premier.
- Une condition d'import mal écrite a laissé `journaliser` non importé, vu
  par `tsc` avant le commit.

## Fusion et déploiement

PR #549, CI verte en 17 min 19, fusionnée en rebase, `7c8e885`. Déployée, run
37627166643. **Constaté en production** : le conteneur démarré sur l'image
`7c8e885` journalise `chargeurs libvips bloques`, opérations
`VipsForeignLoadSvg` et `VipsForeignLoadPdf`, et `/_next/image` sert le JPEG
(200). LS-276 close.

## Prochaine étape

LS-26, la FAQ et le délai de préparation avant expédition, attend les
réponses de l'exploitante.

## État des tickets

LS-276 close et déployée. 249 tickets terminés sur 275, relevés dans Jira.
