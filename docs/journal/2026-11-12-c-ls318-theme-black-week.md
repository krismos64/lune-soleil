# 12 novembre 2026 : thème Black Week dans le site, LS-318

## Demande

Intégrer le thème validé sur maquette (journal `2026-11-12-b`) à l'accueil et
au catalogue, animé, activé à la main par l'exploitante.

## Fait

- **Valeur `BLACK_WEEK`** : `src/lib/theme-saisonnier.ts`, migration
  `20261112180000_theme_black_week` (retrait puis pose de
  `chk_parametre_theme_connu`, aucune donnée convertie), SQL manuels,
  `verifier-schema.sh` (accepté, minuscules rejetées), `MODELE-LOGIQUE.md`.
- **Jetons** `[data-theme="black_week"]` dans `tokens.css`, pied de page à la
  nuit. `verifier-contraste.sh` reconnaît le suffixe `-sur-nuit` ; cas 11 de sa
  preuve par mutation, choisi pour rester vert si le suffixe n'était pas lu.
- **Décors** `src/components/decor-black-week.tsx` : soleil levant, rayons qui
  tournent, halo, poussière d'or, liseré d'or, marges dorées, liseré des cartes,
  sac doré du bouton d'achat. Mouvement continu sous `data-continu`, joué
  seulement sous un état posé par le script, bouton de pause.
- **Catalogue** : bandeau de nuit, « Black Week » en paragraphe d'affichage
  au-dessus du `h1` « Le catalogue », inchangé (ADR-046 §5). **Accueil** : héros
  de nuit, ruban « Black Week », rayons de l'emblème en rotation continue,
  bouton plein en or. Cartes : liseré doré au survol, bouton d'achat de nuit.
- **Administration** : le thème et sa description dans le choix des thèmes.
- **ADR-045 et ADR-046 amendés**, `frontend-design.md`, `REFERENCES.md`,
  agent `ls-frontend-revue`, commentaire de `globals.css`.

## Écarts à la maquette

Non portés, par ADR-045 : le reflet qui balaie « Week » (mouvement sur un
texte), la gerbe d'étincelles au clic (sur le libellé du bouton), l'entrée des
cartes en fondu. La bande de nuit du catalogue est retirée sous le thème, la
maquette ne la porte pas.

## Ce qui a dérapé

- **`ls-frontend-revue` a trouvé six défauts**, tous corrigés dans la branche :
  le **liseré des cartes couvrait 1 à 2 px de la photographie** (carte en
  `overflow: hidden`, rectangle à `99 %`) et le test mesurait la boîte du SVG,
  fixée par le CSS, donc toujours juste ; la règle du thème **effaçait l'anneau
  de focus** du bouton de pause (même spécificité, déclarée après) ; la bande de
  nuit testait encore `noel` seul ; le halo respirait sous le ruban à 320 px ;
  le héros devenait blanc sur blanc à l'impression (Noël 2 aussi) ; le test des
  bornes sautait un décor réduit à zéro par sa propre animation.
- **La première mutation d'allégation a été vue par la mauvaise assertion** :
  elle cassait la phrase que le test cherche avant d'atteindre la vérification
  des taux. Refaite en gardant la phrase.
- Le test d'intégration reposait la contrainte avec la liste de Noël recopiée :
  elle aurait refusé `BLACK_WEEK` aux tests suivants de la base partagée. Il
  rejoue désormais la migration au lieu de recopier une liste.

## Preuves

- Vitest complet : 2041 tests, 126 fichiers. Intégration du thème : 7 tests,
  mutation de la migration sans `BLACK_WEEK` : 2 échecs attendus.
- Bout en bout des thèmes, quatre largeurs : 121 verts (Noël compris).
  Mutations : allégation « -30 % », bouton de pause retiré, poussière sans
  script, liseré à l'ancienne géométrie, anneau de focus retiré, toutes
  détectées par le test visé.
- Contrastes : 3 blocs de thème, 14 jetons ; mutation 11 sur 11.

## À savoir pour LS-319

Le test de bout en bout du catalogue refuse tout « -NN % » : il devra
l'admettre quand la promotion est active, et seulement alors.

## Prochaine étape

Mise en production sur accord de Christophe (migration classée destructive,
`--confirm-destructive`), puis LS-319 : ADR de la promotion, tests de prix et
de concurrence avant le code.

## État des tickets

- **LS-318** : code sur `main` après fusion, critères 1 à 7 remplis, en
  production à faire.
- **LS-319** : À faire.

## Fusion, même jour

PR #660 fusionnée en rebase, `main` à `274f406`. Deux passages rouges avant :
le contrôle « Format », Prettier non lancé en local sur deux fichiers ; puis
`tests/composant/gestion-passkeys-ls295.test.tsx`, « bascule vers la
confirmation quand la route refuse faute de preuve », un `toHaveFocus` en
échec sur le runner. **Sans lien avec LS-318** : 6 passages sur 6 en local,
`main` vert sur ses six derniers passages, et le job relancé passe. Première
occurrence relevée, à surveiller : un second échec ouvrira un ticket.
