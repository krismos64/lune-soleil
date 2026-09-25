#!/bin/bash
# Éprouve `verifier-couverture-mutations.sh` en injectant les défauts qu'il
# prétend attraper, LS-230. Un contrôle qui n'a jamais échoué n'est pas un
# contrôle, et celui-ci garde les quarante-deux autres.
#
# LES MUTATIONS REPRENNENT LES FORMES RÉELLEMENT RENCONTRÉES, jamais celle qui
# s'écrit le plus commodément. Les cinq formes ci-dessous sont celles que
# l'inventaire du 14 septembre 2026 a produites :
#
#   cas 1   une preuve neuve n'est citée nulle part, la forme exacte des
#           vingt-huit dormantes trouvées ce jour-là
#   cas 2   une preuve est écartée sans motif, un nom posé seul dans la
#           section des écartées : un interrupteur, pas une décision
#   cas 3   le registre cite une preuve disparue, le défaut en sens inverse,
#           un nom mort qui couvre une absence
#   cas 4   une preuve est citée HORS de la section des écartées, dans le
#           récit historique : c'est le faux positif qu'a produit la première
#           version du contrôle, qui cherchait dans tout le document
#   cas 5   le registre disparaît, sans quoi le contrôle écarterait tout
#
# LE CAS 6 GARDE LE CONTRÔLE CONTRE LUI-MÊME. Un ancrage cassé le rendrait
# silencieusement vert, motif payé plusieurs fois sur ce dépôt : il doit échouer
# quand il n'a plus rien à examiner, jamais rendre un OK vide.
#
# Usage : ./scripts/verifier-couverture-mutations-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-couverture-mutations.sh"
REGISTRE="docs/PREUVES-PAR-MUTATION.md"
TEMOIN="scripts/verifier-temoin-ls230-mutation.sh"

# Ce script restaure par `git checkout` : un dépôt sale perdrait le travail non
# commité. Le cas s'est produit deux fois sur ce dépôt.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ARRÊT : le dépôt porte des modifications non commitées."
  echo "Ce script restaure par git checkout et les effacerait. Commiter d'abord."
  exit 1
fi

echecs=0
cas=0

restaurer() {
  git checkout -- "$REGISTRE" 2>/dev/null || true
  rm -f "$RACINE/$TEMOIN"
}

# UNE INTERRUPTION DOIT SORTIR, PAS SEULEMENT RESTAURER, LS-230. `trap INT TERM`
# ne fait pas quitter bash : il exécute le gestionnaire puis REPREND le script,
# qui muterait le cas suivant.
trap restaurer EXIT
trap 'interrompre_mutation' INT TERM
interrompre_mutation() {
  restaurer
  echo >&2
  echo "INTERROMPU : les fichiers ont ete restaures." >&2
  exit 130
}

# Le contrôle doit être VERT avant toute mutation, sans quoi les rouges qui
# suivent ne prouveraient rien.
if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "ARRÊT : le contrôle est déjà rouge avant mutation."
  exit 1
fi
echo "État initial : le contrôle est vert."
echo

eprouver() {
  local intitule="$1" motif_attendu="$2"
  cas=$((cas + 1))

  local sortie code
  sortie=$("$CONTROLE" 2>&1)
  code=$?

  restaurer

  if [ "$code" -eq 0 ]; then
    echo "   ÉCHEC cas $cas, $intitule"
    echo "         le contrôle est resté VERT : c'est un trou."
    echecs=$((echecs + 1))
    return
  fi

  # LE MESSAGE EST VÉRIFIÉ, pas seulement le code. Un contrôle qui rougirait
  # pour une autre raison passerait un test qui ne regarde que le code de
  # sortie. Motif « mutation vue par le mauvais test ».
  if ! grep -qF "$motif_attendu" <<<"$sortie"; then
    echo "   ÉCHEC cas $cas, $intitule"
    echo "         le contrôle a rougi, mais PAS sur le défaut visé."
    echo "         attendu : $motif_attendu"
    echecs=$((echecs + 1))
    return
  fi

  echo "   OK    cas $cas, $intitule"
}

echo "Mutations"

# --- cas 1 : une preuve neuve, citée nulle part
printf '#!/bin/bash\n# Témoin de LS-230, retiré par le trap.\nexit 0\n' > "$TEMOIN"
chmod +x "$TEMOIN"
eprouver "une preuve neuve n'est ni rejouée ni écartée" \
  "n'est ni rejouée ni écartée"

# --- cas 2 : écartée sans motif, un nom posé seul
printf '#!/bin/bash\nexit 0\n' > "$TEMOIN"
chmod +x "$TEMOIN"
printf '\n| `%s` | |\n' "$(basename "$TEMOIN")" >> "$REGISTRE"
eprouver "une preuve est écartée sans motif" \
  "écartée sans motif suffisant"

# --- cas 3 : le registre cite une preuve disparue
printf '\n## Les preuves écartées, et leur raison\n\n| `verifier-fantome-ls230-mutation.sh` | un motif assez long pour passer le seuil de vingt caractères |\n' >> "$REGISTRE"
eprouver "le registre cite une preuve disparue" \
  "qui n'existe plus"

# --- cas 4 : citée HORS de la section des écartées
#
# C'est le faux positif qu'a produit la première version du contrôle : les cinq
# preuves réparées par LS-230, nommées dans le tableau historique du registre,
# passaient pour écartées alors qu'elles devaient entrer en CI.
printf '#!/bin/bash\nexit 0\n' > "$TEMOIN"
chmod +x "$TEMOIN"
perl -0pi -e "s/^## Les preuves écartées/| \`$(basename "$TEMOIN")\` | citée dans le récit, ce qui ne vaut pas dispense |\n\n## Les preuves écartées/m" "$REGISTRE"
eprouver "une mention hors section ne vaut pas dispense" \
  "n'est ni rejouée ni écartée"

# --- cas 5 : le registre disparaît
rm -f "$REGISTRE"
eprouver "le registre disparaît" \
  "est introuvable"

# --- cas 6 : l'ancrage se garde contre lui-même
cas=$((cas + 1))
dossier_vide=$(mktemp -d)
sortie=$(cd "$dossier_vide" && mkdir -p scripts docs && \
  cp "$RACINE/$CONTROLE" scripts/ 2>/dev/null && \
  ./scripts/verifier-couverture-mutations.sh 2>&1)
code=$?
rm -rf "$dossier_vide"

if [ "$code" -eq 0 ]; then
  echo "   ÉCHEC cas $cas, un ancrage cassé rend un OK silencieux."
  echecs=$((echecs + 1))
else
  echo "   OK    cas $cas, un ancrage cassé fait échouer le contrôle"
fi

echo

if [ "$echecs" -gt 0 ]; then
  echo "ÉCHEC : $echecs cas sur $cas ne sont pas détectés."
  echo "Le contrôle ne prouve pas ce qu'il prétend garder."
  exit 1
fi

echo "OK : $cas cas sur $cas détectés, le contrôle attrape le défaut qu'il vise."
