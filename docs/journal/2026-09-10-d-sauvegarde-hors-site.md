# 10 septembre 2026, d : la sauvegarde sort enfin de la machine

Un risque qu'ADR-037 avait explicitement accepté est fermé. Deux pièges de
`set -e` rencontrés en chemin, tous deux dans mon code, tous deux attrapés par le
script de mutation écrit la veille.

## La question qui a lancé le travail

Christophe : « a-t-on mis en place une sauvegarde quotidienne ? si oui où ça ? et
utilise-t-on également une sauvegarde quotidienne en externe au cas où OVH
plante ? »

La réponse mesurée était **oui, non, et un ticket existe**. Et cette question a
révélé une imprécision de ma part : j'avais déclaré le critère 1 de LS-107
« FAIT » au motif que la rétention est en place, alors qu'il dit « la profondeur
de rétention est décidée, écrite, **et le moyen est en place** » dans un ticket
qui cite « au minimum une copie hebdomadaire conservée hors du VPS ».

Rectifié dans Jira avant de commencer.

## Ce qui existait, et ce qui manquait

```
/var/backups/lune-soleil     14 jeux, rotation, 02h30 UTC
copie hors site              AUCUNE
```

ADR-037 le rangeait parmi ses risques acceptés : « une perte totale du VPS
emporte les deux ». Photocopier un document et ranger la photocopie dans le même
tiroir ne protège pas de l'incendie du tiroir.

## Le système repris de SmartPlanning

Christophe avait déjà monté le dispositif sur SmartPlanning, SP-594. **L'analyser
plutôt que de concevoir à neuf** a évité de refaire les erreurs qu'il avait déjà
payées, et son script porte les leçons d'une mise en service réelle.

Les choix repris tels quels :

**L'API native B2 et non S3.** La compatibilité S3 impose une signature AWS v4,
des dizaines de lignes de HMAC en shell. L'API native s'utilise en `curl` simple,
avec `jq` et `sha1sum` déjà présents.

**La vérification porte sur la copie, pas sur l'envoi.** Le script relit la liste
distante et compare taille **et** SHA-1. Un code 200 dit que la requête a abouti,
pas que le fichier est lisible chez B2.

**La garde des 48 heures.** Si la sauvegarde locale a cessé, la plus récente peut
dater de plusieurs jours : sans cette garde, le hors-site paraîtrait sain pendant
que la sauvegarde est morte.

**Un diagnostic de forme de clé**, né d'un incident réel chez SmartPlanning :
`K003` y était devenu `ЧKOO`, avec un caractère cyrillique et deux lettres O à la
place des zéros. Invisible à l'œil, et la longueur seule ne le voyait pas.

## Ce qui diffère pour cette boutique

**Deux fichiers par jeu et non un** : le dump **et** l'archive des médias. Envoyer
le premier sans le second restaurerait un catalogue dont chaque fiche pointe vers
une photographie absente, ADR-007. Le script exige le **même horodatage** pour les
deux, jamais « les plus récents » indépendamment.

**Rétention à quatorze jours** au lieu de trente, cohérence avec ADR-037.

## Le chiffrement était le prérequis, et il manquait

Les sauvegardes de Lune & Soleil n'étaient **pas chiffrées**, contrairement à
celles de SmartPlanning. Tant qu'elles restaient sur une machine dont l'accès est
contrôlé, c'était discutable. Dès qu'elles partent chez un tiers, ce ne l'est
plus : le dump porte les adresses et les emails des clients, et Backblaze chiffre
au repos avec **ses** clés.

**Facultatif ici, bloquant là-bas.** Sans fichier de clé, la sauvegarde locale
reste en clair et le **dit** ; la copie hors site refuse d'envoyer du non chiffré.
L'inverse transformerait une clé disparue en panne totale de sauvegarde.

## Deux pièges de `set -e`, et le témoin qui les a vus

Le témoin du script de mutation est passé au rouge **deux fois**, chaque fois pour
une raison différente et chaque fois dans mon code.

**`$(( ))` en commande isolée rend 1 quand le résultat vaut zéro.** J'écrivais
`NB=$((NB + $(rotation ...)))`, ce qui aurait fait échouer la sauvegarde nominale
les treize premiers jours, quand rien n'est à supprimer.

**`ls motif1 motif2` rend 1 dès qu'un seul motif ne matche rien**, même s'il liste
parfaitement l'autre. Le script sortait en 1 **après une sauvegarde réussie**,
sans un mot, la sortie s'arrêtant net après le chiffrement.

Le second est le plus vicieux : aucun message, aucune trace, et un code d'échec
sur du travail parfaitement fait. **Sans le script de mutation écrit hier, ce
défaut partait en production**, où il aurait fait passer l'unité systemd en
`failed` chaque nuit sur une sauvegarde saine.

Les deux sont documentés dans le code, avec la mesure qui les a révélés.

## La preuve qui compte

Pas « le fichier est arrivé », mais « la copie distante est **restaurable** » :

```
téléchargement depuis B2   16 654 octets
déchiffrement local        PGDMP, 92 919 octets
pg_restore --list          225 objets lisibles
```

C'est la seule chose qui compte le jour où le VPS disparaît.

## Le point qui aurait annulé tout le travail

**La clé de chiffrement vit sur le VPS.** Si le serveur disparaît, les archives
restent chez Backblaze et deviennent **définitivement illisibles**.

Le dispositif n'aurait alors couvert que la panne disque, pas le scénario pour
lequel il existe. Christophe l'a enregistrée dans son gestionnaire de mots de
passe, avec la commande de déchiffrement.

**Elle n'a jamais transité par cette session** : lue par lui sur le serveur,
jamais affichée ici. Une valeur qui entre dans l'historique doit être révoquée,
et une clé de chiffrement révoquée rend les sauvegardes illisibles.

## Ce que le dispositif couvre, et ce qu'il ne couvre pas

| Scénario | Couvert |
|---|---|
| Suppression accidentelle en base | oui, 14 jeux locaux |
| Panne disque du VPS | oui, copie Backblaze |
| Perte totale du VPS, compte OVH suspendu | **oui**, avec la clé hors serveur |
| Compromis du serveur | **partiellement** : l'attaquant a la clé B2 en écriture |

Le dernier point se resserrerait avec une clé B2 sans droit de suppression et une
règle de rétention côté Backblaze, qui s'applique même si le serveur ne tourne
plus. Non urgent, à arbitrer.

## État des tickets

**LS-107 reste EN COURS.** Le critère 1 est désormais entièrement fait, rétention
**et** moyen. Restent les critères 4 et 6, qui exigent une restauration avec des
fiches produit affichant leurs images, donc **LS-23**.

## Prochaine étape

LS-23, les photographies, reste le goulot : elle débloque LS-140 et LS-107, et
conditionne les onze stories de contenu de l'epic LS-22.
