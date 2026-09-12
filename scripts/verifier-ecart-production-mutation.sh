#!/usr/bin/env bash
# Preuve par mutation du contrôle d'écart de production, LS-220.
#
# MOTIF. `CLAUDE.md` l'exige : « un contrôle qui n'a jamais échoué sur le défaut
# qu'il prétend attraper n'est pas un contrôle ». Les quatre sens de
# `verifier-ecart-production.sh` sont verts sur un dépôt sain, ce qui ne prouve
# rien tant qu'ils n'ont pas rougi.
#
# CE QUI EST MUTÉ EST LE WORKFLOW, jamais le contrôle. Muter le contrôle
# prouverait que le contrôle se casse, ce qui n'intéresse personne : ce qui doit
# être gardé est que le WORKFLOW continue de mesurer ce qu'il annonce.
#
# LES MUTATIONS PORTENT SUR LES FORMES RÉELLEMENT PRÉSENTES dans le fichier,
# jamais sur celle qui serait la plus commode à écrire dans un `sed`. C'est la
# leçon de `verifier-graphie-marque.sh`, prouvé par quatre mutations réussies
# pendant qu'il laissait passer quatre défauts réels du dépôt.
#
# LA DERNIÈRE MUTATION GARDE LE CONTRÔLE CONTRE LUI-MÊME : un workflow
# introuvable doit le faire échouer franchement, sans quoi un ancrage cassé
# rendrait un OK silencieux sur zéro fichier examiné.
#
# Usage : ./scripts/verifier-ecart-production-mutation.sh
# Prérequis : un dépôt git avec son historique. Ni Docker, ni base, ni réseau.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

WORKFLOW=".github/workflows/ecart-production.yml"
CONTROLE="./scripts/verifier-ecart-production.sh"

[ -r "$WORKFLOW" ] || { echo "ECHEC workflow introuvable : $WORKFLOW"; exit 1; }
[ -x "$CONTROLE" ] || { echo "ECHEC contrôle introuvable : $CONTROLE"; exit 1; }

TMP=$(mktemp -d)
SAUVEGARDE="$TMP/workflow.yml"
cp "$WORKFLOW" "$SAUVEGARDE"

restaurer() { cp "$SAUVEGARDE" "$WORKFLOW"; }
nettoyer() { restaurer; rm -rf "$TMP"; }
trap nettoyer EXIT

echecs=0
mutations=0

# ---------------------------------------------------------------------------
# Contrôle préalable : le contrôle doit être VERT avant toute mutation.
#
# Sans cette vérification, un script qui échoue pour une autre raison afficherait
# « toutes les mutations détectées » alors qu'aucune n'a rien prouvé. C'est le
# défaut exact corrigé par LS-42 sur le script de migration, un mode fail-open
# qui concluait au vert.
# ---------------------------------------------------------------------------
if ! "$CONTROLE" >"$TMP/reference.txt" 2>&1; then
  echo "ECHEC le contrôle n'est pas vert AVANT mutation."
  echo "      Aucune mutation ne peut rien prouver dans cet état."
  echo
  sed 's/^/      /' "$TMP/reference.txt"
  exit 1
fi

echo "Etat de reference : le contrôle est vert"
echo

# ---------------------------------------------------------------------------
# `mute` refuse une substitution qui ne change RIEN.
#
# POURQUOI CE GARDE-FOU EXISTE. Une expression qui ne correspond plus au fichier
# ne mute rien, le contrôle reste vert, et le script conclut « NON détecté, le
# contrôle est aveugle » sur un contrôle parfaitement voyant. Le sens de l'échec
# serait INVERSÉ, ce qui est pire qu'une absence de contrôle : il accuserait un
# innocent, et la correction évidente serait de réécrire un contrôle qui n'a
# rien. Le cas s'est produit trois fois sur ce dépôt.
# ---------------------------------------------------------------------------
mute() {
  local expression="$1"
  local avant

  avant=$(cksum <"$WORKFLOW")
  perl -0pi -e "$expression" "$WORKFLOW"

  if [ "$(cksum <"$WORKFLOW")" = "$avant" ]; then
    echo "  ECHEC la mutation n'a modifié aucun caractère du workflow"
    echo "        L'expression ne correspond plus au fichier : corriger ce"
    echo "        script, pas le contrôle."
    echo "        expression : $expression"
    exit 1
  fi
}

cas() {
  local nom="$1" motif_attendu="$2"
  mutations=$((mutations + 1))

  if "$CONTROLE" >"$TMP/sortie.txt" 2>&1; then
    echo "  RATE  $nom -> NON détecté, le contrôle est aveugle"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  if grep -qF "$motif_attendu" "$TMP/sortie.txt"; then
    echo "  OK    $nom -> détecté, et par le sens attendu"
  else
    echo "  RATE  $nom -> échec constaté, mais PAS sur le sens attendu"
    echo "          attendu : $motif_attendu"
    grep "ECHEC" "$TMP/sortie.txt" | head -3 | sed 's/^/            /'
    echecs=$((echecs + 1))
  fi

  restaurer
}

# ---------------------------------------------------------------------------
# Cas 1 : LE COMPTAGE DES MIGRATIONS DISPARAÎT.
#
# L'ÉTAT D'AVANT LS-220, remis tel quel : sans ce filtre, rien ne distingue un
# commit de documentation d'une migration non appliquée. Le workflow ouvrirait
# alors une issue chaque nuit, et le bruit ferait ignorer celle qui compte,
# c'est-à-dire exactement le signal que ce ticket existe pour produire.
# ---------------------------------------------------------------------------
mute "s{-- 'prisma/migrations/\\*/migration\\.sql'}{-- 'prisma/schema.prisma'}"
cas "filtre sur les migrations remplacé par le schéma" \
  "le workflow ne porte plus"

# ---------------------------------------------------------------------------
# Cas 2 : LA GARDE SUR UN SHA INCONNU DISPARAÎT.
#
# CE CAS PORTE LE CRITÈRE 4, et c'est le plus grave des trois. `git cat-file -e`
# est ce qui distingue « la production est à jour » de « je ne sais pas ce que
# la production sert ». Sans lui, un SHA inconnu tombe dans le calcul d'écart,
# `git rev-list` rend vide, et le workflow conclurait sur une valeur qui ne veut
# rien dire au lieu de dire qu'il n'a pas pu conclure.
# ---------------------------------------------------------------------------
mute "s{if ! git cat-file -e}{if false \\&\\& ! git cat-file -e}"
cas "garde sur un SHA inconnu neutralisée" \
  "la garde sur un SHA inconnu n'est plus une condition active"

# ---------------------------------------------------------------------------
# Cas 3 : L'ÉTIQUETTE N'EST PLUS CRÉÉE AVANT D'ÊTRE POSÉE.
#
# LE DÉFAUT EXACT DE LS-199, et il a rendu un garde-fou muet DEUX NUITS.
# `gh issue create --label` échoue si l'étiquette n'existe pas, et l'étape
# entière tombe : le mécanisme censé rendre un écart visible serait lui-même
# invisible. Une étiquette vit dans les RÉGLAGES du dépôt et non dans le dépôt,
# donc la créer à la main ne survit ni à un clone ni à un dépôt recréé.
# ---------------------------------------------------------------------------
mute "s{gh label create ecart-production}{true ecart-production-desactive}"
cas "création de l'étiquette retirée" \
  "le workflow ne porte plus"

# ---------------------------------------------------------------------------
# Cas 4 : LE CONTRÔLE GARDÉ CONTRE SON PROPRE ANCRAGE.
#
# UN CONTRÔLE QUI NE TROUVE PLUS RIEN À EXAMINER DOIT ÉCHOUER, jamais rendre un
# OK silencieux. Le dépôt a déjà connu ce cas : `verifier-tests-mutation.sh`
# visait un fichier déplacé par LS-122 et s'arrêtait avant la première mutation,
# inopérant sans que personne le voie, son échec ressemblant à celui d'une
# mutation ratée.
#
# LE WORKFLOW EST DÉPLACÉ ET NON VIDÉ : un fichier vide resterait lisible, et le
# contrôle rougirait sur ses quatre motifs absents plutôt que sur l'ancrage.
# ---------------------------------------------------------------------------
mutations=$((mutations + 1))
mv "$WORKFLOW" "$TMP/deplace.yml"

if "$CONTROLE" >"$TMP/sortie.txt" 2>&1; then
  echo "  RATE  workflow introuvable -> le contrôle rend un OK silencieux"
  echecs=$((echecs + 1))
elif grep -qF "workflow introuvable" "$TMP/sortie.txt"; then
  echo "  OK    workflow introuvable -> détecté, le contrôle refuse de conclure"
else
  echo "  RATE  workflow introuvable -> échec constaté, mais sans le dire"
  echecs=$((echecs + 1))
fi

mv "$TMP/deplace.yml" "$WORKFLOW"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations détectées"
else
  echo "  $mutations mutations, $echecs NON détectées"
fi
echo "-----------------------------------------"

exit "$echecs"
