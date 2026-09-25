#!/bin/bash
# Vérifie que le titre de chaque écran hérite du gabarit de LS-180 et LS-181,
# jeton `--ls-police-titre` et une seule échelle par espace, LS-228 et LS-229.
#
# Il couvre les deux espaces privés, sens 1 et 2, ET le périmètre que ces deux
# sens n'atteignent pas, sens 4 : pages publiques et écrans sans session.
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
# CE QU'IL VÉRIFIE, DANS LES QUATRE SENS.
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
#   4. `globals.css` pose la règle qui couvre ce qu'aucun layout n'atteint,
#      LS-229
#      -> les pages publiques n'ont aucun layout où l'accrocher, et les écrans
#         atteints SANS session sortent du leur avant le gabarit
#
# POURQUOI UN QUATRIÈME SENS, LS-229. Les sens 1 et 2 gardent les deux espaces
# privés et les gardent bien. Ils sont restés VERTS pendant que 100 % des titres
# publics rendaient en `system-ui`, mesuré sur la production le 14 septembre
# 2026 avec quatre échelles concurrentes, 32, 36, 40 et 56 px : leur périmètre
# ne le couvrait pas, et C42 ne le revendiquait pas non plus.
#
# DEUX FAMILLES ÉCHAPPAIENT, POUR DES RAISONS DISTINCTES. Les pages publiques
# n'ont aucun layout à module CSS, `(boutique)/layout.tsx` rendant un fragment
# sans conteneur. Les écrans de connexion et d'inscription vivent pourtant SOUS
# les dossiers couverts, mais `compte/layout.tsx` sort avant le gabarit quand il
# n'y a pas d'identité : `.colonne` n'est jamais rendu, donc `.colonne h1` ne
# s'applique pas. Un chemin couvert par une règle ne suffit pas à conclure qu'un
# écran l'est, la garde s'évalue à l'exécution.
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
GLOBAL="src/app/globals.css"

defauts=0

echo "Gabarit de titre, espaces privés et périmètre public, LS-228 et LS-229"
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

  if ! grep -q -- "--ls-police-titre" <<<"$bloc"; then
    echo "   ÉCHEC : la règle « h1 » de $layout n'emploie pas --ls-police-titre."
    defauts=$((defauts + 1))
    continue
  fi

  if ! grep -q "font-size" <<<"$bloc"; then
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
  grep -q "font-family" <<<"$bloc" && fautes="font-family"
  if grep -q "font-size" <<<"$bloc"; then
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

# --------------------------------------------------------------- sens 4

echo "4. La règle globale couvre ce qu'aucun layout n'atteint, LS-229"

if [ ! -f "$GLOBAL" ]; then
  echo "   ÉCHEC : $GLOBAL est introuvable."
  echo "   L'ancrage de ce sens est cassé, il ne prouve plus rien."
  exit 1
fi

# Le bloc de titre global. `awk` s'arrête à la première accolade fermante, donc
# il isole bien la règle et non tout le fichier.
bloc_global=$(awk '/^h1,/,/\}/' "$GLOBAL")

if [ -z "$bloc_global" ]; then
  echo "   ÉCHEC : $GLOBAL ne pose aucune règle de titre sur l'élément."
  echo "   Sans elle, tout titre public et tout écran sans session retombe en"
  echo "   police système, défaut mesuré sur la production le 14 septembre 2026."
  defauts=$((defauts + 1))
elif ! grep -q -- "--ls-police-titre" <<<"$bloc_global"; then
  echo "   ÉCHEC : la règle de titre de $GLOBAL n'emploie pas --ls-police-titre."
  defauts=$((defauts + 1))
else
  echo "   OK   $GLOBAL pose la règle héritée sur l'élément"
fi

# L'échelle du titre d'écran, pour les écrans que ni l'un ni l'autre layout ne
# couvre. Sans elle, un `h1` nu prend la taille par défaut du navigateur.
if ! awk '/^h1 \{/,/\}/' "$GLOBAL" | grep -q "font-size"; then
  echo "   ÉCHEC : $GLOBAL ne fixe aucune échelle de titre d'écran."
  defauts=$((defauts + 1))
else
  echo "   OK   l'échelle du titre d'écran y est posée"
fi

# Les modules publics ne doivent pas la neutraliser en reposant une police.
# La TAILLE reste admise chez eux, à la différence des espaces privés : une page
# de contenu et une fiche produit n'ont pas la même densité, et le sens 2 garde
# déjà l'uniformité là où elle est voulue.
# `src/app` A LA RACINE EST DANS LE PERIMETRE, et son oubli avait coute.
# `erreur.module.css` y vit seul, sert quatre ecrans d'erreur, et n'etait
# examine NI par le sens 2, qui cherche dans `administration/` et `compte/`, NI
# par ce sens 4 quand il ne regardait que `(boutique)`. Son `font-weight: 600`
# avait survecu au passage des huit modules publics en 500 : les pages d'erreur
# rendaient leur titre plus gras que tout le reste, sans qu'aucun controle ne le
# voie. Releve a la relecture du 14 septembre 2026, jamais par un script.
modules_publics=$(
  {
    find "src/app/(boutique)" -name "*.module.css" -not -path "*/compte/*"
    find src/app -maxdepth 1 -name "*.module.css"
  } 2>/dev/null | sort -u
)

nb_publics=$(printf '%s\n' "$modules_publics" | grep -c . || true)

if [ "$nb_publics" -eq 0 ]; then
  echo "   ÉCHEC : aucun module public trouvé."
  echo "   L'ancrage de ce sens est cassé, il ne prouve plus rien."
  exit 1
fi

fautifs=0
while IFS= read -r module; do
  [ -z "$module" ] && continue
  bloc=$(awk '/^\.titre[ ,{]/,/\}/' "$module")
  [ -z "$bloc" ] && continue
  if grep -q "font-family" <<<"$bloc"; then
    echo "   ÉCHEC : ${module#src/app/} repose font-family sur son titre."
    defauts=$((defauts + 1))
    fautifs=$((fautifs + 1))
  fi
done <<< "$modules_publics"

if [ "$fautifs" -eq 0 ]; then
  echo "   OK   $nb_publics modules publics examinés, aucun ne repose sa police"
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
