#!/bin/bash
# Prouve par mutation que les garde-fous de migrate-production.sh detectent
# vraiment ce qu'ils pretendent detecter.
#
# LS-42. La version precedente du script affichait "migration additive" quoi
# qu'il arrive : sa detection interrogeait la base, absorbait l'erreur par
# `|| true`, et se repliait sur une sortie qui ne contient aucun SQL. Elle
# aurait passe un test qui se contente de verifier qu'une migration additive
# est acceptee. Un controle qui n'a jamais echoue sur le defaut qu'il pretend
# attraper n'est pas un controle.
#
# Chaque cas ci-dessous fabrique une situation et exige un CODE DE SORTIE precis.
# Aucune base reelle : psql, pg_dump, pg_restore et npx sont des doublures
# placees en tete de PATH.
#
# Usage : ./scripts/verifier-migration-mutation.sh

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$RACINE/scripts/migrate-production.sh"

BAC=$(mktemp -d)
trap 'rm -rf "$BAC"' EXIT

ECHECS=0
CAS=0

# ---------------------------------------------------------------------------
# Doublures. PSQL_ETAT pilote le comportement de psql depuis chaque cas.
# ---------------------------------------------------------------------------

FAUX="$BAC/bin"
mkdir -p "$FAUX"

cat > "$FAUX/psql" <<'DOUBLURE'
#!/bin/bash
# PSQL_ETAT : ok (base joignable, table presente), sans-table, injoignable
case "${PSQL_ETAT:-ok}" in
  injoignable) echo "could not connect to server" >&2; exit 2 ;;
  sans-table)
    # `SELECT 1` reussit, la requete sur _prisma_migrations echoue
    [[ "$*" == *"_prisma_migrations"* ]] && { echo 'relation does not exist' >&2; exit 1; }
    echo "1"; exit 0 ;;
  *)
    # Base joignable, aucune migration appliquee
    [[ "$*" == *"_prisma_migrations"* ]] && exit 0
    echo "1"; exit 0 ;;
esac
DOUBLURE

cat > "$FAUX/pg_dump" <<'DOUBLURE'
#!/bin/bash
# Ecrit un dump factice de plus de 1024 octets a l'emplacement demande
CIBLE=""
for ARG in "$@"; do [[ "$ARG" == --file=* ]] && CIBLE="${ARG#--file=}"; done
[ -n "$CIBLE" ] && head -c 4096 /dev/zero | tr '\0' 'x' > "$CIBLE"
exit 0
DOUBLURE

cat > "$FAUX/pg_restore" <<'DOUBLURE'
#!/bin/bash
echo "1; 2345 TABLE public produits"
exit 0
DOUBLURE

cat > "$FAUX/npx" <<'DOUBLURE'
#!/bin/bash
echo "[doublure npx] $*"
exit 0
DOUBLURE

chmod +x "$FAUX"/*

# ---------------------------------------------------------------------------
# Fabrique un repertoire de migrations contenant le SQL passe en argument
# ---------------------------------------------------------------------------

fabriquer_migration() {
  local REP="$1" NOM="$2" SQL="$3"
  mkdir -p "$REP/$NOM"
  printf '%s\n' "$SQL" > "$REP/$NOM/migration.sql"
}

# ---------------------------------------------------------------------------
# attendre_code <description> <code attendu> <PSQL_ETAT> <repertoire> [arg]
# ---------------------------------------------------------------------------

attendre_code() {
  local DESC="$1" ATTENDU="$2" ETAT="$3" REP="$4" ARG="${5:-}"
  CAS=$((CAS + 1))

  local SORTIE OBTENU
  SORTIE=$(PATH="$FAUX:$PATH" \
    DATABASE_URL="postgresql://faux/faux" \
    MIGRATIONS_DIR="$REP" \
    BACKUP_DIR="$BAC/sauvegardes" \
    PSQL_ETAT="$ETAT" \
    bash "$SCRIPT" $ARG 2>&1)
  OBTENU=$?

  if [ "$OBTENU" -eq "$ATTENDU" ]; then
    echo "  OK    $DESC (code $OBTENU)"
  else
    echo "  ECHEC $DESC : code $OBTENU attendu $ATTENDU"
    printf '%s\n' "$SORTIE" | sed 's/^/        /'
    ECHECS=$((ECHECS + 1))
  fi
}

echo "Preuve par mutation des garde-fous de migration, LS-42"
echo

# ---------------------------------------------------------------------------
# Cas 1 : migration additive. Le script doit aller au bout.
# C'est le cas temoin : sans lui, un script qui refuse tout passerait.
# ---------------------------------------------------------------------------

REP_ADDITIF="$BAC/additif"
fabriquer_migration "$REP_ADDITIF" "20260730000000_init" \
  "CREATE TABLE produits (id uuid PRIMARY KEY);
ALTER TABLE produits ADD COLUMN nom text;
CREATE INDEX idx_produits_nom ON produits (nom);"

echo "Temoin, une migration additive doit passer"
attendre_code "migration additive acceptee" 0 ok "$REP_ADDITIF"
echo

# ---------------------------------------------------------------------------
# Cas 2 a 6 : mutations destructives. Chacune doit BLOQUER, code 1.
# C'est ici que la version precedente du script echouait sur les cinq.
# ---------------------------------------------------------------------------

echo "Mutations destructives, chacune doit bloquer"

for MUTATION in \
  "DROP TABLE|DROP TABLE commandes;" \
  "DROP COLUMN|ALTER TABLE produits DROP COLUMN nom;" \
  "TRUNCATE|TRUNCATE TABLE mouvements_stock;" \
  "DELETE FROM|DELETE FROM avis WHERE statut = 'REFUSE';" \
  "renommage|ALTER TABLE produits RENAME COLUMN nom TO libelle;"
do
  NOM="${MUTATION%%|*}"
  SQL="${MUTATION#*|}"
  REP="$BAC/destructif-$CAS"
  fabriquer_migration "$REP" "20260730000000_init" \
    "CREATE TABLE produits (id uuid PRIMARY KEY);
$SQL"
  attendre_code "$NOM bloque sans confirmation" 1 ok "$REP"
done
echo

# ---------------------------------------------------------------------------
# Cas 7 : la confirmation explicite doit lever le blocage, et elle seule.
# ---------------------------------------------------------------------------

echo "La confirmation explicite leve le blocage"
REP_CONFIRME="$BAC/confirme"
fabriquer_migration "$REP_CONFIRME" "20260730000000_init" \
  "DROP TABLE commandes;"
attendre_code "--confirm-destructive accepte" 0 ok "$REP_CONFIRME" "--confirm-destructive"
echo

# ---------------------------------------------------------------------------
# Cas 8 : detection impossible. C'est le fail-open que LS-42 corrige.
# Base injoignable, donc la liste des migrations appliquees est inconnue :
# le script ne peut pas savoir ce qui va s'executer, il doit bloquer.
# ---------------------------------------------------------------------------

echo "Detection impossible, le script doit bloquer et non passer"
attendre_code "base injoignable bloque" 1 injoignable "$REP_ADDITIF"

# ---------------------------------------------------------------------------
# Cas 9 : migration sans fichier migration.sql. Contenu non analysable,
# donc destructivite indeterminee, donc arret.
# ---------------------------------------------------------------------------

REP_VIDE="$BAC/sans-sql"
mkdir -p "$REP_VIDE/20260730000000_init"
attendre_code "migration sans SQL bloque" 1 ok "$REP_VIDE"

# ---------------------------------------------------------------------------
# Cas 10 : premiere migration, table _prisma_migrations absente.
# La base repond, il n'y a simplement rien d'applique : doit passer.
# ---------------------------------------------------------------------------

echo
echo "Premiere migration, table absente mais base joignable"
attendre_code "table absente acceptee" 0 sans-table "$REP_ADDITIF"

# ---------------------------------------------------------------------------

echo
if [ "$ECHECS" -eq 0 ]; then
  echo "$CAS cas, tous conformes."
  exit 0
fi
echo "$ECHECS echec(s) sur $CAS cas."
exit 1
