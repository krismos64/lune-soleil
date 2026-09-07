#!/bin/bash
# Preuve par mutation de `verifier-description-accessible.sh`, LS-161.
#
# Un contrôle qui n'a jamais échoué sur le défaut qu'il prétend attraper n'est
# pas un contrôle. Ce script réintroduit le défaut, vérifie que le contrôle
# rougit EN NOMMANT sa cible, puis restaure.
#
# CINQ CAS, et les deux derniers sont les moins évidents :
#
#   1. l'`aria-label` remis sur la région décrite, le défaut de LS-161 lui-même
#   2. le même défaut sur l'écran voisin, corrigé par LS-160
#   3. la règle C39 retirée de `frontend-design.md`, sens 2 du contrôle
#   4. un `aria-label` en COMMENTAIRE ne doit PAS faire rougir : les deux écrans
#      corrigés nomment l'attribut pour expliquer son absence, et les compter
#      rendrait le contrôle rouge sur du code exemplaire
#   5. la cible vivant dans un AUTRE fichier que celui qui la décrit
#
# Usage : ./scripts/verifier-description-accessible-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-description-accessible.sh"
FACTURE="src/app/administration/commandes/[id]/document-facture.tsx"
REMBOURSEMENT="src/app/administration/commandes/[id]/remboursement.tsx"
REGLE=".claude/rules/frontend-design.md"
TEMOIN="src/app/administration/commandes/[id]/temoin-mutation-ls161.tsx"

MUTABLES=("$FACTURE" "$REMBOURSEMENT" "$REGLE")

for f in "${MUTABLES[@]}"; do
  [ -r "$f" ] || {
    echo "ECHEC fichier illisible : $f"
    exit 1
  }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; rm -f "$TEMOIN"' EXIT

cle() { printf '%s' "$1" | tr '/' '_'; }
for f in "${MUTABLES[@]}"; do cp "$f" "$TMP/$(cle "$f")"; done
restaurer() {
  for f in "${MUTABLES[@]}"; do cp "$TMP/$(cle "$f")" "$f"; done
  rm -f "$TEMOIN"
}

# L'ETAT DE REFERENCE DOIT ETRE VERT, sans quoi tout « rouge » observé ensuite
# ne prouverait rien : il pourrait venir d'un défaut préexistant.
if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "ECHEC l'état de référence est déjà rouge, la mutation ne prouverait rien"
  "$CONTROLE"
  exit 1
fi
echo "État de référence vert."
echo

ko=0
cas=0

# Attend que le contrôle échoue ET que sa sortie contienne le motif attendu.
# EXIGER LE MOTIF ET PAS SEULEMENT LE ROUGE : un contrôle qui échoue pour une
# autre raison passerait pour vigilant sans avoir rien vu.
attendre_rouge() {
  local titre="$1" motif="$2" sortie
  cas=$((cas + 1))
  sortie="$("$CONTROLE" 2>&1)"
  if [ -z "$sortie" ] || "$CONTROLE" >/dev/null 2>&1; then
    echo "  NON DETECTE  $titre"
    echo "               le contrôle reste vert sur le défaut réintroduit"
    ko=1
  elif printf '%s' "$sortie" | grep -q "$motif"; then
    echo "  detecte      $titre"
  else
    echo "  MAL DETECTE  $titre"
    echo "               rouge, mais la sortie ne nomme pas « $motif »"
    printf '%s\n' "$sortie" | sed 's/^/               /'
    ko=1
  fi
  restaurer
}

attendre_vert() {
  local titre="$1"
  cas=$((cas + 1))
  if "$CONTROLE" >/dev/null 2>&1; then
    echo "  detecte      $titre"
  else
    echo "  FAUX POSITIF $titre"
    "$CONTROLE" 2>&1 | sed 's/^/               /'
    ko=1
  fi
  restaurer
}

# ---------------------------------------------------------------------------
# Cas 1 : le défaut de LS-161, l'aria-label remis sur la région décrite.
# ---------------------------------------------------------------------------
perl -0pi -e 's{(id="message-document")}{$1\n        aria-label="Génération du document"}' "$FACTURE"
attendre_rouge "1. aria-label remis sur message-document" "message-document"

# ---------------------------------------------------------------------------
# Cas 2 : le même défaut sur l'écran voisin, celui que LS-160 avait corrigé.
# ---------------------------------------------------------------------------
perl -0pi -e 's{(id="message-remboursement")}{$1\n        aria-label="Résultat du remboursement"}' "$REMBOURSEMENT"
attendre_rouge "2. aria-label remis sur message-remboursement" "message-remboursement"

# ---------------------------------------------------------------------------
# Cas 3 : la règle retirée du document, sens 2 du contrôle.
#
# LE MOTIF CHERCHE EST `aria-describedby`, la règle C39 étant la seule à le
# nommer dans ce fichier. La retirer ligne à ligne suffit.
# ---------------------------------------------------------------------------
perl -ni -e 'print unless /aria-describedby|aria-label/' "$REGLE"
attendre_rouge "3. règle C39 retirée de frontend-design.md" "n'énonce plus la règle"

# ---------------------------------------------------------------------------
# Cas 4 : un aria-label EN COMMENTAIRE ne doit pas faire rougir.
#
# CE CAS GARDE LE CONTROLE CONTRE LUI-MEME. Sa première version comptait les
# commentaires et accusait les deux écrans corrigés, qui nomment `aria-label`
# pour expliquer son absence. Un contrôle qui rougit sur le code exemplaire
# pousse à retirer l'explication, motif déjà payé sur ce dépôt par le hook de
# secrets qui bloquait son propre commentaire.
# ---------------------------------------------------------------------------
perl -0pi -e 's{(id="message-document")}{/* mention en commentaire : aria-label ne doit pas compter */\n        $1}' "$FACTURE"
attendre_vert "4. aria-label cité en commentaire, aucun faux positif"

# ---------------------------------------------------------------------------
# Cas 5 : la cible vit dans un AUTRE fichier que celui qui la décrit.
#
# Le contrôle cherche l'élément dans tout `src/` et non dans le seul fichier :
# rien n'oblige une cible à vivre à côté de ce qui la décrit, et une recherche
# limitée au fichier raterait ce cas en silence.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TSX'
/** Témoin de mutation LS-161, écrit et supprimé par le script. */
export function TemoinMutation() {
  return (
    <p
      id="message-document"
      role="status"
      aria-label="Témoin dans un autre fichier"
    >
      Témoin
    </p>
  );
}
TSX
attendre_rouge "5. cible portant aria-label dans un autre fichier" "message-document"

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  $cas cas sur $cas, le contrôle voit ce qu'il prétend voir"
  echo "-----------------------------------------"
  exit 0
fi
echo "  ECHEC preuve par mutation incomplète"
echo "-----------------------------------------"
exit 1
