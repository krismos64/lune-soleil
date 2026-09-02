#!/bin/bash
# Preuve par mutation de `verifier-navigation-administration.sh`, LS-162.
#
# Motif. Ce contrôle compare deux listes et les trouve cohérentes : son vert est
# indistinguable de celui d'un script qui compare deux listes vides, ou qui lit
# la mauvaise partie du fichier.
#
# LE CAS 2 EST LE PLUS IMPORTANT. Il rejoue le défaut d'origine de LS-162, une
# story qui ajoute un écran sans le relier. C'est le seul cas qui prouve que le
# contrôle protège l'AVENIR et pas seulement l'état du jour.
#
# Usage : ./scripts/verifier-navigation-administration-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-navigation-administration.sh"
NAVIGATION="src/components/navigation-administration.tsx"
LAYOUT="src/app/administration/layout.tsx"
ECRAN_TEMOIN="src/app/administration/remises/page.tsx"

detectes=0
total=0

# LA RESTAURATION NE PASSE PAS PAR GIT : `git checkout` est atomique et échoue
# en entier sur un chemin non suivi, ce qui laisserait les fichiers suivis non
# restaurés eux non plus. Les deux fichiers d'ici sont neufs dans cette story.
SAUVEGARDE="$(mktemp -d)"

sauvegarder() {
  local fichier index=0
  for fichier in "$NAVIGATION" "$LAYOUT"; do
    [ -r "$fichier" ] || { echo "ECHEC fichier illisible : $fichier"; exit 1; }
    cp "$fichier" "$SAUVEGARDE/$index"
    index=$((index + 1))
  done
}

restaurer() {
  local fichier index=0
  for fichier in "$NAVIGATION" "$LAYOUT"; do
    [ -r "$SAUVEGARDE/$index" ] && cp "$SAUVEGARDE/$index" "$fichier"
    index=$((index + 1))
  done
  # L'écran témoin du cas 2 est créé dans un dossier neuf : le dossier part
  # avec lui, sans quoi un répertoire vide resterait dans `src/app`.
  rm -rf "$(dirname "$ECRAN_TEMOIN")"
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
# Cas 1 : la barre renvoie vers un écran qui n'existe pas.
#
# Le geste réel : écrire la rubrique en même temps que la story qui livrera
# l'écran, et livrer la barre avant l'écran. La barre promet alors une fonction
# et rend un 404.
# ---------------------------------------------------------------------------
muter "$NAVIGATION" 's{\{ chemin: "/administration/stocks", libelle: "Stocks" \},}{{ chemin: "/administration/statistiques", libelle: "Statistiques" },}'
attendre_echec "rubrique pointant vers un écran non livré"

# ---------------------------------------------------------------------------
# Cas 2 : une story ajoute un écran sans le mettre dans la barre.
#
# C'EST LE DÉFAUT D'ORIGINE DE LS-162, rejoué à l'identique. Chaque story a
# ajouté un écran sans le relier, et rien ne le signalait. Ce cas est la seule
# preuve que le contrôle protège les stories À VENIR : sans lui, il ne
# vérifierait que la cohérence du jour.
# ---------------------------------------------------------------------------
mkdir -p "$(dirname "$ECRAN_TEMOIN")"
cat > "$ECRAN_TEMOIN" <<'FIN'
export default function PageRemises() {
  return <main>Remises</main>;
}
FIN
attendre_echec "écran neuf ajouté sans entrer dans la barre"

# ---------------------------------------------------------------------------
# Cas 3 : la barre n'est plus posée par le layout.
#
# SANS LE TROISIÈME SENS, CE CAS PASSERAIT. Les deux listes resteraient
# parfaitement cohérentes pendant que l'administration redeviendrait un
# ensemble d'écrans sans aucun lien, c'est-à-dire l'état d'avant la story.
# ---------------------------------------------------------------------------
muter "$LAYOUT" 's{<NavigationAdministration />}{null}'
attendre_echec "barre retirée du layout, les listes restant cohérentes"

# ---------------------------------------------------------------------------
# Cas 4 : l'écran courant n'est plus annoncé.
#
# L'information passerait par la seule couleur, ce que `frontend-design.md`
# interdit. Le rendu resterait visuellement identique pour qui voit l'écran, et
# muet pour un lecteur d'écran.
# ---------------------------------------------------------------------------
muter "$NAVIGATION" 's/aria-current=\{courante \? "page" : undefined\}/data-courante={courante}/'
attendre_echec "aria-current retiré, l'information ne passe plus que par la couleur"

echo
echo "-----------------------------------------"
if [ "$detectes" -eq "$total" ]; then
  echo "  $total mutations, $total détectées"
else
  echo "  $total mutations, $((total - detectes)) NON détectées"
fi
echo "-----------------------------------------"

[ "$detectes" -eq "$total" ]
