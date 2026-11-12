# Maquette du thème Black Week et de la promotion de 30 %, LS-318 et LS-319

Maquette du 12 novembre 2026, **en attente de validation par Christophe**. Une
page HTML autonome : l'ouvrir dans un navigateur suffit, sans serveur.

La barre du bas bascule deux choses :

- **Promotion active ou inactive.** Inactive, la page montre le thème seul :
  aucun prix barré, aucun badge, aucune bande défilante, aucune mention de
  réduction. C'est la séparation exigée par ADR-046 : un thème n'annonce rien,
  la promotion (LS-319) porte seule les allégations de prix.
- **Catalogue, fiche produit, panier**, pour voir le bloc de prix dans les
  trois contextes.

## Ce qu'elle montre

- Palette noir et jaune doré. Contrastes calculés en tête du style : l'or vif ne
  s'écrit que sur la nuit, jamais sur le fond clair (1,65:1).
- **Mouvement continu**, à la demande de Christophe : soleil levant aux rayons
  tournants, poussière d'or, reflet sur « Week », bande défilante, entrée des
  cartes, trait doré qui barre l'ancien prix, tampon « -30 % » et son reflet,
  liseré doré au survol, gerbe d'étincelles au clic, poussière dans les marges
  au-delà de 1240 px. Cadre de l'amendement d'ADR-045 posé pour Noël : **bouton
  de pause** flottant, **rien** en mouvement réduit (état final affiché, prix
  barré par `text-decoration`), aucun décor sur une photographie ni un contrôle.
- Prix réduit calculé comme le fera le serveur : `floor(centimes * 70 / 100)`,
  1200 donne 840.

## Points ouverts pour la validation

1. **Le titre « Black Week » reste affiché quand la promotion est inactive.**
   Le nom de l'événement suggère une réduction : à garder, ou à remplacer par
   un titre neutre en l'absence de promotion ?
2. **Aucune date dans les textes.** L'activation étant manuelle, « jusqu'au
   29 novembre » deviendrait faux si la promotion était coupée plus tôt ou
   laissée plus tard.
3. **La phrase « Prix barré : le plus bas pratiqué sur les 30 jours précédant
   la Black Week »** est une proposition, à vérifier aux sources (L112-1-1)
   avant d'entrer dans le site.

## Écarts qui ne se reportent pas dans le site

- le titre se révèle mot à mot : le site l'affiche au premier rendu ;
- les cartes apparaissent en fondu : le site les affiche au premier rendu,
  seul leur décor s'anime (ADR-045, point 5) ;
- « Ajouter au panier » montre une coche de démonstration, sans rien ajouter.

**Données réelles, en lecture seule** : les douze pièces reprises du prototype
de Noël, données publiques du catalogue, photos chargées depuis
`lune-soleil.fr`. Elles ne servent d'amorce à aucun test ni à aucune base.
