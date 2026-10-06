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

## Prochaine étape

Vérifier le nocturne qui suit la fusion, puis fermer #525 et LS-271. Ensuite
LS-270, en zone critique. LS-258 : l'exemption `braces` échoit le 17 octobre.

## État des tickets

LS-271 en cours, jusqu'au nocturne vert. LS-270 à faire. LS-258 en cours.
LS-269 fusionnée, non déployée.
