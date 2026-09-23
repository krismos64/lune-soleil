#!/usr/bin/env bash
#
# Aucun `echo | grep -q` ni `printf | grep -q` nouveau sous `pipefail`, LS-237.
#
# LE DEFAUT. `grep -q` quitte a la premiere correspondance et ferme le tube. Si
# le producteur ecrit encore, il recoit SIGPIPE et sort en 141 ; sous
# `set -o pipefail`, le pipeline entier echoue ALORS QUE LE MOTIF A ETE TROUVE.
# Le resultat depend du minutage, donc le defaut est intermittent et accuse un
# innocent. Mesure du 23 septembre 2026 : 17 faux negatifs sur 200 essais sur
# 536 lignes, et `verifier-config-claude.sh` signalait un fichier suivi comme
# absent 6 fois sur 20. La forme sure est la here-string :
#
#   grep -q "motif" <<<"$variable"
#
# LES RESTES SONT LISTES, PAS EXEMPTES POUR TOUJOURS. `grep-q-pipefail-restants.txt`
# porte, par fichier, le nombre d'occurrences au 23 septembre 2026. Un fichier
# absent de la liste ou qui en compte PLUS fait echouer ce controle ; un
# fichier qui en compte MOINS est signale, pour que la liste baisse avec lui.
# LS-250 porte la conversion des restes.
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

RESTANTS="scripts/grep-q-pipefail-restants.txt"
MOTIF='(printf|echo)[^|]*\|[[:space:]]*grep[[:space:]]+-[a-zA-Z]*q'

ko=0
examines=0
vus=""

nombre_autorise() {
  awk -v f="$1" '$1 == f { print $2 }' "$RESTANTS"
}

for fichier in scripts/*.sh .claude/scripts/*.sh; do
  [ -r "$fichier" ] || continue
  grep -qE 'set -[a-z]*o pipefail|set -o pipefail' "$fichier" || continue
  examines=$((examines + 1))
  vus+="$fichier"$'\n'

  # LES COMMENTAIRES NE COMPTENT PAS : un commentaire qui cite la forme
  # interdite pour expliquer sa correction n'execute rien. La premiere version
  # les comptait, et les deux scripts corriges par LS-237 entraient dans la
  # liste des restes a cause de leur propre explication.
  compte=$(grep -vE '^[[:space:]]*#' "$fichier" | grep -cE "$MOTIF")
  autorise=$(nombre_autorise "$fichier")
  autorise=${autorise:-0}

  if [ "$compte" -gt "$autorise" ]; then
    echo "ECHEC $fichier : $compte \`echo|printf | grep -q\` sous pipefail, $autorise admis"
    grep -nE "$MOTIF" "$fichier" | grep -vE '^[0-9]+:[[:space:]]*#' | sed 's/^/      /'
    echo "      ecrire \`grep -q motif <<<\"\$variable\"\`, SIGPIPE rend le tube intermittent"
    ko=$((ko + 1))
  elif [ "$compte" -lt "$autorise" ]; then
    echo "A BAISSER $RESTANTS : $fichier compte $compte, la liste en admet $autorise"
  fi
done

# LE CONTROLE SE GARDE CONTRE LUI-MEME : TOUT FICHIER LISTE DOIT AVOIR ETE LU.
# Un ancrage casse ne rend pas forcement zero fichier examine : mesure par la
# preuve, la chaine mutee figure dans CE script, qui s'examinait alors seul et
# restait vert. Exiger que chaque fichier de la liste ait ete examine attrape
# l'ancrage casse comme la liste perimee, un fichier renomme ou supprime.
while read -r liste _; do
  [ -z "$liste" ] && continue
  case "$liste" in \#*) continue ;; esac
  if ! grep -qxF "$liste" <<<"$vus"; then
    echo "ECHEC $RESTANTS nomme $liste, que ce controle n'a pas examine"
    echo "      ancrage pipefail casse, ou fichier renomme : corriger l'un ou la liste"
    ko=$((ko + 1))
  fi
done <"$RESTANTS"

if [ "$ko" -gt 0 ]; then
  exit 1
fi

echo "OK aucun nouveau \`echo|printf | grep -q\` sous pipefail, $examines scripts examines"
