#!/usr/bin/env bash
# Preuve par mutation de verifier-mutations-a-sec.sh, LS-254.
#
# CE QUE CHAQUE CAS FABRIQUE, et pourquoi cette forme. Les deux expressions
# perimees trouvees le 24 septembre 2026 l'ont ete parce que le CODE avait
# change sous elles, jamais le script : le premier cas reproduit donc ce
# mouvement-la, sur `src/`, et non une expression cassee a la main.
#
# LE CONTROLE EST AUSSI EPROUVE CONTRE LUI-MEME : une decouverte qui ne trouve
# rien, un script dont aucun appel n'est analyse, une ligne qu'il ne sait pas
# lire. Chacune de ces trois defaillances rendrait sinon un OK muet.
#
# SA PREMIERE VERSION A PORTE DEUX DEFAUTS, trouves en l'executant, jamais en
# la relisant : les mutations s'accumulaient sur tout le script faute de
# repartir du fichier d'origine apres chaque `cas`, et onze expressions saines
# passaient pour perimees ; une fonction ecrite sur une ligne, `cle() { ...; }`,
# faisait sauter tout le reste du script, qui rendait zero appel. Le dernier
# cas garde le premier, la garde « zero appel » a attrape le second.
#
# Usage : ./scripts/verifier-mutations-a-sec-mutation.sh
set -u

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-mutations-a-sec.sh"
PREUVE_TESTS="scripts/verifier-tests-mutation.sh"
PREUVE_ETATS="scripts/verifier-etats-non-nominaux-mutation.sh"
STOCK="src/repositories/stock.ts"
MUTABLES=("$CONTROLE" "$PREUVE_TESTS" "$PREUVE_ETATS" "$STOCK")

detectes=0
total=0

SAUVEGARDE="$(mktemp -d)"

sauvegarder() {
  local index=0 fichier
  for fichier in "${MUTABLES[@]}"; do
    [ -r "$fichier" ] || { echo "ECHEC fichier illisible : $fichier"; exit 1; }
    cp "$fichier" "$SAUVEGARDE/$index"
    index=$((index + 1))
  done
}

restaurer() {
  local index=0 fichier
  for fichier in "${MUTABLES[@]}"; do
    [ -r "$SAUVEGARDE/$index" ] && cp "$SAUVEGARDE/$index" "$fichier"
    index=$((index + 1))
  done
}

nettoyer() {
  restaurer
  rm -rf "$SAUVEGARDE"
}

sauvegarder
trap nettoyer EXIT
trap 'nettoyer; echo "INTERROMPU : fichiers restaures." >&2; exit 130' INT TERM

muter() {
  local fichier="$1" expression="$2" avant
  avant=$(cksum <"$fichier")
  perl -0pi -e "$expression" "$fichier"
  if [ "$(cksum <"$fichier")" = "$avant" ]; then
    echo "ECHEC la mutation n'a modifié aucun caractère de $fichier"
    echo "      l'expression ne correspond plus au code : corriger le script."
    exit 1
  fi
}

attendre_echec() {
  total=$((total + 1))
  if "$CONTROLE" >/dev/null 2>&1; then
    echo "NON DETECTE  $1"
  else
    echo "detecte      $1"
    detectes=$((detectes + 1))
  fi
  restaurer
}

attendre_succes() {
  total=$((total + 1))
  if "$CONTROLE" >/dev/null 2>&1; then
    echo "detecte      $1"
    detectes=$((detectes + 1))
  else
    echo "FAUX POSITIF $1"
  fi
  restaurer
}

echo "Preuve par mutation de verifier-mutations-a-sec.sh"
echo

if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "ECHEC le controle n'est pas vert AVANT mutation : aucune mutation ne"
  echo "      pourrait rien prouver dans cet etat."
  exit 1
fi

# Le code bouge sous une expression, la forme des deux defauts du 24 septembre.
muter "$STOCK" 's{\n      AND archivee_a IS NULL}{\n      AND archivee_a IS NOT DISTINCT FROM NULL}'
attendre_echec "le code change sous une expression, qui ne mute plus rien"

# Une ligne que le controle ne sait pas lire : son argument depend de
# l'execution. La deviner serait pire que la refuser.
muter "$PREUVE_TESTS" 's{\z}{\nmute "\$STOCK" "\$EXPRESSION_CALCULEE"\n}'
attendre_echec "ligne mute non analysable"

# La decouverte ne trouve plus rien : zero script examine.
muter "$CONTROLE" 's{scripts/\*-mutation\.sh 2>}{scripts/*-aucune-preuve.sh 2>}'
attendre_echec "decouverte cassee, zero script examine"

# Un script ou la signature n'est plus reconnue : zero appel analyse.
muter "$PREUVE_ETATS" 's{local fichier="\$1" expression="\$2"}{local cible="\$1" motif="\$2"}'
attendre_echec "signature de mute non reconnue, zero appel analyse"

# Le premier defaut du controle lui-meme : sans remise a zero apres `cas`, les
# mutations s'accumulaient et des expressions saines passaient pour perimees.
muter "$CONTROLE" 's{%courant = \(\) if \$restauratrices\{\$fonction\};\n      next;}{next;}'
attendre_echec "remise a zero apres cas retiree, accumulation des mutations"

# Un commentaire citant une ligne mute ne doit rien declencher.
muter "$PREUVE_TESTS" 's{\z}{\n# rappel : mute "\$STOCK" "\$EXPRESSION_CALCULEE" ne se lit pas\n}'
attendre_succes "commentaire citant un appel, aucun faux positif"

echo
echo "-----------------------------------------"
echo "  $total mutations, $detectes détectées"
echo "-----------------------------------------"
[ "$detectes" -eq "$total" ] || exit 1
