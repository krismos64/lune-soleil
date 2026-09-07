#!/usr/bin/env bash
# Prouve que `hook-block-secret-commands.sh` refuse une VALEUR de secret passee
# en argument, LS-156 criteres 6 et 8, et qu'il laisse passer les commandes
# legitimes.
#
# ------------------------------------------------------------------
# LES PREFIXES SONT ASSEMBLES A L'EXECUTION, JAMAIS ECRITS EN ENTIER.
#
# Ce n'est pas une precaution de style : la premiere version de ce test a ete
# ecrite directement dans un appel Bash, et **le hook a bloque le test
# lui-meme**, la commande portant les motifs en clair. Motif deja en fiche sur
# ce depot, « le hook bloque son explication ».
#
# Deux raisons de les assembler :
#
#   1. le fichier serait autrement illisible par toute session, ce hook barrant
#      la lecture d'un fichier qui porte ces motifs
#   2. le depot est PUBLIC et l'analyse de secrets refuse un motif litteral
#      credible, meme factice. La fiche sur GitGuardian l'impose : une valeur de
#      test doit RESSEMBLER a un secret sans en etre un
#
# Les suffixes sont des repetitions d'une meme lettre, ce qu'aucune vraie cle
# n'est.
# ------------------------------------------------------------------
#
# Usage : ./scripts/verifier-hook-secret-argument.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$RACINE/.claude/scripts/hook-block-secret-commands.sh"

[ -x "$HOOK" ] || {
  echo "ECHEC hook introuvable ou non executable : $HOOK"
  exit 1
}

command -v jq >/dev/null 2>&1 || {
  echo "ECHEC jq est absent, le hook refuserait toute commande sans l'analyser."
  echo "      Ce test ne pourrait pas distinguer un refus legitime d'un refus"
  echo "      d'outillage : il s'arrete plutot que de conclure a tort."
  exit 1
}

# Assemblage a l'execution, voir l'en-tete.
S="s"; K="k"; W="wh"; G="gh"
CLE_TEST="${S}${K}_test_$(printf 'A%.0s' {1..24})"
CLE_LIVE="${S}${K}_live_$(printf 'B%.0s' {1..24})"
WEBHOOK="${W}sec_$(printf 'C%.0s' {1..24})"
JETON_GH="${G}p_$(printf 'D%.0s' {1..24})"

reussites=0
echecs=0
cas=0

# LE CODE ATTENDU EST EXPLICITE, et les deux sens comptent autant.
#
# UN HOOK QUI REFUSE TOUT SERAIT « SUR » ET INUTILISABLE : les cas qui doivent
# PASSER sont la moitie de la preuve. Sans eux, un motif trop large passerait
# pour un succes, et c'est le defaut qui a failli entrer ici, `pk_live_` et
# `sk_test_` etant des sous-chaines frequentes dans de la documentation.
jouer() {
  local intitule="$1" commande="$2" attendu="$3"
  cas=$((cas + 1))

  local charge sortie code
  charge=$(jq -n --arg c "$commande" '{tool_input: {command: $c}}')
  sortie=$(printf '%s' "$charge" | "$HOOK" 2>&1)
  code=$?

  if [ "$code" -eq "$attendu" ]; then
    echo "OK    cas $cas, $intitule"
    reussites=$((reussites + 1))
    return
  fi

  echo "ECHEC cas $cas, $intitule"
  echo "      code $code, attendu $attendu"
  if [ "$attendu" -eq 2 ]; then
    echo "      LE HOOK A LAISSE PASSER une valeur de secret en argument :"
    echo "      elle serait lisible par tout ps de la machine."
  else
    echo "      LE HOOK A REFUSE une commande legitime : un garde-fou qui"
    echo "      bloque le travail normal finit par etre desactive."
    printf '%s\n' "$sortie" | sed 's/^/        /'
  fi
  echecs=$((echecs + 1))
}

echo "Preuve du sens « secret en argument » de hook-block-secret-commands.sh"
echo ""
echo "Doivent etre REFUSES, code 2 :"

jouer "cle secrete de test en argument" "stripe listen --api-key $CLE_TEST" 2
jouer "cle secrete live en argument" "un-outil --token $CLE_LIVE" 2
jouer "secret de webhook en argument" "mon-script --secret $WEBHOOK" 2
jouer "jeton GitHub en argument" "gh auth login --with-token $JETON_GH" 2

# LA SUBSTITUTION N'EST PAS UNE PROTECTION, et le message du hook le dit : le
# shell developpe la valeur AVANT l'execution, donc elle apparait dans `ps`
# exactement comme une valeur litterale. Ce cas garde cette affirmation vraie.
jouer "cle au milieu d'une commande composee" \
  "echo demarrage && stripe listen --api-key $CLE_TEST --forward-to localhost:3000" 2

echo ""
echo "Doivent PASSER, code 0 :"

jouer "stripe sans cle, il lit sa configuration" "stripe listen" 0
jouer "node lit le fichier lui-meme" "node --env-file=.env script.mjs" 0
jouer "commande de test ordinaire" "npm run test:unitaire" 0
jouer "un NOM de variable, jamais sa valeur" "grep -c STRIPE_SECRET_KEY .env.example" 0
jouer "le prefixe seul, sans valeur derriere" "grep -r '${S}${K}_test_' docs/" 0

echo ""
if [ "$echecs" -gt 0 ]; then
  echo "ECHEC $echecs cas sur $cas."
  exit 1
fi

echo "OK $reussites cas sur $cas, dans les deux sens."
