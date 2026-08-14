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

## Reprise, les tests d'intégration du service

Session reprise à la demande de Christophe sur ce point précis. **23 tests
d'intégration** écrits, sur base réelle et disque réel.

Ils testent ce qu'aucun autre test ne pouvait voir : le service orchestre trois
effets qui doivent rester d'accord entre eux, la base, le disque et la valeur
rendue. Les tests unitaires couvraient chaque moitié séparément ; leur cohérence
ne l'était pas. Un statut `TRAITE` sur un média sans fichiers, un média publié
dont la base dit `ECHOUE`, une ligne supprimée dont les fichiers restent : aucun
de ces cas n'était détectable avant.

**Le service passe sans correction.** C'est suspect pour du code jamais exécuté,
donc vérifié plutôt que cru, par trois mutations :

| Mutation | Tests qui rougissent |
|---|---|
| statut `TRAITE` malgré un échec de traitement | 2 |
| réordonnancement sans la parade, parcours naïf | 4 |
| publication avant traitement | 6 |

La deuxième confirme automatiquement le piège de l'index partiel, mesuré à la
main plus tôt dans la journée.

### Une mutation « non détectée » qui avait raison

Le premier passage a rendu **75 mutations, 1 non détectée** : le cas qui retire
le refus de format par signature. Le diagnostic a montré que la mutation était
juste et mon cas mal écrit, exactement le motif déjà rencontré en LS-101.

L'asymétrie mesurée, qui n'a rien d'évident :

```
sharp LIT le SVG        format "svg", 10 x 10
sharp LEVE sur le PDF   Error
```

Retirer le refus par signature laisse donc le SVG **quand même refusé**, par le
second filet qui teste le format analysé. Seul le PDF distingue les deux versions
du code, et c'est lui qu'il fallait nommer comme test attendu.

### Le second filet n'était couvert par aucun test

La question suivante s'imposait : si le premier filet suffit, le second sert-il
à quelque chose ? Mesuré en le retirant seul, **toute la suite reste verte**.
C'était donc du code non éprouvé sur un chemin de sécurité.

Il a pourtant une valeur réelle, et le cas a été construit : le refus par
signature n'inspecte que les **1024 premiers octets**, pour ne pas balayer un
fichier de 25 Mo à chaque téléversement. Un SVG précédé d'un commentaire XML long
pousse sa balise hors de cette fenêtre et traverse le premier contrôle ; sharp le
lit malgré tout.

Le test ajouté est le seul qui distingue les deux filets, et sa mutation le
prouve. Sans cette enquête, le second filet serait resté du code que personne
n'exerce, jusqu'au jour où quelqu'un l'aurait retiré en le croyant redondant.

## Ce qui reste à faire sur LS-102

Le ticket reste **En cours**.

1. Server Actions, avec leur garde de rôle
2. écran de téléversement, progression, vignettes, texte alternatif
3. branchement de la purge de quarantaine sur la tâche planifiée, LS-72
4. revue par `ls-frontend-revue`

Faits depuis la première rédaction de ce journal : les tests d'intégration, le
réordonnancement éprouvé par un test plutôt que par une mesure manuelle, et les
sept cas de mutation dont les deux sur l'EXIF.

## État des tickets

LS-102 **En cours**, socle technique livré. Aucun autre ticket touché.

## Prochaine étape

Les Server Actions et l'écran de téléversement. La couche métier est désormais
éprouvée de bout en bout, base et disque compris : ce qui reste est de
l'interface, et `ls-frontend-revue` la relira.
