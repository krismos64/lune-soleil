# 9 octobre 2026 : photos portées générées, ajoutées à 44 boucles d'oreilles

Demande de Christophe. Aucun code applicatif touché : intervention de contenu
en production, par l'interface d'administration.

## Fait

Une seconde photographie « portée » ajoutée à **44 pièces** de boucles
d'oreilles : la boucle sur une oreille de profil, fond blanc, visage hors
champ. Générée par Codex à partir de la photo produit réelle, relue sur
planche contre l'original (43 fidèles, Fleur dorée vérifiée sur l'original),
puis téléversée par l'admin, sans script serveur ni accès à la base.

Chaque photo porte un texte alternatif qui décrit le bijou et finit par
« Photo d'illustration. », par exemple « Boucle d'oreille Neige d'Hiver portée :
bonhomme de neige blanc à écharpe rouge, sur puce. Photo d'illustration. »

Outil : skill personnel `lune-soleil-photos-portees`, hors dépôt
(`~/.claude/skills/`), qui liste les articles à une photo depuis le site
public, génère, réencode, contrôle par `traiterPhotographie` puis insère par
l'admin après validation de la planche.

## Preuves

Sur le site public, après insertion :

| Mesure | Valeur |
| --- | --- |
| pièces publiées | 50 |
| avec deux photographies | 50 |
| fiches vérifiées, 2 médias et description présente | 44 sur 44 |
| boucles d'oreilles à une seule photo, détection du skill relancée | 0 |

Aucun doublon : chaque envoi était précédé d'un contrôle du titre de la fiche
et du nombre de photos, qui arrêtait l'enchaînement sinon.

## Écart avec une règle du projet, à arbitrer

Le dépôt n'admet les images Codex qu'en habillage, **sans bijou ni texte,
sans personne** (ADR-045, ADR-046, `public/habillage/README.md`), et l'epic
LS-22 interdit tout contenu fictif présenté comme réel. Ces photos montrent un
bijou réel sur une oreille générée ; la mention « photo d'illustration » n'est
que dans le texte alternatif, **invisible à l'écran**. L'écart n'a été relevé
qu'après l'insertion.

Options : retirer les 44 photos, les garder avec une mention visible sur la
fiche (story et code), ou acter l'exception par un ADR. Non tranché.

**Tranché le même jour par Christophe : exception actée, ADR-047**
(`8d833f0`, PR #577). La photo portée générée est admise en photo
complémentaire, jamais en première position, à six conditions que les 44
photos tiennent. Aucune mention visible ajoutée ; son éventuelle obligation
légale reste à vérifier aux sources.

## Défauts et pièges rencontrés

**Faux positif C2PA, non corrigé.** Les PNG de Codex et ChatGPT sont refusés
au téléversement : leur manifeste C2PA (bloc `caBX`) embarque un logo SVG, que
`formatRefuseParSignature` de `traitement.ts` lit dans les 1024 premiers
octets. Une vraie photo signée C2PA (Pixel, Samsung, Photoshop) le serait
aussi. Contourné par réencodage ; aucun ticket créé, choix de Christophe.

**Onglet caché, section non hydratée.** Fenêtre Chrome en arrière-plan,
`visibilityState` vaut `hidden` et la section Photos de l'admin ne s'hydrate
jamais : choisir un fichier ne déclenche rien, sans erreur. Remède : remettre
la fenêtre au premier plan par `osascript`.

## État des tickets

LS-23, close, commentée deux fois : mesure du 9 octobre et écart, puis
arbitrage par ADR-047. Aucun ticket créé.

## Prochaine étape

Ce que nomme
`2026-10-08-f` : relecture de `/aide#faq` par l'exploitante, clore LS-26, puis
LS-19.
