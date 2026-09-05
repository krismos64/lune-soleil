#!/bin/bash
# Preuve par mutation de `verifier-loading-et-404.sh`, LS-146.
#
# Motif. Ce contrôle cherche une ABSENCE, celle d'un `loading.tsx` fautif. Son
# vert est donc indistinguable de celui d'un script qui ne regarde rien, tant
# qu'un fichier fautif ne l'a pas fait rougir.
#
# LE CAS 1 EST LE GESTE RÉEL. `frontend-design.md` exige un état de chargement,
# LS-104 en a posé un sur le catalogue, et l'ajouter sur la fiche produit paraît
# être une amélioration. C'est exactement ainsi que le défaut entrerait.
#
# Usage : ./scripts/verifier-loading-et-404-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-loading-et-404.sh"
FICHE="src/app/(boutique)/produit/[slug]"
# Le segment PARENT de la fiche, cible du cas 3.
PARENT_FICHE="src/app/(boutique)/produit"
NOT_FOUND="src/app/not-found.tsx"

detectes=0
total=0

# Les cas 2 et 3 DÉPLACENT un fichier suivi plutôt que de le supprimer : une
# suppression réelle laisserait le dépôt amputé si le script était interrompu,
# et la restauration par copie ne dépend d'aucun état d'indexation.
SAUVEGARDE="$(mktemp -d)"

restaurer() {
  rm -f "$FICHE/loading.tsx"
  rm -f "$PARENT_FICHE/loading.tsx"
  [ -r "$SAUVEGARDE/not-found" ] && cp "$SAUVEGARDE/not-found" "$NOT_FOUND"
}

nettoyer() {
  restaurer
  rm -rf "$SAUVEGARDE"
}

[ -r "$NOT_FOUND" ] || { echo "ECHEC fichier illisible : $NOT_FOUND"; exit 1; }
cp "$NOT_FOUND" "$SAUVEGARDE/not-found"
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

echo "État de référence, avant toute mutation"
if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "  ECHEC le contrôle n'est pas vert AVANT mutation."
  exit 1
fi
echo "  OK    le contrôle est vert, les mutations peuvent commencer"
echo

# ---------------------------------------------------------------------------
# Cas 1 : un état de chargement posé sur la fiche produit.
#
# LE DÉFAUT RÉEL, et il entrerait par une bonne intention. Le fichier est
# parfaitement correct en lui-même : c'est sa PRÉSENCE sur ce segment qui fait
# tomber le 404 à 200.
# ---------------------------------------------------------------------------
cat > "$FICHE/loading.tsx" <<'FIN'
export default function ChargementFiche() {
  return <p>Chargement de la fiche…</p>;
}
FIN
attendre_echec "loading.tsx posé sur une route qui appelle notFound()"

# ---------------------------------------------------------------------------
# Cas 2 : la page 404 disparaît.
#
# SANS CE CAS, LE SECOND SENS SERAIT DÉCORATIF. Le contrôle resterait vert sur
# un dépôt d'où `not-found.tsx` aurait été retiré : il ne distinguerait pas
# « aucune route fautive » de « plus rien à protéger », qui est l'état d'AVANT
# cette story.
# ---------------------------------------------------------------------------
rm -f "$NOT_FOUND"
attendre_echec "page 404 racine supprimée"

# ---------------------------------------------------------------------------
# Cas 3 : le `loading.tsx` est posé sur un segment PARENT.
#
# LE DÉFAUT QUE CE CONTRÔLE A LAISSÉ PASSER, mesuré le 5 septembre 2026 pendant
# LS-188. Un `loading.tsx` couvre TOUT son sous-arbre, pas seulement sa propre
# page : posé sur `administration/`, il a fait passer en 200 les 404 de
# `produits/[id]` et `commandes/[id]`, deux dossiers plus bas.
#
# LE CONTRÔLE EST RESTÉ VERT parce qu'il ne comparait que des fichiers VOISINS,
# `loading.tsx` et `page.tsx` du même dossier. Sans ce cas, l'élargissement qui
# le corrige ne serait prouvé par rien, et rien n'empêcherait de le rétrécir à
# nouveau.
#
# LA CIBLE EST LA FICHE PUBLIQUE et non un écran d'administration : elle est
# déjà celle des deux autres cas, et le défaut ne tient pas au dossier mais à la
# distance entre la frontière et l'appel.
# ---------------------------------------------------------------------------
cat > "$PARENT_FICHE/loading.tsx" <<'FIN'
export default function ChargementProduit() {
  return <p>Chargement…</p>;
}
FIN
attendre_echec "loading.tsx posé sur un segment PARENT de la route à notFound()"

echo
echo "-----------------------------------------"
if [ "$detectes" -eq "$total" ]; then
  echo "  $total mutations, $total détectées"
else
  echo "  $total mutations, $((total - detectes)) NON détectées"
fi
echo "-----------------------------------------"

[ "$detectes" -eq "$total" ]
