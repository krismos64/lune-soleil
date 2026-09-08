# 8 septembre 2026, h : LS-151, la boutique est servie en HTTPS

Deuxième session de la journée sur l'hébergement, dans la foulée d'ADR-036. Ce
qu'elle a coûté à apprendre : **un contrôle du projet a refusé un usage
légitime, et c'est l'usage qui a cédé**, pas la règle.

## Le résultat

`https://lune-soleil.fr` répond en TLS depuis le VPS, à côté des deux sites de
SmartPlanning qui **n'ont pas été interrompus une seule fois**.

```
smartplanning.fr             HTTP 200
analytics.smartplanning.fr   HTTP 200
lune-soleil.fr  (HTTPS)      HTTP 502   <- attendu
http://lune-soleil.fr        HTTP 301 -> https://lune-soleil.fr/
https://www.lune-soleil.fr   HTTP 301 -> https://lune-soleil.fr/
```

Le 502 est le bon résultat : Nginx fonctionne, rien n'écoute sur 3002. LS-152
posera l'application.

Certificat émis pour les deux domaines, expire le 7 décembre 2026, lu par
`openssl s_client` sur ce qui est **réellement servi** et non sur le disque.

## La documentation de l'autre projet a évité trois pièges

Christophe a autorisé la lecture du dépôt SmartPlanning, et son
`docs/deployment.md` est précis. Trois pièges y ont été désamorcés avant de
causer des dégâts.

**`http2 on;` n'existe qu'à partir de Nginx 1.25**, la machine sert la 1.24.0.
`nginx -t` a rendu « unknown directive » et **a refusé avant tout rechargement**.
Sans ce test, plus aucun rechargement n'aurait été possible pour aucun des trois
sites.

**Le `nginx.conf` global porte `ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3`.**
Sans redéclaration explicite dans notre bloc, la boutique aurait hérité de deux
protocoles obsolètes depuis 2021, RFC 8996, et un paiement aurait pu y voyager.
SmartPlanning fait déjà cette surcharge dans son propre fichier.

**Les zones `limit_req_zone` vivent dans le contexte `http` global**, même
écrites dans un fichier de site. SmartPlanning déclare `general`, `auth`, `api`
et `conn_limit` : réutiliser un de ces noms aurait fait échouer `nginx -t` et
cassé les trois sites d'un coup.

✅ Context7 consulté sur Nginx, qui a mis en avant le point du SNI : plusieurs
serveurs HTTPS sur une même IP servent le certificat du serveur par défaut si le
SNI n'est pas supporté. Vérifié sur la machine, `TLS SNI support enabled`.

## Le contrôle qui m'a repris

Ma première version servait le challenge ACME par `root /var/www/certbot`. La CI
a échoué : `verifier-nginx.sh` refuse toute directive `root` ou `alias` dans ce
fichier, Nginx servant des fichiers rendrait une facture atteignable sans jeton,
LS-132 critère 6.

**Mon usage était légitime, et le contrôle ne peut pas le distinguer d'un vrai
défaut.** La tentation était d'ajouter une exemption pour ce cas ; c'est
exactement ce que la fiche mémoire sur les exemptions déconseille.

Le challenge passe donc par certbot en mode `standalone` sur `127.0.0.1:8888`,
relayé par Nginx. Aucun répertoire n'est exposé et l'invariant tient sans
dérogation.

**Le fichier de renouvellement a dû être basculé sur ce mode**, et le
renouvellement rejoué à blanc. Sans cette bascule il serait resté sur `webroot`,
dont le répertoire venait d'être supprimé : il aurait échoué dans
quatre-vingt-dix jours, **en silence**, et le site serait devenu inaccessible
avec un avertissement de sécurité. C'est précisément le défaut que le critère 5
de la story existe pour empêcher.

## Un défaut trouvé sur SmartPlanning, non corrigé

Le critère 2 demande de vérifier le pare-feu **depuis l'extérieur**, et c'est
cette exigence qui a payé.

```
http://51.77.146.72:3000  ->  HTTP 200
http://51.77.146.72:3001  ->  HTTP 200
```

L'application complète de SmartPlanning répond, son API d'authentification
comprise, en HTTP clair. `ufw` ne les autorise pourtant pas : **Docker insère ses
règles DNAT en amont de la chaîne d'`ufw`**, donc `-p 3000:3000` publie sur
toutes les interfaces et le pare-feu de l'hôte ne s'applique pas.

Tout ce que Nginx apporte est court-circuité : TLS, limitation de débit, en-têtes
de sécurité. Cinq appels consécutifs à `/api/auth/session` rendent 200 sans
ralentissement, alors que la zone `auth` limite à 60 par minute.

**Non corrigé délibérément.** C'est un autre projet, un service payant, et une
correction mal faite couperait des clients. Un ticket détaillé a été rédigé pour
le projet SP, avec le correctif en deux lignes, `127.0.0.1:3000`.

**Pour la boutique, la leçon est directe** : LS-152 publiera en `127.0.0.1:3002`.
C'était déjà un de ses critères, il gagne ici sa démonstration.

## Ce qui reste ouvert

Le **critère 2 échoue**, et la story reste **En cours** plutôt que d'être close
sur sept critères en ignorant le huitième. Elle se ferme quand le port de la
boutique sera vérifié non joignable, ce qui suppose que LS-152 ait posé
l'application.

## Preuves

```
npm run format:check                 All matched files use Prettier code style!
./scripts/verifier-nginx.sh          OK la resolution de l'adresse client est coherente
./scripts/verifier-regles.sh         règles conformes au schéma
./scripts/verifier-config-claude.sh  configuration Claude Code cohérente
sudo nginx -t                        syntax is ok / test is successful
certbot renew --dry-run              all simulated renewals succeeded, EXIT=0
CI PR #315                           les huit contrôles de CONTRIBUTING, SUCCESS
```

PR #315 fusionnée sur `main` en rebase, commits `8cce267` et `04373c0`.

## État des tickets

LS-151 **En cours**, sept critères sur huit. LS-152, LS-153 et LS-142 commentés
plus tôt dans la journée par ADR-036, tous **À faire**.

## Prochaine étape

**LS-152**, la composition de production : conteneur applicatif sur
`127.0.0.1:3002`, PostgreSQL 18 avec son volume au bon point de montage, limites
de ressources obligatoires pour protéger SmartPlanning, secrets hors de l'image,
et la sauvegarde en routine qui manque encore.

Le fuseau de la machine étant `Etc/UTC`, les horaires de `docker/cron/crontab`
sont à relire dans ce fuseau avant de poser le conteneur de tâches planifiées.
