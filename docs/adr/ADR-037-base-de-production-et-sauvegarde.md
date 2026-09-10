# ADR-037 : base de production en conteneur, et sauvegarde en routine sur l'hôte

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 8 septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-152 |

## Décision

La base de production est un **conteneur PostgreSQL 18 sur le VPS**, avec volume
nommé, et non une base gérée par un hébergeur.

Sa **sauvegarde tourne sur l'hôte**, hors de la composition applicative, par une
unité `systemd` quotidienne. Elle écrit dans `/var/backups/lune-soleil`, au
format `custom`, avec une rétention bornée à quatorze copies.

## Le critère qui décide, et il n'est pas la facilité de mise en route

La description de LS-152 le pose : **la sauvegarde et la restauration décident,
pas la commodité**. Une base gérée fournit des sauvegardes automatiques sans
travail, et c'est son seul avantage réel ici. Il ne suffit pas.

Une base gérée facturerait de dix à vingt euros par mois pour une boutique dont
le volume de données tient en quelques dizaines de mégaoctets, et surtout elle
sortirait la base de la machine qui porte déjà les médias et les documents
comptables. Une restauration cohérente devrait alors recouper deux sources dont
les instants de sauvegarde diffèrent : le dump de l'hébergeur et le volume local
d'ADR-007. Un média référencé par une commande restaurée pourrait manquer.

Le conteneur garde **une seule machine, un seul instant de sauvegarde**, et la
restauration se joue en une commande.

## Ce qui rend ce choix acceptable, et qui manquait

Un conteneur sans sauvegarde en routine serait un choix irresponsable, et c'était
l'état du projet jusqu'ici. `scripts/migrate-production.sh` **exige** une
sauvegarde vérifiée avant toute migration et la produit lui-même, mais **rien ne
sauvegardait périodiquement**. Une perte de disque un jour sans migration aurait
tout emporté.

La mesure du 8 septembre 2026 sur la machine a montré pire que prévu :
`/var/backups` ne contient que les archives système d'Ubuntu, et **SmartPlanning
ne sauvegarde pas non plus sa propre base**. Le disque partagé n'avait aucune
routine de sauvegarde de base de données, pour aucun des deux projets.

## Pourquoi la sauvegarde vit sur l'hôte et non dans la composition

Un conteneur de sauvegarde inclus dans `docker-compose.production.yml` s'arrête
avec elle. Or les moments où la sauvegarde compte le plus sont ceux où la
composition est en difficulté : un `docker compose down` avant manipulation, une
image qui ne démarre pas, un retour arrière en cours.

L'unité `systemd` est **indépendante du cycle de vie de l'application**. Elle
survit à un `down`, elle démarre avec la machine, et son échec est visible par
`systemctl status` sans dépendre de `docker logs`.

Ce choix diverge de celui du conteneur de tâches planifiées, `docker/cron/`, et
la différence est délibérée : celui-là déclenche des routes **de
l'application**, il n'a aucun sens sans elle. La sauvegarde, si.

## La rétention est bornée, et c'est une contrainte de cohabitation

**Quatorze copies quotidiennes**, les plus anciennes supprimées à chaque
exécution.

Le disque est partagé avec un produit payant depuis ADR-036, et il porte déjà les
médias d'ADR-007, qui croissent sans annonce. Une sauvegarde qui s'accumule sans
limite est un mécanisme de saturation à retardement : elle arrêterait les deux
projets, et elle le ferait un jour où personne ne regarde.

Quatorze jours couvrent le délai de rétractation de quatorze jours, ce qui donne
la propriété utile : toute commande encore rétractable est présente dans au moins
une sauvegarde.

LS-107 porte la politique complète de sauvegarde, dont sa rétention longue et le
volume des médias. Cet ADR tranche **la part technique que LS-152 exécute**, et
LS-107 peut l'élargir sans la contredire.

## La restauration se prouve, elle ne se suppose pas

Une sauvegarde jamais restaurée n'est pas une sauvegarde. Le critère 7 de LS-152
l'exige, et le projet a déjà mesuré ce que vaut un contrôle jamais exercé sur le
défaut qu'il prétend attraper.

La restauration se joue sur une **base de test**, jamais sur la production, à
partir d'un dump produit par la routine automatique et non fabriqué pour
l'occasion.

## Les conséquences

`docker-compose.production.yml` porte un service `db` en `postgres:18.4`, avec
volume nommé monté sur **`/var/lib/postgresql`** et non sur `.../data`, rupture
de l'image 18 déjà rencontrée sur ce dépôt.

Le port de la base **n'est pas publié sur l'hôte**, contrairement à la
composition de développement qui l'expose sur `127.0.0.1:55432` pour l'accès
depuis le poste. En production, seul le réseau Docker interne y accède, ce que
SmartPlanning fait déjà pour son propre PostgreSQL.

La sauvegarde s'exécute par `docker exec` sur ce conteneur, ce qui évite
d'installer un client PostgreSQL 18 sur l'hôte, dont les dépôts Ubuntu 24.04
servent une version antérieure : un `pg_dump` plus ancien que le serveur refuse
de fonctionner.

## Les risques acceptés

**~~La sauvegarde reste sur la même machine que la base.~~ FERMÉ le 10 septembre
2026, LS-107.** Ce risque était réel : une perte totale du VPS emportait la base
et ses quatorze sauvegardes ensemble.

Une copie quotidienne part désormais vers **Backblaze B2**, un fournisseur
différent d'OVH, à 03h15 UTC. Les archives sont **chiffrées en AES256 avant
envoi**, la passphrase ne quittant jamais le VPS. Restauration prouvée de bout en
bout le jour même : téléchargement, déchiffrement, 225 objets lisibles par
`pg_restore`.

Détail dans `EXPLOITATION.md`, section « Sauvegarde hors site ».

**La restauration est manuelle.** Elle demande une intervention, là où une base
gérée offrirait un bouton. Le mode opératoire est écrit plutôt que supposé, et
elle a été jouée pour de vrai le 9 septembre 2026.

**Le déploiement, lui, ne l'est plus** depuis LS-138 : il part d'un commit et
aboutit sur la machine par le workflow, retour arrière compris. Ce risque
accepté ne porte donc plus que sur la restauration d'une sauvegarde.
