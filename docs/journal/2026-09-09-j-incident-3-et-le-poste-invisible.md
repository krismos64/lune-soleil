# 9 septembre 2026, j : l'incident 3, six garde-fous éprouvés, et le poste que personne ne surveillait

Session courte et sans dérive. L'incident 3 de LS-139 est joué, les garde-fous
de la sauvegarde cessent d'être une hypothèse, et la mesure d'entrée a trouvé un
poste de croissance disque qu'aucun ticket ne portait.

## Ce que la mesure d'entrée a trouvé avant tout travail

**Le disque était passé de 13 % à 20 % en une journée.** Le commentaire Jira de
la veille listait trois postes de croissance : médias, quarantaine, et
`pre-migration-*.dump`. Aucun des trois n'était en cause.

```
/dev/sda1                  72G   15G utilisés   58G libres   20 %
/var/backups/lune-soleil   964K   (10 jeux, tous sains)
docker system df           Images 23   9,538 Go   3,023 Go récupérables
```

**Dix images `ghcr.io/krismos64/lune-soleil` de 459 Mo**, une par déploiement,
que rien ne purgeait. Huit déploiements en onze heures la veille. Ce poste croît
avec l'activité de **développement**, pas avec celle de la boutique, et c'est ce
qui le rendait invisible : le raisonnement habituel sur un disque de production
regarde les données, pas les artefacts de livraison.

Arbitrage de Christophe : traiter le point dans cette session plutôt que d'ouvrir
un ticket.

## Six garde-fous et non quatre

`EXPLOITATION.md` et le commentaire Jira en citaient quatre. La confrontation au
code en a trouvé **six**, et l'un des deux manquants est celui qu'ADR-007 exige :
sans les racines de médias et de documents, le dump de la base seul restaurerait
un catalogue dont chaque fiche pointe vers une photographie disparue. Les
originaux étant supprimés après traitement, la perte imposerait de redemander
toutes les photographies à l'exploitante.

Motif déjà connu ici sous « contrôle générique et complétude » : un inventaire
écrit à la main est une opinion tant qu'on ne l'a pas confronté au code. Il avait
été écrit deux fois, dans la documentation et dans le ticket, sans jamais être
vérifié.

## Le contrôle mute un état du monde, pas un fichier

`verifier-sauvegarde-mutation.sh`, neuf cas. Les autres scripts de mutation de
ce dépôt posent un défaut dans un fichier source ; les garde-fous éprouvés ici se
déclenchent sur l'**état du monde**. La mutation fabrique donc cet état :
conteneur réellement arrêté, base réellement vide, racine réellement absente. Le
script muté reste le script réel, copié sans modification.

Tout se joue sur un conteneur PostgreSQL jetable en `postgres:18.4`, la version
relevée sur `lune-soleil-db` et non supposée. Le script refuse de démarrer si son
conteneur témoin existe déjà.

**Deux de mes cas visaient à côté, et le harnais les a dits.**

Le premier voulait faire échouer `pg_dump` avec un mot de passe faux. Il a
produit une sauvegarde valide. Cause mesurée : `docker exec` se connecte par la
**socket locale**, et le `pg_hba.conf` de l'image officielle porte
`local all all trust`, vérifié identique en production. Le mot de passe n'est
vérifié que sur les connexions `host`.

**La conséquence dépasse ce script** : une rotation d'identifiants ratée ne se
manifesterait pas par un échec de sauvegarde. La sauvegarde continuerait, et
c'est l'application qui tomberait.

Le second voulait éprouver le compte d'objets avec une base vide. Un dump de base
vide fait **873 octets**, donc le garde-fou de **taille** l'attrape en premier et
le compte d'objets n'est jamais atteint. Le cas serait passé au vert en prouvant
le mauvais garde-fou, motif déjà en fiche. Corrigé par une base à une seule table
et cinquante lignes, qui dépasse 1024 octets en restant loin de dix objets.

**Le contrôle est prouvé par cinq mutations**, dont une qui vérifie qu'il rougit
quand sa cible disparaît plutôt que de rendre un OK muet.

## L'incident 3, joué

Sept sens, tous verts, sur une image de 20 Mo montée en boucle.

```
2. témoin, disque dédié sain                      la sauvegarde réussit
3. saturation                                     /dev/loop0  15M  15M  0  100%
4. sauvegarde sur disque plein   ->  "Arrêt : pg_dump a échoué."  code 1
5. aucune sauvegarde tronquée laissée derrière     OK
   le disque réel n'a pas bougé, delta 18804 Ko    OK
6. la sauvegarde reprend seule, place rendue       OK   (critère 6)
7. /api/sante  ->  200 pendant tout l'incident     OK
```

**Le point de méthode qui compte plus que le résultat** : jamais le disque réel.
La machine porte SmartPlanning depuis ADR-036, un produit payant. Le script
refuse de démarrer si son point de montage existe déjà, ne détache que les
périphériques de boucle attachés à **son** image, et démonte sous `trap` y
compris sur interruption. Un incident joué ne doit pas devenir l'incident qu'il
simule.

**Ce qu'il a établi de non évident** : le script s'arrête sur l'échec de
`pg_dump`, pas sur le contrôle de taille. Un disque plein interrompt l'écriture
avant que les 1024 octets ne soient atteints. C'est donc le garde-fou **absent de
l'inventaire documenté** qui rattrape, ce qui est un argument de plus contre les
inventaires écrits à la main.

**La rotation ne s'exécute jamais sur un échec**, prouvé et non lu : quinze jeux
posés, un échec provoqué, quinze jeux intacts.

## L'alerte de seuil, et pourquoi son unité déclare deux codes de succès

Unité systemd horaire, alerte à 80 %, critique à 90 %. Horaire et non quotidienne
parce que la fréquence se choisit sur le délai de réaction, pas sur le coût : le
contrôle ne fait que lire `df`. À un tiers de point d'occupation par heure sur
cette machine en activité, un contrôle quotidien laisserait franchir le seuil
critique sans un mot pendant vingt-trois heures.

`SuccessExitStatus=1 2` sépare deux états que `systemctl --failed` confondrait :
« le disque se remplit » demande d'agir sur le disque, « le contrôle est cassé »
de réparer le contrôle. Éprouvé par un override temporaire à 10 % : l'alerte
s'affiche, l'unité reste hors de `--failed`. Le code 3, mesure impossible, reste
un échec.

Le message **nomme les trois postes** au lieu d'annoncer un pourcentage nu, pour
ne pas obliger à refaire l'enquête à chaud. Il dit aussi que la machine est
partagée : une alerte qui ne parlerait que de la boutique laisserait croire que
SmartPlanning est couvert ailleurs, ce qu'il n'est pas.

## La purge des images, et ce qu'elle ne pouvait pas être

`deployer.sh` gagne une étape 9. Elle ne pouvait pas être un `prune` : l'en-tête
du fichier l'écrit déjà, la machine est partagée et `docker image prune -a`
emporterait les images de SmartPlanning. Le filtre est ancré sur le seul dépôt,
construit depuis `$IMAGE_DEPOT` plutôt qu'écrit en clair.

**Trois images conservées**, parce que le retour arrière vise `$SHA_PRECEDENT` :
l'image en service et la précédente doivent survivre, la troisième laisse la
marge d'un second retour arrière, cas rencontré la veille.

**L'image en service est protégée deux fois**, et les deux ont été vérifiées
séparément : par son rang, et par le refus de Docker.

```
docker rmi <image en service>
Error response from daemon: conflict: ... container a1e20f3b1e04 is using its
referenced image
```

**Le gain réel est de 552 Mo pour six images de 459 Mo**, et l'écart n'est pas
une erreur : les couches sont largement partagées. Annoncer 2,7 Go aurait été
faux. Les sept conteneurs sont intacts, SmartPlanning compris.

## Ce qui a failli être raté

**Le déployeur installé ne se met pas à jour tout seul.** `systemctl cat` dit que
l'unité de sauvegarde appelle `/opt/lune-soleil/deploiement/sauvegarder-base.sh`,
mais le déployeur, lui, vit en `/usr/local/sbin/lune-soleil-deployer`. Modifier
le dépôt n'aurait rien changé à la machine. La table de propagation du skill
`story` porte cette ligne, et c'est elle qui l'a rattrapé. Installé, et
`--etat` rejoué pour vérifier.

Le script de sauvegarde a été confronté par `md5sum` à sa copie sur la machine
avant l'incident : éprouver un autre fichier que celui qui tourne la nuit
n'aurait rien prouvé. Identiques.

## État des tickets

**LS-139 reste EN COURS.** Fait après cette session : critères 1, 2, 4, 7, et
les **trois incidents** des critères 5 et 6.

Reste : le durcissement SSH et le pare-feu, et le critère 3 bloqué par LS-210.

## Prochaine étape

Le durcissement SSH et le pare-feu, dernier point de LS-139 hors du critère 3.
La machine étant partagée, une règle de pare-feu posée ici s'applique aussi à
SmartPlanning : le constat de LS-151 vaut avertissement, Docker contourne `ufw`.
