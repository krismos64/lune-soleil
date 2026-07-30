#!/bin/bash
# Prepare la base locale de developpement, LS-66.
#
# Enchaine les trois etapes qui rendent la base conforme au modele :
#   1. demarrage du conteneur PostgreSQL 18 et attente du controle de sante
#   2. `prisma migrate dev` : tables, cles etrangeres, index dont les partiels
#   3. application du SQL que Prisma ne sait pas generer, CHECK et unicite
#      differable
#
# POURQUOI L'ETAPE 3 EXISTE. Prisma 7 ne genere ni les contraintes CHECK ni une
# contrainte DEFERRABLE. Sans elle, la base a ses tables mais pas le dernier
# filet contre la survente, et prisma/sql-manuel/verifier-schema.sh refuse de
# s'executer.
#
# ETAT TRANSITOIRE. LS-67 doit porter ces deux fichiers dans une migration
# Prisma SQL versionnee, apres quoi l'etape 3 disparait d'ici et le SQL se
# deploie par le mecanisme ordinaire, y compris en production. Tant que ce
# n'est pas fait, la production ne recoit PAS ces contraintes : ne pas
# considerer ce script comme un chemin de deploiement.
#
# Usage :
#   ./scripts/preparer-base-locale.sh              # prepare, conserve les donnees
#   ./scripts/preparer-base-locale.sh --reinitialiser   # repart d'une base vide
#
# `set -e` : toute etape ratee arrete le script. Une base a moitie preparee est
# pire qu'une base absente, elle donne l'illusion d'etre utilisable.
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE"

SQL_DIR="$RACINE/prisma/sql-manuel"
CONTENEUR=lune-soleil-db
BASE=lunesoleil
UTILISATEUR=lunesoleil

REINITIALISER=0
if [ "${1:-}" = "--reinitialiser" ]; then
  REINITIALISER=1
elif [ -n "${1:-}" ]; then
  echo "Argument inconnu : $1"
  echo "Usage : $0 [--reinitialiser]"
  exit 2
fi

echec() {
  echo
  echo "ECHEC : $1"
  echo
  exit 1
}

# ---------------------------------------------------------------------------
# Prerequis
# ---------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || echec "docker introuvable dans le PATH"
docker info >/dev/null 2>&1 || echec "le demon Docker ne repond pas, est-il demarre ?"

# Le fichier d'environnement porte les variables que docker-compose.yml exige et
# que prisma.config.ts lit. Son absence produit sinon une erreur de substitution
# Compose difficile a relier a sa cause.
[ -f "$RACINE/.env" ] || echec "fichier .env absent.
       Le creer a partir de .env.example, puis renseigner POSTGRES_PASSWORD
       et DATABASE_URL. Generer un mot de passe : openssl rand -base64 24"

for f in "$SQL_DIR/001_contraintes_check.sql" "$SQL_DIR/002_contraintes_unicite.sql"; do
  [ -r "$f" ] || echec "fichier SQL illisible : $f"
done

# ---------------------------------------------------------------------------
# 1. Conteneur
# ---------------------------------------------------------------------------
if [ "$REINITIALISER" -eq 1 ]; then
  echo "== Reinitialisation, suppression du volume =="
  # `down -v` detruit le volume nomme, donc toutes les donnees locales. Cette
  # branche n'est atteinte que sur demande explicite.
  docker compose down -v >/dev/null 2>&1 || true
fi

echo "== Demarrage de PostgreSQL 18 =="
docker compose up -d db >/dev/null 2>&1 || echec "le conteneur n'a pas demarre"

# Attente du controle de sante declare dans docker-compose.yml, et non d'un
# simple `pg_isready` : celui-ci repond deja pendant l'initialisation du volume,
# avant que la base applicative n'existe.
echo -n "   attente du controle de sante"
sante=""
for _ in $(seq 1 60); do
  sante=$(docker inspect --format '{{.State.Health.Status}}' "$CONTENEUR" 2>/dev/null || echo absent)
  [ "$sante" = "healthy" ] && break
  echo -n "."
  sleep 2
done
echo
[ "$sante" = "healthy" ] || echec "la base n'est pas saine apres 120 secondes (etat : $sante).
       Journaux : docker compose logs db"
echo "   sain"

# ---------------------------------------------------------------------------
# 2. Migration Prisma
# ---------------------------------------------------------------------------
echo "== Migration Prisma =="
#
# `migrate deploy` et non `migrate dev`, pour deux raisons.
#
# 1. `migrate dev` est INTERACTIF. Il detecte un environnement non interactif et
#    sort en erreur, meme quand la migration vient de s'appliquer sans probleme.
#    Mesure sur ce depot le 30 juillet 2026 : « Prisma Migrate has detected that
#    the environment is non-interactive, which is not supported. » Un script
#    d'automatisation ne peut donc pas l'appeler.
# 2. Les roles different. `migrate dev` CREE une migration a partir d'un
#    changement de schema, `migrate deploy` APPLIQUE des migrations existantes.
#    Preparer une base est le second cas.
#
# Consequence a connaitre : ce script n'engendre aucune migration. Apres avoir
# modifie schema.prisma, lancer `npx prisma migrate dev --name description` a la
# main, puis revenir ici. La creation d'une migration reste un geste delibere,
# et c'est bien ainsi : elle produit un fichier qui partira en production.
#
# Pas de `--skip-generate` non plus, l'option n'existe pas sur ces commandes en
# Prisma 7 et fait afficher l'aide puis sortir en erreur.
npx prisma migrate deploy || echec "l'application des migrations a echoue.
       Si schema.prisma a change sans migration correspondante, creer d'abord
       la migration : npx prisma migrate dev --name description_du_changement"

# ---------------------------------------------------------------------------
# 3. SQL que Prisma ne genere pas
# ---------------------------------------------------------------------------
#
# Ces fichiers ne sont PAS rejouables : ils declarent leurs contraintes sans
# `IF NOT EXISTS`, donc une seconde application sort en erreur « already
# exists ». Les reecrire serait du travail perdu, LS-67 les remplace par une
# migration. On les saute donc quand les contraintes sont deja la, en
# distinguant les deux fichiers plutot qu'en testant un compte global.
echo "== Contraintes que Prisma ne genere pas =="

compter_checks() {
  docker exec -i "$CONTENEUR" psql -U "$UTILISATEUR" -d "$BASE" -tAq -c \
    "SELECT count(*) FROM pg_constraint
      WHERE contype = 'c' AND connamespace = 'public'::regnamespace
        AND conname LIKE 'chk_%';" 2>/dev/null | tr -d '[:space:]'
}

appliquer() {
  local fichier="$1" libelle="$2"
  docker exec -i "$CONTENEUR" psql -U "$UTILISATEUR" -d "$BASE" -q -v ON_ERROR_STOP=1 \
    < "$fichier" >/dev/null 2>&1 \
    || echec "l'application de $libelle a echoue.
       Rejouer en voyant les erreurs :
       docker exec -i $CONTENEUR psql -U $UTILISATEUR -d $BASE < $fichier"
}

if [ "$(compter_checks)" = "0" ]; then
  appliquer "$SQL_DIR/001_contraintes_check.sql" "001_contraintes_check.sql"
  echo "   001_contraintes_check.sql applique"
else
  echo "   001_contraintes_check.sql deja applique, saute"
fi

differable=$(docker exec -i "$CONTENEUR" psql -U "$UTILISATEUR" -d "$BASE" -tAq -c \
  "SELECT count(*) FROM pg_constraint WHERE conname = 'section_produit_ordre_unique';" \
  2>/dev/null | tr -d '[:space:]')
if [ "$differable" = "0" ]; then
  appliquer "$SQL_DIR/002_contraintes_unicite.sql" "002_contraintes_unicite.sql"
  echo "   002_contraintes_unicite.sql applique"
else
  echo "   002_contraintes_unicite.sql deja applique, saute"
fi

# ---------------------------------------------------------------------------
# Client Prisma
# ---------------------------------------------------------------------------
echo "== Generation du client Prisma =="
npx prisma generate >/dev/null 2>&1 || echec "la generation du client a echoue"
echo "   genere"

# ---------------------------------------------------------------------------
# Etat final, mesure et non suppose
# ---------------------------------------------------------------------------
#
# Aucun compte attendu n'est ecrit ici. Un nombre fige dans un script devient
# faux a la premiere contrainte ajoutee, et ce depot en a deja fait l'experience
# plusieurs fois. Ces lignes rapportent ce qui est, la verification du contenu
# appartient a verifier-schema.sh.
tables=$(docker exec -i "$CONTENEUR" psql -U "$UTILISATEUR" -d "$BASE" -tAq -c \
  "SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations';" | tr -d '[:space:]')
partiels=$(docker exec -i "$CONTENEUR" psql -U "$UTILISATEUR" -d "$BASE" -tAq -c \
  "SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND indexdef ILIKE '%WHERE%';" | tr -d '[:space:]')

echo
echo "-----------------------------------------"
echo "  Base locale prete"
echo "    tables            : $tables"
echo "    index partiels    : $partiels"
echo "    contraintes CHECK : $(compter_checks)"
echo "-----------------------------------------"
echo
echo "Verifier le modele sur cette base :"
echo "  npm run db:verifier"
