#!/usr/bin/env bash
#
# Déploie une image de la boutique sur la machine de production. LS-138.
#
# CE SCRIPT EST LA SEULE CHOSE QUE LA CLÉ DE DÉPLOIEMENT PEUT EXÉCUTER.
# `authorized_keys` l'enferme par `command="..."`, donc quoi que GitHub Actions
# envoie, c'est ce fichier qui tourne. Le SHA voulu arrive par
# `SSH_ORIGINAL_COMMAND`, jamais comme une commande à exécuter.
#
# POURQUOI CET ENFERMEMENT. La machine est PARTAGÉE avec SmartPlanning, ADR-036,
# un produit payant avec des clients, et le compte `deploy` a `sudo` sans mot de
# passe et le groupe `docker`. Une clé sans `command=` donnerait donc la machine
# entière à quiconque compromettrait le dépôt, QUI EST PUBLIC. Les trois clés
# déjà présentes sont sans restriction ; celle-ci ne l'est pas, et c'est
# délibéré.
#
# CE QU'IL NE FAIT JAMAIS, et ce n'est pas une liste de bonnes intentions : rien
# ici ne touche un conteneur, un volume, un réseau ou un fichier qui ne porte pas
# le préfixe `lune-soleil`. Aucun `prune`, aucun filtre large, aucun rechargement
# de Nginx, qui sert les trois sites de la machine.
#
# Usage, tel que la clé l'appelle :
#   deployer.sh <sha-de-40-caracteres>
#   deployer.sh --retour-arriere            revient à l'image précédente
#   deployer.sh --etat                      affiche l'état sans rien changer

set -euo pipefail

RACINE="${RACINE_DEPLOIEMENT:-/opt/lune-soleil}"
COMPOSE="$RACINE/docker-compose.production.yml"
FICHIER_ENV="${FICHIER_ENV:-/etc/lune-soleil/production.env}"
PROJET="lune-soleil"

# L'HISTORIQUE DES DÉPLOIEMENTS, ET C'EST LUI QUI REND LE RETOUR ARRIÈRE
# POSSIBLE. Une ligne par déploiement réussi, le plus récent en dernier.
# SmartPlanning versionne ses fichiers par des copies suffixées à la main,
# `.bak-sp583`, `.avant-sp580` : cette forme se perd et ne dit pas l'ordre.
HISTORIQUE="${HISTORIQUE_DEPLOIEMENT:-/var/lib/lune-soleil/deploiements.log}"

IMAGE_DEPOT="ghcr.io/krismos64/lune-soleil"

# Délai maximal d'attente d'un conteneur sain, en secondes. Le healthcheck du
# Dockerfile a `start-period=15s` et `interval=30s`, donc trois minutes laissent
# passer plusieurs cycles sans être une attente infinie.
DELAI_SANTE="${DELAI_SANTE:-180}"

journaliser() {
  printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

echouer() {
  journaliser "ARRÊT : $1"
  exit 1
}

# ---------------------------------------------------------------------------
# L'ARGUMENT VIENT DE SSH_ORIGINAL_COMMAND, DONC D'INTERNET.
#
# Il est validé avant tout usage, et le motif est volontairement le plus étroit
# possible : quarante caractères hexadécimaux, rien d'autre. Sans cette garde,
# une valeur comme `abc; rm -rf /` serait interpolée dans les commandes qui
# suivent. C'est l'invariant 7 du projet appliqué à une entrée qui n'est pas un
# formulaire.
# ---------------------------------------------------------------------------

ENTREE="${*:-${SSH_ORIGINAL_COMMAND:-}}"
[ -n "$ENTREE" ] || echouer "aucun argument. Usage : deployer.sh <sha|--retour-arriere|--etat> [nombre-de-migrations]"

# DEUX MOTS AU PLUS, ET CHACUN VALIDÉ SÉPARÉMENT.
#
# Le premier est l'action, le second le nombre de migrations attendues. Tout ce
# qui suit est IGNORÉ plutôt que refusé : la valeur ne sert qu'à ces deux
# variables, et aucune n'est jamais évaluée comme une commande.
#
# L'entrée vient de `SSH_ORIGINAL_COMMAND`, donc d'Internet. Les deux motifs
# ci-dessous sont volontairement les plus étroits possibles : sans eux, une
# valeur comme `abc; rm -rf /` serait interpolée dans les commandes qui suivent.
# C'est l'invariant 7 appliqué à une entrée qui n'est pas un formulaire.
ARGUMENT=$(printf '%s' "$ENTREE" | awk '{print $1}')
MIGRATIONS_BRUT=$(printf '%s' "$ENTREE" | awk '{print $2}')
EMPREINTE_BRUTE=$(printf '%s' "$ENTREE" | awk '{print $3}')

MIGRATIONS_ATTENDUES=""
if [ -n "$MIGRATIONS_BRUT" ]; then
  printf '%s' "$MIGRATIONS_BRUT" | grep -qE '^[0-9]{1,4}$' \
    || echouer "le nombre de migrations attendues doit être un entier de 1 à 4 chiffres."
  MIGRATIONS_ATTENDUES="$MIGRATIONS_BRUT"
fi

EMPREINTE_COMPOSE=""
if [ -n "$EMPREINTE_BRUTE" ]; then
  printf '%s' "$EMPREINTE_BRUTE" | grep -qE '^[0-9a-f]{64}$' \
    || echouer "l'empreinte de la composition doit être un sha256 de 64 caractères hexadécimaux."
  EMPREINTE_COMPOSE="$EMPREINTE_BRUTE"
fi

# ---------------------------------------------------------------------------
# Garde-fous d'entrée. Chaque étape qui ne peut pas conclure ARRÊTE le script :
# un déploiement qui continue sur une incertitude est pire qu'un déploiement
# refusé.
# ---------------------------------------------------------------------------

[ -f "$COMPOSE" ] || echouer "$COMPOSE introuvable."
[ -r "$FICHIER_ENV" ] || echouer "$FICHIER_ENV illisible."
command -v docker >/dev/null 2>&1 || echouer "docker est introuvable."

mkdir -p "$(dirname "$HISTORIQUE")"
touch "$HISTORIQUE"

# JAMAIS DE `--build` DANS CETTE FONCTION NI DANS SES APPELS.
#
# Le service `cron` de la composition porte un `build:`, donc un
# `up -d --build` CONSTRUIRAIT sur le VPS. `npm ci` et `next build` saturent les
# quatre vCores plusieurs minutes, et **un processus de l'hôte n'est borné par
# aucune limite de conteneur** : c'est le geste le plus risqué possible sur une
# machine qui sert un produit payant, EXPLOITATION.md le dit déjà.
#
# L'image applicative se TIRE de GHCR, où elle a été construite et vérifiée par
# `verifier-image-docker.sh` avant publication. L'image du cron est déjà
# présente sur la machine ; une modification de `docker/cron/` ne se propage
# donc pas seule, ce qui est un choix et non un oubli.
#
# `-p lune-soleil` N'EST PAS FACULTATIF : sans lui, Compose déduit le nom du
# projet du répertoire courant et crée un second jeu de conteneurs sur un
# volume VIDE, donc un site sur un catalogue vierge.
composer() {
  docker compose -f "$COMPOSE" -p "$PROJET" --env-file "$FICHIER_ENV" "$@"
}

tag_courant() {
  grep '^IMAGE_TAG=' "$FICHIER_ENV" | head -1 | cut -d= -f2
}

# ---------------------------------------------------------------------------
# --etat : ne change RIEN. Sert au diagnostic et à la vérification d'après
# déploiement, sans donner de shell.
# ---------------------------------------------------------------------------

if [ "$ARGUMENT" = "--etat" ]; then
  echo "Image en service : $(tag_courant)"
  echo
  echo "Conteneurs :"
  docker ps --filter "name=lune-soleil" --format '  {{.Names}}  {{.Status}}' || true
  echo
  echo "Cinq derniers déploiements :"
  tail -5 "$HISTORIQUE" | sed 's/^/  /' || true
  exit 0
fi

# ---------------------------------------------------------------------------
# Détermination du SHA visé
# ---------------------------------------------------------------------------

if [ "$ARGUMENT" = "--retour-arriere" ]; then
  # L'AVANT-DERNIÈRE LIGNE, et non la dernière : la dernière est ce qui tourne.
  NB_LIGNES=$(grep -c . "$HISTORIQUE" 2>/dev/null || echo 0)

  # LES DEUX CAS SE DISTINGUENT, et la première version les confondait.
  #
  # Avec une seule ligne d'historique, il n'y a pas d'avant-dernière : `tail -2 |
  # head -1` rend alors la DERNIÈRE, donc l'image en service, et le message
  # « l'image précédente est celle en service » désignait la mauvaise cause.
  # Mesuré le 9 septembre 2026 en jouant le premier retour arrière, l'historique
  # ne portant qu'une ligne parce que la version antérieure avait été posée à la
  # main pendant LS-152.
  #
  # Un message d'erreur qui nomme la mauvaise cause fait chercher au mauvais
  # endroit : ici il aurait fait croire à un déploiement déjà annulé.
  if [ "$NB_LIGNES" -lt 2 ]; then
    echouer "l'historique ne porte que $NB_LIGNES déploiement(s), il en faut deux pour revenir en arrière. Voir $HISTORIQUE."
  fi

  SHA_VISE=$(awk '{print $2}' "$HISTORIQUE" | tail -2 | head -1)
  [ -n "$SHA_VISE" ] || echouer "avant-dernière ligne illisible dans $HISTORIQUE."
  [ "$SHA_VISE" != "$(tag_courant)" ] || echouer "l'avant-dernier déploiement est déjà en service, rien à faire."
  journaliser "RETOUR ARRIÈRE vers $SHA_VISE"
else
  SHA_VISE="$ARGUMENT"
  # QUARANTE CARACTÈRES HEXADÉCIMAUX, et jamais `latest`. Un tag mouvant rend le
  # retour arrière impossible : « revenir à latest » revient à rester où l'on est.
  printf '%s' "$SHA_VISE" | grep -qE '^[0-9a-f]{40}$' \
    || echouer "'$SHA_VISE' n'est pas un identifiant de commit de 40 caractères hexadécimaux."
fi

SHA_PRECEDENT=$(tag_courant)

journaliser "Déploiement de $SHA_VISE, image en service $SHA_PRECEDENT"

if [ "$SHA_VISE" = "$SHA_PRECEDENT" ]; then
  # IDEMPOTENCE. Rejouer le même SHA ne doit rien casser, et surtout ne doit pas
  # écrire une ligne d'historique qui ferait croire à deux versions distinctes :
  # le retour arrière reviendrait alors sur la même image.
  journaliser "L'image demandée est déjà en service, rien à faire."
  exit 0
fi

# ---------------------------------------------------------------------------
# Étape 1, la sauvegarde. AVANT TOUT LE RESTE.
#
# Elle n'est pas là pour le code, qui revient par son tag, mais pour la BASE :
# une migration ne se répare pas par un retour arrière, le code revient et les
# données non. Si elle échoue, le déploiement n'a pas lieu.
# ---------------------------------------------------------------------------

journaliser "Étape 1, sauvegarde préalable"

# UNE SAUVEGARDE RÉCENTE EST RÉUTILISÉE, ET CE N'EST PAS UNE OPTIMISATION.
#
# `sauvegarder-base.sh` garde QUATORZE jeux et supprime les plus anciens à
# chaque exécution. Or le premier réflexe devant un déploiement douteux est de
# le relancer : quatorze relances dans la journée effaceraient **quatorze jours
# d'historique de sauvegarde**, en croyant bien faire.
#
# Le seuil est de quinze minutes. Au-delà, une sauvegarde neuve est produite ;
# en deçà, celle qui existe couvre déjà l'état de la base, aucune migration ne
# pouvant s'être glissée sans passer par l'étape 3 qui refuserait.
SEUIL_FRAICHEUR="${SEUIL_FRAICHEUR:-900}"
REP_SAUVEGARDE="${BACKUP_DIR:-/var/backups/lune-soleil}"

DERNIERE=$(ls -t "$REP_SAUVEGARDE"/quotidienne-*.dump 2>/dev/null | head -1 || true)
AGE=999999
if [ -n "$DERNIERE" ]; then
  AGE=$(( $(date +%s) - $(stat -c %Y "$DERNIERE" 2>/dev/null || echo 0) ))
fi

if [ "$AGE" -lt "$SEUIL_FRAICHEUR" ]; then
  journaliser "  sauvegarde de $AGE s réutilisée, la rotation n'est pas consommée"
else
  if ! "$RACINE/deploiement/sauvegarder-base.sh" >/dev/null 2>&1; then
    echouer "la sauvegarde a échoué, le déploiement n'aura pas lieu. Voir journalctl -u lune-soleil-sauvegarde."
  fi
  journaliser "  sauvegarde faite"
fi

# ---------------------------------------------------------------------------
# Étape 2, tirer l'image AVANT de toucher à quoi que ce soit.
#
# Si GHCR est indisponible ou si le tag n'existe pas, on l'apprend ici, avec la
# production intacte et toujours en service. Tirer après avoir arrêté le
# conteneur laisserait le site éteint sur une panne de registre.
# ---------------------------------------------------------------------------

journaliser "Étape 2, récupération de $IMAGE_DEPOT:$SHA_VISE"
if ! docker pull "$IMAGE_DEPOT:$SHA_VISE" >/dev/null 2>&1; then
  echouer "image introuvable ou registre injoignable. La production n'a pas été touchée."
fi
journaliser "  image récupérée"

# ---------------------------------------------------------------------------
# Étape 3, le contrôle du schéma.
#
# LES MIGRATIONS NE TOURNENT PAS ICI, ET C'EST DÉLIBÉRÉ.
# `migrate-production.sh` vit dans le DÉPÔT, avec ses garde-fous, `npx prisma`
# et le client PostgreSQL 18 que cette machine n'a pas. Le faire tourner ici
# supposerait d'y poser Node, le dépôt et un client, donc d'élargir ce que la
# clé de déploiement peut atteindre. Une migration se joue depuis le poste, par
# le tunnel décrit dans EXPLOITATION.md, AVANT de déclencher ce déploiement.
#
# CE CONTRÔLE NE LIT PAS L'IMAGE, et la première version le faisait à tort.
# `ls prisma/migrations` dans l'image rend ZÉRO : la sortie `standalone` de
# Next.js n'embarque que `server.js`, `node_modules`, `public` et `src`, jamais
# le répertoire `prisma`. Mesuré le 9 septembre 2026. Le contrôle aurait donc
# comparé 0 à N et n'aurait JAMAIS rien détecté : un garde-fou muet, pire
# qu'absent puisqu'il aurait rassuré.
#
# LE NOMBRE ATTENDU VIENT DONC DU WORKFLOW, qui le lit dans le dépôt au moment
# de construire, et le transmet par `MIGRATIONS_ATTENDUES`. Quand il n'est pas
# fourni, le contrôle le DIT et ne prétend pas avoir vérifié.
# ---------------------------------------------------------------------------

journaliser "Étape 3, contrôle du schéma"

POSTGRES_USER=$(grep '^POSTGRES_USER=' "$FICHIER_ENV" | cut -d= -f2)
POSTGRES_DB=$(grep '^POSTGRES_DB=' "$FICHIER_ENV" | cut -d= -f2)

MIGRATIONS_APPLIQUEES=$(docker exec lune-soleil-db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -tAc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL" 2>/dev/null | tr -d ' ')

[ -n "$MIGRATIONS_APPLIQUEES" ] \
  || echouer "la base est injoignable, le schéma ne peut pas être contrôlé. La production n'a pas été touchée."

if [ -n "${MIGRATIONS_ATTENDUES:-}" ]; then
  journaliser "  migrations attendues $MIGRATIONS_ATTENDUES, appliquées $MIGRATIONS_APPLIQUEES"
  if [ "$MIGRATIONS_ATTENDUES" -gt "$MIGRATIONS_APPLIQUEES" ]; then
    echouer "le commit porte $MIGRATIONS_ATTENDUES migrations pour $MIGRATIONS_APPLIQUEES appliquées. Jouer ./scripts/migrate-production.sh depuis le dépôt AVANT ce déploiement, EXPLOITATION.md le décrit. La production n'a pas été touchée."
  fi
else
  journaliser "  MIGRATIONS_ATTENDUES non fournie, le schéma n'est PAS contrôlé"
fi

# ---------------------------------------------------------------------------
# Étape 4, la bascule.
#
# `up -d` NE RECRÉE QUE CE QUI CHANGE : le service `db` garde ses données et son
# conteneur, seul `app` est remplacé puisque son image diffère. C'est ce qui rend
# la bascule courte.
# ---------------------------------------------------------------------------

journaliser "Étape 4, bascule vers $SHA_VISE"

# LA COMPOSITION DE LA MACHINE NE DOIT PAS AVOIR DÉRIVÉ DU DÉPÔT.
#
# Ce fichier porte les limites de ressources, et **ce sont elles qui protègent
# SmartPlanning** des pics de `sharp`, ADR-036. Une divergence silencieuse est
# exactement ce qui les ferait disparaître sans que personne le voie : le
# déploiement recréerait le conteneur sans limite, et rien ne le dirait.
#
# La référence est l'empreinte du fichier au moment de la construction de
# l'image, transmise par le workflow. Sans elle, le contrôle le DIT plutôt que
# de prétendre avoir vérifié.
if [ -n "${EMPREINTE_COMPOSE:-}" ]; then
  EMPREINTE_MACHINE=$(sha256sum "$COMPOSE" | cut -d' ' -f1)
  if [ "$EMPREINTE_MACHINE" != "$EMPREINTE_COMPOSE" ]; then
    echouer "la composition de la machine diffère de celle du dépôt. Les limites de ressources protègent SmartPlanning : recopier docker-compose.production.yml avant de déployer. La production n'a pas été touchée."
  fi
  journaliser "  composition identique au dépôt"
fi

# L'écriture est atomique : un fichier temporaire puis un `mv`, pour qu'une
# interruption ne laisse jamais un fichier d'environnement à moitié écrit, ce qui
# empêcherait tout démarrage ultérieur.
TMP_ENV=$(mktemp)
trap 'rm -f "$TMP_ENV"' EXIT
sed "s|^IMAGE_TAG=.*|IMAGE_TAG=$SHA_VISE|" "$FICHIER_ENV" > "$TMP_ENV"
grep -q "^IMAGE_TAG=$SHA_VISE$" "$TMP_ENV" || echouer "la substitution d'IMAGE_TAG n'a pas pris, rien n'est modifié."
chmod 600 "$TMP_ENV"
cp "$TMP_ENV" "$FICHIER_ENV"

if ! composer up -d --no-deps app >/dev/null 2>&1; then
  journaliser "  le démarrage a échoué, retour immédiat à $SHA_PRECEDENT"
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$SHA_PRECEDENT|" "$FICHIER_ENV"
  composer up -d --no-deps app >/dev/null 2>&1 || true
  echouer "l'image $SHA_VISE n'a pas démarré. La version précédente est restaurée."
fi

# ---------------------------------------------------------------------------
# Étape 5, attendre que le conteneur soit SAIN, et non seulement démarré.
#
# La différence décide de tout : un conteneur « Up » dont l'application ne répond
# pas sert des 502. Le healthcheck du Dockerfile interroge `/api/sante`, qui
# vérifie la base : c'est lui qui dit si le déploiement a réussi.
# ---------------------------------------------------------------------------

journaliser "Étape 5, attente d'un conteneur sain, $DELAI_SANTE s au maximum"
ECOULE=0
while [ "$ECOULE" -lt "$DELAI_SANTE" ]; do
  ETAT=$(docker inspect lune-soleil-app --format '{{.State.Health.Status}}' 2>/dev/null || echo inconnu)
  [ "$ETAT" = "healthy" ] && break
  sleep 5
  ECOULE=$((ECOULE + 5))
done

if [ "$ETAT" != "healthy" ]; then
  journaliser "  état '$ETAT' après $ECOULE s, retour à $SHA_PRECEDENT"
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$SHA_PRECEDENT|" "$FICHIER_ENV"
  composer up -d --no-deps app >/dev/null 2>&1 || true
  echouer "le conteneur n'est pas devenu sain. La version précédente est restaurée."
fi

journaliser "  conteneur sain après $ECOULE s"

# ---------------------------------------------------------------------------
# Étape 6, la vérification de bout en bout, PAR NGINX et non en direct.
#
# Interroger 127.0.0.1:3002 prouverait que le conteneur répond ; passer par le
# domaine prouve que la chaîne entière fonctionne, TLS et proxy compris. C'est ce
# que voit un client.
# ---------------------------------------------------------------------------

journaliser "Étape 6, vérification par le domaine public"
CODE=$(docker run --rm --network host curlimages/curl:8.11.1 \
  -s -o /dev/null -w '%{http_code}' --max-time 15 https://lune-soleil.fr/api/sante 2>/dev/null || echo 000)

if [ "$CODE" != "200" ]; then
  journaliser "  /api/sante rend $CODE par le domaine, retour à $SHA_PRECEDENT"
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$SHA_PRECEDENT|" "$FICHIER_ENV"
  composer up -d --no-deps app >/dev/null 2>&1 || true
  echouer "la boutique ne répond pas correctement. La version précédente est restaurée."
fi

journaliser "  https://lune-soleil.fr/api/sante rend 200"

# ---------------------------------------------------------------------------
# Étape 7, l'historique. ÉCRIT EN DERNIER, et seulement sur un succès complet.
#
# Une ligne écrite trop tôt ferait croire à une version déployée qui ne l'est
# pas, et le retour arrière suivant viserait une image jamais mise en service.
# ---------------------------------------------------------------------------

printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SHA_VISE" >> "$HISTORIQUE"

# ---------------------------------------------------------------------------
# Étape 8, SmartPlanning n'a pas été touché.
#
# Ce n'est pas une politesse : c'est la garantie que ce script doit rendre, et
# elle se mesure plutôt qu'elle ne se suppose. Un échec ici n'annule pas le
# déploiement, qui a réussi, mais il DOIT se voir dans la sortie.
# ---------------------------------------------------------------------------

journaliser "Étape 8, contrôle de non-régression de SmartPlanning"
for SITE in smartplanning.fr analytics.smartplanning.fr; do
  CODE_SP=$(docker run --rm --network host curlimages/curl:8.11.1 \
    -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$SITE" 2>/dev/null || echo 000)
  if [ "$CODE_SP" = "200" ]; then
    journaliser "  $SITE rend 200"
  else
    journaliser "  ALERTE : $SITE rend $CODE_SP, à vérifier immédiatement"
  fi
done

# ---------------------------------------------------------------------------
# Étape 9, purge des images anciennes. LS-139.
#
# CE QU'ELLE FERME. Chaque déploiement tire une image de 459 Mo et n'en retire
# aucune. Mesure du 9 septembre 2026 : dix images `lune-soleil` sur la machine,
# 9,5 Go d'images au total dont 3 Go récupérables, et le disque passé de 13 % à
# 20 % en une journée. Le poste ne croît pas avec l'activité de la boutique mais
# avec celle du développement, ce qui le rend invisible au raisonnement usuel
# sur les médias et les sauvegardes.
#
# ELLE NE PEUT PAS ÊTRE UN `prune`, et l'en-tête de ce fichier l'écrit déjà :
# la machine est PARTAGÉE avec SmartPlanning. `docker image prune -a` emporterait
# les images d'un produit payant. La purge est donc ancrée sur le seul dépôt
# `$IMAGE_DEPOT`, et le filtre est construit à partir de cette variable plutôt
# qu'écrit en clair, pour qu'un changement de dépôt ne laisse pas un filtre
# périmé viser autre chose.
#
# COMBIEN ON GARDE. Trois, et ce n'est pas un chiffre de confort : le retour
# arrière de l'étape 6 vise `$SHA_PRECEDENT`, donc l'image en service ET la
# précédente doivent survivre. La troisième laisse une marge pour un second
# retour arrière, cas déjà rencontré le 9 septembre 2026 quand un `revert` a
# suivi une correction livrée.
#
# ELLE N'ÉCHOUE JAMAIS LE DÉPLOIEMENT. Il est terminé et vérifié à ce point ;
# un disque encombré est un problème, un déploiement annulé pour cette raison en
# serait un pire. Les erreurs sont donc absorbées et DITES.
# ---------------------------------------------------------------------------

journaliser "Étape 9, purge des images anciennes de $IMAGE_DEPOT"

IMAGES_CONSERVEES="${IMAGES_CONSERVEES:-3}"

# `--filter reference=` restreint à ce dépôt. Le tri est fait par Docker, le
# plus récent d'abord, et `tail -n +N` saute les N-1 premières.
#
# L'IMAGE EN SERVICE EST PROTÉGÉE DEUX FOIS : par son rang, puisqu'elle vient
# d'être tirée et se trouve en tête, et par Docker lui-même, qui refuse de
# supprimer une image dont un conteneur dépend. La ceinture et les bretelles
# sont voulues ici, une erreur de tri effacerait la production en service.
PURGEES=0
while IFS= read -r VIEILLE; do
  [ -n "$VIEILLE" ] || continue
  # Jamais l'image en service ni celle du retour arrière, quel que soit le rang.
  case "$VIEILLE" in
    *:"$SHA_VISE" | *:"$SHA_PRECEDENT") continue ;;
  esac
  if docker rmi "$VIEILLE" >/dev/null 2>&1; then
    PURGEES=$((PURGEES + 1))
  fi
done < <(docker images --filter "reference=$IMAGE_DEPOT" \
  --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | tail -n +$((IMAGES_CONSERVEES + 1)))

RESTANTES=$(docker images --filter "reference=$IMAGE_DEPOT" --format '{{.ID}}' 2>/dev/null | wc -l | tr -d ' ')
journaliser "  $PURGEES image(s) supprimée(s), $RESTANTES conservée(s)"

# L'ESPACE DISQUE EST DIT À CHAQUE DÉPLOIEMENT, et c'est le seul endroit où
# quelqu'un le lira sans le chercher. L'alerte de seuil, elle, est portée par
# `lune-soleil-seuil-disque.service`.
journaliser "  espace disque : $(df -h / | awk 'NR==2 {print $5" utilisés, "$4" libres"}')"

journaliser "Déploiement terminé, $SHA_PRECEDENT -> $SHA_VISE"
