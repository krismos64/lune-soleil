# 24 septembre 2026, fin d'après-midi : LS-251, la réassurance sur trois écrans

Suite de `2026-09-24-b`. Pendant le nocturne relancé pour LS-252, Christophe a
choisi LS-251.

## L'arbitrage

Le ticket demandait de trancher en démarrant entre le bandeau entier et un
sous-ensemble sur la fiche. À 320 px, les six éléments empilent près de 500 px.
Trois options présentées, Christophe a retenu la recommandée : **le même
composant, un sous-ensemble par écran**.

| Écran | Éléments | Région |
|---|---|---|
| fiche, bloc 7 | livraison, gratuité | Informations de livraison |
| panier | les six, après les actions | Engagements de la boutique |
| tunnel | paiement, rétractation, contact | Engagements de la boutique |

`BandeauReassurance` prend `elements` et `nom`. Le texte reste écrit dans le
composant, et l'ordre rendu est toujours le sien, quel que soit celui demandé.
La ligne de livraison écrite à la main dans `selecteur-variante.tsx` disparaît :
son commentaire disait encore que le composant « n'existe pas encore ». Le
sélecteur étant un composant client, la page serveur rend le bloc 7 et le lui
passe en prop.

## Ce que la revue a trouvé

`ls-frontend-revue`, rien de bloquant, trois points corrigés :

- **le bandeau se découpait sur la largeur de l'écran**, `@media`, alors qu'il
  vit dans la colonne d'achat de la fiche : trois colonnes dans 548 px à
  1280 px, une case vide. Passé en `container query`. Mesuré après : fiche en
  une colonne aux quatre largeurs, accueil inchangé, 1, 1, 2 et 3
- **le bandeau touchait le dernier lien** du panier et du tunnel, marge ajoutée
- **« 14 jours » écrit en dur**, depuis LS-236, quand le tunnel l'affiche
  désormais sous la mention légale qui lit `DUREE_RETRACTATION_JOURS`. Il la
  lit aussi

## Preuves

- tests de composant, 7 : sous-ensemble, ordre, réserve des frais de retour,
  aucune région sans élément. Deux prouvés par mutation, l'ordre de la liste
  reçue et la garde de région vide
- bout en bout : fiche, panier et tunnel avec seuil lu en base, débordement et
  axe-core. Le test « sous le bouton de commande » prouvé par mutation, bandeau
  remonté au-dessus du bouton : y 673 contre 1310, rouge
- 197 tests de bout en bout sur les cinq fichiers concernés, aux quatre largeurs
- captures à 320 px relues sur les trois écrans

## Ce qui a dérapé

- **une capture du panier montrait le bandeau au-dessus du bouton** : le serveur
  relancé servait le build de la **mutation**, restaurée dans les sources mais
  pas reconstruite. Motif « construire n'est pas servir », déjà en mémoire. Une
  capture après une preuve par mutation exige un build neuf

## État des tickets

**LS-251** : critères 1, 2 et 3 faits, `ls-frontend-revue` passée. Clos à la
fusion.

## Prochaine étape

1. Le nocturne 36011272260 pour LS-252 et LS-235
2. Le contrôle à sec des expressions de mutation par PR, proposé
