# 12 novembre 2026 : Black Week, tickets et maquette, LS-318 et LS-319

## Demande

L'exploitante veut un thème Black Week du lundi 23 au dimanche 29 novembre 2026,
avec tous les prix barrés à -30 %.

## Arbitrages de Christophe

- Aucun prix modifié depuis fin octobre : le prix actuel est le prix de
  référence de L112-1-1 pour cette Black Week.
- **Activation et désactivation manuelles** par l'exploitante, thème comme
  promotion.
- Taux fixe de 30 % écrit dans le code, tout le catalogue, port non réduit,
  arrondi au centime inférieur, seuil de franchise sur le montant réduit, prix
  figé à la création de la commande, chaque bascule historisée.
- Palette noir et jaune doré, **mouvement continu** pour attirer l'œil.

## Fait

- **LS-318**, thème, et **LS-319**, promotion, créés sous LS-7, rattachement
  vérifié par JQL `parent = LS-7`. LS-318 en cours. Le paramètre `parent` de
  `createJiraIssue` n'a rien posé : rattachement refait par `editJiraIssue`.
- Maquette `docs/prototypes/theme-black-week/`, promotion active ou inactive,
  catalogue, fiche et panier. Contrastes calculés, deux valeurs annoncées de
  mémoire étaient fausses (11,4 pour 11,29 ; 4,72 pour 5,04) et ont été
  corrigées.
- Contrôlée dans Chrome : 320 px et 1280 px sans débordement, promotion
  inactive sans aucun élément de promotion visible, mouvement réduit figé avec
  le prix barré par `text-decoration`, aucune erreur en console.

## Points ouverts, dans le README de la maquette

Titre « Black Week » sans promotion active, absence de dates dans les textes,
phrase sur le prix de référence à vérifier aux sources.

## Prochaine étape

Validation de la maquette par Christophe, puis LS-318 dans le site et l'ADR de
LS-319 (skill `adr`), à livrer avant le lundi 23 novembre 2026.

## État des tickets

- **LS-318** : En cours, maquette en validation.
- **LS-319** : À faire, ADR avant le code.
