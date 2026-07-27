#!/bin/bash
# Migration de production, avec deux garde-fous automatiques.
#
# Christophe a accorde l'autonomie sur les migrations de production le
# 27 juillet 2026. Cette autonomie repose sur deux controles deterministes,
# executes par ce script et non laisses a l'appreciation de l'assistant.
#
#   Garde-fou 1 : sauvegarde VERIFIEE avant toute migration.
#     Le dump doit exister, ne pas etre vide, et son integrite est controlee.
#     Sans sauvegarde valide, la migration ne part pas.
#
#   Garde-fou 2 : migration destructive detectee, arret.
#     Un DROP COLUMN, DROP TABLE, DROP CONSTRAINT NOT NULL ou un renommage
#     exige une confirmation humaine explicite. Une migration additive
#     (ADD COLUMN, CREATE TABLE, CREATE INDEX) passe seule.
#
# Pourquoi cette distinction : un deploiement de code qui echoue se repare en
# redeployant l'image precedente, taguee par SHA. Une migration destructive ne
# se repare pas par un retour arriere. Le code revient, les donnees non. Il
# faut alors restaurer une sauvegarde, donc perdre toutes les commandes
# passees depuis. Sur une boutique en activite, ce sont des commandes reelles.
#
# Usage : ./scripts/migrate-production.sh [--confirm-destructive]

set -euo pipefail

CONFIRME_DESTRUCTIF=0
[ "${1:-}" = "--confirm-destructive" ] && CONFIRME_DESTRUCTIF=1

HORODATAGE=$(date +%Y%m%d-%H%M%S)
REP_SAUVEGARDE="${BACKUP_DIR:-/var/backups/lune-soleil}"
SAUVEGARDE="$REP_SAUVEGARDE/pre-migration-$HORODATAGE.dump"

echo "Migration de production, $HORODATAGE"
echo

# ---------------------------------------------------------------------------
# Garde-fou 2 : analyse du SQL avant toute action
# ---------------------------------------------------------------------------

echo "Analyse des migrations en attente"

SQL_ATTENTE=$(npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script 2>/dev/null || true)

if [ -z "$SQL_ATTENTE" ]; then
  # Repli : analyser les fichiers de migration non appliques
  SQL_ATTENTE=$(npx prisma migrate status 2>&1 | grep -i "following migration" -A20 || true)
fi

MOTIFS_DESTRUCTIFS='DROP[[:space:]]+(TABLE|COLUMN|CONSTRAINT|SCHEMA|INDEX)|ALTER[[:space:]]+TABLE[[:space:]]+[^;]*RENAME|TRUNCATE|DELETE[[:space:]]+FROM'

if echo "$SQL_ATTENTE" | grep -qiE "$MOTIFS_DESTRUCTIFS"; then
  echo
  echo "MIGRATION DESTRUCTIVE DETECTEE"
  echo
  echo "Instructions concernees :"
  echo "$SQL_ATTENTE" | grep -inE "$MOTIFS_DESTRUCTIFS" | sed 's/^/  /'
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
  echo "  Migration additive, aucune instruction destructive detectee."
fi

# ---------------------------------------------------------------------------
# Garde-fou 1 : sauvegarde verifiee
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

NB_OBJETS=$(pg_restore --list "$SAUVEGARDE" | grep -c '^[0-9]' || echo 0)
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
