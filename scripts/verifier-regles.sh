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

# Prédicats des index partiels, LS-49.
#
# Les deux contrôles précédents vérifient qu'un identifiant existe et qu'une
# règle se déclenche. Aucun ne regarde ce que la règle *dit* de cet identifiant.
#
# Le défaut trouvé le 29 juillet 2026 : LS-45 avait élargi le filtre de
# `paiement_reussi_unique` aux trois états d'encaissement, après avoir mesuré un
# double encaissement. `database.md` et `MODELE-LOGIQUE.md` portaient encore
# `WHERE statut = 'REUSSI'`. Tous les identifiants existaient, le script restait
# vert, et la règle chargée au moment de coder le paiement décrivait la faille.
#
# Ce contrôle compare, pour chaque index partiel du schéma, les valeurs d'enum
# du prédicat réel à celles citées par les documents qui nomment cet index.
# Il ne compare pas le SQL entier : les documents le reformulent légitimement,
# en `WHERE` ou en prose. Les valeurs d'enum, elles, ne se reformulent pas.
echo "Prédicats des index partiels, schéma contre documents"
echo

DOCS="$RACINE/docs/architecture"
predicats_ko=0
nb_index=0

# Chaque index partiel : nom de l'index, table portante, prédicat.
#
# L'ancrage porte sur le nom de l'index **et** sur la table, deux formes de
# citation également fréquentes. `MODELE-LOGIQUE.md` nomme l'index dans un
# tableau, `database.md` écrit `UNIQUE paiement (commande_id) WHERE ...` et ne
# nomme l'index nulle part. Ancrer sur le seul nom d'index ratait le fichier le
# plus dangereux des deux, celui qui se charge au moment de coder.
while IFS= read -r ligne; do
  index=$(echo "$ligne" | grep -oE 'map: "[a-z_0-9]+"' | sed 's/map: "//;s/"//')
  predicat=$(echo "$ligne" | sed -E 's/.*where: raw\("(.*)"\), map:.*/\1/')
  [ -n "$index" ] || continue
  nb_index=$((nb_index+1))

  # Valeurs d'enum du prédicat réel, une majuscule et un souligné uniquement,
  # ce qui exclut les noms de colonnes et les mots-clés SQL en minuscules.
  attendues=$(echo "$predicat" | grep -oE "'[A-Z_]+'" | tr -d "'" | sort -u)
  [ -n "$attendues" ] || continue

  # Table portante : le @@map du modèle où figure cet index. Le bloc du modèle
  # est délimité par la première accolade fermante en début de ligne.
  table=$(awk -v idx="$index" '
    /^model /      { bloc = ""; }
                   { bloc = bloc "\n" $0; }
    /^}/           { if (bloc ~ idx) { print bloc; exit } }
  ' "$SCHEMA" | grep -oE '@@map\("[a-z_0-9]+"\)' | sed 's/@@map("//;s/")//')

  # Ancrage. Deux formes suffisent à couvrir tous les documents du dépôt :
  #
  #   paiement_reussi_unique          le nom de l'index, MODELE-LOGIQUE.md
  #   paiement (...)                  la table suivie de ses champs, forme qui
  #                                   couvre aussi `UNIQUE paiement (commande_id)`
  #                                   de database.md, qui la contient
  #
  # Historique, parce que ce contrôle s'est trompé trois fois et que chaque
  # erreur est instructive :
  #
  # 1. Ancrer sur le seul nom d'index ratait database.md, qui ne le nomme
  #    jamais. Donc le fichier le plus dangereux, celui chargé en codant.
  # 2. Ajouter `statut =`, la colonne du prédicat, attrapait toute ligne parlant
  #    d'un statut : 18 faux positifs sur un état correct, deux index qui se
  #    contaminaient.
  # 3. Ajouter `UNIQUE partiel sur (champs)` réglait la règle V14 mais ratait
  #    encore `paiement (commandeId)` du tableau récapitulatif, quatrième forme.
  #
  # La leçon est de ne pas empiler une ancre par forme rencontrée : la suivante
  # échappera. `<table> (` est le point commun de presque toutes les écritures
  # d'une contrainte, et couvre `UNIQUE paiement (commande_id)` par inclusion.
  #
  # La règle V14 reste hors de sa portée : elle écrit
  # `UNIQUE partiel sur (commandeId)` sans nommer la table. D'où la seconde
  # ancre, sur les champs indexés. Retirer celle-ci a fait rougir le cas 6 du
  # script de mutation, ce qui est exactement son rôle.
  champs=$(echo "$ligne" | sed -E 's/.*@@unique\(\[([^]]*)\].*/\1/' | tr -d ' ')
  ancres="$index"
  [ -n "$table" ]  && ancres="$ancres|$table *\\("
  [ -n "$champs" ] && ancres="$ancres|partiel sur \`?\($champs\)"

  # Une ligne qui cite l'index ou la table sous forme de contrainte décrit ce
  # filtre. Le prédicat déborde souvent sur les lignes suivantes, alignées sous
  # le `WHERE` : `database.md` écrit le filtre du paiement sur trois lignes.
  # Comparer la seule ligne d'ancrage produirait un faux positif à chaque
  # prédicat un peu long, ce qui est arrivé en écrivant ce contrôle.
  #
  # La continuation s'arrête à la prochaine contrainte, à la fin du bloc de code
  # ou à une ligne vide.
  for doc in "$REGLES"/*.md "$DOCS"/MODELE-LOGIQUE.md "$DOCS"/MODELE-CONCEPTUEL.md; do
    [ -r "$doc" ] || continue
    rel=${doc#"$RACINE"/}
    while IFS=: read -r num _; do
      [ -n "$num" ] || continue
      contenu=$(awk -v d="$num" 'NR < d { next }
        NR > d && (/^UNIQUE/ || /^\|/ || /^```/ || /^[[:space:]]*$/) { exit }
        { print }' "$doc")
      # Les valeurs sont relevées avec ou sans apostrophes. La règle V14 de
      # MODELE-CONCEPTUEL.md écrivait `statut = REUSSI` sans quotes : exiger les
      # apostrophes laissait passer le prédicat périmé dans le document le plus
      # structurant des trois. Le seuil de trois caractères écarte les sigles de
      # prose sans écarter les valeurs d'enum réelles, la plus courte du schéma
      # étant ADMIN.
      citees=$(echo "$contenu" \
        | grep -oE "'[A-Z_]+'|\b[A-Z][A-Z_]{2,}\b" | tr -d "'" | sort -u)
      [ -n "$citees" ] || continue
      manquantes=$(comm -23 <(echo "$attendues") <(echo "$citees") | tr '\n' ' ')
      if [ -n "${manquantes// /}" ]; then
        echo "  ECHEC $rel:$num : $index cité sans ${manquantes% }"
        echo "        prédicat réel : $predicat"
        predicats_ko=$((predicats_ko+1))
      fi
    done < <(grep -nE "$ancres" "$doc")
  done
done < <(grep -E 'where: raw\(' "$SCHEMA")

if [ "$predicats_ko" -eq 0 ]; then
  echo "  OK    $nb_index index partiels, aucune contrainte citée ne contredit son prédicat"
  echo "        (portée : lignes citant le nom d'index, la table ou les champs ;"
  echo "         la prose qui décrit un filtre sans le nommer reste hors contrôle)"
else
  ko=$((ko + predicats_ko))
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  règles conformes au schéma"
else
  echo "  $ko anomalie(s) : identifiant absent, règle sans paths ou prédicat contredit"
fi
echo "-----------------------------------------"
[ "$ko" -eq 0 ] || exit 1
