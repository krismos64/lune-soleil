#!/bin/bash
# Vérifie que la règle C37 est appliquée : une Server Action d'administration
# qui modifie une donnée lue par le layout passe `"layout"` à `revalidatePath`.
#
# Motif. `revalidatePath(chemin)` invalide la PAGE seule. Le layout de
# l'administration lit NEUF comptages par `lireComptages` : trois sur le statut
# des commandes, deux sur les variantes, un sur les expéditions, un sur les
# messages, un sur les rétractations, et l'encaissé du jour. Une action qui
# change l'une de ces données sans passer `"layout"` rafraîchit l'écran pendant
# que la barre garde son ancien nombre.
#
# POURQUOI CE CONTRÔLE EXISTE, ET POURQUOI IL ARRIVE APRÈS LA RÈGLE. LS-201 a
# posé C37 le 7 septembre 2026 et corrigé SIX appels, sur les messages et les
# stocks. Elle n'a couvert que deux domaines sur cinq : ONZE appels restaient en
# violation sur les commandes, les expéditions, les rétractations et les
# variantes, et personne ne l'a vu pendant que la règle était écrite.
#
# C'est le motif connu de ce dépôt, une règle écrite et non vérifiée ne tient
# pas. La règle était juste, sa portée réelle n'avait jamais été mesurée.
#
# CE QU'IL VÉRIFIE, DANS LES DEUX SENS :
#
#   1. tout fichier d'action qui touche un domaine compté par le layout porte
#      au moins un `revalidatePath(..., "layout")`
#   2. la règle C37 est toujours écrite dans `frontend-design.md`, sans quoi le
#      contrôle protégerait une règle que plus rien n'énonce
#
# CE QU'IL NE PEUT PAS FAIRE, dit ici plutôt que laissé croire. Il raisonne par
# FICHIER et non par fonction : un fichier qui porte un appel correct et un
# appel oublié passe. Savoir quelle fonction modifie quel comptage demanderait
# de suivre les appels jusqu'au SQL, ce qu'un contrôle textuel ne fait pas. Il
# attrape le domaine entièrement oublié, ce qui est précisément ce qui s'est
# produit ici : quatre domaines sur cinq n'avaient AUCUN appel avec `"layout"`.
#
# LE MOTIF EST `revalidatePath(.*"layout"` ET NON `[^)]*`. Un argument peut
# lui-meme etre un appel, `revalidatePath(chemin(produitId), "layout")` : une
# classe qui exclut la parenthese fermante s'arrete a celle de `chemin(...)` et
# ne voit jamais l'option. Mesure sur ce depot, le controle accusait un fichier
# parfaitement correct a sa premiere execution.
#
# Usage : ./scripts/verifier-revalidation-layout.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$RACINE/src/app/administration"
REGLE="$RACINE/.claude/rules/frontend-design.md"
ko=0

[ -d "$SOURCE" ] || {
  echo "ECHEC dossier d'administration introuvable : $SOURCE"
  exit 1
}
[ -r "$REGLE" ] || {
  echo "ECHEC règle de conception illisible : $REGLE"
  exit 1
}

echo "Revalidation du layout, règle C37"
echo

# ---------------------------------------------------------------------------
# Sens 1 : les domaines comptés par le layout portent un appel avec `"layout"`.
#
# LA LISTE EST DÉRIVÉE DE `lireComptages`, ET NON ÉCRITE À L'INSTINCT. Chaque
# entrée dit quel comptage de la barre dépend de ce domaine. Un domaine qui
# cesserait d'être compté sort de cette liste avec sa raison.
# ---------------------------------------------------------------------------
DOMAINES=(
  "commandes:commandesAPreparer, commandesPretesAExpedier, commandesEnCours"
  "expeditions:expeditionsEnTransit"
  "retractations:retractationsEnCours"
  "messages:messagesNonLus"
  "stocks:variantesStockFaible, variantesIndisponibles"
)

for entree in "${DOMAINES[@]}"; do
  domaine="${entree%%:*}"
  comptages="${entree#*:}"
  fichier="$SOURCE/$domaine/actions.ts"

  if [ ! -r "$fichier" ]; then
    echo "  ECHEC $domaine/actions.ts est illisible ou a été déplacé"
    echo "        Le contrôle ne peut rien prouver sur ce domaine : soit le"
    echo "        fichier a bougé, soit cette liste est périmée."
    ko=1
    continue
  fi

  if grep -q 'revalidatePath(.*"layout"' "$fichier"; then
    echo "  OK    $domaine, $comptages"
  else
    echo "  ECHEC $domaine/actions.ts ne porte AUCUN revalidatePath avec « layout »"
    echo "        Ce domaine alimente : $comptages"
    echo "        L'écran se rafraîchira pendant que la barre gardera son"
    echo "        ancien nombre, règle C37."
    ko=1
  fi
done

# Le stock des variantes vit aussi sous `produits/`, l'éditeur écrivant
# `quantitePhysique` et `archiveeA` sans passer par l'écran Stocks.
VARIANTES="$SOURCE/produits/[id]/actions-variantes.ts"
if [ -r "$VARIANTES" ]; then
  if grep -q 'revalidatePath(.*"layout"' "$VARIANTES"; then
    echo "  OK    produits/actions-variantes, variantesStockFaible, variantesIndisponibles"
  else
    echo "  ECHEC produits/[id]/actions-variantes.ts ne porte aucun « layout »"
    echo "        Créer, modifier ou archiver une variante écrit quantitePhysique"
    echo "        ou archiveeA, les colonnes que les deux comptages filtrent."
    ko=1
  fi
else
  echo "  ECHEC produits/[id]/actions-variantes.ts est illisible ou déplacé"
  ko=1
fi

# ---------------------------------------------------------------------------
# Sens 2 : la règle est toujours écrite, avec son mécanisme.
# ---------------------------------------------------------------------------
echo
if grep -q "C37" "$REGLE" && grep -q '"layout"' "$REGLE"; then
  echo "  OK    frontend-design.md énonce toujours la règle C37"
else
  echo "  ECHEC frontend-design.md n'énonce plus C37, ou ne nomme plus l'option"
  echo "        « layout ». Un contrôle qui applique une règle qu'aucun document"
  echo "        ne porte laisse la session suivante l'ignorer de bonne foi."
  ko=1
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  revalidation du layout conforme"
  echo "-----------------------------------------"
  exit 0
fi
echo "  ECHEC revalidation du layout"
echo "-----------------------------------------"
exit 1
