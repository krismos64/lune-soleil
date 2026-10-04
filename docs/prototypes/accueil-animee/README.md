# Maquette d'accueil animée, LS-260

Maquette validée par Christophe le 4 octobre 2026, à l'origine d'ADR-045.
Page HTML autonome : l'ouvrir dans un navigateur suffit, sans serveur.

**Référence de rendu, pas source de vérité.** Là où elle diffère d'ADR-045,
l'ADR l'emporte. Trois écarts y sont acceptés et ne se reportent pas :

- le titre se révèle mot à mot et reste invisible 1,6 s : le site l'affiche
  au premier rendu ;
- le dégradé doré du titre emploie deux arrêts sous 3:1 (`#e0b657`,
  `#f0cf7a`) : le site ne garde que les arrêts bronze ;
- le bouton principal porte un reflet au survol : le site ne le porte pas.

La poussière d'or y est un canvas à positions aléatoires ; le site la rend en
CSS à positions fixes, règle des paillettes de `frontend-design.md`.

**Aucune donnée réelle de produit.** Les cartes portent « Emplacement photo »
et aucun prix. Les liens pointent vers `lune-soleil.fr`.

`logo.jpg` est le logo de Christophe, métadonnées retirées.
