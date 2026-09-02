#!/bin/bash
# Preuve par mutation de `verifier-palette-secours.sh`, LS-146.
#
# Motif. Ce contrôle garde un écran que PERSONNE NE VOIT JAMAIS en conditions
# normales : `global-error.tsx` ne se rend que si le layout racine lui-même a
# échoué. Aucun test de rendu ne le traverse, aucune session de développement ne
# l'affiche. Son vert est donc, plus que pour tout autre contrôle du dépôt,
# indistinguable de celui d'un script qui ne regarde rien.
#
# Usage : ./scripts/verifier-palette-secours-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-palette-secours.sh"
JETONS="src/styles/tokens.css"
STYLES="src/app/erreur.module.css"
PAGE="src/app/global-error.tsx"

detectes=0
total=0

# LA RESTAURATION NE PASSE PAS PAR GIT : `git checkout` est atomique et échoue
# en entier sur un chemin non suivi, ce qui laisserait les fichiers suivis non
# restaurés eux non plus. La sauvegarde par copie ne dépend d'aucun état
# d'indexation, et les trois fichiers d'ici sont neufs dans cette story.
SAUVEGARDE="$(mktemp -d)"

sauvegarder() {
  local fichier index=0
  for fichier in "$JETONS" "$STYLES" "$PAGE"; do
    [ -r "$fichier" ] || { echo "ECHEC fichier illisible : $fichier"; exit 1; }
    cp "$fichier" "$SAUVEGARDE/$index"
    index=$((index + 1))
  done
}

restaurer() {
  local fichier index=0
  for fichier in "$JETONS" "$STYLES" "$PAGE"; do
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

# Appelé SANS pipe vers grep : le pipe renverrait le code de grep et non celui
# du contrôle, ce qui avait fait passer sept mutations pour « non détectées » à
# tort sur ce projet.
attendre_echec() {
  local libelle="$1"
  total=$((total + 1))

  if "$CONTROLE" >/dev/null 2>&1; then
    echo "NON DETECTE  $libelle"
  else
    echo "detecte      $libelle"
    detectes=$((detectes + 1))
  fi

  restaurer
}

# Vérifie qu'une substitution a bien mordu. Une cible déplacée par un
# reformatage laisserait le fichier intact, et le cas testerait alors le dépôt
# sain en accusant le contrôle.
muter() {
  local fichier="$1" expression="$2"
  local avant
  avant=$(cksum <"$fichier")

  perl -0pi -e "$expression" "$fichier"

  if [ "$(cksum <"$fichier")" = "$avant" ]; then
    echo "ECHEC la mutation n'a modifié aucun caractère de $fichier"
    echo "      l'expression ne correspond plus au code : corriger le script."
    exit 1
  fi
}

echo "État de référence, avant toute mutation"
if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "  ECHEC le contrôle n'est pas vert AVANT mutation."
  exit 1
fi
echo "  OK    le contrôle est vert, les mutations peuvent commencer"
echo

# ---------------------------------------------------------------------------
# Cas 1 : ADR-022 change une couleur, la copie ne suit pas.
#
# C'EST LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER, et il est parfaitement
# réaliste : une session future assombrit le brun primaire dans `tokens.css`,
# tout le site suit, et cet écran garde l'ancienne teinte sans que rien ne le
# signale. Il ne se verrait que le jour d'une panne.
# ---------------------------------------------------------------------------
muter "$JETONS" 's/--ls-primary: #5f4519;/--ls-primary: #4a3512;/'
attendre_echec "jeton primaire modifié, la copie de secours ne suit plus"

# ---------------------------------------------------------------------------
# Cas 2 : la page de secours redevient dépendante des jetons.
#
# LE GESTE EST CELUI D'UNE BONNE INTENTION. Voir une valeur en dur dans un
# fichier dont l'en-tête dit « aucune valeur hexadécimale » donne envie de la
# remplacer par la variable correspondante. Le rendu resterait parfait dans tous
# les tests, et l'écran sortirait sans couleur le seul jour où il compte, la
# variable venant du fichier qui vient d'échouer.
# ---------------------------------------------------------------------------
muter "$STYLES" 's/background: #fbf7f0;/background: var(--ls-background);/'
attendre_echec "valeur littérale remplacée par un jeton dans la zone de secours"

# ---------------------------------------------------------------------------
# Cas 3 : une couleur est ajoutée sans passer par la liste.
#
# SANS CE CAS, LE COMPTE SERAIT DÉCORATIF. La liste des couleurs surveillées est
# écrite à la main, et une liste manuscrite ne vaut que ce qu'elle vaut : le
# compte est ce qui force à y revenir. Une cinquième couleur ajoutée en silence
# échapperait autrement à toute surveillance.
# ---------------------------------------------------------------------------
muter "$STYLES" 's/(\.actionRacine \{)/.bandeauRacine {\n  background: #a33a2e;\n}\n\n$1/'
attendre_echec "couleur ajoutée à la zone de secours hors de la liste"

# ---------------------------------------------------------------------------
# Cas 4 : la page de secours importe un composant partagé.
#
# L'en-tête lit le cookie du panier et appelle un service. Dans l'état où le
# layout racine a échoué, rien ne garantit qu'ils se rendent : un écran de
# secours qui échoue à son tour ne laisse qu'une page blanche.
# ---------------------------------------------------------------------------
muter "$PAGE" 's{import styles from "./erreur.module.css";}{import { EnTeteBoutique } from "@/components/en-tete-boutique";\nimport styles from "./erreur.module.css";}'
attendre_echec "composant partagé importé par l'écran de dernier recours"

# ---------------------------------------------------------------------------
# Cas 5 : la langue disparaît de la balise racine.
#
# `global-error.tsx` REMPLACE le layout racine, donc le `lang="fr"` que celui-ci
# portait. L'oublier fait prononcer le texte français avec les règles de
# l'anglais par un lecteur d'écran, sur le seul écran qui reste au visiteur.
# ---------------------------------------------------------------------------
muter "$PAGE" 's/<html lang="fr">/<html>/'
attendre_echec "attribut lang retiré de la page de secours"

echo
echo "-----------------------------------------"
if [ "$detectes" -eq "$total" ]; then
  echo "  $total mutations, $total détectées"
else
  echo "  $total mutations, $((total - detectes)) NON détectées"
fi
echo "-----------------------------------------"

[ "$detectes" -eq "$total" ]
