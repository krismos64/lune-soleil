# 10 septembre 2026, b : la quarantaine sortait dans les sauvegardes

Session courte sur le critère 3 de LS-107. Un défaut de confidentialité réel,
une première correction fausse rattrapée par mon propre garde-fou, et une fiche
mémoire qui affirmait le contraire de ce que j'ai mesuré.

## Le défaut, et il était en service

L'archive de sauvegarde emportait `medias/quarantaine/`, ce que le critère 3
interdit explicitement. Vérifié sur une archive **réelle** de production avant de
toucher à quoi que ce soit :

```
var/lib/lune-soleil/medias/
var/lib/lune-soleil/medias/public/
var/lib/lune-soleil/medias/quarantaine/     <- interdit
var/lib/lune-soleil/documents/
```

**Ce que la quarantaine porte** : les originaux non traités, avec leurs
métadonnées EXIF, dont la **position GPS du lieu de prise de vue**. ADR-007
supprime l'original dès le traitement réussi, précisément pour cela.

**Pourquoi l'archiver est pire que le garder sur disque** : le fichier vivant
part en quelques secondes, une copie entrée dans une archive y survit
**quatorze jours**, dans autant de jeux qu'il y a eu de nuits. La suppression de
l'original ne la rattrape pas, elle ne touche que le disque.

Les dossiers étaient vides, donc rien n'a fui. Le défaut se serait manifesté à la
première photographie de LS-23.

## Ma première correction était fausse, et mon garde-fou l'a dit en production

J'avais changé la valeur par défaut de `MEDIA_RACINE` vers `public/`. La
sauvegarde a échoué à l'exécution suivante :

```
Arret : l'archive emporte la quarantaine, LS-107 critere 3.
```

**La cause** : le script fait `source` de `/etc/lune-soleil/production.env`,
**où cette variable est posée**. La valeur du fichier écrase la valeur par
défaut. Motif « config corrigée à moitié », déjà en fiche, et je l'ai reproduit.

**Détourner `MEDIA_RACINE` aurait été pire que le défaut initial.** Elle est
**partagée** : la composition Docker en fait la source du montage, et
`src/services/media.ts` la lit pour écrire les téléversements, qui passent
d'abord par la quarantaine. La restreindre cassait le téléversement pour protéger
la sauvegarde.

D'où `MEDIA_SAUVEGARDE`, propre à la sauvegarde, qui se dérive de la racine
quand elle n'est pas posée : le jour où le volume déménage, une seule variable
bouge.

## Le garde-fou lit l'archive produite, pas le chemin visé

C'est ce qui l'a rendu utile, et c'est ce qui a attrapé ma propre erreur. Un
contrôle sur la valeur de `MEDIA_SAUVEGARDE` serait resté vert devant l'archive
fautive, puisque la variable était juste dans le code et fausse à l'exécution.

**Deux cas de mutation ajoutés, onze au total, zéro échec** :

```
la quarantaine entre dans l'archive              rougit
le decor nominal archive public/ sans elle       reste vert, medias presents
```

Le décor du script de mutation reproduit désormais la vraie structure, `public/`
à côté de `quarantaine/`. Un décor plus simple que le réel rend des mutations qui
ne mordent sur rien.

## Preuve après installation sur la machine

```
var/lib/lune-soleil/medias/public/
var/lib/lune-soleil/documents/
quarantaine : 0 occurrence
```

Les trois routes publiques répondent 200 et le montage du volume est intact : le
téléversement n'est pas touché.

## Une fiche mémoire qui disait l'inverse du mesuré

En posant le lien de blocage vers LS-23, j'ai obtenu le **bon sens du premier
coup** en inversant les paramètres par rapport à ce matin sur LS-140.

`lune-soleil-sens-des-liens-jira` donnait donc une formule fausse, et affirmait
en outre qu'un lien se supprime par `DELETE /rest/api/3/issueLink/`, alors que
l'outil MCP n'expose aucune suppression.

Les deux points sont corrigés, avec l'hypothèse qui les réconcilie : **le sens
dépend probablement du client employé**, `curl` sur l'API v3 en août, l'outil MCP
aujourd'hui. La fiche dit désormais de vérifier après chaque création plutôt que
de se fier à une règle.

C'est le motif de la journée : une fiche exacte à l'écriture, devenue trompeuse
quand l'outillage a changé sous elle.

## L'état réel de LS-107, confronté au code

Le ticket date du 14 août, avant LS-152 et LS-139.

**Trois critères étaient déjà satisfaits** sans travail : la rétention à
quatorze jeux (ADR-037), la couverture base et médias (LS-152), et la procédure
écrite (`EXPLOITATION.md`).

**Le critère 3 est corrigé ici.**

**Deux restent ouverts**, et attendent LS-23 : la restauration exercée demande
des fiches produit **affichant leurs images**, et la démonstration d'un point
antérieur à la veille se fera sur le même exercice. Une fiche qui s'affiche sans
image ne prouve pas qu'une fiche avec images s'afficherait.

## État des tickets

**LS-107 est EN COURS**, lien de blocage vers LS-23 posé et vérifié.

## Prochaine étape

LS-148, le consentement aux cookies : priorité haute, personne ne la bloque, et
son issue peut alléger le périmètre plutôt que l'alourdir puisqu'elle demande
d'abord d'établir si une bannière est **due**.
