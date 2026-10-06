# 6 octobre 2026 : LS-271, nocturne rouge, quatre mutations hors cible

Suite de `2026-10-05-a`.

## Ce qui a été fait

- **Issue #525**, nocturne n°54 du 5 octobre : seule l'étape « Preuves par
  mutation lourdes » est rouge, sur quatre cas RATE. Les tests étaient
  voyants, et chaque fois la mutation visait un code que la refonte du
  4 octobre avait déplacé.
- **Échap du panneau d'archivage** : LS-266 a placé avant lui le panneau de
  retrait, qui porte le même gestionnaire `Escape`. L'expression perl mutait
  la première occurrence, donc le retrait. Elle s'ancre désormais sur
  `confirmation === "archiver"`. Le retrait a son propre test d'Échap,
  `retrait-espace-ls266.spec.ts`.
- **Cas 11, 11 bis et 11 ter, débordements de l'accueil** : LS-260 a posé
  `overflow: hidden` sur `.hero`. La coupe est légitime : retirée, elle laisse
  les feuilles animées de l'emblème sortir de l'écran, le test de débordement
  rougissant aux quatre largeurs (jusqu'à 400 px en 1280). Un titre élargi dans
  le héros est coupé sans barre de défilement, et la mesure l'ignore donc à bon
  droit. Les trois cas visent maintenant la section éditoriale, rendue même
  catalogue vide et coupée par aucun ancêtre.
- Preuves : `verifier-etats-non-nominaux-mutation.sh` donne 6 mutations sur 6.
  Les trois débordements, rejoués à la main contre `page-accueil.spec.ts`,
  rougissent sur 3, 2 et 4 largeurs, et le témoin non muté est vert (28 tests).
  `verifier-mutations-a-sec.sh` : 240 expressions, aucune périmée.

## Ce qui a dérapé

- La garde à sec de LS-254 ne voyait aucun des quatre cas : chaque expression
  modifiait bien un caractère, mais au mauvais endroit ou sans effet
  observable. La mémoire « Cible de mutation déplacée » porte maintenant cette
  forme.
- Les commentaires des cas 11 et 11 bis affirmaient des largeurs de détection
  devenues fausses. Ils sont corrigés à partir de la mesure.

## Risque résiduel, à arbitrer

Un texte trop large dans le héros est désormais coupé sans alerte. La mesure
ne voit pas un contenu tronqué par un ancêtre en `overflow: hidden`.
`overflow-wrap: anywhere` limite le risque pour le texte courant. Écrit dans
LS-271.

## Nocturne n°55 et LS-272

- Le nocturne n°55 a tourné sur `c7decbd` : preuves lourdes vertes,
  `180 mutations, 180 detectees`, d'où la clôture de LS-271.
- Il reste rouge sur l'audit : GHSA-68fv-2mgg-jv7q, gravité haute, publié
  dans la nuit sur `source-map-js` 1.2.1, seul paquet non exempté. **LS-272** :
  la 1.2.2 tient dans les plages déclarées par `postcss`, `css-tree` et
  `magicast`. `npm update source-map-js` ne modifie que le verrou.
- Preuve : le filtre d'audit du nocturne, rejoué sur `main`, sort
  « NON EXEMPTE source-map-js ». Avec la correction, 5 paquets signalés, tous
  couverts par l'exemption `braces`, code 0. Types, lint et build au vert ;
  1760 tests sur 1760.

## Nocturne lancé à la main et LS-273

- Run 37469871570 sur `fde4fe1` : audit vert (LS-272 close), mutations à 180
  sur 180, mais **60 échecs de bout en bout**, tous des délais dépassés de
  `page.goto` en attente de `load`. Tous mènent à `/administration/connexion`
  en 1280 px. Aux autres largeurs, seul le test qui passe en 1280 échoue.
  Aucune défaillance d'autorisation.
- Vert en local (140 tests) et au n°55 du matin. En 1280, la page ne demande
  qu'une image, `univers-atelier.jpg` en `w=640`, que la production sert en
  0,3 s. L'hypothèse d'une optimisation d'image bloquée n'est pas prouvée.
- **Le diagnostic était impossible** : en CI, le reporter était `github`
  seul, sans dossier `playwright-report/`. L'étape de rapport concluait « No
  files were found » et passait au vert, depuis le 31 juillet. LS-273 ajoute
  le reporter HTML en CI. Prouvé sous `CI=1` : rapport et trace écrits, aucune
  ligne de sortie en plus, donc aucun effet sur les filtres des mutations.

## Prochaine étape

LS-273 : relancer le nocturne et lire la trace au prochain échec, puis
fermer #525 sur un vert. Ensuite LS-270, en zone critique. LS-258 :
l'exemption `braces` échoit le 17 octobre.

## État des tickets

LS-271 et LS-272 closes. LS-273 en cours. LS-270 à faire. LS-258 en cours.
LS-269 fusionnée, non déployée.
