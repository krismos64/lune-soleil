# ADR-036 : hébergement sur le VPS existant, en cohabitation avec SmartPlanning

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 8 septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-151 |

## Décision

La boutique est hébergée sur le **VPS OVH déjà en service pour SmartPlanning**,
en cohabitation, plutôt que sur une machine dédiée achetée pour elle.

Aucun VPS n'est acheté au titre de LS-151.

## Le contexte qui a forcé la question

Le 8 septembre 2026, le catalogue VPS d'OVHcloud est **intégralement en rupture**.
Les quatorze localisations européennes de la gamme 2027 affichent « en rupture de
stock », Gravelines, Roubaix et Strasbourg comprises, et la gamme précédente ne
propose aucune localisation sur les trois zones mondiales.

Le configurateur compense seul : laissé à son choix par défaut, il place le
serveur en **Amérique du Nord**, ce qui sortirait les données des clients de
l'Union européenne sans que personne ne l'ait décidé.

La cause n'est pas propre à OVH. Hetzner présente le même symptôme à la même
date, ses gammes CX et CAX étant indisponibles. La tension porte sur les
composants, la mémoire au premier rang, et aucun réapprovisionnement n'est annoncé.

Attendre était donc d'une durée inconnue, et le projet aurait laissé onze stories
de l'epic LS-7 bloquées sur une commande impossible à passer.

## Ce qui a été mesuré, et non supposé

La machine existante a été inspectée avant de décider, par `ssh smartplanning`,
en lecture seule.

| Ressource | Total | Utilisé | Disponible |
|---|---|---|---|
| Mémoire | 7,6 Go | 1,2 Go | **6,4 Go** |
| Processeurs | 4 vCores | charge 0,00 sur 15 minutes | quasi tout |
| Disque | 72 Go | 7,9 Go, 11 % | **64 Go** |

Consommation réelle des quatre conteneurs en service : application 146 Mo,
PostgreSQL 66 Mo, Redis 15 Mo, Umami 414 Mo. Les limites déclarées dans
`docker-compose.prod.yml` de SmartPlanning réservent 1,75 Go, soit largement plus
que ce qui est consommé.

La machine tourne depuis 61 jours, sous Ubuntu 24.04.3 LTS, avec Nginx 1.24.0 sur
l'hôte et un pare-feu `ufw` actif n'ouvrant que 22, 80 et 443.

**C'est la configuration que le VPS-2 envisagé aurait offerte**, 4 vCores et 8 Go,
à 15 % d'occupation.

## Pourquoi cette solution plutôt que les autres examinées

**Un VPS dédié** : impossible à acheter, c'est le point de départ.

**AWS ou un cloud à l'usage** : de cinq à sept fois le coût mensuel, avec le
trafic sortant facturé au gigaoctet, ce qui vise exactement le poste des
photographies servies en plusieurs résolutions. L'architecture du projet, un
volume local pour les médias et une composition Docker, y serait payée au prix de
l'élasticité sans en tirer parti.

**Vercel** : incompatible avec deux décisions déjà prises. Il n'héberge pas de
conteneur PostgreSQL, et son système de fichiers n'est pas persistant, ce qui
périmerait ADR-007 et son volume local pour les médias.

**Scaleway ou Infomaniak** : viables et non écartés sur le fond, mais ils
demandent un fournisseur de plus et ne résolvent rien que la machine existante ne
résolve déjà.

## Ce que la cohabitation impose au projet

### Le port applicatif change

`docker/nginx/lune-soleil.conf` porte `proxy_pass http://127.0.0.1:3000`. Ce port
est **occupé par SmartPlanning**, comme le 3001 l'est par Umami. La boutique prend
le **3002**, et le fichier versionné doit être corrigé plutôt que la valeur
inventée sur le serveur, ce que son en-tête interdit explicitement.

### Les limites de ressources deviennent obligatoires

Elles étaient un confort sur une machine dédiée, elles sont une **protection de
SmartPlanning** ici. Le traitement d'images par `sharp` consomme par pics lors
d'un téléversement, et rien ne doit permettre à la boutique d'affamer un produit
payant. La composition de production de LS-152 les porte, sans valeur par défaut
laissée implicite.

### Le disque est le poste à surveiller

ADR-007 stocke les médias dans un volume local. 64 Go sont libres, ce qui est
confortable, mais c'est la ressource qui croît sans annonce et que deux projets
partagent désormais. Une saturation les arrête tous les deux.

### Le fuseau horaire est UTC

`timedatectl` donne `Etc/UTC`. Les tâches planifiées de `docker/cron/crontab`
doivent être lues dans ce fuseau, et non dans l'heure de Paris. Le critère de
LS-151 sur la cohérence des horaires porte donc sur une machine déjà réglée, qu'il
faut vérifier et non fixer.

### Le DNS vit ailleurs

Le domaine `lune-soleil.fr` et sa zone sont déjà chez OVH, sur le même compte que
SmartPlanning dont le DNS vit chez Hostinger. Les enregistrements de la boutique
se posent sans jamais toucher à ceux de SmartPlanning.

## Les risques acceptés

**Le sort commun.** Un redémarrage, une saturation disque ou une erreur de
manipulation touche les deux projets. SmartPlanning est un produit payant avec des
clients ; la boutique lui fait courir un risque qu'elle ne lui faisait pas hier.
Ce risque est accepté en connaissance de cause, et les limites de ressources en
sont la contrepartie.

**L'isolation de la préproduction.** LS-142 exige une préproduction isolée comme
porte de sortie du Go-Live. Sur une machine partagée, elle serait un troisième
site sur le même hôte, ce qui affaiblit l'isolation demandée. Le ticket porte
cette contradiction et la tranche, cet ADR ne la tranche pas à sa place.

**La réversibilité, qui est réelle.** La composition Docker se déplace sans
réécriture le jour où la boutique reçoit sa propre machine. Cette décision n'est
donc pas un engagement définitif, et le retour au VPS dédié reste ouvert quand le
stock revient.

## Une observation de sécurité, hors périmètre de cet ADR

L'inspection a montré que les ports **3000 et 3001 écoutent sur `0.0.0.0`**, donc
sur toutes les interfaces, et non sur la boucle locale. Le pare-feu `ufw` ne les
ouvre pas vers l'extérieur, ils ne sont donc pas joignables aujourd'hui : la
protection tient à une seule ligne de pare-feu, sans défense en profondeur.

Cela concerne SmartPlanning et non la boutique. C'est signalé ici parce que la
mesure a été faite dans le cadre de cette décision, et le point est reporté à
Christophe pour son autre projet.

**Pour Lune & Soleil, le critère de LS-152 tient**, et devient plus important
qu'il ne l'était : le port applicatif se publie sur `127.0.0.1:3002` et non sur
toutes les interfaces, Nginx étant devant.

## Ce que cet ADR périme

| Élément | Ce qui change |
|---|---|
| LS-151 | ne prépare plus une machine vierge, mais ajoute un site à une machine en service |
| LS-152 | le port passe de 3000 à 3002, les limites de ressources deviennent obligatoires |
| LS-153 | la première mise en ligne se fait sans interrompre SmartPlanning |
| LS-142 | la préproduction isolée doit trancher ce que « isolée » signifie sur une machine partagée |
| `docker/nginx/lune-soleil.conf` | `proxy_pass` vise le port 3002 |

## Traçabilité

LS-151 pour la préparation de la machine, LS-152 pour la composition de
production, LS-153 pour la mise en ligne, LS-138 pour la chaîne de déploiement,
LS-142 pour la préproduction. ADR-007 pour le stockage local des médias, qui
motive la surveillance du disque. `docker/nginx/lune-soleil.conf` et son en-tête,
LS-91. Agent `ls-conteneurisation` pour la conduite technique.
