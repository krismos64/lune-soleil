#!/usr/bin/env bash
# Prouve `verifier-prefetch-administration.sh` par mutation, LS-166.
#
# UN CONTRÔLE QUI N'A JAMAIS ÉCHOUÉ SUR LE DÉFAUT QU'IL PRÉTEND ATTRAPER N'EST
# PAS UN CONTRÔLE. Ce script pose des défauts réels, vérifie que le contrôle les
# voit, et restaure le dépôt dans tous les cas.
#
# QUATRE SENS, ET NON UN SEUL. Les deux premiers sont le défaut lui-même sur les
# deux emplacements gardés, le troisième garde le contrôle contre son propre
# angle mort d'ancrage, le quatrième contre ses faux positifs.
#
# LE QUATRIÈME SENS EXISTE PARCE QUE LE DÉFAUT S'EST PRODUIT. La première
# version du parseur s'arrêtait au premier `>`, sans sauter les commentaires :
# `error.tsx` écrit « `<Link>` ET NON UN `<a>` NU » dans le commentaire qui
# précède son lien, et le contrôle rendait DEUX faux positifs sur des balises
# parfaitement conformes. Un contrôle qui crie au loup finit désactivé.
#
# Usage : ./scripts/verifier-prefetch-administration-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-prefetch-administration.sh"
ko=0

# ---------------------------------------------------------------------------
# LA RESTAURATION PASSE PAR `git checkout`, ET ELLE EST ATOMIQUE : un chemin non
# suivi ferait échouer la commande ENTIÈRE et laisserait les autres fichiers
# mutés. Les cibles sont donc toutes suivies, et vérifiées comme telles avant de
# muter quoi que ce soit.
# ---------------------------------------------------------------------------
MUTABLES=(
  "src/app/administration/messages/page.tsx"
  "src/components/navigation-administration.tsx"
  "src/app/administration/error.tsx"
)

for fichier in "${MUTABLES[@]}"; do
  if ! git ls-files --error-unmatch "$fichier" >/dev/null 2>&1; then
    echo "ÉCHEC : $fichier n'est pas suivi par git, la restauration serait impossible."
    exit 1
  fi
done

restaurer() {
  git checkout -- "${MUTABLES[@]}" "$CONTROLE" 2>/dev/null
}
trap restaurer EXIT

# ---------------------------------------------------------------------------
# LE CONTRÔLE DOIT ÊTRE VERT AVANT DE COMMENCER, sans quoi chaque « échec
# attendu » serait obtenu pour la mauvaise raison et le script conclurait à tort
# que la mutation est détectée.
# ---------------------------------------------------------------------------
if ! $CONTROLE >/dev/null 2>&1; then
  echo "ÉCHEC : le contrôle est déjà rouge avant toute mutation."
  $CONTROLE
  exit 1
fi

essayer() {
  local intitule="$1"
  local attendu="$2" # "rouge" ou "vert"

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

echo "Mutations de verifier-prefetch-administration.sh"
echo

# --- 1. Le défaut sur une page de route -----------------------------------
perl -0pi -e 's/(<Link\s+href="\/administration\/commandes"\s+className=\{styles\.retour\})\s+prefetch=\{false\}/$1/' \
  "src/app/administration/messages/page.tsx"
essayer "prefetch retiré d'une page de route" "rouge"

# --- 2. Le défaut sur la barre latérale, hors du dossier des routes --------
perl -0pi -e 's/\n\s+prefetch=\{false\}\n(\s+\/\*\n\s+\* `aria-current="page"`)/\n$1/' \
  "src/components/navigation-administration.tsx"
essayer "prefetch retiré de la barre latérale" "rouge"

# --- 3. L'ancrage du contrôle, réduit à un sous-dossier --------------------
# Un ancrage trop étroit laisserait la majorité des liens hors de portée en
# restant vert : le garde-fou de cardinalité doit le refuser.
perl -0pi -e 's|"\$RACINE/src/app/administration"|"\$RACINE/src/app/administration/messages"|' \
  "$CONTROLE"
essayer "ancrage réduit à un seul sous-dossier" "rouge"

# --- 4. Le faux positif du commentaire ------------------------------------
# Le parseur doit sauter les commentaires : sans cela il prend « <Link> » écrit
# dans une explication pour une balise réelle. Retirer le saut doit faire crier
# le contrôle sur un dépôt pourtant conforme, ce qui est un défaut du contrôle.
perl -0pi -e 's/    if \(texte\.startsWith\("\/\*", i\)\) \{\n      const fin = texte\.indexOf\("\*\/", i \+ 2\);\n      if \(fin === -1\) break;\n      i = fin \+ 1;\n      continue;\n    \}\n\n//' \
  "$CONTROLE"

if grep -q 'startsWith("/\*", i)' "$CONTROLE"; then
  echo "  ÉCHEC saut des commentaires : la substitution n'a pas trouvé sa cible,"
  echo "        le sens 4 ne prouve donc rien. Corriger le motif de ce script."
  ko=1
  restaurer
else
  essayer "saut des commentaires retiré du parseur" "rouge"
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK : les quatre mutations sont détectées."
else
  echo "ÉCHEC : au moins une mutation passe inaperçue."
fi

exit "$ko"
