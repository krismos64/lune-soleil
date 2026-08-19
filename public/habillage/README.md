# habillage/

Images d'habillage du site, servies par Next.js depuis `public/` et optimisees
par `next/image`.

## Ce qui entre ici

Les visuels qui appartiennent au **site** : hero de l'accueil, illustrations
editoriales. Ils sont versionnes dans le depot et ne changent qu'avec le code.

## Ce qui n'entre pas

**Les photographies de produits.** Elles vivent dans le volume des medias,
ADR-007, sont televersees par l'administration et passent par la chaine de
traitement qui retire les metadonnees EXIF. Mettre une photo de bijou vendable
ici la sortirait de ce circuit, et notamment du retrait de la geolocalisation.

## accueil-hero.jpg, a remplacer avant l'ouverture

**Visuel d'habillage engendre, non contractuel.** Il montre des bijoux qui ne
sont PAS au catalogue.

Le garder a la mise en ligne ferait passer des pieces inexistantes pour des
creations de la boutique : LS-22 l'interdit, et ce serait une allegation
commerciale trompeuse au meme titre qu'un faux avis.

Arbitrage de Christophe du 19 aout 2026 : conserve pendant le developpement,
**remplace avant l'ouverture** par une photographie reelle de LS-23. Le
remplacement ne demande aucune modification de code si le nom de fichier et le
ratio 16/10 sont conserves ; sinon, ajuster `aspect-ratio` et les dimensions
declarees dans `src/app/(boutique)/page.tsx`.

Aucune metadonnee EXIF, ICC ni XMP dans le fichier actuel, verifie.
