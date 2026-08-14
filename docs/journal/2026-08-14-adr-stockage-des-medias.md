# 14 août 2026, ADR-007, stockage des médias

Première session du 14 août. Objectif unique : écrire l'ADR sur le stockage des
médias, prérequis explicite de LS-102, avec arbitrage de Christophe sur chaque
point ouvert. Aucun code applicatif touché.

## Le numéro n'est pas le suivant de la liste

Le réflexe était de prendre 029, à la suite d'ADR-028. Le skill `adr` réserve
**ADR-007** au stockage des médias : c'est une décision que le cahier des charges
avait identifiée comme ouverte, et l'instruction est de reprendre son numéro
d'origine plutôt que d'en créer un nouveau. Un ADR-029 aurait laissé le 007
ouvert pour toujours dans la liste des décisions en attente.

## Quatre arbitrages demandés, quatre tranchés

L'arbitrage du 13 août portait déjà « traitement local avec sharp, aucun service
tiers ». Il laissait quatre points ouverts, tous soumis à Christophe :

1. **Emplacement et service** : volume Docker `lune-soleil-medias`, servi par
   Nginx sans réveiller Node
2. **Isolement du non traité** : deux dossiers, `quarantaine/` et `public/`, le
   déplacement étant le seul geste qui publie
3. **Original** : supprimé après traitement réussi, c'est lui qui porte le GPS
4. **Déclinaisons** : AVIF, WebP et JPEG de repli, sur 320, 640 et 1280 px

Le point 1 avait un piège technique qu'il fallait mesurer avant de proposer :
`next.config.ts` fixe `output: "standalone"`, donc `public/` est copié dans
l'image à la construction. Un média téléversé après un déploiement aurait disparu
au déploiement suivant, sans que la construction ni le contrôle de santé le
signalent. L'option a été proposée en disant pourquoi elle est fautive.

Le point 2 rejoue un motif déjà rencontré trois fois ici, le champ d'état ajouté
sans être porté dans toutes les conditions d'accès. Deux dossiers rendent C8
physique au lieu de la confier à la discipline des requêtes.

## Les chiffres sont mesurés, pas estimés

Sur une image de 4032 x 3024 px portant un EXIF GPS, sharp 0.35.3, libvips
8.18.3, Node 22.23.2 :

| Format | Total des 3 largeurs | Temps |
|---|---|---|
| AVIF | 42 Ko | 446 ms |
| WebP | 257 Ko | 205 ms |
| JPEG | 327 Ko | 103 ms |

**La première mesure était fausse et a été refaite.** L'image source était du
bruit aléatoire pur : il se moyenne à la réduction et donne un aplat que les
codecs compressent à presque rien, 0,4 Ko en AVIF 320 px. Un chiffre absurde pour
une photo de bijou. La seconde image porte dégradé, anneaux concentriques et
trame fine, structures qui survivent au redimensionnement.

Le réflexe à garder : un résultat qui paraît trop favorable se vérifie avant de
servir d'appui à une décision.

## Ce que la mesure a révélé, et qui va au-delà des chiffres

**sharp retire l'EXIF par défaut.** La preuve a été prise dans les deux sens :
sortie par défaut sans EXIF, `keepExif()` conservant les 226 octets. La raison
d'être de LS-102 est donc assurée par un comportement que **rien dans le code ne
rend visible**. Aucune ligne n'affirme la protection, et un `keepExif()` ajouté
plus tard de bonne foi, pour garder une orientation ou un profil colorimétrique,
rouvrirait la fuite en silence.

C'est écrit en tête de la section Risques de l'ADR, et cela donne à LS-102 sa
mutation prête à l'emploi pour le critère 11.

## Deux lignes périmées trouvées au point 4 du skill

Le geste « vérifier ce que l'ADR périme » a payé deux fois, dans le skill `adr`
lui-même :

- ADR-007 y figurait comme décision ouverte, « Cloudinary ou objet S3 »
- **ADR-008 aussi, alors qu'il est accepté depuis longtemps**, SMTP OVH. Cette
  ligne était fausse indépendamment du travail du jour

Le tableau des décisions ouvertes ne porte plus que ADR-010, génération des PDF,
et une phrase dit désormais qu'une décision tranchée en sort pour entrer dans la
table de `docs/REFERENCES.md`.

## Vérifications

`verifier-config-claude.sh` silencieux, `verifier-regles.sh` vert sur ses trois
sections, Prettier conforme sur les trois fichiers. Le contrôle de configuration
a été **prouvé par mutation** : ADR-007 retiré de la table de `REFERENCES.md`, il
signale bien « ADR-007 accepté mais absent de la table ». Son silence vaut donc
succès, ce qui n'allait pas de soi puisqu'il n'affiche aucune ligne de réussite.

## État des tickets

LS-102 reste **À faire**, et son prérequis est levé : l'ADR existe, elle est
implémentable. La story suivante dans l'ordre du découpage reste **LS-100**,
éditeur de fiche produit.

Rien d'autre n'a bougé. LS-96 demeure la seule story ouverte de LS-2, en attente
de la phase 6.

## Prochaine étape

LS-100. Deux points de cet ADR concernent la phase 6 et devront être repris avec
le déploiement : la sauvegarde doit couvrir le volume des médias en plus de la
base, et la surveillance de l'espace disque n'existe pas.
