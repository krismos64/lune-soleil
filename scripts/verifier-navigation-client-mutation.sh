#!/bin/bash
# Preuve par mutation de `verifier-navigation-client.sh`, LS-110.
#
# Motif. Ce contrôle rend un OK sur un dépôt où toutes les balises `<a>`
# restantes sont légitimes : son vert est indistinguable de celui d'un script
# dont l'ancrage est cassé, ou qui accepte n'importe quelle dérogation.
#
# LES MUTATIONS PORTENT SUR LES FORMES RÉELLEMENT PRÉSENTES dans ce dépôt, et
# non sur celle qui serait la plus commode à écrire. Le fil d'Ariane de
# l'éditeur de produit est le défaut d'origine de la story, le lien enveloppé
# sur plusieurs lignes est la forme majoritaire du dépôt : un contrôle qui ne
# verrait que la première laisserait passer la seconde.
#
# LE CAS 4 GARDE LE CONTRÔLE CONTRE LUI-MÊME. Un contrôle qui n'a plus rien à
# examiner doit échouer, sans quoi un ancrage cassé rendrait un OK silencieux.
#
# Usage : ./scripts/verifier-navigation-client-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-navigation-client.sh"
EDITEUR="src/app/administration/produits/[id]/page.tsx"
CREATION="src/app/administration/produits/nouveau/formulaire-produit.tsx"
DEROGATION="src/app/global-error.tsx"

detectes=0
total=0

# LA RESTAURATION NE PASSE PAS PAR GIT. `git checkout` est atomique et échoue en
# entier sur un chemin non suivi, ce qui laisserait les fichiers suivis non
# restaurés eux non plus. Motif « git checkout est atomique », en fiche.
SAUVEGARDE="$(mktemp -d)"

sauver() {
  for f in "$EDITEUR" "$CREATION" "$DEROGATION"; do
    mkdir -p "$SAUVEGARDE/$(dirname "$f")"
    cp "$f" "$SAUVEGARDE/$f"
  done
}

restaurer() {
  for f in "$EDITEUR" "$CREATION" "$DEROGATION"; do
    cp "$SAUVEGARDE/$f" "$f"
  done
}

nettoyer() {
  restaurer
  rm -rf "$SAUVEGARDE"
}
trap nettoyer EXIT

sauver

# Joue une mutation et exige que le contrôle la DÉTECTE.
#
# Le message attendu est vérifié, et pas seulement le code de sortie : un
# contrôle qui rougit pour une autre raison que celle visée ferait corriger la
# mauvaise chose. Motif « mutation vue par le mauvais test », en fiche.
jouer() {
  local titre="$1" attendu="$2"
  total=$((total + 1))

  local sortie
  sortie=$("$CONTROLE" 2>&1)
  local code=$?

  if [ "$code" -eq 0 ]; then
    echo "NON DETECTE  $titre"
    echo "             le contrôle est resté vert sur le défaut qu'il vise"
    restaurer
    return
  fi

  if ! printf '%s' "$sortie" | grep -q "$attendu"; then
    echo "MAUVAISE CAUSE  $titre"
    echo "                rouge, mais sans annoncer : $attendu"
    printf '%s\n' "$sortie" | head -4
    restaurer
    return
  fi

  echo "detecte  $titre"
  detectes=$((detectes + 1))
  restaurer
}

echo "Preuve par mutation de verifier-navigation-client.sh"
echo

# ---------------------------------------------------------------------------
# 1. LE DÉFAUT D'ORIGINE DE LA STORY, le fil d'Ariane.
#
# LE MOTIF NE CITE PLUS LA FORME COMPLÈTE DE LA BALISE, LS-213. Il ciblait
# `<Link href="..." >Catalogue</Link>` sur une seule ligne ; l'ajout de
# `prefetch={false}` a réparti la balise sur trois lignes et la substitution a
# cessé de trouver sa cible, SANS RIEN DIRE. Le script annonçait alors « non
# détecté » et accusait le contrôle, quand c'était la mutation qui n'avait rien
# muté. Motif « correction échouée en silence », déjà connu du dépôt.
#
# Il vise donc la balise ouvrante et la fermeture séparément, formes stables
# quel que soit le nombre d'attributs.
# ---------------------------------------------------------------------------
perl -0pi -e 's{<Link href="/administration/categories" prefetch=\{false\}>\n\s+Catalogue\n\s+</Link>}{<a href="/administration/categories">Catalogue</a>}s' "$EDITEUR"
jouer "fil d'Ariane en balise native" "page.tsx"

# ---------------------------------------------------------------------------
# 2. LA MÊME FAUTE SUR L'AUTRE ÉCRAN, forme au fil du texte.
# ---------------------------------------------------------------------------
perl -0pi -e 's{<Link href="/administration/categories" prefetch=\{false\}>}{<a href="/administration/categories">}s; s{gérer les catégories\n\s+</Link>}{gérer les catégories</a>}s' "$CREATION"
jouer "renvoi vers les catégories en balise native" "formulaire-produit.tsx"

# ---------------------------------------------------------------------------
# 3. LE LIEN ENVELOPPÉ SUR PLUSIEURS LIGNES, forme majoritaire du dépôt.
#
# CELUI-CI EST LE PLUS UTILE DES QUATRE. Un contrôle qui lirait la seule ligne
# de la balise ouvrante ne trouverait aucun `href` et passerait son chemin, en
# restant vert sur un vrai défaut. C'est la raison du `sed` sur quatre lignes
# dans le contrôle, et cette mutation est ce qui le prouve.
# ---------------------------------------------------------------------------
perl -0pi -e 's{<Link href="/administration/categories" prefetch=\{false\}>\n\s+Catalogue\n\s+</Link>}{<a\n          href="/administration/categories"\n        >Catalogue</a>}s' "$EDITEUR"
jouer "lien interne enveloppé sur plusieurs lignes" "page.tsx"

# ---------------------------------------------------------------------------
# 4. LE CONTRÔLE CONTRE LUI-MÊME : plus rien à examiner.
#
# Retirer le marqueur ne suffirait pas, cela ferait rougir par la branche
# ordinaire. Ce qu'il faut éprouver est le PLANCHER : si toutes les navigations
# internes disparaissaient, un contrôle sans dénominateur resterait vert en
# n'ayant plus rien à vérifier.
#
# La mutation vide donc l'inventaire en changeant le motif de recherche du
# contrôle lui-même, ce qui simule un ancrage cassé par un futur remaniement.
# ---------------------------------------------------------------------------
total=$((total + 1))
TMP_CONTROLE="$(mktemp)"
cp "$CONTROLE" "$TMP_CONTROLE"
perl -0pi -e 's{--include="\*\.tsx"}{--include="*.aucune-extension-reelle"}' "$CONTROLE"
sortie=$("$CONTROLE" 2>&1)
code=$?
cp "$TMP_CONTROLE" "$CONTROLE"
rm -f "$TMP_CONTROLE"
chmod +x "$CONTROLE"

if [ "$code" -ne 0 ] && printf '%s' "$sortie" | grep -q "ancrage"; then
  echo "detecte  ancrage cassé, le contrôle refuse de rendre un OK à vide"
  detectes=$((detectes + 1))
else
  echo "NON DETECTE  ancrage cassé"
  echo "             le contrôle rend un OK alors qu'il n'examine plus rien :"
  echo "             c'est exactement le garde-fou muet qu'il prétend remplacer"
fi

# ---------------------------------------------------------------------------
# LE VERT DE RÉFÉRENCE. Après restauration, le contrôle doit être vert : sans
# cette vérification, un script qui échouerait TOUJOURS marquerait quatre
# détections sur quatre en ne prouvant rien. Motif « mutation trop brutale ».
# ---------------------------------------------------------------------------
restaurer
echo
if "$CONTROLE" >/dev/null 2>&1; then
  echo "vert de référence retrouvé après restauration"
else
  echo "ECHEC le contrôle est rouge sur le dépôt restauré"
  echo "      les détections ci-dessus ne prouvent rien, un contrôle toujours"
  echo "      rouge détecte tout sans rien vérifier."
  exit 1
fi

echo
echo "Mutations détectées : $detectes sur $total"

if [ "$detectes" -eq "$total" ]; then
  echo "OK le contrôle attrape le défaut qu'il prétend attraper"
  exit 0
fi

echo "ECHEC $((total - detectes)) mutation(s) non détectée(s)"
exit 1
