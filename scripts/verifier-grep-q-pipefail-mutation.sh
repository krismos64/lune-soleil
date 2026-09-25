#!/usr/bin/env bash
#
# Preuve par mutation de verifier-grep-q-pipefail.sh, LS-237.
#
# QUATRE CAS. Les trois premiers posent le defaut que le controle pretend
# attraper et exigent qu'il rougisse ; le quatrieme pose un commentaire qui
# CITE la forme interdite et exige qu'il reste vert, faux positif qu'a produit
# sa premiere version.
set -u

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-grep-q-pipefail.sh"
CORRIGE="scripts/verifier-tests-mutation.sh"
ANCIEN_RESTE="scripts/amorcer-production.sh"
MUTABLES=("$CONTROLE" "$CORRIGE" "$ANCIEN_RESTE")

# LE TUBE EST UNE VARIABLE, ET C'EST UNE CONTRAINTE DU CONTROLE EPROUVE : ecrite
# d'un seul tenant, la forme interdite fait signaler CE script par le controle,
# qui rougit alors a chaque cas pour une raison etrangere a la mutation. La
# premiere version l'a fait, et seul le cas 4 l'a montre, en faux positif.
T='|'

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

# Cas 1 : le defaut d'origine revient dans le script qu'il a rendu intermittent.
muter "$CORRIGE" 's{if grep -qF "\$motif_attendu" <<<"\$lignes_echec"; then}{if printf "%s" "\$lignes_echec" '"$T"' grep -qF "\$motif_attendu"; then}'
attendre_echec "tube de printf vers grep -qF reintroduit dans $CORRIGE"

# Cas 2 : un ancien reste, converti par LS-250, regagne une occurrence. La liste
# qui en admettait une a disparu : aucune n'est plus admise nulle part.
muter "$ANCIEN_RESTE" 's{\z}{\nif echo "\$x" '"$T"' grep -q "y"; then :; fi\n}'
attendre_echec "occurrence reintroduite dans un ancien reste"

# Cas 3 : l'ancrage casse, plus aucun script examine, le controle doit le dire.
muter "$CONTROLE" 's{set -\[a-z\]\*o pipefail\|set -o pipefail}{set -ZZZ pipefail}'
attendre_echec "ancrage pipefail casse, zero script examine"

# Cas 4 : un COMMENTAIRE qui cite la forme n'execute rien, et ne doit pas rougir.
muter "$CORRIGE" 's{\z}{\n# rappel : jamais echo "\$x" '"$T"' grep -q "y" sous pipefail\n}'
attendre_succes "commentaire citant la forme, aucun faux positif"

echo
echo "-----------------------------------------"
echo "  $total mutations, $detectes détectées"
echo "-----------------------------------------"

[ "$detectes" -eq "$total" ] || exit 1
