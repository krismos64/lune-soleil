#!/bin/bash
# Migration de production, avec deux garde-fous automatiques.
#
# L'autonomie sur les migrations de production repose sur ces deux controles
# deterministes, executes par ce script et non laisses a l'appreciation de
# l'assistant. Si l'un des deux ne peut pas conclure, la migration ne part pas.
#
#   Garde-fou 1 : migration destructive detectee, arret.
#     Un DROP, un TRUNCATE, un DELETE FROM ou un renommage exige une
#     confirmation humaine explicite. Une migration additive passe seule.
#
#   Garde-fou 2 : sauvegarde VERIFIEE avant toute migration.
#     Le dump doit exister, ne pas etre vide, et son integrite est controlee.
#     Sans sauvegarde valide, la migration ne part pas.
#
# Pourquoi cette distinction : un deploiement de code qui echoue se repare en
# redeployant l'image precedente, taguee par SHA. Une migration destructive ne
# se repare pas par un retour arriere. Le code revient, les donnees non. Il
# faut alors restaurer une sauvegarde, donc perdre toutes les commandes
# passees depuis. Sur une boutique en activite, ce sont des commandes reelles.
#
# CORRECTION LS-42, 30 juillet 2026. La version precedente etait en fail-open :
# la detection interrogeait la base par `prisma migrate diff`, absorbait toute
# erreur par `|| true`, et se repliait sur `prisma migrate status` qui liste des
# NOMS DE FICHIERS et non du SQL. Aucun DROP n'y apparait jamais. Le garde-fou
# affichait donc "migration additive" quoi qu'il arrive.
#
# La detection lit desormais le SQL des fichiers de migration non appliques,
# source locale qui ne depend d'aucun appel reseau. Chaque etape qui ne peut pas
# conclure interrompt le script. Voir tests/migrate-production-mutation.sh.
#
# Usage : ./scripts/migrate-production.sh [--confirm-destructive]

set -euo pipefail

CONFIRME_DESTRUCTIF=0
[ "${1:-}" = "--confirm-destructive" ] && CONFIRME_DESTRUCTIF=1

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REP_MIGRATIONS="${MIGRATIONS_DIR:-$RACINE/prisma/migrations}"

HORODATAGE=$(date +%Y%m%d-%H%M%S)
REP_SAUVEGARDE="${BACKUP_DIR:-/var/backups/lune-soleil}"
SAUVEGARDE="$REP_SAUVEGARDE/pre-migration-$HORODATAGE.dump"

echo "Migration de production, $HORODATAGE"
echo

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Arret : DATABASE_URL n'est pas defini." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Garde-fou 1 : analyse du SQL des migrations non appliquees
# ---------------------------------------------------------------------------
#
# La liste des migrations deja appliquees vient de la table _prisma_migrations,
# que `prisma migrate deploy` tient a jour. On lit le SQL de celles qui restent.
#
# Toute etape qui echoue ici arrete le script. Une detection qui ne peut pas
# conclure n'autorise rien : c'est exactement le defaut que LS-42 corrige.

echo "Analyse des migrations en attente"

if [ ! -d "$REP_MIGRATIONS" ]; then
  echo "Arret : repertoire de migrations introuvable, $REP_MIGRATIONS" >&2
  exit 1
fi

# Migrations deja appliquees, une par ligne. psql -t sort sans en-tete ni cadre.
# La table peut ne pas exister avant la toute premiere migration, cas traite.
APPLIQUEES=$(psql "$DATABASE_URL" -tAc \
  "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL" \
  2>/dev/null) || {
  if psql "$DATABASE_URL" -tAc "SELECT 1" >/dev/null 2>&1; then
    # La base repond mais la table est absente : premiere migration, tout est en attente.
    echo "  Table _prisma_migrations absente, premiere migration, tout est en attente."
    APPLIQUEES=""
  else
    echo "Arret : la base de production est injoignable, detection impossible." >&2
    echo "Un garde-fou qui ne peut pas conclure n'autorise pas la migration." >&2
    exit 1
  fi
}

SQL_ATTENTE=""
NB_ATTENTE=0

for CHEMIN in "$REP_MIGRATIONS"/*/; do
  [ -d "$CHEMIN" ] || continue
  NOM=$(basename "$CHEMIN")
  # grep -Fxq : correspondance exacte de ligne, litterale. Sans -x, la migration
  # « 001_init » serait consideree appliquee des que « 001_init_bis » l'est.
  if printf '%s\n' "$APPLIQUEES" | grep -Fxq "$NOM"; then
    continue
  fi
  FICHIER="$CHEMIN/migration.sql"
  if [ ! -f "$FICHIER" ]; then
    echo "Arret : migration $NOM sans migration.sql, contenu non analysable." >&2
    exit 1
  fi
  SQL_ATTENTE+=$(cat "$FICHIER")$'\n'
  NB_ATTENTE=$((NB_ATTENTE + 1))
  echo "  En attente : $NOM"
done

if [ "$NB_ATTENTE" -eq 0 ]; then
  echo
  echo "Aucune migration en attente, rien a appliquer."
  exit 0
fi

MOTIFS_DESTRUCTIFS='DROP[[:space:]]+(TABLE|COLUMN|CONSTRAINT|SCHEMA|INDEX|TYPE|VIEW)|ALTER[[:space:]]+TABLE[[:space:]]+[^;]*RENAME|TRUNCATE|DELETE[[:space:]]+FROM'

# grep -c dans une affectation plutot que dans un `if` : sous `set -e`, un grep
# sans correspondance renvoie 1 et tuerait le script sur une migration additive.
NB_DESTRUCTIVES=$(printf '%s' "$SQL_ATTENTE" | grep -icE "$MOTIFS_DESTRUCTIFS" || true)

if [ "$NB_DESTRUCTIVES" -gt 0 ]; then
  echo
  echo "MIGRATION DESTRUCTIVE DETECTEE"
  echo
  echo "Instructions concernees :"
  printf '%s' "$SQL_ATTENTE" | grep -inE "$MOTIFS_DESTRUCTIFS" | sed 's/^/  /'
  echo
  if [ "$CONFIRME_DESTRUCTIF" -eq 0 ]; then
    echo "Arret. Une migration destructive ne se repare pas par un retour" >&2
    echo "arriere : le code revient, les donnees non." >&2
    echo >&2
    echo "Strategie recommandee, en deux temps :" >&2
    echo "  1. Ajouter la nouvelle structure, deployer le code compatible" >&2
    echo "  2. Migrer les donnees, verifier" >&2
    echo "  3. Retirer l'ancienne structure dans une version ulterieure" >&2
    echo >&2
    echo "Pour passer outre en connaissance de cause :" >&2
    echo "  ./scripts/migrate-production.sh --confirm-destructive" >&2
    exit 1
  fi
  echo "Confirmation destructive fournie, poursuite."
else
  echo "  $NB_ATTENTE migration(s) analysee(s), aucune instruction destructive."
fi

# ---------------------------------------------------------------------------
# Garde-fou 2 : sauvegarde verifiee
# ---------------------------------------------------------------------------

echo
echo "Sauvegarde avant migration"
mkdir -p "$REP_SAUVEGARDE"

pg_dump --format=custom --file="$SAUVEGARDE" "$DATABASE_URL"

if [ ! -f "$SAUVEGARDE" ]; then
  echo "Arret : la sauvegarde n'a pas ete creee." >&2
  exit 1
fi

TAILLE=$(wc -c < "$SAUVEGARDE" | tr -d ' ')
if [ "$TAILLE" -lt 1024 ]; then
  echo "Arret : sauvegarde suspecte, $TAILLE octets seulement." >&2
  exit 1
fi

# Controle d'integrite : l'archive doit etre lisible par pg_restore
if ! pg_restore --list "$SAUVEGARDE" >/dev/null 2>&1; then
  echo "Arret : la sauvegarde est illisible, integrite non verifiee." >&2
  exit 1
fi

NB_OBJETS=$(pg_restore --list "$SAUVEGARDE" | grep -c '^[0-9]' || true)
echo "  $SAUVEGARDE"
echo "  $TAILLE octets, $NB_OBJETS objets, integrite verifiee."

# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------

echo
echo "Application des migrations"
npx prisma migrate deploy

echo
echo "Verification de l'etat"
npx prisma migrate status

echo
echo "Migration terminee."
echo "Sauvegarde conservee : $SAUVEGARDE"
echo
echo "En cas de probleme, restauration :"
echo "  pg_restore --clean --if-exists --dbname=\"\$DATABASE_URL\" \"$SAUVEGARDE\""
