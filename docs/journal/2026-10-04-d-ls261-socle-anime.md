# 4 octobre 2026 : LS-261, en-tête, menu mobile plein écran et pied de nuit

Suite de `2026-10-04-c`. Arbitrage de Christophe : le déploiement attend la
fin de la refonte, LS-260 à LS-263.

## Ce qui a été fait

- **Menu mobile plein écran**, `src/components/menu-mobile.tsx`, sous 768 px :
  liens numérotés avec description, raccourcis compte et panier, lune et
  soleil, ciel de nuit. **Bâti sur `<details>`** : sans script, toucher
  « Menu » ouvre le panneau dans le flux, sous la barre, et la navigation
  reste atteignable. Le script ajoute l'ouverture en cercle, le focus sur le
  premier lien et sa boucle, Échap, la page et le reste de l'en-tête
  `inert`, la fermeture au clic et au changement de page.
- **En-tête** : libellés inchangés. La navigation en ligne n'existe qu'à
  partir de 768 px ; compte et panier restent dans la barre à toutes les
  largeurs, en pictogrammes sous 480 px avec leur texte comme nom
  accessible. Le panier porte le même nom dans la barre et dans le menu.
- **Pied de page** sur la nuit, colonnes et liens inchangés, contour de
  focus clair : le brun habituel n'y donne que 1,46:1.
- **`ApparitionAuDefilement` passe dans le layout de la boutique**, et se
  rejoue à chaque changement de chemin.
- `tests/e2e/menu-mobile-ls261.spec.ts` : clavier, inertie, fermeture,
  page courante, axe-core, sans script, et navigation en ligne au-delà de
  768 px.

## Ce qui a dérapé

- **Deux tests voisins ont rougi à cause du menu**, présent dans l'en-tête de
  toutes les pages. `gabarit-titre-public-ls229` cherche la première classe
  finissant par `__panneau`, et `compte-commandes` mesure la frise sur le
  premier `<ol>` du document : le menu fournissait les deux. Corrigé dans le
  menu, classe renommée et liste en `<ul>`, ses numéros étant un décor.
- **La revue `ls-frontend-revue` a relevé huit défauts**, tous corrigés :
  - l'ouverture animait `clip-path`, qu'ADR-045 n'autorise pas, remplacée par
    un disque en `transform` ;
  - un lien vers la page affichée laissait le menu ouvert sur une page
    inerte ;
  - l'en-tête restait lisible au lecteur d'écran sous le panneau ;
  - sans script, le focus passait sous un panneau opaque ;
  - l'apparition ne se rejouait pas en navigation client ;
  - le panier portait deux noms ;
  - le bouton doublait son état en disant « Fermer » ;
  - trois commentaires étaient devenus faux.
- **Une mutation n'a rien prouvé au premier essai** : un `return` placé avant
  du code le rendait inatteignable, et la construction échouait avant tout
  test. Rejouée par une mutation qui compile, attrapée.
- **La fiche produit débordait de 120 px une fois sur trois** à 320 et
  390 px, trouvé par la suite complète. Chrome masque le contenu d'un
  `<details>` fermé sans lui retirer sa boîte : avant l'hydratation, le
  panneau, encore dans le flux, restait posé hors de l'écran à droite du
  bouton. Un test de diagnostic temporaire a listé les éléments en cause,
  puis a été supprimé. Corrigé par `display: none` sur le panneau fermé :
  3 échecs sur 10 avant, 20 réussites sur 20 après.
- **`setState` dans un effet est refusé par le lint du projet** :
  `useSyncExternalStore` donne le drapeau « script présent » sans effet.

## Preuves

- Quatre mutations attrapées par le test prévu seul : Échap, boucle de
  tabulation, fermeture au changement de page, fermeture au clic.
- Contrôles textuels de la CI au vert, types et lint au vert.
- **Suite de bout en bout complète en local** : 2 291 réussis et 82 ignorés,
  code 0. Les ignorés sont les 70 du nocturne plus les 12 que le test du
  menu écarte selon la largeur. Les quatre messages
  « failed-to-find-server-action » du serveur existaient déjà dans la suite
  de LS-260.
- Rendu contrôlé à 320, 390, 768 et 1280 sur `/`, `/catalogue` et `/aide`,
  sans débordement ; menu avec script, sans script et en mouvement réduit.

## Prochaine étape

LS-262, Notre univers et le catalogue, maintenant débloquée.

## État des tickets

LS-261 close à la fusion. LS-262 et LS-263 à faire. LS-264 attend un
arbitrage de libellé. LS-258 en cours jusqu'au 17 octobre.
