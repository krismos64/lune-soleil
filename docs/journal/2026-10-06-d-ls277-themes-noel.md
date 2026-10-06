# 6 octobre 2026 : LS-277, deux thèmes de Noël validés en maquette

Suite de `2026-10-06-c`.

## Ce qui a été fait

- Christophe écarte l'ancien thème de Noël de LS-267, qui n'est pas actif en
  production (vérifié : ni `data-theme` ni ruban sur l'accueil et le catalogue).
- **Maquette refaite** en rouge et blanc, en deux variantes comparables :
  « Noël 1, sobre », dans le cadre d'ADR-046, et « Noël 2, franc », qui
  colore le bandeau. Deux images générées par Codex : un papier cadeau rouge et
  blanc, et un paquet au ruban sous la neige, sans bijou ni texte.
- Sur sa demande, mouvement continu des flocons, du soleil et des boules, avec
  un bouton de pause discret (WCAG 2.2.2), puis la **page des créations** dans
  les deux thèmes, sur les douze premières pièces en ligne : cartes en paquet
  cadeau, bouton d'achat animé, filtres et pagination décorés, neige dans les
  marges.
- **Validation totale des deux thèmes sur les deux pages**, arbitrage du
  6 octobre. Maquette versée dans `docs/prototypes/themes-noel/`. **LS-277**
  créée sous LS-7, avec ses critères.
- Contrôles des maquettes : captures en 390 et 1280 px, aucun débordement,
  aucune erreur, pause mesurée (rien ne bouge après le clic), aucun bouton
  dans un lien.

## Ce qui a dérapé

- **Les 51 produits étaient archivés** depuis le 4 octobre à 20 h 57, par une
  seule action d'administration trente minutes après le déploiement de LS-266
  et LS-267, ce qui vidait le catalogue et refermait `robots.txt`. Constaté en
  lisant la page des créations, signalé, **republié par Christophe** le soir
  même : 50 pièces en ligne, `robots.txt` rouvert. Auteur non identifiable,
  aucune connexion journalisée sur le créneau. **LS-278** ouverte : confirmation
  de l'archivage groupé, alerte sur catalogue vide, auteur journalisé.
- Un premier jet de la maquette mettait le bouton d'achat à l'intérieur du
  lien de la carte : HTML invalide, corrigé avant la validation.

## Prochaine étape

Les deux amendements sont acceptés le même soir, PR #535, et LS-277 démarre :
journal `2026-10-06-e`.

## État des tickets

LS-277 débloquée par les amendements, puis en cours. LS-274 en cours jusqu'au
nocturne vert. LS-273 et LS-258 en cours. LS-275, LS-276 et LS-278 à faire.
