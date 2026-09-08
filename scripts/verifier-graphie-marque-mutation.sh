#!/usr/bin/env bash
# Prouve `verifier-graphie-marque.sh` par mutation, LS-193.
#
# UN CONTRÔLE QUI N'A JAMAIS ÉCHOUÉ SUR LE DÉFAUT QU'IL PRÉTEND ATTRAPER N'EST
# PAS UN CONTRÔLE. Ce script pose des défauts réels, vérifie que le contrôle les
# voit, et restaure le dépôt dans tous les cas.
#
# QUATRE SENS : les deux du contrôle, plus deux qui le gardent contre lui-même.
# Le quatrième est le plus important, il vise le mode de défaillance que la story
# a rencontré sur un contrôle voisin : rester VERT en ayant cessé de voir.
#
# Usage : ./scripts/verifier-graphie-marque-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-graphie-marque.sh"
ko=0

MUTABLES=(
  "src/lib/seo.ts"
  "src/components/pied-boutique.tsx"
)

for fichier in "${MUTABLES[@]}"; do
  if ! git ls-files --error-unmatch "$fichier" >/dev/null 2>&1; then
    echo "ÉCHEC : $fichier n'est pas suivi par git, la restauration serait impossible."
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# LES FICHIERS À MUTER NE DOIVENT PORTER AUCUNE MODIFICATION NON COMMITÉE.
#
# La restauration passe par `git checkout`, qui écraserait un travail en cours.
# Le cas s'est produit sur ce dépôt, et il s'est reproduit pendant LS-193 même :
# une preuve voisine a effacé deux fichiers que je venais de corriger.
# ---------------------------------------------------------------------------
if ! git diff --quiet -- "${MUTABLES[@]}" "$CONTROLE"; then
  echo "ÉCHEC : des modifications non commitées portent sur les fichiers à muter."
  echo "        Les commiter ou les remiser avant de lancer cette preuve."
  exit 1
fi

restaurer() {
  git checkout -- "${MUTABLES[@]}" "$CONTROLE" 2>/dev/null
}
trap restaurer EXIT

if ! $CONTROLE >/dev/null 2>&1; then
  echo "ÉCHEC : le contrôle est déjà rouge avant toute mutation."
  $CONTROLE
  exit 1
fi

essayer() {
  local intitule="$1"
  local attendu="$2"

  if $CONTROLE >/dev/null 2>&1; then
    obtenu="vert"
  else
    obtenu="rouge"
  fi

  if [ "$obtenu" = "$attendu" ]; then
    echo "  OK    $intitule : $obtenu, comme attendu"
  else
    echo "  ÉCHEC $intitule : $obtenu, attendu $attendu"
    ko=1
  fi

  restaurer
}

echo "Mutations de verifier-graphie-marque.sh"
echo

# --- 1. L'ancienne graphie revient dans du code ----------------------------
perl -0pi -e 's/\{`© \$\{new Date\(\)\.getFullYear\(\)\} \$\{NOM_BOUTIQUE\}`\}/{`© ${new Date().getFullYear()} Lune \& Soleil`}/' \
  "src/components/pied-boutique.tsx"
essayer "ancienne graphie réintroduite dans le pied de page" "rouge"

# --- 2. Le nom est recopié en dur au lieu d'être dérivé --------------------
# Le défaut le plus insidieux : la graphie est JUSTE, mais la valeur est
# dupliquée. Le prochain changement rouvrirait alors le même écart.
perl -0pi -e 's/\$\{NOM_BOUTIQUE\}`\}/Lune-soleil`}/' \
  "src/components/pied-boutique.tsx"
essayer "nom recopié en dur au lieu d'être dérivé" "rouge"

# --- 3. La constante disparaît ---------------------------------------------
# Le contrôle lit la graphie DANS le code : si la constante est renommée ou
# supprimée, il ne doit pas conclure « tout va bien » sur une lecture vide.
perl -0pi -e 's/export const NOM_BOUTIQUE = "Lune-soleil";/export const NOM_MARQUE = "Lune-soleil";/' \
  "src/lib/seo.ts"
essayer "constante renommée, le contrôle ne peut plus lire la référence" "rouge"

# --- 4. Le contrôle cesse de voir, en restant vert -------------------------
# C'EST LE MODE DE DÉFAILLANCE QUE LA STORY A RENCONTRÉ. `verifier-seo.sh`
# cherchait l'ancienne graphie en dur : au changement de graphie il est devenu
# aveugle EN RESTANT VERT, ce que rien n'annonce.
#
# Ici, vider la liste des fichiers examinés doit faire échouer le garde-fou de
# cardinalité, jamais rendre un OK silencieux.
perl -0pi -e "s{usages=\\\$\\(grep -rl 'NOM_BOUTIQUE' src/}{usages=\\\$(grep -rl 'NOM_INEXISTANT' src/}" \
  "$CONTROLE"

if grep -q "NOM_INEXISTANT" "$CONTROLE"; then
  essayer "le contrôle ne trouve plus aucun usage" "rouge"
else
  echo "  ÉCHEC garde de cardinalité : la substitution n'a pas trouvé sa cible,"
  echo "        le sens 4 ne prouve donc rien. Corriger le motif de ce script."
  ko=1
  restaurer
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK : les quatre mutations sont détectées."
else
  echo "ÉCHEC : au moins une mutation passe inaperçue."
fi

exit "$ko"
