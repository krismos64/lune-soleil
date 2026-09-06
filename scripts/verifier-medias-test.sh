#!/bin/bash
# Confronte les constantes recopiées de `engendrer-medias-test.mjs` à leurs
# sources, LS-187.
#
# POURQUOI CE SCRIPT RECOPIE, ET POURQUOI CE CONTRÔLE EXISTE. Le générateur
# tourne AVANT `next build`, hors du contexte de Playwright et de ses alias de
# module : il ne peut importer ni `tests/e2e/chemin-session.ts` pour les chemins,
# ni `src/integrations/medias/declinaisons.ts` pour les largeurs et formats. Il
# les recopie donc, ce qui crée deux sources de vérité.
#
# DEUX SOURCES DE VÉRITÉ NE RESTENT ÉGALES QUE SI QUELQUE CHOSE LES COMPARE.
# Sans ce contrôle, ajouter un média de test ou une largeur à ADR-007 laisserait
# le générateur produire l'ancien jeu de fichiers : les URL construites par le
# code pointeraient des fichiers absents, et le test des sept URL rougirait en
# accusant le code. C'est exactement le motif que LS-187 corrige, déplacé d'un
# cran.
#
# TROIS COMPARAISONS :
#
#   1. les chemins de média, contre `tests/e2e/chemin-session.ts`
#   2. les largeurs servies, contre `declinaisons.ts`
#   3. les formats par largeur, contre `declinaisons.ts`
#
# Usage : ./scripts/verifier-medias-test.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
GENERATEUR="$RACINE/scripts/engendrer-medias-test.mjs"
FIXTURE="$RACINE/tests/e2e/chemin-session.ts"
DECLINAISONS="$RACINE/src/integrations/medias/declinaisons.ts"
ko=0

for fichier in "$GENERATEUR" "$FIXTURE" "$DECLINAISONS"; do
  [ -r "$fichier" ] || { echo "ECHEC fichier illisible : $fichier"; exit 1; }
done

# ---------------------------------------------------------------------------
# 1. Les chemins de média.
#
# CÔTÉ FIXTURE, ils se lisent sur les proprietes `chemin:` des médias de test.
# L'ancrage exclut les autres `chemin`, la fixture n'en portant pas d'autre à ce
# jour mais rien ne l'interdisant : le motif exige un identifiant `e2e-`.
# ---------------------------------------------------------------------------
chemins_fixture=$(grep -oE 'chemin: "e2e-[A-Za-z0-9_-]+"' "$FIXTURE" \
  | sed 's/chemin: "//; s/"//' | sort -u)

chemins_generateur=$(awk '/^const CHEMINS = \[/,/\];/' "$GENERATEUR" \
  | grep -oE '"e2e-[A-Za-z0-9_-]+"' | tr -d '"' | sort -u)

if [ -z "$chemins_fixture" ] || [ -z "$chemins_generateur" ]; then
  echo "ECHEC aucun chemin de média lu d'un côté ou de l'autre"
  echo "      l'ancrage du contrôle est cassé : une des deux listes a changé"
  echo "      de forme, et la comparaison ne vérifie plus rien."
  exit 1
fi

if [ "$chemins_fixture" != "$chemins_generateur" ]; then
  echo "ECHEC les chemins de média divergent entre la fixture et le générateur"
  echo "      fixture    : $(echo "$chemins_fixture" | tr '\n' ' ')"
  echo "      générateur : $(echo "$chemins_generateur" | tr '\n' ' ')"
  echo "      un média amorcé en base sans fichier sur disque rend 404 sur"
  echo "      toutes ses URL, et le test accuserait le code."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# 2. Les largeurs servies, ADR-007.
# ---------------------------------------------------------------------------
largeurs_source=$(grep -oE 'LARGEURS_SERVIES = \[[0-9, ]+\]' "$DECLINAISONS" \
  | grep -oE '[0-9]+' | sort -n | tr '\n' ' ')

largeurs_generateur=$(grep -oE '^const LARGEURS = \[[0-9, ]+\]' "$GENERATEUR" \
  | grep -oE '[0-9]+' | sort -n | tr '\n' ' ')

if [ -z "$largeurs_source" ] || [ -z "$largeurs_generateur" ]; then
  echo "ECHEC aucune largeur lue d'un côté ou de l'autre"
  echo "      l'ancrage du contrôle est cassé."
  exit 1
fi

if [ "$largeurs_source" != "$largeurs_generateur" ]; then
  echo "ECHEC les largeurs divergent entre ADR-007 et le générateur"
  echo "      declinaisons.ts : $largeurs_source"
  echo "      générateur      : $largeurs_generateur"
  echo "      une largeur ajoutée sans être engendrée fait pointer un srcSet"
  echo "      vers un fichier absent."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# 3. Les formats par largeur.
#
# LE JPEG S'ARRÊTE À 1280 px, et c'est le piège de cette table : une comparaison
# du seul ENSEMBLE des formats resterait verte sur un générateur qui produirait
# un `1920.jpeg` que le traitement ne produit pas. La comparaison porte donc sur
# les couples largeur-format, aplatis et triés.
# ---------------------------------------------------------------------------
extraire_couples() {
  awk '/FORMATS_PAR_LARGEUR/,/^\};/' "$1" \
    | grep -oE '[0-9]+: \[[^]]+\]' \
    | sed 's/: \[/ /; s/\]//; s/"//g; s/,//g' \
    | while read -r largeur formats; do
        for format in $formats; do
          echo "$largeur.$format"
        done
      done | sort
}

couples_source=$(extraire_couples "$DECLINAISONS")
couples_generateur=$(extraire_couples "$GENERATEUR")

if [ -z "$couples_source" ] || [ -z "$couples_generateur" ]; then
  echo "ECHEC aucun couple largeur-format lu d'un côté ou de l'autre"
  echo "      l'ancrage du contrôle est cassé."
  exit 1
fi

if [ "$couples_source" != "$couples_generateur" ]; then
  echo "ECHEC les déclinaisons divergent entre ADR-007 et le générateur"
  echo "      declinaisons.ts : $(echo "$couples_source" | tr '\n' ' ')"
  echo "      générateur      : $(echo "$couples_generateur" | tr '\n' ' ')"
  ko=$((ko + 1))
fi

nb_couples=$(printf '%s\n' "$couples_source" | grep -c .)
nb_chemins=$(printf '%s\n' "$chemins_fixture" | grep -c .)

echo "Médias de test comparés     : $nb_chemins"
echo "Déclinaisons comparées      : $nb_couples"

echo
if [ "$ko" -eq 0 ]; then
  echo "OK le générateur de médias de test est aligné sur ses deux sources"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
