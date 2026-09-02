#!/bin/bash
# Vérifie que les couleurs écrites en dur dans la page de secours restent égales
# aux jetons d'ADR-022, LS-146.
#
# POURQUOI DES VALEURS EN DUR EXISTENT ICI, ET NULLE PART AILLEURS. `global-
# error.tsx` remplace le layout racine au lieu de s'y imbriquer : il perd donc
# les imports de `tokens.css` et de `globals.css`, que ce layout porte. S'appuyer
# sur une variable CSS reviendrait à dépendre du fichier dont la défaillance
# amène cette page. Un écran de dernier recours n'a de valeur que s'il ne peut
# pas échouer à son tour.
#
# CE QUE CE CONTRÔLE EXISTE POUR ATTRAPER. La duplication est justifiée, elle
# n'en reste pas moins une duplication : le jour où ADR-022 change une couleur,
# `tokens.css` suit et cette copie ne suit pas. La divergence serait totalement
# silencieuse, la page de secours ne s'affichant qu'en cas de panne du layout
# racine, c'est-à-dire jamais pendant le développement ni dans aucun test de
# rendu. Elle se découvrirait le jour de la panne, sur l'écran qui doit
# précisément inspirer confiance.
#
# `verifier-contraste.sh` NE PEUT PAS LE VOIR, et les deux contrôles sont
# complémentaires : il ne lit que les paires écrites en `var(--ls-*)`, une valeur
# littérale lui étant par construction invisible. C'est le prix de la
# duplication, et ce script est ce qui le paie.
#
# Usage : ./scripts/verifier-palette-secours.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
JETONS="$RACINE/src/styles/tokens.css"
STYLES="$RACINE/src/app/erreur.module.css"
PAGE="$RACINE/src/app/global-error.tsx"
ko=0

[ -r "$JETONS" ] || { echo "ECHEC jetons de design illisibles : $JETONS"; exit 1; }
[ -r "$STYLES" ] || { echo "ECHEC styles d'erreur illisibles : $STYLES"; exit 1; }
[ -r "$PAGE" ] || { echo "ECHEC page de secours illisible : $PAGE"; exit 1; }

# ---------------------------------------------------------------------------
# Les quatre couleurs recopiées, et le jeton dont chacune vient.
#
# LA LISTE EST ÉCRITE À LA MAIN, ET C'EST UNE FAIBLESSE ASSUMÉE. Un contrôle de
# complétude sur une liste manuscrite ne vaut que ce que vaut la liste, motif
# déjà en fiche sur ce dépôt. Le garde-fou est ailleurs : le second sens
# ci-dessous compte les valeurs littérales du bloc de secours et échoue si ce
# nombre change, ce qui force à revenir ici plutôt que d'ajouter une couleur en
# silence.
# ---------------------------------------------------------------------------
verifier_couleur() {
  local jeton="$1" attendue="$2"
  local reelle

  reelle=$(grep -oE -- "$jeton:[[:space:]]*#[0-9a-fA-F]{6}" "$JETONS" \
    | head -1 | grep -oE '#[0-9a-fA-F]{6}' | tr '[:upper:]' '[:lower:]')

  if [ -z "$reelle" ]; then
    echo "ECHEC le jeton $jeton est introuvable dans tokens.css"
    echo "      la page de secours recopie une couleur qui n'existe plus."
    ko=$((ko + 1))
    return
  fi

  if [ "$reelle" != "$attendue" ]; then
    echo "ECHEC $jeton vaut $reelle dans tokens.css, la page de secours a $attendue"
    echo "      ADR-022 a changé sans que la copie de erreur.module.css suive."
    echo "      Corriger le bloc .pageRacine, invisible dans tout test de rendu."
    ko=$((ko + 1))
    return
  fi

  if ! grep -qi "$attendue" "$STYLES"; then
    echo "ECHEC la couleur $attendue de $jeton n'est plus dans erreur.module.css"
    ko=$((ko + 1))
  fi
}

verifier_couleur "--ls-background" "#fbf7f0"
verifier_couleur "--ls-primary" "#5f4519"
verifier_couleur "--ls-text" "#3b2f2a"

# Le blanc du texte sur aplat primaire. Il n'a pas de jeton propre à confronter,
# `--ls-text-on-primary` valant `#ffffff` littéralement.
verifier_couleur "--ls-text-on-primary" "#ffffff"

# ---------------------------------------------------------------------------
# Sens 2 : la page de secours ne dépend d'aucune variable CSS.
#
# C'EST L'INVARIANT QUI JUSTIFIE TOUT LE RESTE. Le jour où quelqu'un remplace
# une valeur littérale par `var(--ls-primary)`, par souci de cohérence et de
# bonne foi, la page redevient dépendante du fichier dont la défaillance
# l'amène. Le rendu resterait parfait dans tous les tests, et l'écran sortirait
# sans couleurs le seul jour où il compte.
#
# `--ls-space-4` FAIT EXCEPTION et porte son repli, `var(--ls-space-4, 16px)` :
# un espacement absent dégrade la mise en page, une couleur absente rend le
# texte illisible sur fond transparent.
# ---------------------------------------------------------------------------
# LA ZONE DE SECOURS COMMENCE À `.pageRacine` ET VA JUSQU'AU BOUT du fichier :
# les quatre sélecteurs `*Racine` y sont groupés, et c'est délibéré. Borner au
# seul bloc `.pageRacine` ne verrait que deux couleurs sur six, en laissant
# `.titreRacine`, `.texteRacine` et `.actionRacine` hors de portée, c'est-à-dire
# la plus grande partie de ce que ce contrôle existe pour surveiller.
bloc=$(awk '/^\.pageRacine \{/,0' "$STYLES")
[ -n "$bloc" ] || {
  echo "ECHEC le bloc .pageRacine est introuvable dans erreur.module.css"
  echo "      l'ancrage du contrôle est cassé : il ne vérifie plus rien."
  exit 1
}

# LES COMMENTAIRES PARTENT AVANT LE COMPTE. Chaque couleur de cette zone porte
# au-dessus d'elle le rapport mesuré, écrit en MAJUSCULES, `#5F4519 sur #FBF7F0
# : 8,36:1`. Les compter comme des déclarations doublerait le total et rendrait
# le contrôle rouge sur un fichier exemplaire, dont la réaction serait de
# retirer l'explication. Motif « contrôle satisfait par un commentaire », déjà
# en fiche sur ce dépôt.
declarations=$(printf '%s' "$bloc" | perl -0pe 's{/\*.*?\*/}{}gs')

if printf '%s' "$bloc" | grep -qE 'var\(--ls-[a-z-]+\)[^,]*;' ; then
  echo "ECHEC .pageRacine emploie une variable CSS sans valeur de repli"
  echo "      cette page remplace le layout racine, donc les imports de"
  echo "      tokens.css : une variable y est vide, et le texte sortirait"
  echo "      sans couleur le seul jour où cet écran s'affiche."
  ko=$((ko + 1))
fi

# Le nombre de valeurs littérales du bloc de secours entier. Il fige la surface
# recopiée : ajouter une couleur sans l'inscrire plus haut fait échouer ce
# contrôle, ce qui est le seul moyen de tenir une liste écrite à la main.
LITTERALES_ATTENDUES=6
litterales=$(printf "%s" "$declarations" | grep -coE '#[0-9a-fA-F]{6}')

if [ "$litterales" -ne "$LITTERALES_ATTENDUES" ]; then
  echo "ECHEC $litterales couleurs littérales dans le bloc de secours, $LITTERALES_ATTENDUES attendues"
  echo "      une couleur a été ajoutée ou retirée sans passer par ce contrôle."
  echo "      Inscrire la nouvelle couleur ci-dessus, puis corriger ce nombre."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Sens 3 : la page de secours reste autonome.
#
# Elle ne doit importer ni composant partagé, ni service. L'en-tête lit le
# cookie du panier et appelle un service : dans l'état où le layout racine a
# échoué, rien ne garantit qu'ils se rendent, et un écran de secours qui échoue
# à son tour ne laisse qu'une page blanche.
# ---------------------------------------------------------------------------
if grep -qE '^import .*(components|services|repositories|integrations)' "$PAGE"; then
  echo "ECHEC global-error.tsx importe un composant ou un service"
  echo "      il doit rester autonome : sa seule dépendance est une feuille de"
  echo "      style. Tout le reste peut échouer au moment où il s'affiche."
  ko=$((ko + 1))
fi

# LE MOTIF PORTE SUR LA BALISE, ET NON SUR `lang="fr"` SEUL. Cherché seul,
# l'attribut se trouve dans le commentaire d'en-tête de la page, qui explique
# précisément pourquoi il est là : le contrôle restait alors vert sur une page
# dont la balise avait perdu l'attribut, satisfait par l'explication plutôt que
# par le code. Mesuré, la mutation du cas 5 passait au vert. Motif « contrôle
# satisfait par un commentaire », déjà en fiche sur ce dépôt.
if ! grep -q '<html lang="fr">' "$PAGE"; then
  echo "ECHEC global-error.tsx ne porte plus lang=\"fr\" sur son html"
  echo "      il remplace le layout racine, donc l'attribut que celui-ci posait :"
  echo "      sans lui un lecteur d'écran prononce le texte en anglais."
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK la palette de secours est alignée sur ADR-022 et reste autonome"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
