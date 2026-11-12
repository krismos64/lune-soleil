# Maquette du thème Black Week et de la promotion de 30 %, LS-318 et LS-319

Maquette du 12 novembre 2026, **validée par Christophe le même jour**. Une
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

## Arbitrages de la validation, 12 novembre 2026

1. **Le titre « Black Week » est gardé** même si la promotion est inactive :
   l'exploitante active toujours la promotion en même temps que le thème.
2. **Les dates sont écrites** (« du lundi 23 au dimanche 29 novembre »),
   dans l'accroche et la bande défilante de la promotion. L'exploitante
   s'engage à activer et désactiver aux bonnes dates : laissée active après le
   29, l'annonce deviendrait fausse.
3. **Mention sous le prix barré** : « Prix barré : prix le plus bas pratiqué
   au cours des 30 jours précédant la réduction. » Article L112-1-1 lu sur
   Légifrance le 12 novembre 2026 (version en vigueur depuis le 28 mai 2022,
   ordonnance n° 2021-1734) : il impose d'indiquer ce prix antérieur et
   n'impose ni n'interdit de mention explicative. La phrase en reprend les
   termes.

## Écarts qui ne se reportent pas dans le site

- le titre se révèle mot à mot : le site l'affiche au premier rendu ;
- les cartes apparaissent en fondu : le site les affiche au premier rendu,
  seul leur décor s'anime (ADR-045, point 5) ;
- « Ajouter au panier » montre une coche de démonstration, sans rien ajouter.

**Données réelles, en lecture seule** : les douze pièces reprises du prototype
de Noël, données publiques du catalogue, photos chargées depuis
`lune-soleil.fr`. Elles ne servent d'amorce à aucun test ni à aucune base.
