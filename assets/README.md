# assets/

Matière première des images engendrées. **Ce dossier n'est pas servi.**

Next.js ne publie que `public/` : rien d'ici n'a d'URL, et c'est la raison d'être
du dossier. Un fichier source qui serait publié donnerait une seconde adresse
pour la même identité visuelle, qu'aucun contrôle ne tiendrait d'accord avec les
fichiers réellement servis.

## Ce qui entre ici

Les fichiers dont un script du dépôt **dérive** ce qui est servi, et qui ne sont
jamais référencés par le code applicatif.

`logo-lune-soleil.png`, 1024 par 1024, fourni par Christophe le 5 septembre 2026.
`scripts/engendrer-images-marque.mjs` en tire les six images de marque : le
favicon à trois résolutions, les icônes 32 et 180, les deux icônes du manifeste
et l'image de partage.

## Ce qui n'entre pas

**Les visuels d'habillage du site**, hero et illustrations éditoriales : ils
vivent dans `public/habillage/` et sont servis tels quels.

**Les photographies de produits.** Elles vivent dans le volume des médias,
ADR-007, sont téléversées par l'administration et passent par la chaîne de
traitement qui retire les métadonnées EXIF. En poser une ici la sortirait de ce
circuit, et notamment du retrait de la géolocalisation.

## Le logo est un visuel engendré

Comme `accueil-hero.jpg`, il porte les marques d'une image produite par un
générateur : rendu doré en relief, typographie sérif générique. Contrairement au
hero, il n'affirme rien de faux sur les produits, une identité de marque
n'engageant aucune allégation commerciale. Il n'y a donc pas d'obligation de le
remplacer avant l'ouverture.

**Il écrit « Lune-soleil » quand tout le code porte « Lune & Soleil ».** L'écart
est réel et suivi par un ticket : la graphie du nom compte pour le référencement,
les moteurs recoupant le texte, le JSON-LD et le logo pour établir l'entité.

## Modifier une image de marque

Ne jamais retoucher un fichier engendré à la main : le script le réécrirait, et
son mode `--verifier` échouerait en attendant. Remplacer le logo source, puis :

```bash
node scripts/engendrer-images-marque.mjs             # réécrit les six images
node scripts/engendrer-images-marque.mjs --verifier  # échoue si divergence
```

Le recadrage des petites icônes est ancré sur quatre nombres, mesurés pour
isoler le croissant et le soleil sans attraper le texte du médaillon. Un logo de
composition différente les rend faux : les revérifier à l'œil sur la planche
16, 32 et 48 px avant de commiter.
