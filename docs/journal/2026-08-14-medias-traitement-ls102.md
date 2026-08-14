# 14 août 2026, LS-102 partielle, traitement et stockage des photographies

Cinquième session du 14 août, après LS-100 et LS-101. **Story arrêtée en cours
de route à la demande de Christophe** : le socle technique est livré, l'écran et
les Server Actions ne le sont pas.

## Ce qui est livré

| Module | Ce qu'il garantit | Tests |
|---|---|---|
| `integrations/medias/traitement.ts` | onze déclinaisons, EXIF retiré, orientation redressée, aplatissement blanc, SVG et PDF refusés | 18 |
| `integrations/medias/stockage.ts` | quarantaine et public, publication par déplacement, original supprimé, anti-traversée, purge | 17 |
| `services/media.ts` | orchestration, statut `ECHOUE` sans rien publier, réordonnancement | aucun |
| `services/media-validation.ts` | taille, texte alternatif, ordre exhaustif | aucun |
| `repositories/media.ts` | accès données | aucun |

**Les trois derniers modules compilent mais ne sont jamais exécutés.** C'est
l'état à retenir de cette session, il est dit ici plutôt que découvert plus tard.

## La précision de Christophe qui a changé la conception

« Les photos ne seront pas forcément avec localisation GPS, ce sera aussi peut-être
des photos dont le fond sera changé avec une application. »

Vérifié avec sharp plutôt que supposé, et le résultat va dans le sens de la
sécurité :

- une image **sans** EXIF traverse le traitement sans en gagner
- une image **avec** EXIF le perd, y compris celui qu'une application de
  retouche ajoute, `Software` et `Artist` mesurés

Une photographie retouchée n'est donc pas un cas exempté : les applications
conservent souvent l'EXIF d'origine et en ajoutent. Aucun raccourci du type « si
pas de GPS, publier l'original » n'est acceptable, et la règle `securite.md` le
dit désormais.

Deux arbitrages en découlent, tous deux de Christophe :

**Formats permissifs, sauf SVG et PDF.** Tout format bitmap que sharp sait lire
est accepté, pour ne bloquer l'exploitante sur aucun format réel. SVG et PDF sont
refusés **sur la signature du fichier, avant tout décodage** : ce ne sont pas des
photographies, et ce sont les deux formats d'entrée les plus complexes que
libvips expose, dont l'override de `package.json` corrige quatre CVE. Le refus ne
porte ni sur l'extension ni sur le type MIME, que l'appelant peut mentir.

**Aplatissement sur blanc pour le JPEG.** Le JPEG ne connaît pas la
transparence : sans aplatissement, un bijou détouré s'afficherait sur fond
**noir** chez qui ne supporte ni AVIF ni WebP, c'est-à-dire exactement le public
que le repli JPEG existe pour servir. AVIF et WebP gardent la transparence.

## Le piège mesuré, et il diffère de celui des sections

Le ticket demandait de vérifier si la contrainte d'ordre des médias est
différable, comme celle des sections. **Elle ne l'est pas, et ne peut pas
l'être** : `media_principal_unique` est un index partiel filtré sur `ordre = 1`,
pas une contrainte, et un index ne se diffère jamais.

Mesuré sur la base réelle, PostgreSQL 18.4, le **même échange réussit dans un
sens et échoue dans l'autre** :

```
m1 au rang 1, m2 au rang 2

VERT   UPDATE m1 -> 2  puis  UPDATE m2 -> 1     le rang 1 est libéré d'abord
ROUGE  UPDATE m1 -> 1  puis  UPDATE m2 -> 2
       ERROR: duplicate key value violates unique constraint
              "media_principal_unique"
```

La transaction ne sauve pas, l'index étant vérifié ligne à ligne. C'est plus
dangereux qu'un échec systématique : un réordonnancement écrit sans y penser
marche selon l'ordre de parcours des lignes, donc peut passer en développement et
casser en production. Même famille que le piège du carnet d'adresses, que
`database.md` nommait déjà sans donner la parade.

**La parade est d'écrire le rang 1 en dernier.** Elle est implémentée dans
`reordonnerMedias` et documentée dans `database.md`, mesure à l'appui.

## Trois suppositions corrigées par la mesure

Le motif se répète depuis LS-100, et il vaut d'être noté tel quel.

**`withExif({ IFD0: { Orientation } })` n'écrit pas l'orientation.** Elle est
relue à 1, donc mon test ne posait aucun cas et accusait un code juste. Il faut
`withMetadata({ orientation })`.

**Le GPS s'écrit dans `IFD3`**, pas dans une clé `GPS` : le type `Exif` de sharp
n'expose que `IFD0` à `IFD3`.

**Les coordonnées sont encodées en rationnels binaires**, donc introuvables par
une recherche textuelle. Un test qui chercherait une latitude en clair ne
prouverait rien : la preuve porte sur l'absence du bloc EXIF entier, ce qu'un
troisième test vérifie.

## La protection est invisible, et elle est prouvée

sharp retire l'EXIF **par défaut**. Aucune ligne de code n'affirme donc la
protection principale de cette story, et un `keepExif()` ajouté de bonne foi pour
conserver un profil colorimétrique la rouvrirait en silence. C'est le risque
principal nommé par ADR-007.

La mutation qu'ADR-007 désigne a été jouée : ajouter `keepExif()` sur le chemin
d'encodage fait rougir **deux tests**, ceux qui lisent les métadonnées du fichier
produit. Sans cette vérification, rien ne distinguerait une protection réelle
d'une absence de test.

## Le contrôle qui a rattrapé un oubli

`verifier-regles.sh` a rougi sur `src/integrations/medias`, qu'aucune règle de
`.claude/rules/` ne couvrait : une session éditant le traitement d'image
n'aurait chargé aucune règle de domaine. C'est le contrôle de couverture ajouté
par LS-88, et c'est exactement le défaut qu'il existe pour attraper.

`securite.md` porte désormais ce chemin et une section sur le traitement des
photographies, plutôt qu'un `paths` élargi sans contenu.

## Propagé

`.env.example` perd les trois variables `MEDIA_PROVIDER_*`, qui supposaient la
formulation « Cloudinary ou objet S3 » du cahier des charges qu'ADR-007 amende.
Elles cèdent la place à `MEDIA_RACINE`.

## Ce qui reste à faire sur LS-102

Le ticket reste **En cours**, et sept critères sur onze ne sont pas remplis.

1. tests d'intégration sur base réelle du service, aujourd'hui inexistants
2. Server Actions, avec leur garde de rôle
3. écran de téléversement, progression, vignettes, texte alternatif
4. réordonnancement éprouvé sur base, la parade n'étant vérifiée que par la
   mesure manuelle et non par un test
5. cas de mutation dans `verifier-tests-mutation.sh`, dont `keepExif()`
6. branchement de la purge de quarantaine sur la tâche planifiée, LS-72
7. revue par `ls-frontend-revue`

## État des tickets

LS-102 **En cours**, socle technique livré. Aucun autre ticket touché.

## Prochaine étape

Reprendre LS-102 par ses tests d'intégration, avant l'écran : le service
orchestre trois effets, base, disque et traitement, et c'est là que les défauts
se logeront.
