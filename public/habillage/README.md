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

## Les six visuels de `/notre-univers`, LS-25

Ajoutes le 20 septembre 2026, photographies **reelles** fournies par
l'exploitante.

| Fichier | Ratio | Ou il parait |
|---|---|---|
| `univers-modelage.jpg` | 16/10 | en-tete de « Mon histoire », seul a porter `priority` |
| `univers-atelier.jpg` | 16/10 | apres le paragraphe sur l'atelier d'Artix |
| `univers-matieres.jpg` | 16/10 | ouverture de « Les matieres » |
| `univers-porte.jpg` | 1:1 | « Des pieces uniques », donne l'echelle |
| `univers-emballage.jpg` | 1:1 | « Ce a quoi je tiens », le soin du colis |
| `univers-nettoyage.jpg` | 1:1 | « L'entretien », a droite de l'encadre des interdits |

**ELLES MONTRENT LE TRAVAIL, JAMAIS UNE OFFRE**, arbitrage de Christophe du
20 septembre 2026. Certaines portent des pieces absentes du catalogue, un
serpent jaune et des creoles corail : ce sont des creations reelles de
l'exploitante, vendues sur les marches ou deja parties.

La distinction est celle qui separe `/notre-univers` d'une page de vente : aucun
prix, aucun bouton panier, aucune reference. C'est ce qui la distingue du cas
d'`accueil-hero.jpg` ci-dessus, dont les pieces n'ont **jamais existe**.

## Le retrait des metadonnees n'est PAS automatique ici

**C'est le piege de ce dossier**, et il merite d'etre relu avant tout ajout. Les
photographies de produits passent par la chaine d'ADR-007, qui retire l'EXIF :
celles-ci n'y passent pas, elles sont versionnees a la main.

Les cinq ont ete converties par `sharp` sans `keepExif()`, l'absence d'appel
etant ce qui protege, puis **verifiees octet par octet** : aucun segment EXIF,
GPS, XMP ni ICC, aucun APP residuel. Les sources PNG portaient toutes du XMP.

```
univers-atelier.jpg     AUCUNE metadonnee   segments APP : aucun hors JFIF
univers-emballage.jpg   AUCUNE metadonnee   segments APP : aucun hors JFIF
univers-matieres.jpg    AUCUNE metadonnee   segments APP : aucun hors JFIF
univers-modelage.jpg    AUCUNE metadonnee   segments APP : aucun hors JFIF
univers-nettoyage.jpg   AUCUNE metadonnee   segments APP : aucun hors JFIF
univers-porte.jpg       AUCUNE metadonnee   segments APP : aucun hors JFIF
```

**LE RISQUE N'EST PAS THEORIQUE**, et la sixieme image l'a prouve le 20 septembre
2026 : `nettoyage.png` portait un bloc **GPS**, la seule des six dans ce cas. Les
cinq premieres n'avaient que du XMP. Sans cette conversion, la position aurait
ete servie publiquement.

Toute image ajoutee ici repasse par cette verification. Une photographie de
smartphone porte par defaut la position du domicile de l'exploitante.
