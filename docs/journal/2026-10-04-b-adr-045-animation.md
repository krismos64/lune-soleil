# 4 octobre 2026 : maquette d'accueil animée validée, ADR-045 accepté

Suite de `2026-10-04-a`.

## Ce qui a été fait

**Une maquette d'accueil animée**, construite hors dépôt à partir du logo
vectoriel, a été validée par Christophe après trois tours : menu mobile plein
écran, retrait du bouton de pause, vrais liens du site. Elle reste hors dépôt
jusqu'à LS-260, qui la verse dans `docs/prototypes/`.

**Arbitrage de Christophe** : le rendu animé s'étend aux autres pages
publiques, avec une intensité dosée par type de page. Cinq tickets, sous
l'epic LS-7 :

- LS-259, ADR-045 : **close** ;
- LS-260, accueil, et LS-261, socle commun : bloquées par LS-259 seulement ;
- LS-262, notre univers et catalogue, et LS-263, fiche produit et pages
  d'action : bloquées aussi par LS-261.

**ADR-045 accepté et fusionné**, PR #509 : aucune bibliothèque d'animation,
contenu principal visible au premier rendu, arrêt automatique des boucles sans
bouton de pause, intensité par type de page, Playwright en mouvement réduit.
Il amende `frontend-design.md` : dégradé de ciel limité à deux décors, texte
doré à 3:1 par arrêt de couleur, paillettes sans canvas.

Mesures qui fondent l'ADR : script de la maquette 3 461 octets gzip contre
20 329 pour `motion` `animate` et 41 404 pour `motion/react` ; arrêts dorés de
la maquette à 5,66, 4,26, 1,84 et 1,45:1 sur `#fffaf1`.

**Le catalogue porte des pièces réelles** et `robots.txt` autorise
l'indexation, relevé sur `lune-soleil.fr`. Le README et la fiche mémoire
d'état affirmaient encore l'inverse, corrigés.

## Ce qui a dérapé

- **Le skill `adr` refuse l'invocation par Claude**, réservé à `/adr`. Le
  travail a attendu que Christophe le lance.
- **Deux scripts d'édition de la maquette** se sont arrêtés sur leur propre
  garde-fou avant d'écrire, l'un sur une expression trop large, l'autre sur
  une ligne d'accolade. Fichier intact les deux fois.
- **La capture sans fenêtre de Chrome** ne fait avancer ni le temps ni le
  défilement, et impose une largeur minimale vers 500 px. Les mesures de
  rendu ont été refaites avec Playwright.

## Prochaine étape

LS-260, l'accueil : verser la maquette dans `docs/prototypes/`, poser
`reducedMotion: "reduce"` dans `playwright.config.ts`, mesurer LCP et CLS
avant de toucher la page.

## État des tickets

LS-259 close. LS-260 à LS-263 à faire. LS-258 en cours jusqu'au 17 octobre.
