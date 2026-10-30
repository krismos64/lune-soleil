# 30 octobre 2026 : photos portées ajoutées aux 14 boucles d'oreilles qui n'en avaient pas

Demande de Christophe. Aucun code applicatif touché : intervention de contenu
en production, par l'interface d'administration, dans le cadre d'ADR-047.

## Fait

Inventaire du catalogue public (sitemap puis chaque fiche) : 65 pièces
publiées, dont 14 boucles d'oreilles à une seule photo, 11 de la collection
Noël et 3 boucles d'oreilles, toutes publiées après le lot du 9 octobre. Les
5 bagues sont hors périmètre.

Pour chacune, une photo portée générée par Codex d'après la photo produit,
réencodée et passée dans `traiterPhotographie`, relue sur planche contre
l'original (14 fidèles, aucun visage ni texte), validée par Christophe puis
téléversée en seconde position par l'admin, avec un texte alternatif finissant
par « Photo d'illustration. ». Outil : skill personnel
`lune-soleil-photos-portees`, hors dépôt.

## Preuves

Sur le site public, après insertion :

| Mesure | Valeur |
| --- | --- |
| pièces publiées | 65 |
| avec deux photographies | 65 |
| descriptions retrouvées sur leur fiche publique | 14 sur 14 |

Aucun doublon : chaque envoi était précédé d'un contrôle du titre exact de la
fiche, du nombre de photos (exactement une), de l'onglet visible et de
l'hydratation de la section, qui arrêtait l'enchaînement sinon.

## Pièges rencontrés

- Neige Écarlate : Codex a répondu « Selected model is at capacity », une
  relance unique a suffi.
- Deux téléversements refusés par l'outil du navigateur (« not a file input »),
  la référence du champ fichier ayant changé : rien n'est parti, relance sur la
  référence donnée par `find`.

## Relevé hors lot

Sur « Trésor de Noël », le texte alternatif de la **première** photo, saisi
avant cette session, nomme « Malice Dorée ». Non corrigé, hors du lot validé :
à corriger dans l'admin.

## Prochaine étape

LS-300 (vignette et lien des pièces au récapitulatif), puis LS-298 (message
« email vérifié »).

## État des tickets

Aucun ticket ouvert ni modifié : intervention de contenu sans story.
