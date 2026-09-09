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
# PREMIERE_MIGRATION retient si la base est VIERGE, et ce drapeau sert plus bas
# a choisir le seuil de taille de la sauvegarde, LS-208.
PREMIERE_MIGRATION=0

APPLIQUEES=$(psql "$DATABASE_URL" -tAc \
  "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL" \
  2>/dev/null) || {
  if psql "$DATABASE_URL" -tAc "SELECT 1" >/dev/null 2>&1; then
    # La base repond mais la table est absente : premiere migration, tout est en attente.
    echo "  Table _prisma_migrations absente, premiere migration, tout est en attente."
    APPLIQUEES=""
    PREMIERE_MIGRATION=1
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

# ---------------------------------------------------------------------------
# LES COMMENTAIRES SONT RETIRES AVANT L'ANALYSE, LS-208
#
# POURQUOI. Le 8 septembre 2026, a la premiere migration reelle, ce garde-fou a
# annonce « MIGRATION DESTRUCTIVE DETECTEE » sur trois lignes de DOCUMENTATION :
# l'en-tete de la migration Better Auth explique quels DROP INDEX ont ete
# ECARTES, et le motif cherchait du texte sans savoir lire du SQL.
#
# LE COUT N'EST PAS L'AGACEMENT. Un faux positif impose `--confirm-destructive`
# sur une migration entierement additive, donc il APPREND a passer outre. Un
# garde-fou qu'on contourne par habitude ne protege plus rien, exactement le
# defaut que LS-42 a corrige dans l'autre sens.
#
# LE SENS RETENU, et il est ecrit pour ne pas etre redecouvert : ce qui suit
# `--` ne s'execute pas, PostgreSQL l'ignore, donc ce n'est pas destructif et
# ce script l'ignore aussi. Un `DROP TABLE` place la est inoffensif, et bloquer
# dessus arreterait une migration sans danger.
#
# CE QUI EST PRESERVE, et c'est le point delicat : le code AVANT le `--` sur la
# meme ligne. `DROP TABLE commandes; -- volontaire` doit toujours bloquer. Le
# `s/--.*$//` ne retire que la fin de ligne, jamais la ligne entiere.
#
# CE QUI N'EST PAS TRAITE, dit plutot que tu : un `--` a l'interieur d'un
# LITTERAL de chaine, `INSERT INTO t VALUES ('a -- b')`, verrait sa fin de
# ligne retiree a tort. Le cas ne peut que faire DISPARAITRE du texte de
# l'analyse, donc au pire masquer une instruction destructive placee apres un
# tel litteral SUR LA MEME LIGNE. Aucune migration du depot n'a cette forme, et
# la traiter exigerait un analyseur SQL. Si ce cas apparait un jour, la reponse
# est de couper la ligne en deux dans la migration.
#
# L'ANALYSE PORTE SUR LE SQL DECOMMENTE, L'AFFICHAGE SUR L'ORIGINAL. Sans cette
# distinction, le message d'erreur montrerait des lignes videes de leur
# commentaire avec des numeros qui ne correspondraient plus au fichier.
SQL_ANALYSE=$(printf '%s' "$SQL_ATTENTE" \
  | sed -E 's/--.*$//' \
  | awk 'BEGIN{bloc=0}
    {
      ligne = $0
      resultat = ""
      while (1) {
        if (bloc == 0) {
          i = index(ligne, "/*")
          if (i == 0) { resultat = resultat ligne; break }
          resultat = resultat substr(ligne, 1, i - 1)
          ligne = substr(ligne, i + 2)
          bloc = 1
        } else {
          i = index(ligne, "*/")
          if (i == 0) { break }
          ligne = substr(ligne, i + 2)
          bloc = 0
        }
      }
      print resultat
    }')

# grep -c dans une affectation plutot que dans un `if` : sous `set -e`, un grep
# sans correspondance renvoie 1 et tuerait le script sur une migration additive.
NB_DESTRUCTIVES=$(printf '%s' "$SQL_ANALYSE" | grep -icE "$MOTIFS_DESTRUCTIFS" || true)

if [ "$NB_DESTRUCTIVES" -gt 0 ]; then
  echo
  echo "MIGRATION DESTRUCTIVE DETECTEE"
  echo
  echo "Instructions concernees :"
  # Sur le SQL DECOMMENTE, pour que les lignes affichees soient celles qui ont
  # reellement declenche la detection. Une ligne montree ici est une ligne qui
  # s'executera.
  printf '%s' "$SQL_ANALYSE" | grep -inE "$MOTIFS_DESTRUCTIFS" | sed 's/^/  /'
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

# SEUIL DE TAILLE, ET IL DEPEND DE L'ETAT DE LA BASE, LS-208.
#
# 1024 octets sur une base qui porte des donnees : un dump nettement plus petit
# signale un pg_dump interrompu ou une base qui n'est pas celle qu'on croit.
#
# 256 OCTETS SUR UNE BASE VIERGE, et ce n'est pas un affaiblissement. Un
# `pg_dump --format=custom` d'une base VIDE fait 887 octets, mesure du
# 8 septembre 2026 sur la production : le seuil de 1024 rendait donc la toute
# PREMIERE migration impossible, par un garde-fou qui protege des donnees
# n'existant pas encore. Le blocage etait circulaire, il faut des donnees pour
# migrer et migrer pour en avoir, et il a ete contourne ce jour-la par un
# `prisma migrate deploy` en direct, ce que CLAUDE.md interdit.
#
# CE QUE 256 CONTINUE D'ATTRAPER, meme sur une base vierge : un fichier vide,
# un message d'erreur de quelques dizaines d'octets ecrit a la place du dump,
# une redirection qui n'a rien recu. Le controle d'integrite par
# `pg_restore --list` reste applique dans les deux cas, et c'est lui qui porte
# la vraie garantie.
#
# LE SEUIL SE RESSERRE DE LUI-MEME : des la deuxieme migration la table
# `_prisma_migrations` existe, `PREMIERE_MIGRATION` vaut 0, et 1024 s'applique
# sans qu'aucune configuration soit a changer.
if [ "$PREMIERE_MIGRATION" -eq 1 ]; then
  SEUIL_TAILLE=256
  echo "  Base vierge, seuil de taille abaisse a $SEUIL_TAILLE octets."
else
  SEUIL_TAILLE=1024
fi

TAILLE=$(wc -c < "$SAUVEGARDE" | tr -d ' ')
if [ "$TAILLE" -lt "$SEUIL_TAILLE" ]; then
  echo "Arret : sauvegarde suspecte, $TAILLE octets pour un seuil de $SEUIL_TAILLE." >&2
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
