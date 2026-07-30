# components/

Composants d'interface réutilisables.

Composant serveur par défaut. Un composant client uniquement pour une interaction
réelle, avec `"use client"` explicite et le périmètre le plus étroit possible.

## Ce qui entre ici

- le rendu et les états obligatoires : vide, chargement, erreur, pending,
  disabled, indisponible
- les jetons de `src/styles/tokens.css`, jamais une valeur hexadécimale en dur

## Ce qui n'entre pas

- le calcul métier : un prix, un total ou une disponibilité viennent du serveur,
  jamais d'un calcul dans le navigateur
- l'accès aux données

Les textes visibles suivent les règles de rédaction du projet : tous les accents,
aucun tiret cadratin, aucun accord au féminin par défaut. Détail dans
`.claude/rules/frontend-design.md`.
