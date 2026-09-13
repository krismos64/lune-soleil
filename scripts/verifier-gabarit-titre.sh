#!/bin/bash
# Vérifie que le titre de chaque écran des deux espaces privés hérite du gabarit
# de LS-180 et LS-181, jeton `--ls-police-titre` et une seule échelle, LS-228.
#
# POURQUOI CE CONTRÔLE EXISTE. Les deux stories de rendu ont posé le serif écran
# par écran, sur une classe `.titre` que chaque page devait penser à employer.
# La convention ne s'est pas propagée : mesuré sur la production du 13 septembre
# 2026 par `getComputedStyle`, SEPT titres sur quatorze rendaient en `system-ui`,
# et trois échelles cohabitaient, 24, 36 et 44 px. Les écrans fautifs étaient
# presque tous postérieurs aux deux stories, écrits en recopiant un voisin
# ANTÉRIEUR au jeton.
#
# CE N'EST PAS UN DÉFAUT DE COULEUR OU DE VALEUR, c'est un défaut de propagation.
# Un contrôle qui mesurerait la valeur du jeton resterait vert : le jeton est
# correct, il n'est simplement pas atteint. Ce qui se vérifie ici est donc qu'une
# RÈGLE HÉRITÉE existe, et que rien ne la neutralise en aval.
#
# CE QU'IL VÉRIFIE, DANS LES TROIS SENS.
#
#   1. chacun des deux layouts pose la règle héritée sur `h1`
#      -> sans elle, chaque écran redevient libre de son titre, et l'on retombe
#         exactement dans l'état d'avant LS-228
#   2. aucun module d'écran ne repose `font-family` ou `font-size` sur son titre
#      -> une règle locale l'emporte sur l'héritée par spécificité, donc une
#         seule recopie suffit à rouvrir le défaut sur un écran
#   3. le contrôle trouve bien des fichiers à examiner
#      -> un ancrage cassé rendrait un OK silencieux, motif déjà payé sur ce
#         dépôt avec `verifier-navigation-administration.sh`, dont l'`awk` ne
#         trouvait plus son tableau après une annotation de type
#
# LE SENS 2 EST CELUI QUI ATTRAPE LA RÉCIDIVE. Le sens 1 constate que le gabarit
# existe ; il resterait vert le jour où un écran neuf repose sa propre taille.
# C'est précisément ce qui s'est produit entre LS-181 et LS-228.
#
# IL CIBLE `h1` ET NON UNE CLASSE, même raison que la règle CSS qu'il protège :
# une classe doit être posée pour agir, donc oubliée pour ne pas agir. Quatre
# écrans d'administration portaient déjà un `h1` nu, sans aucune classe, et un
# contrôle nominatif ne les aurait jamais vus.
#
# CE QU'IL NE VÉRIFIE PAS, et qui reste au test de bout en bout : la police
# RÉELLEMENT calculée. Un contrôle textuel lit des règles, il ne rend pas une
# page. Les deux moitiés sont nécessaires, motif « contrôle textuel et test
# d'exécution » déjà en fiche.
#
# Usage : ./scripts/verifier-gabarit-titre.sh

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

LAYOUT_ADMIN="src/app/administration/layout.module.css"
LAYOUT_COMPTE="src/app/(boutique)/compte/layout.module.css"

defauts=0

echo "Gabarit de titre des espaces privés, LS-228"
echo

# --------------------------------------------------------------- sens 1

echo "1. La règle héritée existe dans les deux layouts"

for layout in "$LAYOUT_ADMIN" "$LAYOUT_COMPTE"; do
  if [ ! -f "$layout" ]; then
    echo "   ÉCHEC : $layout est introuvable."
    echo "   L'ancrage de ce contrôle est cassé, il ne prouve plus rien."
    exit 1
  fi

  # La règle doit cibler `h1` ET porter le jeton : l'une sans l'autre ne fait
  # pas un gabarit. Un `.colonne h1` sans `font-family` laisserait la police
  # système, ce qui est le défaut d'origine.
  bloc=$(awk '/\.colonne h1/,/\}/' "$layout")

  if [ -z "$bloc" ]; then
    echo "   ÉCHEC : $layout ne pose aucune règle héritée sur « h1 »."
    defauts=$((defauts + 1))
    continue
  fi

  if ! printf '%s' "$bloc" | grep -q -- "--ls-police-titre"; then
    echo "   ÉCHEC : la règle « h1 » de $layout n'emploie pas --ls-police-titre."
    defauts=$((defauts + 1))
    continue
  fi

  if ! printf '%s' "$bloc" | grep -q "font-size"; then
    echo "   ÉCHEC : la règle « h1 » de $layout ne fixe aucune échelle."
    defauts=$((defauts + 1))
    continue
  fi

  echo "   OK   $layout"
done

echo

# --------------------------------------------------------------- sens 2

echo "2. Aucun module d'écran ne neutralise le gabarit"

# Les modules des deux espaces, layouts exclus : ce sont eux qui portent la
# règle, la trouver chez eux n'est pas un défaut.
modules=$(find src/app/administration "src/app/(boutique)/compte" \
  -name "*.module.css" -not -name "layout.module.css" 2>/dev/null | sort)

nb_modules=$(printf '%s\n' "$modules" | grep -c . || true)

# Sens 3, ici plutôt qu'à la fin : sans fichier à examiner, tout ce qui suit
# rendrait un succès vide.
if [ "$nb_modules" -eq 0 ]; then
  echo "   ÉCHEC : aucun module d'écran trouvé."
  echo "   L'ancrage de ce contrôle est cassé, il ne prouve plus rien."
  exit 1
fi

while IFS= read -r module; do
  [ -z "$module" ] && continue

  # Le bloc `.titre`, s'il existe. Une taille ou une police posée là l'emporte
  # sur la règle héritée, par spécificité.
  bloc=$(awk '/^\.titre[ ,{]/,/\}/' "$module")
  [ -z "$bloc" ] && continue

  fautes=""
  printf '%s' "$bloc" | grep -q "font-family" && fautes="font-family"
  if printf '%s' "$bloc" | grep -q "font-size"; then
    fautes="${fautes:+$fautes et }font-size"
  fi

  if [ -n "$fautes" ]; then
    echo "   ÉCHEC : ${module#src/app/} repose $fautes sur son titre."
    defauts=$((defauts + 1))
  fi
done <<< "$modules"

if [ "$defauts" -eq 0 ]; then
  echo "   OK   $nb_modules modules examinés, aucun ne repose son titre"
fi

echo

# --------------------------------------------------------------- verdict

if [ "$defauts" -gt 0 ]; then
  echo "ÉCHEC : $defauts défaut(s) de gabarit de titre."
  echo
  echo "Le titre se pose UNE FOIS dans le layout de l'espace, jamais par écran."
  echo "Un écran qui repose sa taille rouvre le défaut de LS-228 sur lui seul."
  exit 1
fi

echo "OK : le gabarit de titre est posé une fois et personne ne le neutralise."
