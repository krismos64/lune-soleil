# 7 octobre 2026 : LS-280, maquette de la page Livraison et aide

## Ce qui a été fait

- **Demande de Christophe** : refondre `/aide` en motion design, assortie à
  l'accueil, avec critique et images de Codex, et une maquette à valider avant
  tout code. LS-280 créée sous LS-7, aucun ticket n'existant.
- **Contradiction signalée** : ADR-045, point 7, classe l'aide en page Action,
  micro-interactions seulement. La maquette sert d'arbitrage, comme LS-268 pour
  le contact ; l'amendement s'écrira si elle est validée.
- **Maquette** `docs/prototypes/aide-animee/` : héros d'aube avec aquarelle
  cerclée et anneau tracé, trois fiches de mode comparables, franchise à part,
  parcours du colis en quatre étapes avec un colis qui le parcourt, cadran de
  quatorze lunes pour la rétractation, deux parcours de retour, FAQ sur un ciel
  de nuit. Deux aquarelles générées par Codex, réencodées sans métadonnées.
- **Mesuré dans le navigateur** : fin de la plus longue séquence à 4,5 s,
  aucune animation infinie, zéro animation et tout le décor dessiné en
  mouvement réduit, aucun débordement à 320 px.
- **Codex a critiqué deux fois** : la page actuelle, puis la maquette. Retenu
  et écarté détaillés dans le README de la maquette.

## Dérives

- J'avais écrit « emballé à la main » dans une étape du parcours : le type
  d'emballage fait partie des questions 38 à 42 sans réponse, LS-26. Retiré.
- Une session parallèle sur LS-279, dans le même dossier, a embarqué les
  brouillons de la maquette dans deux commits poussés, `8704483` et `4b2e564`,
  dont deux PNG de 2 Mo. Prévenue, elle a réécrit sa branche non fusionnée :
  la PR #539 porte `88c49a0`, `f6b8c5b` et `9c59aec`, dont aucun ne touche
  `docs/prototypes`, vérifié après `git fetch`. Cause : un `git add -A` dans
  un dossier partagé. LS-280 est commitée depuis un worktree séparé pour ne
  pas changer de branche sous l'autre session.
- Défauts relevés sur la page en production, à corriger au portage : le lien
  « page de contact » du bloc FAQ s'affiche en bleu navigateur ; le contact
  annonce des « délais » sur une page qui n'en publie aucun.

## Prochaine étape

Christophe valide ou corrige la maquette. Ensuite : amendement d'ADR-045,
portage dans `src/app/(boutique)/aide/` avec tarifs lus en configuration,
LCP et CLS mesurés avant et après, revue `ls-frontend-revue`.

## État des tickets

LS-280 en cours, maquette livrée, à valider. LS-279 suivie par une autre
session.
