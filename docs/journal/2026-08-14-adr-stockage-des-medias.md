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
4. **Déclinaisons** : AVIF, WebP et JPEG de repli, sur 320, 640 et 1280 px, plus
   1920 px en AVIF et WebP après la relecture décrite plus bas

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

## Une quatrième largeur ajoutée après relecture

L'ADR a d'abord été écrit avec trois largeurs, 320, 640 et 1280 px. Christophe a
demandé si la qualité tenait, ce qui a fait mesurer deux choses que la première
rédaction n'avait pas regardées.

**La compression n'est pas le problème.** En PSNR sur une source de 24 Mpx, AVIF
obtient 33,0 dB contre 32,0 dB pour le JPEG, en pesant six fois moins. Au-delà de
32 dB l'écart ne se voit pas à l'œil.

**La largeur maximale l'était.** Une fiche produit affiche l'image sur 600 à
700 px CSS, soit environ 1400 px physiques sur un écran à densité double. À
1280 px l'image est déjà en deçà, et elle se ramollit sur ce qui décide de
l'achat : la gravure, la maille d'une chaîne, le grain d'une pierre. La largeur
1920 px coûte 23 Ko de plus en AVIF. Elle n'est pas engendrée en JPEG, dont le
poids croît vite pour un format qui ne sert que de filet de sécurité.

**Ce qui rend cet arbitrage irréversible :** l'original étant supprimé, ajouter
une largeur plus tard n'est pas un retraitement, il faudrait redemander les
photographies à l'exploitante. C'est la contrepartie du choix de supprimer
l'original, et elle est désormais écrite dans les conséquences de l'ADR et dans
`frontend-design.md`. Un service tiers engendrant à la volée n'aurait pas eu
cette contrainte, ce que la section des alternatives reconnaît maintenant
explicitement au lieu de ne lister que les défauts de l'option écartée.

## Le VPS envisagé est surdimensionné, sauf sur un point

Christophe a soumis la configuration prévue : 4 vCores, 8 Go de RAM, 75 Go de
SSD NVMe. Vérifiée par la mesure plutôt qu'estimée.

Pic de mémoire du traitement, mesuré : **164 Mo** pour une photographie, **433 Mo**
pour quatre en parallèle, sharp employant quatre fils par défaut. Avec
PostgreSQL, Next en standalone, Nginx et le système, le pic tient sous 2 Go des
8 disponibles. Une photographie de 17,6 Mo en 24 Mpx se traite en 1,9 s sur la
machine de mesure, un M4 à 10 cœurs : compter 4 à 5 s sur 4 vCores plus lents.

Le disque n'est pas contraignant non plus, 900 Ko par photographie laissant la
place pour des dizaines de milliers de clichés.

**Le point faible est la sauvegarde à un jour de rétention.** Une seule copie
remplacée chaque jour ne protège pas d'une corruption découverte deux jours plus
tard, et le projet porte des factures que la loi impose de conserver. Ce n'est
pas une décision d'architecture prise ici : elle est ticketée, voir plus bas.

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

## Ce qui a été propagé, et où

Cinq fichiers au-delà de l'ADR lui-même, tous vérifiés plutôt que supposés :

- **`docs/REFERENCES.md`**, ligne ADR-007 dans la table d'aiguillage
- **`.claude/skills/adr/SKILL.md`**, les deux lignes périmées ci-dessus
- **`.claude/rules/frontend-design.md`**, qui disait « formats modernes,
  dimensions servies adaptées » sans les nommer. La règle porte maintenant les
  largeurs, les formats et l'avertissement sur l'irréversibilité
- **`.claude/agents/ls-conteneurisation.md`**, qui ne connaissait qu'un volume de
  données et aurait conseillé une sauvegarde amputée. Il porte les deux volumes,
  la règle « Nginx ne publie que `public/` », et l'étape 1 du déploiement
- **`README.md`**, qui annonçait encore « phase 1, socle technique » alors que la
  phase 1 est close depuis le 13 août et que LS-99 a ouvert la phase 2

Vérifié et **non modifié** : les largeurs 320, 390, 768 et 1280 px de `CLAUDE.md`
et du skill `story` sont des **points de rupture d'affichage**, sans rapport avec
les largeurs d'images. Les confondre aurait introduit une erreur. `CLAUDE.md`
reste à 200 lignes, la limite du contrôle, donc rien ne pouvait y être ajouté.

## État des tickets

LS-102 reste **À faire**, et son prérequis est levé : l'ADR existe, elle est
implémentable. La story suivante dans l'ordre du découpage reste **LS-100**,
éditeur de fiche produit.

**LS-107 créée**, sous l'epic LS-7 de la phase 6 : politique de sauvegarde,
rétention, volume des médias et restauration prouvée. Elle naît de deux constats
distincts, l'ADR qui rend la sauvegarde du volume obligatoire, et la rétention
d'un jour de la configuration de VPS envisagée. LS-7 portait déjà le principe
d'une sauvegarde externalisée avec exercice de restauration : ce qui manquait est
la profondeur de rétention et le périmètre exact de ce qui est sauvegardé.

Un critère y mérite d'être relu : **la sauvegarde ne doit pas emporter la
quarantaine**, sans quoi les originaux portant la position GPS survivraient dans
les copies alors que l'ADR les fait supprimer.

LS-96 demeure la seule story ouverte de LS-2, en attente de la phase 6.

## Prochaine étape

LS-100. La surveillance de l'espace disque reste sans ticket, elle relève du
durcissement de la phase 6 et n'a pas été créée pour ne pas éclater LS-107.
