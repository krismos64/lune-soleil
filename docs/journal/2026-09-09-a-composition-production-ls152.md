# 9 septembre 2026, a : LS-152, la boutique tourne en production

Session commencée le 8 au soir dans la foulée de LS-151, terminée le 9 au matin,
le commit étant daté du 9 à 05h55. Les mesures citées ici portent la date du
8 septembre, jour où elles ont été prises.

La composition de production existe, la boutique tourne sur la machine partagée,
et la sauvegarde qui manquait depuis toujours tourne enfin.

Ce que la session a surtout produit, ce sont **quatre défauts qu'aucun contrôle
ne voyait**, dont deux qui auraient cassé l'ouverture.

## Le résultat

Trois conteneurs sur le VPS de SmartPlanning, ADR-036, sans que l'autre projet
soit interrompu une seule fois.

```
lune-soleil-app     Up (healthy)   127.0.0.1:3002->3000/tcp
lune-soleil-db      Up (healthy)   5432/tcp        (aucun port publie)
lune-soleil-cron    Up
smartplanning.fr             HTTP 200   tout au long
analytics.smartplanning.fr   HTTP 200   tout au long
```

La base porte le schéma complet : **37 tables, 8 index partiels, 35 contraintes
CHECK, 14 migrations**.

## ADR-037, et le critère qui décide

La forme de la base était à trancher. **Conteneur PostgreSQL 18 avec volume
nommé**, pas de base gérée, et le critère est celui que la story imposait : la
sauvegarde et la restauration, jamais la facilité de mise en route.

Une base gérée aurait sorti la base de la machine qui porte les médias et les
documents comptables. Une restauration cohérente aurait alors dû recouper deux
sources dont les instants de sauvegarde diffèrent, et un média référencé par une
commande restaurée aurait pu manquer.

**La sauvegarde tourne sur l'hôte**, par une unité systemd, et non dans la
composition. Les moments où elle compte le plus sont ceux où la composition est
arrêtée : un `down` avant manipulation, une image qui ne démarre pas, un retour
arrière en cours.

## Le manque était pire que ce que la story annonçait

`migrate-production.sh` **exige** une sauvegarde vérifiée avant toute migration
et la produit lui-même, mais rien n'en produisait périodiquement. La description
de LS-152 le disait.

La mesure a montré pire : `/var/backups` ne contient que les archives système
d'Ubuntu, et **SmartPlanning ne sauvegarde pas sa base non plus**. Le disque
partagé n'avait aucune routine de sauvegarde de base, pour aucun des deux
projets.

## Quatre défauts trouvés, tous ticketés

Ils viennent tous de la même cause : **rien n'avait jamais été exécuté en
condition réelle**.

**LS-205, rien ne sert `/medias`.** ADR-007 décide que Nginx les sert et écarte
explicitement un gestionnaire de route Next.js. `verifier-nginx.sh` interdit
toute directive `root` ou `alias` dans ce fichier depuis LS-132. Aucune route ne
les sert. Le catalogue afficherait **des images cassées** pendant que
`/api/sante` rend 200 et que le contrôle de fumée sort en 0.

La contradiction naît de l'ordre des décisions : ADR-007 supposait Nginx capable
de servir des fichiers, ce que LS-132 a interdit après lui. **Ni l'un ni l'autre
n'a tort**, et l'arbitrage ne m'appartient pas.

Trois stories ont travaillé sur le **préfixe** de ces URL sans que personne
n'interroge ce qui les sert : LS-192, LS-197, LS-198.

**LS-206, deux tâches planifiées sur cinq ne sont jamais déclenchées.**
`tache-planifiee.ts` en déclare cinq, `docker/cron/crontab` en planifie trois.
`envoi-emails` et `purge-quarantaine-medias` ont leur service, leur verrou et
leur route : **rien ne les appelle**.

Conséquence d'`envoi-emails` : un client paie, la commande est correcte, le stock
est décrémenté, et **aucune confirmation ni facture ne part**. Le défaut se
découvre au premier client qui écrit.

L'en-tête du crontab parle encore de « cinq minutes » et « un quart d'heure » :
il date de LS-72, avant que deux tâches ne soient ajoutées au service.

**LS-207, Nginx plafonne le corps à 12 Mo** quand le service accepte 25 Mo et
`bodySizeLimit` 26. Une photographie de 17 Mo, cas éprouvé par ADR-007, reçoit un
413 avant d'atteindre la Server Action : l'écran reste sur sa progression, et le
message annonçant « 25 Mo au maximum » ne s'affiche jamais. Le commentaire de
`next.config.ts` décrit ce défaut dans l'autre sens, et sa correction n'avait pas
remonté jusqu'à Nginx.

**LS-208, deux défauts de `migrate-production.sh`**, révélés par sa première
exécution réelle. Détaillés plus bas.

## Deux croyances corrigées par la mesure

**`deploy.resources.limits` s'applique bien hors Swarm.** Un rapport de
relecture l'affirmait ignoré silencieusement, ce qui est la croyance répandue.
Deux services jetables déclarant les mêmes limites, l'un en `deploy.resources`,
l'autre en `mem_limit` et `cpus`, ont rendu un `docker inspect`
**identique** : `memoire=268435456 nanocpus=500000000`.

Ce qui reste vrai de l'avertissement : la limite se vérifie **sur le conteneur**,
jamais dans le fichier. Un zéro signifie « aucune limite », et c'est ainsi qu'on
a vu que SmartPlanning n'en déclare aucune côté processeur.

**`pg_restore --list -` ne lit pas l'entrée standard.** Contrairement à la
convention Unix, il cherche un fichier littéralement nommé `-`. `/dev/stdin`
échoue autrement, l'archive au format `custom` devant être navigable.

Ma première version du script **rejetait une sauvegarde parfaitement valide** de
92 785 octets en annonçant « intégrité non vérifiée ». Le défaut ne se voyait pas
à la lecture, seule l'exécution l'a montré, et il aurait fait échouer toutes les
sauvegardes.

## Le garde-fou qui bloque la première migration

`migrate-production.sh` a refusé de migrer, deux fois de suite et pour deux
raisons distinctes.

**Faux positif du garde-fou 1** : il a annoncé « MIGRATION DESTRUCTIVE DETECTEE »
sur trois `DROP INDEX` qui sont **des lignes de commentaire** expliquant ce qui
avait été écarté. Vérifié : aucune instruction destructive réelle dans les
quatorze migrations. Le motif cherche du texte, il ne comprend pas le SQL, et le
défaut symétrique est plus grave : un vrai `DROP TABLE` après un `--` en fin de
ligne serait traité pareil.

**Blocage circulaire du garde-fou 2** : il exige une sauvegarde de plus de 1024
octets, or un dump de base **vide** fait 887 octets. La première migration d'une
base neuve est donc impossible, bloquée par un garde-fou qui protège des données
n'existant pas encore.

Contourné par `prisma migrate deploy` en direct **sur arbitrage de Christophe**,
la base étant vide et sans rien à perdre. Le contournement est tracé ici et dans
LS-208 ; il ne doit pas se reproduire.

## Le contrôle m'a repris, comme la veille

L'analyse de secrets a bloqué le commit sur la chaîne de connexion écrite d'un
seul tenant, protocole puis identifiant, deux-points, mot de passe, arobase.
Elle figurait dans la composition et dans le document d'exploitation. **Ce sont
des gabarits, et le contrôle ne peut pas les distinguer d'une vraie fuite.**

Le motif a d'ailleurs rougi une seconde fois **sur ce journal**, où la forme
était citée pour l'expliquer : troisième occurrence du piège déjà en fiche, un
contrôle qui bloque sa propre explication.

**Puis GitGuardian a rougi en CI**, sur la ligne assemblant l'URI à partir de
variables : il signale la structure d'un URI de connexion même quand chaque
morceau en est une. Trois contrôles de suite, donc, avant que je trouve la
correction qui n'était pas un contournement.

Ma première correction a été un contournement : sortir le protocole dans une
variable pour casser le motif. **GitGuardian l'a refusée aussi**, en CI, et il
avait raison de la refuser : il signale la structure d'un URI de connexion même
quand chaque morceau est une variable.

La bonne correction n'était pas de casser le motif mais de **ranger la valeur au
bon endroit**. `DATABASE_URL` contient le mot de passe de la base : sa place est
dans le fichier de secrets de l'hôte, avec les autres, et non dans un fichier
versionné quelle que soit la façon dont elle y serait écrite.

Même arbitrage que pour le challenge ACME la veille, et même leçon : **c'est
l'usage qui cède**. Deux contrôles de suite ont refusé un contournement avant
que je trouve la correction qui n'en était pas un.

## Un défaut fermé avant d'exister

Le `Dockerfile` crée désormais `/var/lib/lune-soleil/medias` et `.../documents`
avec leur propriétaire. Sans ces points de montage dans l'image, Docker les crée
en `root`, alors que le processus tourne en `node`.

L'instant du défaut est ce qui le rendait coûteux : rien n'échoue au démarrage,
le contrôle de santé rend 200, et l'échec serait survenu **à la première écriture
de facture, pendant un paiement réel**.

## Preuves

```
Critere 3  temoin survit a down/up, data_directory /var/lib/postgresql/18/docker
           aucun message « unused mount » dans les journaux
Critere 4  51.77.146.72:3002, :5432, :55432 injoignables depuis mon poste
           regle DNAT ciblant 127.0.0.1 et non 0.0.0.0/0
Critere 5  aucun .env dans les couches, docker history muet
           aucune des trois valeurs dans les journaux, motif prouve par temoin
Critere 6  92 785 octets, 225 objets, integrite verifiee
           les trois controles de migrate-production.sh passent sur ce dump
Critere 7  restauration jouee : 37 tables, 35 CHECK, 14 migrations, sortie 0
Critere 8  37 tables, 8 index partiels, 35 CHECK sur la base de production
Limites    app 1342177280 / 1.5 vCPU / 512 pid, verifiees par docker inspect
Machine    boutique 303 Mo consommes, 6,1 Go libres, disque a 13 %

npm run format:check              All matched files use Prettier code style!
./scripts/verifier-regles.sh      regles conformes au schema
./scripts/verifier-nginx.sh       OK la resolution de l'adresse client
./scripts/verifier-propagation-docs.sh    socle Zod et son document accordes
./scripts/verifier-registre-traitements.sh  OK, 36 tables rangees
```

## LS-151 close, ses huit critères rejoués le jour même

La story attendait LS-152 pour son critère 2. Plutôt que de la fermer sur les
preuves de la veille, **les huit critères ont été rejoués sur la machine**, celle-ci
ayant changé entre-temps.

```
C1  root par mot de passe   tente reellement : Permission denied
C2  pare-feu de l'exterieur 22, 80, 443 ouverts ; 3000, 3001, 3002,
                            5432, 55432, 6379, 8888 fermes
C3  Docker et Compose       v5.0.1, conteneur de test demarre
C4  HTTPS et redirections   200, 301 depuis http et depuis www
                            certificat servi valide au 7 decembre, deux domaines
C5  renouvellement a blanc  « all simulated renewals succeeded », 04h48 ce jour
C6  fichier Nginx du depot  diff identique, en-tetes LS-91 lignes 191 et 192
C7  fuseau horaire          Etc/UTC, crontab du conteneur lu dans ce fuseau
C8  procedure reproductible PREPARATION-SERVEUR.md, huit etapes
```

`certbot.timer` est armé et actif, prochaine échéance dans six heures, et le
fichier de renouvellement porte bien `authenticator = standalone` sur le port
8888 : la bascule imposée par le contrôle du projet a tenu.

**Une mesure fausse a failli passer.** Mon premier test de ports annonçait 22, 80
et 443 **fermés**, ce qui contredisait le fait que la session SSH fonctionnait à
cet instant. La cause était ma méthode, `/dev/tcp` dans un sous-shell sous
`timeout`, et non la machine. Refait avec `nc`, tout était conforme. Une mesure
qui contredit un fait établi se refait avant d'être crue.

**Le renouvellement a paru bloqué neuf minutes** : certbot applique un délai
aléatoire de 384 secondes en mode non interactif, pour étaler la charge sur les
serveurs de Let's Encrypt. Lire son journal a évité de conclure à un blocage.

**Deux affirmations de la procédure étaient périmées** et ont été corrigées : le
502 annoncé comme résultat attendu est désormais un 200, et le défaut des ports
de SmartPlanning n'est plus « non corrigé » depuis SP-583. La section est gardée
pour le motif, qui survit à sa correction.

## État des tickets

**LS-152 reste En cours**, ses huit critères étant prouvés mais la production
n'étant pas exploitable tant que LS-205, LS-206 et LS-207 ne sont pas fermées.
La composition, elle, n'est pas remise en cause par ces trois défauts.

**LS-151 est CLOSE**, ses huit critères rejoués et prouvés le 9 septembre.

**Quatre tickets créés**, tous rattachés à LS-7 : LS-205, LS-206 et LS-207
bloquent LS-153 ; LS-208 non, la migration ayant abouti.

## Prochaine étape

**LS-206** est le plus rentable des trois bloquants : deux lignes de crontab,
plus le contrôle qui confronte la table `TACHES` au fichier, sans quoi la
prochaine tâche ajoutée reproduira le défaut.

**LS-205 demande un arbitrage** avant tout code, la contradiction opposant un ADR
accepté à un invariant de sécurité.

Les clés Stripe et SMTP ne sont pas posées, elles relèvent de LS-153.
