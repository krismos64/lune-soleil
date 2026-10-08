# 8 octobre 2026 : l'accueil, portes de catégorie, réassurance illustrée et logo Facebook

Suite de `2026-10-08-c`. Demande de Christophe : le logo Facebook au pied, et
une refonte en motion design des sections « Choisir simplement » et de
réassurance, avec Codex si besoin. Pas de ticket neuf, consigne de la
session : rattaché à LS-260 (accueil animé) et LS-30 (lien Facebook).

## Ce que Codex a apporté, et ce qui a été écarté

Retenu : de vraies photos pour les catégories, un arc solaire tracé derrière le
titre, des cartes visibles dès le premier rendu, un bandeau sans filets avec
des icônes sobres de même épaisseur, aucune animation dans le tunnel.

Écarté : traiter Noël à part (les catégories viennent de l'administration, un
cas codé en dur casserait au prochain changement) et un dessin de mains (un
tracé générique affaiblirait le caractère artisanal), remplacé par l'emblème
lune et soleil.

## Livré

- **Portes de catégorie** : une carte cintrée par catégorie publiée, la vraie
  photo de sa pièce la plus récemment publiée et le nombre de pièces en vente,
  `listerCouverturesCategories`. Aucune image de bijou engendrée. Arc solaire
  tracé une fois en 1,2 s, photo qui s'approche et flèche qui avance au survol.
- **Réassurance** : une icône au trait par engagement dans un médaillon, plus
  de filets ; tracé des icônes sur l'accueil seul, option `anime`.
- **Logo Facebook** au pied, SVG en ligne, décoratif.
- **Défaut corrigé au passage** : le surtitre « Choisir simplement » était en
  or foncé sur sable, 4,23:1, paire refusée par C31 ; il passe en primaire,
  7,49:1, calculé.

## Preuves

Aucun débordement aux quatre largeurs, rendu capturé au repos et à mi-animation.
Intégration 34 passed dont 3 neufs, mutations (photo la plus ancienne, pièces
hors vente comptées) détectées ; composants 9 passed dont 2 neufs ; bout en
bout 510 passed sur les specs de l'accueil, du catalogue, des thèmes, de la
fiche, du panier et du tunnel. Contrôles du dépôt verts.
