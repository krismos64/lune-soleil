#!/usr/bin/env bash
#
# Prouve par mutation que les garde-fous de `deploiement/sauvegarder-base.sh`
# arretent vraiment le script. LS-139, incident 3.
#
# MOTIF. `EXPLOITATION.md` affirmait que le script « s'arrete plutot que de
# produire une sauvegarde douteuse ». C'etait une HYPOTHESE : le 9 septembre
# 2026, `verifier-tests-mutation.sh` ne citait pas ce script, et aucun de ses
# garde-fous n'avait jamais ete declenche. Ce depot a deja livre plusieurs
# garde-fous qui ne fonctionnaient pas, dont un qui annoncait « migration
# additive » devant un DROP TABLE.
#
# SIX GARDE-FOUS ET NON QUATRE. La documentation en citait quatre, comptes a la
# lecture : conteneur arrete, dump sous 1024 octets, archive illisible, moins de
# dix objets. Deux manquaient a l'inventaire, dont celui qu'ADR-007 exige, les
# racines de medias et documents absentes. Un inventaire ecrit a la main est une
# opinion tant qu'on ne l'a pas confronte au code.
#
# CE QUI EST MUTE ICI EST UNE CONDITION D'EXECUTION, PAS UN TEXTE. Les autres
# scripts de mutation de ce depot posent un defaut dans un fichier source. Les
# garde-fous eprouves ici se declenchent sur l'ETAT DU MONDE : un conteneur
# arrete, un repertoire absent, une base vide. La mutation fabrique donc cet
# etat, et le controle mute reste le script reel, copie sans modification.
#
# IL NE TOUCHE JAMAIS LA PRODUCTION. Tout se joue sur un conteneur PostgreSQL
# jetable et des repertoires temporaires. `CONTENEUR_DB` et `BACKUP_DIR` sont
# surcharges a chaque cas. Le conteneur porte un nom qui ne peut pas entrer en
# collision avec `lune-soleil-db`, et le script s'arrete si ce nom existe deja.
#
# Usage : ./scripts/verifier-sauvegarde-mutation.sh
# Prerequis : Docker lance. Sans Docker, le script echoue franchement plutot
# que d'annoncer un vert qui ne veut rien dire.

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$RACINE/deploiement/sauvegarder-base.sh"

if [ ! -r "$SCRIPT" ]; then
  echo "Arret : $SCRIPT illisible." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Arret : Docker n'est pas lance, aucune mutation ne peut etre jouee." >&2
  exit 1
fi

# LA MEME VERSION QU'EN PRODUCTION, mesuree et non supposee : `docker inspect
# lune-soleil-db` rend `postgres:18.4` le 9 septembre 2026. Un client plus
# ancien que le serveur REFUSE de s'executer, et c'est precisement le defaut que
# le script contourne en faisant tourner pg_dump DANS le conteneur.
IMAGE_PG="postgres:18.4"

# Nom deliberement distinct de `lune-soleil-db`. Un prefixe partage ferait
# qu'un `docker rm` trop large emporterait la base reelle.
CONTENEUR="lune-soleil-mutation-sauvegarde"

if docker inspect "$CONTENEUR" >/dev/null 2>&1; then
  echo "Arret : le conteneur $CONTENEUR existe deja, refus d'ecraser." >&2
  exit 1
fi

BAC=$(mktemp -d)

nettoyer() {
  docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
  rm -rf "$BAC"
}
trap nettoyer EXIT

ECHECS=0
CAS=0

MDP="mutation-sans-valeur-reelle"

# ---------------------------------------------------------------------------
# Le decor : un conteneur PostgreSQL jetable avec assez d'objets pour passer le
# garde-fou de cardinalite, et les deux racines de fichiers qu'ADR-007 exige.
# ---------------------------------------------------------------------------

echo "Preparation du decor"

docker run -d --name "$CONTENEUR" \
  -e POSTGRES_USER=mutation \
  -e POSTGRES_PASSWORD="$MDP" \
  -e POSTGRES_DB=mutation \
  "$IMAGE_PG" >/dev/null 2>&1 || {
  echo "Arret : le conteneur temoin n'a pas demarre." >&2
  exit 1
}

# `pg_isready` plutot qu'un `sleep` fixe : une attente bornee mesure l'etat au
# lieu de le supposer. Le depot a deja paye un `setTimeout` qui mesurait mal.
PRET=0
for _ in $(seq 1 60); do
  if docker exec "$CONTENEUR" pg_isready -U mutation -d mutation >/dev/null 2>&1; then
    PRET=1
    break
  fi
  sleep 1
done

if [ "$PRET" -ne 1 ]; then
  echo "Arret : le conteneur temoin n'est jamais devenu pret." >&2
  exit 1
fi

# DIX OBJETS EST LE SEUIL DU GARDE-FOU, donc le decor nominal doit passer
# au-dessus, sans quoi le temoin echouerait pour la mauvaise raison et tous les
# cas suivants seraient ininterpretables. Douze tables : la marge est voulue.
docker exec -i -e PGPASSWORD="$MDP" "$CONTENEUR" \
  psql -U mutation -d mutation >/dev/null 2>&1 <<'SQL'
CREATE TABLE t01 (id serial primary key, valeur text);
CREATE TABLE t02 (id serial primary key, valeur text);
CREATE TABLE t03 (id serial primary key, valeur text);
CREATE TABLE t04 (id serial primary key, valeur text);
CREATE TABLE t05 (id serial primary key, valeur text);
CREATE TABLE t06 (id serial primary key, valeur text);
CREATE TABLE t07 (id serial primary key, valeur text);
CREATE TABLE t08 (id serial primary key, valeur text);
CREATE TABLE t09 (id serial primary key, valeur text);
CREATE TABLE t10 (id serial primary key, valeur text);
CREATE TABLE t11 (id serial primary key, valeur text);
CREATE TABLE t12 (id serial primary key, valeur text);
INSERT INTO t01 (valeur) VALUES ('temoin');
SQL

MEDIAS="$BAC/medias"
DOCUMENTS="$BAC/documents"
mkdir -p "$MEDIAS" "$DOCUMENTS"
# Trois entrees au moins : le script note « arborescences quasi vides » sous ce
# compte, et une note n'est pas un echec, mais autant que le temoin soit franc.
echo "photographie" > "$MEDIAS/piece-01.txt"
echo "declinaison" > "$MEDIAS/piece-02.txt"
echo "facture" > "$DOCUMENTS/facture-01.txt"

FICHIER_ENV="$BAC/production.env"
cat > "$FICHIER_ENV" <<ENV
POSTGRES_USER=mutation
POSTGRES_PASSWORD=$MDP
POSTGRES_DB=mutation
ENV
chmod 600 "$FICHIER_ENV"

echo "  conteneur $CONTENEUR pret, 12 tables, 2 racines de fichiers"
echo

# ---------------------------------------------------------------------------
# Le harnais
#
# Chaque cas lance le script REEL avec un environnement fabrique. Le repertoire
# de sauvegarde est NEUF a chaque cas : sans cela, la sauvegarde valide d'un cas
# precedent resterait en place et un echec paraitrait avoir produit un fichier.
# ---------------------------------------------------------------------------

# jouer <description> <code attendu> <motif attendu dans la sortie> [reglages...]
# Les reglages sont des affectations passees a l'environnement du script.
jouer() {
  local DESC="$1" ATTENDU="$2" MOTIF="$3"
  shift 3
  CAS=$((CAS + 1))

  local REP
  REP=$(mktemp -d "$BAC/sauvegardes-XXXXXX")

  local SORTIE OBTENU
  SORTIE=$(env \
    FICHIER_ENV="$FICHIER_ENV" \
    BACKUP_DIR="$REP" \
    CONTENEUR_DB="$CONTENEUR" \
    MEDIA_RACINE="$MEDIAS" \
    DOCUMENTS_RACINE="$DOCUMENTS" \
    "$@" \
    bash "$SCRIPT" 2>&1)
  OBTENU=$?

  local VERDICT="OK"

  if [ "$OBTENU" -ne "$ATTENDU" ]; then
    VERDICT="ECHEC code $OBTENU attendu $ATTENDU"
  elif [ -n "$MOTIF" ] && ! printf '%s' "$SORTIE" | grep -q "$MOTIF"; then
    # LE CODE DE SORTIE NE SUFFIT PAS. Un script peut rendre 1 pour une raison
    # qui n'est pas celle qu'on croit eprouver, et le cas passerait au vert en
    # prouvant autre chose. Le motif ancre le cas sur SA cause.
    VERDICT="ECHEC code correct mais le motif '$MOTIF' est absent"
  fi

  # UNE SAUVEGARDE NE DOIT SUBSISTER QUE SUR LE CAS NOMINAL. Un garde-fou qui
  # arrete le script en laissant un dump derriere lui laisserait la rotation
  # d'une execution ulterieure promouvoir un fichier douteux au rang de
  # sauvegarde. Ce sens n'est verifie que sur les cas en echec.
  if [ "$VERDICT" = "OK" ] && [ "$ATTENDU" -ne 0 ]; then
    local RESTES
    RESTES=$(find "$REP" -maxdepth 1 -type f \( -name 'quotidienne-*.dump' -o -name 'fichiers-*.tar.gz' \) | wc -l | tr -d ' ')
    if [ "$RESTES" -ne 0 ]; then
      VERDICT="ECHEC arret correct mais $RESTES fichier(s) laisse(s) derriere"
    fi
  fi

  if [ "$VERDICT" = "OK" ]; then
    echo "  OK   $DESC"
  else
    echo "  $VERDICT"
    echo "       cas : $DESC"
    printf '%s\n' "$SORTIE" | sed 's/^/       | /'
    ECHECS=$((ECHECS + 1))
  fi

  rm -rf "$REP"
}

echo "Mutations"

# ---------------------------------------------------------------------------
# Cas 0, le temoin.
#
# SANS LUI, SIX ECHECS PROUVERAIENT QUE LE SCRIPT EST CASSE, pas que ses
# garde-fous fonctionnent. Un script qui rend 1 sur tout passerait les six cas
# suivants pour de mauvaises raisons.
# ---------------------------------------------------------------------------
jouer "temoin, decor sain, la sauvegarde reussit" 0 "Sauvegarde terminee"

# ---------------------------------------------------------------------------
# Cas 1, fichier d'environnement illisible.
#
# Pas un garde-fou de qualite de sauvegarde, mais la porte d'entree : sans
# identifiants, tout ce qui suit echouerait avec un message de Docker plutot
# qu'avec la cause.
# ---------------------------------------------------------------------------
jouer "fichier d'environnement absent" 1 "illisible" \
  FICHIER_ENV="$BAC/nexiste-pas.env"

# ---------------------------------------------------------------------------
# Cas 2, conteneur inexistant.
# ---------------------------------------------------------------------------
jouer "conteneur inexistant" 1 "n'existe pas" \
  CONTENEUR_DB="lune-soleil-mutation-absent"

# ---------------------------------------------------------------------------
# Cas 3, CONTENEUR ARRETE, premier des quatre garde-fous documentes.
#
# Le cas reel : un `restart: unless-stopped` laisse un conteneur arrete apres un
# `down` manuel, et la minuterie tourne quand meme la nuit suivante.
# ---------------------------------------------------------------------------
docker stop "$CONTENEUR" >/dev/null 2>&1
jouer "conteneur arrete" 1 "et non 'running'"
docker start "$CONTENEUR" >/dev/null 2>&1
for _ in $(seq 1 60); do
  docker exec "$CONTENEUR" pg_isready -U mutation -d mutation >/dev/null 2>&1 && break
  sleep 1
done

# ---------------------------------------------------------------------------
# Cas 4, ECHEC DE pg_dump lui-meme.
#
# ABSENT DE L'INVENTAIRE DOCUMENTE. Le conteneur tourne, la base repond, et
# pourtant le dump echoue : identifiants desynchronises, base renommee, role
# supprime. Sans ce garde-fou, `set -e` arreterait le script sans dire pourquoi.
#
# UN MOT DE PASSE FAUX NE FABRIQUE PAS CE CAS, mesure le 9 septembre 2026 et
# contre-intuitif : `pg_dump` REUSSIT avec `PGPASSWORD` totalement faux, code 0
# et dump valide. `docker exec` se connecte par la SOCKET LOCALE, et le
# `pg_hba.conf` de l'image officielle porte `local all all trust`. Verifie
# identique sur `lune-soleil-db` en production. Le mot de passe n'est vérifié
# que sur les connexions `host`, donc jamais dans ce chemin.
#
# La consequence depasse ce script : une rotation d'identifiants ratee ne se
# manifesterait PAS par un echec de sauvegarde. La sauvegarde continuerait, et
# c'est l'application qui tomberait.
#
# Une base inexistante fait echouer la connexion elle-meme, ce que `trust` ne
# rattrape pas. C'est la forme reellement presente d'un echec de pg_dump.
# ---------------------------------------------------------------------------
ENV_BASE_ABSENTE="$BAC/production-base-absente.env"
sed 's/^POSTGRES_DB=.*/POSTGRES_DB=base_qui_nexiste_pas/' \
  "$FICHIER_ENV" > "$ENV_BASE_ABSENTE"
chmod 600 "$ENV_BASE_ABSENTE"
jouer "pg_dump echoue, base inexistante" 1 "pg_dump a echoue" \
  FICHIER_ENV="$ENV_BASE_ABSENTE"

# ---------------------------------------------------------------------------
# Cas 5, BASE QUASI VIDE, garde-fou de cardinalite.
#
# LE PLUS IMPORTANT DES SIX, et le moins visible : le dump REUSSIT, il fait
# quelques kilo-octets, il est parfaitement lisible par `pg_restore --list`. Il
# passe donc le controle de taille ET le controle d'integrite. Seul le compte
# d'objets le distingue d'une vraie sauvegarde.
#
# Le scenario reel est la composition qui pointerait par erreur sur un volume
# neuf. Sans ce garde-fou, quatorze executions effaceraient par rotation toutes
# les sauvegardes valides, en remplacant chacune par un dump de base vide.
#
# Une base SEPAREE plutot que des DROP TABLE sur la base temoin : detruire le
# decor rendrait les cas suivants dependants de l'ordre d'execution.
#
# ELLE N'EST PAS RIGOUREUSEMENT VIDE, ET C'EST LE POINT. Un dump de base
# totalement vide fait 873 octets, mesure : le garde-fou de TAILLE l'attrape en
# premier, et le compte d'objets n'est jamais atteint. Le cas passerait au vert
# en prouvant le mauvais garde-fou, defaut deja rencontre sur ce depot sous le
# nom « mutation vue par le mauvais test ».
#
# Une seule table avec assez de lignes depasse 1024 octets tout en restant tres
# en dessous de dix objets. C'est aussi le scenario REEL : un volume neuf sur
# lequel une migration partielle a pose une table ou deux.
# ---------------------------------------------------------------------------
docker exec -i -e PGPASSWORD="$MDP" "$CONTENEUR" \
  psql -U mutation -d mutation -c 'CREATE DATABASE presque_vide;' >/dev/null 2>&1

docker exec -i -e PGPASSWORD="$MDP" "$CONTENEUR" \
  psql -U mutation -d presque_vide >/dev/null 2>&1 <<'SQL'
CREATE TABLE seule (id serial primary key, remplissage text);
INSERT INTO seule (remplissage)
SELECT repeat('x', 200) FROM generate_series(1, 50);
SQL

ENV_VIDE="$BAC/production-base-vide.env"
sed 's/^POSTGRES_DB=.*/POSTGRES_DB=presque_vide/' "$FICHIER_ENV" > "$ENV_VIDE"
chmod 600 "$ENV_VIDE"
jouer "base quasi vide, moins de dix objets" 1 "la base semble vide" \
  FICHIER_ENV="$ENV_VIDE"

# ---------------------------------------------------------------------------
# Cas 6, RACINE DES MEDIAS ABSENTE, garde-fou exige par ADR-007.
#
# ABSENT DE L'INVENTAIRE DOCUMENTE, et c'est celui dont la consequence est la
# moins reparable. Un dump de base sans l'archive des fichiers restaure un
# catalogue dont chaque fiche pointe vers une photographie disparue, et les
# originaux sont supprimes apres traitement : la perte impose de redemander
# toutes les photographies a l'exploitante. Une facture, elle, ne se refabrique
# pas du tout, invariant 4.
#
# Le scenario reel est un montage qui ne remonte pas apres un redemarrage.
# ---------------------------------------------------------------------------
jouer "racine des medias absente" 1 "n'existe pas" \
  MEDIA_RACINE="$BAC/medias-absents"

jouer "racine des documents absente" 1 "n'existe pas" \
  DOCUMENTS_RACINE="$BAC/documents-absents"

# ---------------------------------------------------------------------------
# Cas 7, ARCHIVE ILLISIBLE.
#
# Le quatrieme garde-fou documente. Il ne se fabrique pas en corrompant un
# fichier : le script cree l'archive lui-meme, donc la seule facon de la rendre
# illisible est de faire echouer `tar`. Une racine dont la lecture est refusee
# le fait, et c'est un cas reel apres un changement de proprietaire.
#
# La commande tourne en sous-shell root si possible ; sans elevation, le cas est
# ANNONCE COMME NON JOUE plutot que compte comme reussi. Un cas silencieusement
# saute est exactement le motif qu'un `it.skip` produit dans une suite verte.
# ---------------------------------------------------------------------------
if [ "$(id -u)" -eq 0 ]; then
  INACCESSIBLE="$BAC/medias-illisibles"
  mkdir -p "$INACCESSIBLE"
  echo "photographie" > "$INACCESSIBLE/piece.txt"
  chmod 000 "$INACCESSIBLE"
  jouer "archive des fichiers en echec, racine illisible" 1 "archive des fichiers a echoue" \
    MEDIA_RACINE="$INACCESSIBLE"
  chmod 755 "$INACCESSIBLE"
else
  echo "  NON JOUE  archive illisible : demande root, relancer avec sudo pour l'eprouver"
fi

# ---------------------------------------------------------------------------
# Cas 8, LA ROTATION NE S'EXECUTE QU'APRES LA VERIFICATION.
#
# Ce n'est pas un garde-fou d'arret, c'est leur RAISON D'ETRE COMMUNE : ils ne
# valent que si un echec ne detruit rien. Le script place la rotation apres tous
# les `exit 1`, et ce cas le prouve plutot que de le lire.
#
# Quinze jeux sont poses, un de plus que la retention : le decor est donc mur
# pour une rotation. Puis on fait echouer le script. Si la rotation s'executait
# avant la verification, le plus ancien disparaitrait.
# ---------------------------------------------------------------------------
CAS=$((CAS + 1))
REP_ROTATION="$BAC/rotation"
mkdir -p "$REP_ROTATION"
for I in $(seq -w 1 15); do
  printf 'dump factice %s' "$I" > "$REP_ROTATION/quotidienne-202609$I-000000.dump"
  printf 'archive factice %s' "$I" > "$REP_ROTATION/fichiers-202609$I-000000.tar.gz"
done
AVANT=$(find "$REP_ROTATION" -maxdepth 1 -name 'quotidienne-*.dump' | wc -l | tr -d ' ')

env FICHIER_ENV="$ENV_VIDE" BACKUP_DIR="$REP_ROTATION" CONTENEUR_DB="$CONTENEUR" \
  MEDIA_RACINE="$MEDIAS" DOCUMENTS_RACINE="$DOCUMENTS" \
  bash "$SCRIPT" >/dev/null 2>&1

APRES=$(find "$REP_ROTATION" -maxdepth 1 -name 'quotidienne-*.dump' | wc -l | tr -d ' ')

if [ "$AVANT" -eq "$APRES" ]; then
  echo "  OK   un echec ne declenche aucune rotation, $APRES jeux intacts"
else
  echo "  ECHEC un echec a supprime $((AVANT - APRES)) jeu(x) : la rotation precede la verification"
  ECHECS=$((ECHECS + 1))
fi

# ---------------------------------------------------------------------------
# Garde-fou de ce script contre lui-meme.
#
# UN ANCRAGE CASSE RENDRAIT UN OK SILENCIEUX. Si le script de sauvegarde etait
# renomme ou deplace, le harnais ci-dessus echouerait de facon uniforme et on
# pourrait croire a des garde-fous inoperants. Le compte attendu est donc
# verifie, et le temoin en fait partie.
# ---------------------------------------------------------------------------
echo
if [ "$CAS" -lt 9 ]; then
  echo "ECHEC : $CAS cas joues, au moins 9 attendus. L'ancrage du controle est casse."
  exit 1
fi

if [ "$ECHECS" -eq 0 ]; then
  echo "$CAS cas joues, $ECHECS echec. Les garde-fous de sauvegarder-base.sh sont eprouves."
  exit 0
fi

echo "$CAS cas joues, $ECHECS echec(s)."
exit 1
