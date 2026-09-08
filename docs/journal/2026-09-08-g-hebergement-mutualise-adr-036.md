# 8 septembre 2026, g : ADR-036, la boutique s'installe chez SmartPlanning

Session partie d'une intention simple, acheter le VPS, et arrivée à une décision
d'architecture. Ce qu'elle a coûté à apprendre : **une contrainte externe force
parfois une meilleure solution que celle qu'on allait payer**, et la mesure d'une
machine existante vaut mieux qu'un devis.

## Le VPS ne pouvait pas être acheté

Le catalogue VPS d'OVHcloud était **intégralement en rupture** : les quatorze
localisations européennes de la gamme 2027, Gravelines, Roubaix et Strasbourg
comprises, et aucune localisation disponible sur la gamme précédente, sur les
trois zones mondiales.

Ce n'est pas propre à OVH. Hetzner présentait le même symptôme le même jour, ses
gammes CX et CAX indisponibles. La tension porte sur les composants, la mémoire
au premier rang, et aucun réapprovisionnement n'est annoncé.

**Le configurateur compensait seul.** Laissé à son choix par défaut, il plaçait le
serveur en Amérique du Nord, ce qui aurait sorti les données des clients de
l'Union européenne sans que personne ne le décide. C'est le genre de valeur par
défaut qui ne se voit pas dans un panier.

## Trois alternatives examinées puis écartées

**AWS** : de cinq à sept fois le coût, avec le trafic sortant facturé au
gigaoctet, ce qui vise exactement les photographies servies en plusieurs
résolutions.

**Vercel** : incompatible avec deux décisions déjà prises. Pas de conteneur
PostgreSQL, et un système de fichiers non persistant qui périmerait ADR-007 et son
volume local pour les médias.

**Scaleway ou Infomaniak** : viables sur le fond, jamais écartés, mais un
fournisseur de plus pour un problème que la machine existante résout déjà.

## La machine était là depuis le début

Christophe a signalé posséder un VPS pour SmartPlanning. L'inspection, en lecture
seule par `ssh smartplanning`, a montré autre chose qu'une machine chargée.

| Ressource | Total | Utilisé | Disponible |
|---|---|---|---|
| Mémoire | 7,6 Go | 1,2 Go | **6,4 Go** |
| Processeurs | 4 vCores | charge 0,00 | quasi tout |
| Disque | 72 Go | 7,9 Go, 11 % | **64 Go** |

Consommation réelle des quatre conteneurs : application 146 Mo, PostgreSQL 66 Mo,
Redis 15 Mo, Umami 414 Mo. Ubuntu 24.04.3 LTS, Nginx 1.24.0, `ufw` actif n'ouvrant
que 22, 80 et 443, en ligne depuis 61 jours.

**C'est la configuration du VPS-2 qu'on s'apprêtait à acheter**, 4 vCores et 8 Go,
occupée à 15 %.

## Ce que la mesure a changé dans le dépôt

**Le port applicatif passe de 3000 à 3002.** Le 3000 est pris par SmartPlanning et
le 3001 par son Umami. `docker/nginx/lune-soleil.conf` portait `proxy_pass
http://127.0.0.1:3000` depuis LS-91, et son en-tête interdit explicitement
d'inventer la valeur sur le serveur : la correction se fait donc dans le dépôt.

Le même en-tête dit maintenant que la machine n'est pas vierge, et que ce fichier
s'ajoute à côté des configurations existantes sans en modifier aucune.

**Les limites de ressources deviennent obligatoires**, portées par LS-152. Elles
étaient un confort sur une machine dédiée ; elles protègent désormais un produit
payant des pics de `sharp` au téléversement.

## Une observation de sécurité, sur l'autre projet

Les ports 3000 et 3001 **écoutent sur `0.0.0.0`** et non sur la boucle locale.
`ufw` ne les ouvre pas, ils ne sont donc pas joignables depuis l'extérieur, mais
la protection tient à une seule ligne de pare-feu, sans défense en profondeur.

Cela concerne SmartPlanning, pas la boutique. C'est écrit dans l'ADR et signalé à
Christophe parce que la mesure a été faite ici.

Pour Lune & Soleil, le critère de LS-152 sur la publication du port devient plus
important : `127.0.0.1:3002`, jamais toutes les interfaces.

## Le fuseau horaire, un critère qui change de nature

`timedatectl` donne `Etc/UTC`. Le critère 7 de LS-151 demandait de rendre le
fuseau cohérent avec les horaires attendus des tâches planifiées : il devient une
**vérification** et non un réglage, et les horaires de `docker/cron/crontab` se
lisent en UTC, pas en heure de Paris.

## Ce qui n'a pas été tranché, délibérément

LS-142 exige une préproduction **isolée** comme porte de sortie du Go-Live. Sur
une machine partagée, elle serait un troisième site sur le même hôte, ce qui
affaiblit l'isolation demandée.

L'ADR enregistre la contradiction et la laisse à LS-142 plutôt que de la résoudre
à sa place. Trois options y sont écrites, sans qu'aucune soit imposée, et le
critère décisif est ce que la recette avec l'exploitante doit prouver.

## Preuves

```
npm run format:check                 All matched files use Prettier code style!
./scripts/verifier-regles.sh         règles conformes au schéma
./scripts/verifier-config-claude.sh  configuration Claude Code cohérente
gitleaks (pre-commit)                no leaks found
CI PR #313                           les huit contrôles de CONTRIBUTING, SUCCESS
```

PR #313 fusionnée sur `main` en rebase, commit `f5b562b`.

## État des tickets

LS-151, LS-152, LS-153 et LS-142 commentés, tous **À faire**. Aucun n'est clos :
la décision débloque leur exécution, elle ne l'accomplit pas.

**Les onze stories de l'epic LS-7 ne sont plus bloquées par une commande
impossible à passer**, ce qui était l'impasse déclarée par le journal précédent.

## Prochaine étape

LS-151 est désormais jouable : ajouter le troisième site Nginx, le certificat pour
`lune-soleil.fr`, et les enregistrements DNS sans toucher à ceux de SmartPlanning.
Puis LS-152, la composition de production avec ses limites de ressources.

Le backlog sans serveur garde LS-110 et LS-144, deux petites stories repérées en
début de session et non entamées.
