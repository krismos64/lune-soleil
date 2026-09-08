# Préparation du serveur, LS-151

Ce que fait ce document : amener la machine de l'état « rien pour la boutique » à
« Nginx sert `lune-soleil.fr` en HTTPS et attend l'application ». Il s'arrête là
où LS-152 commence, la composition de production.

**La machine n'est pas dédiée à la boutique**, ADR-036. Elle sert SmartPlanning,
un produit payant avec des clients. Toute commande de ce document a été choisie
pour ne jamais interrompre l'autre site, et l'ordre des étapes en dépend.

Exécuté une première fois le 8 septembre 2026 sur `51.77.146.72`.

## Ce qui était déjà en place et ne se refait pas

Relevé sur la machine avant d'agir. Ces points appartiennent à SmartPlanning et
la boutique en hérite.

| Élément | État constaté |
|---|---|
| OS | Ubuntu 24.04.3 LTS |
| Nginx | 1.24.0, sur l'hôte, `TLS SNI support enabled` |
| Docker et Compose | présents, quatre conteneurs en service |
| Pare-feu `ufw` | actif, règles 22, 80 et 443 |
| Fail2ban | actif |
| `certbot.timer` | `enabled` et `active` |
| Connexion root par mot de passe | refusée, `PermitRootLogin without-password` |
| Fuseau horaire | `Etc/UTC` |

**Le fuseau est UTC et non l'heure de Paris.** Les horaires de
`docker/cron/crontab` se lisent dans ce fuseau : une tâche écrite pour 3 h du
matin s'exécute à 5 h heure française en été. À vérifier au moment de LS-152.

## Étape 1, le répertoire du challenge ACME

```bash
sudo mkdir -p /var/www/certbot
sudo chown -R www-data:www-data /var/www/certbot
```

C'est par ce répertoire que Let's Encrypt valide le domaine. Sans lui, la
demande de certificat échoue.

## Étape 2, sauvegarder l'état de Nginx

```bash
sudo cp -a /etc/nginx/sites-enabled \
  /root/sites-enabled.avant-lune-soleil.$(date +%Y%m%d-%H%M%S)
```

Retour arrière disponible avant la première modification, pas après.

## Étape 3, vérifier que Nginx est vert AVANT d'y toucher

```bash
sudo nginx -t
```

**Ne pas sauter cette étape.** Si la configuration était déjà cassée, un échec à
l'étape suivante serait attribué à tort au fichier de la boutique.

Un avertissement `ssl_stapling ignored, no OCSP responder URL` est attendu : il
vient de SmartPlanning, Let's Encrypt ayant retiré l'URL OCSP de ses certificats.
La configuration de la boutique ne porte donc pas cette directive.

## Étape 4, une configuration d'amorçage en HTTP seul

**L'ordre compte, et c'est le piège principal de cette procédure.** Le fichier
final référence un certificat qui n'existe pas encore. L'installer tout de suite
ferait échouer `nginx -t`, donc **plus aucun rechargement ne serait possible pour
aucun site de la machine**.

Installer d'abord un fichier qui n'écoute que sur le port 80 :

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name lune-soleil.fr www.lune-soleil.fr;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 503;
    }
}
```

Le `503` est délibéré : il dit « pas encore de service » plutôt que d'afficher le
site par défaut de la machine, qui est SmartPlanning.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**`reload` et jamais `restart`.** Un `reload` sur une configuration invalide
n'applique rien et laisse l'ancienne en service ; un `restart` arrête Nginx, donc
les trois sites.

## Étape 5, le DNS

Les deux enregistrements `A` doivent viser la machine avant toute demande de
certificat.

```bash
dig @dns106.ovh.net +short lune-soleil.fr A       # 51.77.146.72
dig @dns106.ovh.net +short www.lune-soleil.fr A   # 51.77.146.72
```

**Interroger le serveur de noms d'OVH directement**, un résolveur local pouvant
servir une valeur en cache pendant des heures. Le 8 septembre 2026, `curl` a
répondu depuis un cache alors que le DNS était déjà correct.

**Ne toucher qu'aux enregistrements `A`.** Les `MX` et le `TXT` portant le SPF
sont l'authentification email posée le 8 août 2026 : les modifier casserait
l'envoi des emails transactionnels.

## Étape 6, le certificat

Toujours simuler d'abord. Let's Encrypt limite le nombre de demandes par semaine,
et un échec réel consomme ce quota.

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d lune-soleil.fr -d www.lune-soleil.fr \
  --dry-run --non-interactive --agree-tos --email <adresse>
```

Puis, seulement si la simulation réussit, retirer `--dry-run`.

**Certbot est lent sur cette machine**, plusieurs minutes, et il pose un verrou :
une seconde exécution simultanée échoue sur « Another instance of Certbot is
already running ». Attendre plutôt que relancer.

## Étape 7, la configuration complète

Le fichier vient du dépôt, `docker/nginx/lune-soleil.conf`, et **ne se réécrit
jamais sur le serveur**.

```bash
scp docker/nginx/lune-soleil.conf <hôte>:/tmp/
sudo cp /tmp/lune-soleil.conf /etc/nginx/sites-available/lune-soleil.conf
sudo diff /tmp/lune-soleil.conf /etc/nginx/sites-available/lune-soleil.conf
sudo ln -sfn /etc/nginx/sites-available/lune-soleil.conf \
             /etc/nginx/sites-enabled/lune-soleil.conf
sudo nginx -t && sudo systemctl reload nginx
```

Le `diff` prouve que le fichier servi est celui du dépôt. SmartPlanning a connu
une dérive de ce genre, documentée dans son `docs/deployment.md` : un fichier
édité sur le serveur avait divergé du dépôt dans les deux sens.

### Deux pièges que ce fichier documente

**`http2 on;` n'existe pas en Nginx 1.24**, seulement à partir de 1.25. La
syntaxe est `listen 443 ssl http2;`. L'erreur a été rencontrée le 8 septembre
2026 et `nginx -t` l'a arrêtée avant tout rechargement.

**Aucune zone `limit_req_zone` ne doit réutiliser un nom existant.** SmartPlanning
déclare `general`, `auth`, `api` et `conn_limit`, et ces noms vivent dans le
contexte `http` global même écrits dans un fichier de site. Un doublon fait
échouer `nginx -t`. Préfixer par `ls_` si une limitation devient nécessaire.

## Étape 8, vérifier depuis l'extérieur

Depuis une autre machine, jamais depuis le serveur.

```bash
# Les trois sites répondent
curl -s -o /dev/null -w "%{http_code}\n" https://smartplanning.fr
curl -s -o /dev/null -w "%{http_code}\n" https://analytics.smartplanning.fr
curl -s -o /dev/null -w "%{http_code}\n" https://lune-soleil.fr

# Le certificat RÉELLEMENT servi, et non celui du disque
echo | openssl s_client -connect <ip>:443 -servername lune-soleil.fr 2>/dev/null \
  | openssl x509 -noout -subject -dates

# TLSv1.1 doit être refusé
echo | openssl s_client -connect <ip>:443 -servername lune-soleil.fr -tls1_1

# Le renouvellement, joué et non supposé
sudo certbot renew --dry-run --cert-name lune-soleil.fr
```

**`certbot certificates` lit le disque, `openssl s_client` interroge ce qui est
réellement servi.** S'ils divergent, le trafic n'atteint pas la machine et le
problème est dans la zone DNS. La leçon vient de la panne du 18 août 2026 sur
SmartPlanning.

## Résultat attendu à la fin

`https://lune-soleil.fr` répond **502**. C'est le bon résultat : Nginx fonctionne,
et aucune application n'écoute encore sur le port 3002. LS-152 la posera.

## Ce que cette procédure ne fait pas

Le pare-feu au-delà de l'existant, le durcissement approfondi et la répétition
d'incidents appartiennent à LS-139. La composition de production, les secrets et
la sauvegarde en routine sont LS-152. La chaîne de déploiement est LS-138.

## Un défaut trouvé et non corrigé, qui appartient à SmartPlanning

Les ports **3000 et 3001 sont joignables depuis Internet**, vérifié depuis
l'extérieur : `http://51.77.146.72:3000` répond 200.

`ufw` ne les autorise pourtant pas. La cause est que **Docker insère ses règles
DNAT en amont de celles d'`ufw`**, un contournement connu de la publication de
ports : `-p 3000:3000` ouvre le port quoi qu'en dise le pare-feu.

L'application de SmartPlanning est donc atteignable sans passer par Nginx, donc
sans TLS, sans sa limitation de débit et sans ses en-têtes de sécurité.

**Ce point n'a pas été corrigé** : il concerne un autre projet, et le corriger
sans arbitrage aurait pu interrompre un service payant. Il est signalé à
Christophe.

**Pour la boutique, la leçon est directement applicable** : LS-152 doit publier le
port applicatif en `127.0.0.1:3002` et non `3002`, faute de quoi la boutique
serait exposée de la même manière. C'est déjà un critère de cette story, et il
gagne ici sa démonstration.
