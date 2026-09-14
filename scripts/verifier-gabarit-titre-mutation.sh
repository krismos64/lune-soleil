#!/bin/bash
# Éprouve `verifier-gabarit-titre.sh` en injectant les défauts qu'il prétend
# attraper, LS-228. Un contrôle qui n'a jamais échoué n'est pas un contrôle.
#
# LES MUTATIONS REPRENNENT LES FORMES RÉELLEMENT RENCONTRÉES, jamais celle qui
# s'écrit le plus commodément dans un `sed`. C'est la leçon du 8 septembre 2026 :
# `verifier-graphie-marque.sh` avait été prouvé par quatre mutations réussies
# pendant qu'il laissait passer quatre défauts réels du dépôt, tous sous une
# forme que les mutations n'avaient pas fabriquée.
#
# Les trois formes ci-dessous sont celles relevées dans le dépôt avant LS-228 :
#
#   cas 1   un module repose `font-size` seule, forme des cinq écrans
#           recopiés, `clamp(1.5rem, 5vw, 2.25rem)` sans `font-family`
#   cas 2   un module repose `font-family`, forme des six écrans qui
#           portaient le serif localement avant que le layout le pose
#   cas 3   le layout perd sa règle héritée, ce qui rouvre le défaut sur
#           TOUS les écrans d'un coup
#
# LES CAS 5 À 7 ÉPROUVENT LE SENS 4, AJOUTÉ PAR LS-229. Ils gardent le périmètre
# qu'aucun layout n'atteint, pages publiques et écrans sans session, et leurs
# formes viennent de l'état mesuré sur la production le 14 septembre 2026 :
#
#   cas 5   la règle globale garde sa forme mais perd son jeton, exactement
#           l'état d'avant LS-229 où le jeton existait sans être atteint
#   cas 6   l'échelle du titre d'écran disparaît, et un `h1` nu retombe à la
#           taille par défaut du navigateur ; `administration/connexion` en
#           porte un
#   cas 7   un module PUBLIC repose une police sur son titre, récidive de
#           LS-228 transposée : une seule recopie rouvre le défaut par
#           spécificité
#
# LE CAS 4 GARDE LE CONTRÔLE CONTRE LUI-MÊME. Un ancrage cassé le rendrait
# silencieusement vert, motif payé sur ce dépôt avec
# `verifier-navigation-administration.sh` dont l'`awk` ne trouvait plus son
# tableau après une annotation de type. Il doit échouer quand il n'a plus rien
# à examiner, jamais rendre un OK vide.
#
# Usage : ./scripts/verifier-gabarit-titre-mutation.sh

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

CONTROLE="./scripts/verifier-gabarit-titre.sh"
LAYOUT_ADMIN="src/app/administration/layout.module.css"
CIBLE="src/app/administration/messages/messages.module.css"
GLOBAL="src/app/globals.css"
CIBLE_PUBLIQUE="src/app/(boutique)/catalogue/catalogue.module.css"

echec=0

# Le script restaure par `git checkout` : du travail non commité serait effacé.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ARRÊT : le dépôt porte des modifications non commitées."
  echo "Ce script restaure par git checkout et les effacerait. Commiter d'abord."
  exit 1
fi

restaurer() {
  git checkout -- "$LAYOUT_ADMIN" "$CIBLE" "$GLOBAL" "$CIBLE_PUBLIQUE" 2>/dev/null
}
trap restaurer EXIT INT TERM

# Le contrôle doit être vert AVANT toute mutation, sans quoi les rouges qui
# suivent ne prouveraient rien.
if ! $CONTROLE > /dev/null 2>&1; then
  echo "ARRÊT : le contrôle est déjà rouge avant mutation."
  exit 1
fi
echo "État initial : le contrôle est vert."
echo

eprouver() {
  local numero="$1" intitule="$2"

  if $CONTROLE > /dev/null 2>&1; then
    echo "   ÉCHEC : le contrôle reste VERT sous la mutation $numero."
    echo "           $intitule"
    echec=$((echec + 1))
  else
    echo "   OK   cas $numero rouge : $intitule"
  fi

  restaurer
}

echo "Mutations"

# --- cas 1 : un module repose sa taille, forme des cinq écrans recopiés
perl -0pi -e 's/(^\.titre \{\n)/$1  font-size: clamp(1.5rem, 5vw, 2.25rem);\n/ms' "$CIBLE"
eprouver 1 "un module repose font-size sur son titre"

# --- cas 2 : un module repose le serif localement
perl -0pi -e 's/(^\.titre \{\n)/$1  font-family: var(--ls-police-titre);\n/ms' "$CIBLE"
eprouver 2 "un module repose font-family sur son titre"

# --- cas 3 : le layout perd sa règle héritée
perl -0pi -e 's/\.colonne h1 \{[^}]*\}//ms' "$LAYOUT_ADMIN"
eprouver 3 "le layout d'administration perd sa règle héritée"

# --- cas 4 : le jeton disparaît de la règle héritée, qui subsiste
perl -0pi -e 's/(\.colonne h1 \{[^}]*?)  font-family: var\(--ls-police-titre\);\n/$1/ms' "$LAYOUT_ADMIN"
eprouver 4 "la règle héritée existe mais n'emploie plus le jeton"

# --- cas 5 : la règle globale garde sa forme mais perd son jeton, LS-229
perl -0pi -e 's/(^h1,\nh2,\nh3 \{\n)  font-family: var\(--ls-police-titre\);\n/$1/ms' "$GLOBAL"
eprouver 5 "la règle globale existe mais n'emploie plus le jeton"

# --- cas 6 : l'échelle du titre d'écran disparaît, LS-229
#
# La mutation retire la SEULE ligne `font-size`, et laisse le bloc debout avec
# ce qu'il porte d'autre. Une premiere version supprimait le bloc entier en
# supposant qu'il ne contenait que la taille : le jour ou la graisse l'a
# rejoint, elle ne correspondait plus a rien et le cas passait au vert sans
# rien muter. Une mutation qui ne mute plus ne prouve plus, et elle le dit
# d'une voix identique a celle du succes.
perl -0pi -e 's/(^h1 \{\n(?:[^}]*\n)??)  font-size: clamp\([^)]*\);\n/$1/ms' "$GLOBAL"
eprouver 6 "l'échelle du titre d'écran disparaît"

# --- cas 7 : un module PUBLIC repose une police sur son titre, LS-229
perl -0pi -e 's/(^\.titre \{\n)/$1  font-family: Georgia, serif;\n/ms' "$CIBLE_PUBLIQUE"
eprouver 7 "un module public repose font-family sur son titre"

echo

if [ "$echec" -gt 0 ]; then
  echo "ÉCHEC : $echec mutation(s) non détectée(s)."
  echo "Le contrôle ne prouve pas ce qu'il prétend vérifier."
  exit 1
fi

echo "OK : les sept mutations sont détectées, le contrôle tient."
