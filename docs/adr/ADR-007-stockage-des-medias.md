# ADR-007 : stockage des médias sur volume local, traitement par sharp

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 14 août 2026 |
| Décideur | Christophe Mostefaoui |
| Amende | Cahier des charges V1.0, décision ouverte ADR-007 « Cloudinary ou objet S3 » |
| Ticket | LS-102 |

## Contexte

Le cahier des charges laisse ADR-007 ouvert et formule le choix comme « Cloudinary
ou objet S3 ». Les deux branches supposent un service tiers. L'arbitrage du
13 août 2026 porté par la description de LS-102 écarte cette formulation :
traitement local avec `sharp`, aucun service tiers, aucun appel réseau sortant.
Cet ADR acte cette décision et tranche les quatre points que l'arbitrage laissait
ouverts : l'emplacement des fichiers, qui les sert, comment un média non traité
est tenu hors de portée, et ce que devient l'original.

La contrainte qui commande tout le reste n'est pas fonctionnelle. Les
photographies prises au smartphone portent dans leurs métadonnées EXIF la
position GPS du lieu de prise de vue, c'est-à-dire le domicile de l'exploitante.
`PARCOURS.md` est catégorique : « Aucune image n'est jamais servie publiquement
sans traitement. C'est un blocage, pas un avertissement. »

Trois éléments du dépôt cadrent la décision :

- `sharp` est déjà installé en 0.35.3, avec un override de sécurité documenté
  dans `package.json` (CVE-2026-33327, 33328, 35590, 35591 via libvips). Cet
  override existe précisément parce que sharp traite les photographies
  téléversées
- `next.config.ts` fixe `output: "standalone"`. Le dossier `public/` est copié
  dans l'image à la construction, ce qui interdit de l'employer comme
  destination d'écriture à l'exécution
- Nginx tourne sur l'hôte, décidé en phase 6, et le modèle `Media` porte déjà
  `chemin`, `statutTraitement` (C8) et l'index partiel C9

## Décision

Les fichiers médias vivent sur un **volume Docker nommé `lune-soleil-medias`**,
monté sur `/var/lib/lune-soleil/medias` dans le conteneur applicatif, et servis
directement par **Nginx** sans réveiller le processus Node.

Le volume porte **deux dossiers dont un seul est publié** :

```
/var/lib/lune-soleil/medias/
  quarantaine/   téléversement brut, aucun serveur ne le publie
  public/        uniquement après traitement réussi
```

Le déplacement de `quarantaine/` vers `public/` est le seul geste qui rend un
média accessible, et il n'a lieu qu'après un traitement réussi. **L'original brut
est supprimé** une fois les déclinaisons engendrées.

Chaque photographie produit **neuf déclinaisons** : trois largeurs servies (320,
640 et 1280 px) en AVIF, WebP et JPEG, ce dernier servant de repli.

## Justification par la mesure

Mesures prises le 14 août 2026 sur ce dépôt, sharp 0.35.3, libvips 8.18.3,
Node 22.23.2, sur une image structurée de 4032 x 3024 px (12 Mpx, cadrage
smartphone), JPEG source de 4,28 Mo. Script de mesure décrit plus bas.

| Format | 320 px | 640 px | 1280 px | Total | Temps des 3 encodages |
|---|---|---|---|---|---|
| AVIF | 2,9 Ko | 7,9 Ko | 31,1 Ko | 42 Ko | 446 ms |
| WebP | 10,3 Ko | 59,9 Ko | 187,2 Ko | 257 Ko | 205 ms |
| JPEG | 15,9 Ko | 62,8 Ko | 248,0 Ko | 327 Ko | 103 ms |

Deux chiffres commandent la décision. **AVIF pèse huit fois moins que le JPEG**,
42 Ko contre 327 Ko pour les trois largeurs, ce qui compte sur un catalogue de
bijoux consulté au téléphone. Et il coûte **446 ms d'encodage**, quatre fois le
JPEG, dépensés une seule fois au téléversement et jamais à la lecture. Le coût
disque total est de **626 Ko par photographie**, les neuf fichiers réunis : mille
photographies occupent environ 610 Mo, ce qu'un VPS absorbe sans dimensionnement
particulier.

Le repli JPEG est conservé alors qu'AVIF et WebP couvrent les navigateurs visés,
parce qu'il ne coûte que 103 ms et garantit qu'aucun contexte de lecture ne reste
sans image.

**La suppression des métadonnées est le comportement par défaut de sharp**, ce
qui est le point le plus important de cette mesure :

```
SOURCE            exif: 226 o
DEFAUT            exif: absent          GPS retiré
keepExif()        exif: 226 o           conservé
```

La position GPS disparaît sans qu'aucune ligne de code ne la retire
explicitement. Cette propriété est un piège autant qu'un confort, voir la section
Risques.

## Alternatives écartées

**Cloudinary**, branche nommée par le cahier des charges. Écartée pour la raison
qui a déjà écarté Sentry : le transfert de données à un tiers, et non le prix.
Téléverser la photographie brute chez un prestataire pour qu'il en retire la
position GPS revient à lui confier exactement la donnée qu'on cherche à
supprimer. Le traitement local ne fait sortir aucun octet du serveur.

**Stockage objet compatible S3.** Le service tiers pose la même question que
Cloudinary lorsqu'il est hébergé, et un stockage objet auto-hébergé ajouterait un
composant à une topologie mono-tenant qui tient sur un VPS. Aucun besoin mesuré
ne le justifie : la boutique sert des pièces uniques en faible volume.

**Écrire dans `public/`.** Techniquement fautif ici. En sortie `standalone`,
`public/` est copié dans l'image à la construction : tout média téléversé après
un déploiement disparaîtrait au déploiement suivant. Le défaut ne se verrait ni à
la construction ni au contrôle de santé.

**Servir les médias par un gestionnaire de route Next.js.** Écarté au profit de
Nginx : chaque image réveillerait le processus Node, imposerait d'écrire le cache
à la main et ouvrirait une surface de traversée de chemin à garder. Nginx sert un
fichier statique, c'est son travail.

**Un dossier unique avec filtre applicatif** pour tenir C8. Écarté parce que la
règle reposerait alors sur le fait qu'aucune requête n'oublie
`statutTraitement = 'TRAITE'`. Ce projet a déjà rencontré trois fois le motif d'un
champ d'état ajouté sans être porté dans toutes les conditions d'accès. Deux
dossiers rendent la règle physique : un média non traité n'est pas à un endroit
servable, indépendamment du code.

**Conserver l'original hors du dossier public**, ce qui permettrait de réengendrer
les déclinaisons si un format change. Écarté : l'original est le seul fichier qui
porte la position GPS du domicile, et le conserver le ferait survivre dans les
sauvegardes. Réengendrer suppose de toute façon de redemander les photographies,
coût acceptable au volume de ce catalogue.

## Conséquences

**Compose et déploiement.** Un volume `lune-soleil-medias` s'ajoute au fichier de
production, à côté de `lune-soleil-pgdata`. Le fichier `docker-compose.yml` du
dépôt ne décrit que le développement local et le dit explicitement : la
déclaration de production relève de la phase 6.

**Nginx sert `/medias/`** en pointant sur le sous-dossier `public/` du volume, et
sur lui seul. Faire pointer cet alias sur la racine du volume publierait la
quarantaine et annulerait la décision.

**La sauvegarde doit couvrir le volume des médias en plus de la base.** Une
sauvegarde qui ne prendrait que PostgreSQL restaurerait un catalogue dont chaque
fiche pointe vers un fichier absent. Point à porter en phase 6.

**Le champ `Media.chemin`** porte un chemin relatif au dossier `public/` du
volume, jamais un chemin absolu ni une URL complète : le préfixe de service
appartient à la configuration, pas aux données.

**`Media.identifiantFournisseur` reste nul.** La colonne existe et ne se supprime
pas dans LS-102. Son unicité ne gêne pas, PostgreSQL admettant plusieurs valeurs
nulles sous une contrainte `UNIQUE`.

**Le traitement consomme le CPU du VPS**, 446 ms d'AVIF par photographie et par
largeur cumulée. Sur un téléversement multiple, l'encodage se fait hors du cycle
de la requête et `statutTraitement` porte l'état, ce que C8 prévoit déjà.

**LS-102 est débloquée** par cet ADR, qui était son prérequis explicite.

## Risques

**La suppression de l'EXIF ne se voit pas dans le code.** C'est le risque
principal, et il découle directement de la mesure : sharp retire les métadonnées
par défaut, donc aucune ligne n'affirme cette protection. Un futur `keepExif()`
ajouté de bonne foi, pour conserver une orientation ou un profil colorimétrique,
rouvrirait la fuite en silence. Atténuation : le critère 1 de LS-102 exige de
lire les métadonnées du fichier produit plutôt que de supposer, et son critère 11
exige une mutation. La mesure ci-dessus donne la mutation à employer, `keepExif()`
sur le chemin de traitement, qui doit faire rougir le test.

**Un média orphelin occupe le disque.** Un téléversement interrompu laisse un
fichier en quarantaine que rien ne référence. La tâche de nettoyage décrite au
parcours 3 les purge ; sans elle, la quarantaine croît sans limite.

**Le volume est un point de défaillance local.** Contrairement à un stockage
objet répliqué, la perte du volume perd les médias. C'est le prix accepté de
l'absence de tiers, et c'est ce qui rend la sauvegarde du volume non optionnelle
plutôt que confortable.

**L'espace disque n'est pas surveillé aujourd'hui.** 626 Ko par photographie
reste modeste, mais un disque plein ferait échouer les traitements. La
surveillance relève de la phase 6, avec le déploiement.

## Reproduire les mesures

Les chiffres ci-dessus se rejouent avec un script court : engendrer une image de
4032 x 3024 px portant un EXIF GPS, l'encoder aux trois largeurs dans les trois
formats en relevant taille et durée, puis comparer les métadonnées du fichier
produit avec et sans `keepExif()`. Les valeurs varient avec la machine et le
contenu de l'image ; ce qui doit se retrouver est le rapport entre formats, AVIF
nettement plus léger et nettement plus lent que JPEG, et l'absence d'EXIF sur la
sortie par défaut.
