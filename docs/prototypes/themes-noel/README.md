# Maquette des deux thèmes de Noël, LS-277

Maquette validée par Christophe le 6 octobre 2026, à l'origine de LS-277. Elle
remplace l'ancien thème de Noël de LS-267, qu'il a écarté. Deux pages HTML
autonomes : les ouvrir dans un navigateur suffit, sans serveur. La barre du bas
bascule entre « Noël 1, sobre » et « Noël 2, franc », et le choix suit d'une
page à l'autre.

- `index.html` : l'accueil, avec aussi le rendu hors Noël pour comparer.
- `creations.html` : la page des créations.

**Référence de rendu, pas source de vérité.** Là où elle diffère d'un ADR,
l'ADR l'emporte. Deux de ses choix ont demandé un amendement, tracé le
6 octobre 2026 en tête de chaque ADR :

- **Noël 2** change le fond, le titre, le texte et les boutons du bandeau,
  ce que la section 2 d'ADR-046 interdisait avant l'amendement ;
- le **mouvement continu** des flocons, du soleil, des boules et de la neige des
  marges, avec un bouton de pause, dépassait la borne de cinq secondes du
  point 4 d'ADR-045.

Écarts acceptés qui ne se reportent pas dans le site :

- le titre se révèle mot à mot : le site l'affiche au premier rendu ;
- les cartes du catalogue apparaissent en fondu : le site les affiche au
  premier rendu, seul leur décor s'anime (ADR-045, point 5) ;
- le surtitre rose pâle de Noël 2, `#ffe3dc`, tombe à 4,31:1 : le site écrit
  tout petit texte sur le rouge en blanc pur ;
- la poussière d'or de l'accueil est un canvas : le site la rend en CSS ;
- au clic, « Ajouter au panier » montre une coche de démonstration, sans rien
  ajouter.

**Données réelles, en lecture seule.** La page des créations reprend les douze
premières pièces en ligne le 6 octobre 2026 : noms, catégories, prix,
disponibilité, et photos chargées depuis `lune-soleil.fr`. Ce sont des
données publiques du catalogue. Elles ne servent d'amorce à aucun test ni à
aucune base.

`papier-cadeau.jpg` et `paquet-ruban.jpg` ont été générés par Codex le
6 octobre 2026, sans bijou ni texte, métadonnées retirées. Le papier cadeau
présente un léger raccord : LS-277 le régénère avant l'intégration.
`logo.jpg` est le logo de Christophe, métadonnées retirées, copie de
`accueil-animee/`.
