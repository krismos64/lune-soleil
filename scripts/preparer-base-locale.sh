#!/bin/bash
# Prepare la base locale de developpement, LS-66, LS-67.
#
# Enchaine les deux etapes qui rendent la base conforme au modele :
#   1. demarrage du conteneur PostgreSQL 18 et attente du controle de sante
#   2. `prisma migrate deploy` : tables, cles etrangeres, index dont les
#      partiels, contraintes CHECK et unicite differable
#
# LS-67 A SUPPRIME UNE TROISIEME ETAPE, qui appliquait a la main le SQL de
# prisma/sql-manuel/. Ces contraintes vivent desormais dans une migration
# versionnee : `migrate deploy` les pose ici comme il les posera en production.
#
# NE PAS LA REINTRODUIRE. Appliquer ce SQL apres la migration rendrait la base
# locale conforme meme si la migration etait incomplete, et le defaut
# n'apparaitrait qu'en production. Une base preparee par ce script doit valoir
# exactement ce que `migrate deploy` produit, sans supplement.
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
# Client Prisma
# ---------------------------------------------------------------------------
echo "== Generation du client Prisma =="
npx prisma generate >/dev/null 2>&1 || echec "la generation du client a echoue"
echo "   genere"

# ---------------------------------------------------------------------------
# Etat final, mesure et non suppose
# ---------------------------------------------------------------------------
#
# Aucun compte attendu n'est ECRIT ici. Un nombre fige dans un script devient
# faux a la premiere contrainte ajoutee, et ce depot en a deja fait l'experience
# plusieurs fois. Le compte attendu est donc CALCULE depuis les fichiers de
# reference de prisma/sql-manuel/, qui restent la source de conception.
interroger() {
  docker exec -i "$CONTENEUR" psql -U "$UTILISATEUR" -d "$BASE" -tAq -c "$1" | tr -d '[:space:]'
}

tables=$(interroger "SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations';")
partiels=$(interroger "SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND indexdef ILIKE '%WHERE%';")
checks=$(interroger "SELECT count(*) FROM pg_constraint
    WHERE contype = 'c' AND connamespace = 'public'::regnamespace
      AND conname LIKE 'chk_%';")
differable=$(interroger "SELECT condeferrable AND condeferred FROM pg_constraint
    WHERE conname = 'section_produit_ordre_unique';")

# LS-67 : depuis que les contraintes sont portees par une migration versionnee,
# ce script ne les applique plus. Il doit donc VERIFIER que la migration les a
# bien posees, sinon une migration incomplete produirait une base annoncee
# « prete » avec un filet en moins. Afficher un compte sans le confronter a une
# reference ne prouve rien.
checks_attendus=$(grep -c "ADD CONSTRAINT" "$RACINE/prisma/sql-manuel/001_contraintes_check.sql")

echo
echo "-----------------------------------------"
echo "  Base locale prete"
echo "    tables            : $tables"
echo "    index partiels    : $partiels"
echo "    contraintes CHECK : $checks sur $checks_attendus attendues"
echo "    unicite differable: $differable"
echo "-----------------------------------------"
echo

[ "$checks" = "$checks_attendus" ] || echec "la migration n'a pose que $checks contraintes CHECK sur $checks_attendus.
       La migration versionnee est incomplete par rapport a
       prisma/sql-manuel/001_contraintes_check.sql. Ne pas appliquer ce SQL a la
       main : corriger la migration, LS-67."

[ "$differable" = "t" ] || echec "section_produit_ordre_unique n'est pas differable.
       L'echange de deux positions de section sera rejete, ADR-026.
       Verifier DEFERRABLE INITIALLY DEFERRED dans la migration."

echo "Verifier le modele sur cette base :"
echo "  npm run db:verifier"
