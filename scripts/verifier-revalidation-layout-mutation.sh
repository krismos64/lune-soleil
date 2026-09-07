#!/bin/bash
# Preuve par mutation de `verifier-revalidation-layout.sh`, regle C37.
#
# Un controle qui n'a jamais echoue sur le defaut qu'il pretend attraper n'est
# pas un controle. Ce script reintroduit le defaut, verifie que le controle
# rougit EN NOMMANT sa cible, puis restaure.
#
# SIX CAS, dont deux qui gardent le controle CONTRE LUI-MEME :
#
#   1 a 4. l'etat REEL d'avant la correction, domaine par domaine : commandes,
#          expeditions, retractations et variantes ne portaient AUCUN appel avec
#          `"layout"`. Ce sont les quatre defauts que LS-201 avait laisses.
#   5.     la regle C37 retiree du document, sens 2 du controle
#   6.     un appel dont l'argument est lui-meme un appel ne doit PAS etre pris
#          pour un oubli : `revalidatePath(chemin(produitId), "layout")` a fait
#          rougir la premiere version du controle sur du code parfaitement
#          correct, un `[^)]*` s'arretant a la parenthese de `chemin(...)`
#
# Usage : ./scripts/verifier-revalidation-layout-mutation.sh
# Aucun prerequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-revalidation-layout.sh"
COMMANDES="src/app/administration/commandes/actions.ts"
EXPEDITIONS="src/app/administration/expeditions/actions.ts"
RETRACTATIONS="src/app/administration/retractations/actions.ts"
VARIANTES="src/app/administration/produits/[id]/actions-variantes.ts"
REGLE=".claude/rules/frontend-design.md"

MUTABLES=("$COMMANDES" "$EXPEDITIONS" "$RETRACTATIONS" "$VARIANTES" "$REGLE")

for f in "${MUTABLES[@]}"; do
  [ -r "$f" ] || {
    echo "ECHEC fichier illisible : $f"
    exit 1
  }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cle() { printf '%s' "$1" | tr '/[]' '___'; }
for f in "${MUTABLES[@]}"; do cp "$f" "$TMP/$(cle "$f")"; done
restaurer() {
  for f in "${MUTABLES[@]}"; do cp "$TMP/$(cle "$f")" "$f"; done
}

# L'ETAT DE REFERENCE DOIT ETRE VERT, sans quoi tout « rouge » observe ensuite
# ne prouverait rien : il pourrait venir d'un defaut preexistant.
if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "ECHEC l'état de référence est déjà rouge, la mutation ne prouverait rien"
  "$CONTROLE"
  exit 1
fi
echo "État de référence vert."
echo

ko=0
cas=0

attendre_rouge() {
  local titre="$1" motif="$2" sortie
  cas=$((cas + 1))
  sortie="$("$CONTROLE" 2>&1)"
  if "$CONTROLE" >/dev/null 2>&1; then
    echo "  NON DETECTE  $titre"
    echo "               le contrôle reste vert sur le défaut réintroduit"
    ko=1
  elif printf '%s' "$sortie" | grep -q "$motif"; then
    echo "  detecte      $titre"
  else
    echo "  MAL DETECTE  $titre"
    echo "               rouge, mais la sortie ne nomme pas « $motif »"
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
# Cas 1 a 4 : l'etat reel d'avant la correction, un domaine a la fois.
#
# La mutation retire l'option `"layout"` de chaque appel, ce qui reproduit
# exactement le code livre par LS-201 sur ces quatre domaines.
# ---------------------------------------------------------------------------
retirer_layout() {
  perl -pi -e 's{, "layout"\)}{)}g' "$1"
}

retirer_layout "$COMMANDES"
attendre_rouge "1. commandes sans « layout »" "commandes/actions.ts"

retirer_layout "$EXPEDITIONS"
attendre_rouge "2. expeditions sans « layout »" "expeditions/actions.ts"

retirer_layout "$RETRACTATIONS"
attendre_rouge "3. retractations sans « layout »" "retractations/actions.ts"

retirer_layout "$VARIANTES"
attendre_rouge "4. variantes sans « layout »" "actions-variantes.ts"

# ---------------------------------------------------------------------------
# Cas 5 : la regle retiree du document, sens 2.
# ---------------------------------------------------------------------------
perl -ni -e 'print unless /C37/' "$REGLE"
attendre_rouge "5. règle C37 retirée du document" "n'énonce plus C37"

# ---------------------------------------------------------------------------
# Cas 6 : un argument qui est lui-meme un appel ne doit pas etre pris pour un
# oubli. C'EST LE CAS QUI GARDE LE CONTROLE CONTRE LUI-MEME : sa premiere
# version cherchait `revalidatePath([^)]*"layout"`, motif qui s'arrete a la
# parenthese de `chemin(produitId)` et accusait un fichier correct.
# ---------------------------------------------------------------------------
attendre_vert "6. « revalidatePath(chemin(id), \"layout\") » n'est pas un oubli"

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
