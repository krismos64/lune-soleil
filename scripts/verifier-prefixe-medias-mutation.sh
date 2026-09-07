#!/bin/bash
# Preuve par mutation de `verifier-prefixe-medias.sh`, LS-197.
#
# Un controle qui n'a jamais echoue sur le defaut qu'il pretend attraper n'est
# pas un controle. Ce script reintroduit le defaut, verifie que le controle
# rougit EN NOMMANT sa cause, puis restaure.
#
# CINQ CAS. Les trois premiers reproduisent l'etat REEL d'avant cette story ou
# des variantes credibles ; les deux derniers gardent le controle CONTRE
# LUI-MEME.
#
#   1. l'ARG retire du Dockerfile, l'etat exact d'avant LS-197
#   2. l'ENV retire, l'ARG restant seul : piege reel, un ARG n'est PAS exporte
#      dans l'environnement des RUN suivants, donc `next build` ne le voit pas
#   3. la variable retiree de `.env.example`, ce qui la rendrait invisible a la
#      relecture et a `verifier-environnement.sh`
#   4. un prefixe ATTENDU different de celui que le bundle sert : c'est le
#      critere 2 de la story, et il se prouve sans reconstruire
#   5. l'etat de reference doit rester VERT sur le bundle tel qu'il est, sans
#      quoi tous les rouges ci-dessus ne prouveraient rien
#
# Usage : ./scripts/verifier-prefixe-medias-mutation.sh
# Prerequis : un bundle construit, comme le controle qu'il eprouve.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-prefixe-medias.sh"
DOCKERFILE="Dockerfile"
EXEMPLE=".env.example"

MUTABLES=("$DOCKERFILE" "$EXEMPLE")
for f in "${MUTABLES[@]}"; do
  [ -r "$f" ] || {
    echo "ECHEC fichier illisible : $f"
    exit 1
  }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for f in "${MUTABLES[@]}"; do cp "$f" "$TMP/$(basename "$f")"; done
restaurer() {
  for f in "${MUTABLES[@]}"; do cp "$TMP/$(basename "$f")" "$f"; done
}

# L'ETAT DE REFERENCE DOIT ETRE VERT. Sans lui, un « rouge » observe ensuite
# pourrait venir d'un bundle absent ou d'un defaut preexistant, et le script
# conclurait a tort que le controle est vigilant.
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

# ---------------------------------------------------------------------------
# Cas 1 : l'ARG retire, l'etat exact d'avant LS-197.
# ---------------------------------------------------------------------------
perl -ni -e 'print unless /^ARG NEXT_PUBLIC_MEDIA_PREFIXE=/' "$DOCKERFILE"
attendre_rouge "1. ARG retiré du Dockerfile" "ne déclare aucun ARG"

# ---------------------------------------------------------------------------
# Cas 2 : l'ENV retire, l'ARG restant seul.
#
# CE CAS EST LE PLUS INSTRUCTIF. Un Dockerfile portant l'ARG sans l'ENV semble
# correct a la relecture, et fige pourtant le repli : un ARG n'est pas exporte
# dans l'environnement des RUN suivants.
# ---------------------------------------------------------------------------
perl -ni -e 'print unless /^ENV NEXT_PUBLIC_MEDIA_PREFIXE=/' "$DOCKERFILE"
attendre_rouge "2. ENV retiré, l'ARG reste seul" "n'est repris par aucun ENV"

# ---------------------------------------------------------------------------
# Cas 3 : la variable retiree de `.env.example`.
# ---------------------------------------------------------------------------
perl -ni -e 'print unless /^NEXT_PUBLIC_MEDIA_PREFIXE=/' "$EXEMPLE"
attendre_rouge "3. variable retirée de .env.example" "ne déclare plus"

# ---------------------------------------------------------------------------
# Cas 4 : un prefixe attendu different de celui que le bundle sert.
#
# C'EST LE CRITERE 2 DE LA STORY, et il se prouve SANS reconstruire : le
# controle resout la valeur attendue depuis l'environnement, donc lui en donner
# une autre revient exactement a servir un bundle qui ne la porte pas.
# ---------------------------------------------------------------------------
cas=$((cas + 1))
sortie="$(NEXT_PUBLIC_MEDIA_PREFIXE=/prefixe-absent "$CONTROLE" 2>&1)"
if NEXT_PUBLIC_MEDIA_PREFIXE=/prefixe-absent "$CONTROLE" >/dev/null 2>&1; then
  echo "  NON DETECTE  4. le bundle sert un autre préfixe que celui configuré"
  ko=1
elif printf '%s' "$sortie" | grep -q "ne sert PAS"; then
  echo "  detecte      4. le bundle sert un autre préfixe que celui configuré"
else
  echo "  MAL DETECTE  4. rouge, mais pas sur le désaccord de préfixe"
  ko=1
fi

# ---------------------------------------------------------------------------
# Cas 5 : le controle reste VERT sur l'etat sain, apres toutes ces mutations.
#
# Il verifie du meme coup que `restaurer` a bien rendu les fichiers : une
# mutation non restauree laisserait le depot casse en silence, motif deja
# rencontre sur ce depot.
# ---------------------------------------------------------------------------
cas=$((cas + 1))
if "$CONTROLE" >/dev/null 2>&1; then
  echo "  detecte      5. état sain restauré, le contrôle repasse au vert"
else
  echo "  FAUX POSITIF 5. l'état sain ne repasse pas au vert, restauration incomplète"
  "$CONTROLE" 2>&1 | sed 's/^/               /'
  ko=1
fi

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
