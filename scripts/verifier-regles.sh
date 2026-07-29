#!/bin/bash
# Vérifie qu'aucun fichier de `.claude/rules/` ne nomme un identifiant absent du
# schéma, LS-46.
#
# Motif. Ces fichiers sont chargés automatiquement au moment de coder. Une règle
# qui nomme un champ inexistant est lue avec autorité : la session qui code peut
# « corriger » le schéma pour s'aligner sur elle, et introduire le défaut que la
# règle prétendait décrire. Une règle périmée est plus dangereuse qu'une règle
# absente.
#
# Le défaut s'est produit trois fois dans `database.md` :
#
#   taxRate, taxAmount, priceIncludesTax   trois champs fiscaux inexistants,
#                                          en anglais, appelant un flottant et
#                                          un booléen contre l'invariant 1
#   evenement_webhook                      table renommée evenement_fournisseur
#   quantite_ligne                         colonne réelle ligne_commande.quantite
#
# Usage : ./scripts/verifier-regles.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA="$RACINE/prisma/schema.prisma"
CHECKS="$RACINE/prisma/migrations/manual/001_contraintes_check.sql"
REGLES="$RACINE/.claude/rules"
ko=0

for f in "$SCHEMA" "$CHECKS"; do
  [ -r "$f" ] || { echo "ECHEC fichier illisible : $f"; exit 1; }
done

# Vocabulaire connu : champs Prisma, colonnes mappées, modèles, enums et leurs
# valeurs, noms d'index et de contraintes, tables.
connus="$(mktemp)"
{
  grep -oE '^\s{2}[a-zA-Z][a-zA-Z0-9_]*' "$SCHEMA" | tr -d ' '
  grep -oE '@map\("[a-z_0-9]+"\)' "$SCHEMA" | sed 's/@map("//;s/")//'
  grep -oE '@@map\("[a-z_0-9]+"\)' "$SCHEMA" | sed 's/@@map("//;s/")//'
  grep -oE '^model [A-Za-z]+|^enum [A-Za-z]+' "$SCHEMA" | awk '{print $2}'
  grep -oE '^\s{2}[A-Z_]+$' "$SCHEMA" | tr -d ' '
  grep -oE 'map: "[a-z_0-9]+"' "$SCHEMA" | sed 's/map: "//;s/"//'
  grep -oE 'ADD CONSTRAINT [a-z_0-9]+' "$CHECKS" | awk '{print $3}'
} | sort -u > "$connus"

# Identifiants cités par les règles : ce qui est entre accents graves, plus le
# contenu des blocs de code. Seules les formes qui ressemblent à du code sont
# retenues, camelCase ou snake_case, pour ne pas relever de la prose.
cites="$(mktemp)"
{
  grep -ohE '`[^`]+`' "$REGLES"/*.md | tr -d '`'
  sed -n '/^```/,/^```/p' "$REGLES"/*.md
} | grep -ohE '\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b|\b[a-z_]+_[a-z_]+\b' \
  | sort -u > "$cites"

# Un identifiant qualifié `table.colonne` est accepté si ses deux moitiés le
# sont. Sans cette étape, `ligne_commande.quantite` serait signalé alors qu'il
# est plus précis que la forme nue.
introuvables="$(mktemp)"
while read -r id; do
  grep -qxF "$id" "$connus" && continue
  if echo "$id" | grep -q '\.'; then
    g="${id%%.*}"; d="${id##*.}"
    grep -qxF "$g" "$connus" && grep -qxF "$d" "$connus" && continue
  fi
  echo "$id" >> "$introuvables"
done < "$cites"

echo "Identifiants cités par .claude/rules/, confrontés au schéma"
echo

nb_cites=$(wc -l < "$cites" | tr -d ' ')
nb_ko=$(wc -l < "$introuvables" 2>/dev/null | tr -d ' ')
nb_ko=${nb_ko:-0}

if [ "$nb_ko" -eq 0 ]; then
  echo "  OK    $nb_cites identifiants, tous présents dans le schéma"
else
  while read -r id; do
    echo "  ECHEC $id : cité par une règle, absent du schéma"
    grep -rn --include='*.md' -F "$id" "$REGLES" | head -2 | sed 's/^/        /'
  done < "$introuvables"
  ko=$nb_ko
fi

rm -f "$connus" "$cites" "$introuvables"

# Déclenchement des règles, LS-47.
#
# Une règle se charge quand une session touche un chemin de son frontmatter
# `paths`. Un fichier sans `paths` ne se déclenche jamais : il existe, il est
# juste invisible.
#
# Ce contrôle vérifie la présence du frontmatter, pas l'existence des chemins.
# Ils désignent en majorité `src/`, encore vide avant la phase 1 : exiger qu'ils
# existent ferait rougir le script sur un état parfaitement normal.
sans_paths=0
for f in "$REGLES"/*.md; do
  [ -e "$f" ] || continue
  rel=".claude/rules/$(basename "$f")"
  if ! head -1 "$f" | grep -qx -- '---'; then
    echo "  ECHEC $rel : aucun frontmatter, la règle ne se déclenchera jamais"
    sans_paths=$((sans_paths+1))
  elif ! sed -n '1,/^---$/p' "$f" | grep -q '^paths:'; then
    echo "  ECHEC $rel : frontmatter sans clé paths, la règle ne se déclenchera jamais"
    sans_paths=$((sans_paths+1))
  fi
done

if [ "$sans_paths" -eq 0 ]; then
  echo "  OK    toutes les règles portent un frontmatter paths"
else
  ko=$((ko + sans_paths))
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  règles conformes au schéma"
else
  echo "  $ko identifiant(s) introuvable(s)"
fi
echo "-----------------------------------------"
[ "$ko" -eq 0 ] || exit 1
