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
# PLUS AUCUN RESTE ADMIS DEPUIS LS-250, le 25 septembre 2026. Une liste portait
# les 41 occurrences d'origine, fichier par fichier, et ne pouvait que baisser :
# toutes sont converties, la liste a disparu avec elles, et toute occurrence fait
# desormais echouer ce controle. Rien ne peut « revenir dans la liste », il n'y
# en a plus.
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

# LE TEMOIN, QUI REMPLACE LA GARDE DE LA LISTE. Celle-ci exigeait que chaque
# fichier liste ait ete examine, et c'est ce qui attrapait un ancrage casse : la
# preuve a montre qu'un motif `pipefail` casse laissait ce seul script a lire,
# qui restait vert. Sans liste, un script connu pour porter `pipefail` doit
# avoir ete examine, sans quoi l'ancrage est casse.
TEMOIN="scripts/verifier-tests-mutation.sh"
MOTIF='(printf|echo)[^|]*\|[[:space:]]*grep[[:space:]]+-[a-zA-Z]*q'

ko=0
examines=0
vus=""

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

  if [ "$compte" -gt 0 ]; then
    echo "ECHEC $fichier : $compte tube(s) vers grep -q sous pipefail"
    grep -nE "$MOTIF" "$fichier" | grep -vE '^[0-9]+:[[:space:]]*#' | sed 's/^/      /'
    echo "      ecrire \`grep -q motif <<<\"\$variable\"\`, SIGPIPE rend le tube intermittent"
    ko=$((ko + 1))
  fi
done

# LE CONTROLE SE GARDE CONTRE LUI-MEME. Un ancrage casse ne rend pas forcement
# zero fichier examine : la chaine mutee figure dans CE script, qui s'examinait
# alors seul et restait vert. Le temoin doit donc avoir ete lu.
if ! grep -qxF "$TEMOIN" <<<"$vus"; then
  echo "ECHEC $TEMOIN, qui porte pipefail, n'a pas ete examine"
  echo "      ancrage pipefail casse, ou temoin renomme : corriger l'un ou l'autre"
  ko=$((ko + 1))
fi

if [ "$ko" -gt 0 ]; then
  exit 1
fi

echo "OK aucun tube vers grep -q sous pipefail, $examines scripts examines"
