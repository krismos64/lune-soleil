#!/bin/bash
# Preuve par mutation de `verifier-rendu-texte-simple.sh`, LS-100.
#
# Motif. Un contrôle qui n'a jamais échoué sur le défaut qu'il prétend attraper
# n'est pas un contrôle. Celui-ci cherche une ABSENCE : son vert est donc
# indistinguable de celui d'un contrôle qui ne regarde rien, tant qu'aucune
# violation ne l'a fait rougir.
#
# Chaque cas injecte un défaut réel, exige que le contrôle rougisse, puis
# restaure. Un cas qui ne fait pas rougir est un trou dans le contrôle.
#
# Usage : ./scripts/verifier-rendu-texte-simple-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-rendu-texte-simple.sh"
REGLE=".claude/rules/frontend-design.md"
EDITEUR="src/app/administration/produits/[id]/editeur-produit.tsx"
TEMOIN="src/composant-de-test-mutation.tsx"

detectes=0
total=0

# Restaure tout ce que les cas touchent. Appelé après chaque cas ET par le piège
# de sortie : une interruption au milieu laisserait sinon le dépôt muté, et une
# modification jamais indexée n'est récupérable nulle part.
#
# TOUT FICHIER MUTÉ DOIT FIGURER ICI. C'est un défaut déjà rencontré sur ce
# dépôt : une mutation restée sur le disque réintroduit en silence le défaut que
# la story venait de corriger.
# LA RESTAURATION NE PASSE PAS PAR GIT, ET C'EST LE POINT.
#
# `git checkout` ne sait restaurer qu'un fichier SUIVI. Or une story écrit
# toujours des fichiers neufs, et `$EDITEUR` en est un : tant qu'il n'est pas
# indexé, git ne peut rien en faire. Mesuré en écrivant ce script, deux défauts
# à la suite :
#
#   1. `git checkout "$REGLE" "$EDITEUR"` échoue EN ENTIER sur le chemin non
#      suivi, et ne restaure donc pas non plus `$REGLE`, pourtant suivi. La
#      commande est atomique.
#   2. même corrigée fichier par fichier, elle laisse `$EDITEUR` muté : le
#      `dangerouslySetInnerHTML` injecté par le cas 1 est resté sur le disque,
#      c'est-à-dire exactement le défaut de sécurité que ce contrôle existe pour
#      interdire, réintroduit en silence par son propre script de preuve.
#
# La sauvegarde par copie ne dépend d'aucun état d'indexation. C'est la seule
# forme qui tienne quel que soit le moment de la story où le script est lancé.
#
# Motif déjà rencontré ici sous une autre forme, un fichier muté absent de la
# liste des restaurables : le résultat est le même, la mutation survit à
# l'exécution.
SAUVEGARDE="$(mktemp -d)"

sauvegarder() {
  local fichier index=0
  for fichier in "$REGLE" "$EDITEUR"; do
    [ -r "$fichier" ] || { echo "ECHEC fichier illisible : $fichier"; exit 1; }
    cp "$fichier" "$SAUVEGARDE/$index"
    index=$((index + 1))
  done
}

restaurer() {
  local fichier index=0
  for fichier in "$REGLE" "$EDITEUR"; do
    if [ -r "$SAUVEGARDE/$index" ]; then
      cp "$SAUVEGARDE/$index" "$fichier"
    fi
    index=$((index + 1))
  done
  rm -f "$TEMOIN"
}

nettoyer() {
  restaurer
  rm -rf "$SAUVEGARDE"
}

sauvegarder
trap nettoyer EXIT

# Joue un cas : la mutation est déjà faite par l'appelant, lance le contrôle,
# exige un échec.
#
# `$CONTROLE` est appelé SANS pipe vers grep. Le pipe vers `grep -q` renvoie
# toujours le code de grep, ce qui avait fait passer sept mutations pour « non
# détectées » à tort sur ce projet.
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
# sain : il rendrait « NON DETECTE » en accusant le contrôle.
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
  echo "        Aucune mutation ne peut rien prouver dans cet état."
  exit 1
fi
echo "  OK    le contrôle est vert, les mutations peuvent commencer"
echo

# ---------------------------------------------------------------------------
# Cas 1 : la forme React, dans un composant existant.
#
# C'est le geste exact que la règle C23 interdit, et le plus probable : rendre
# le contenu d'une section avec ses sauts de ligne en insérant du balisage.
# ---------------------------------------------------------------------------
muter "$EDITEUR" 's/\{section\.contenu\}/{null}<span dangerouslySetInnerHTML={{ __html: section.contenu }} \/>/'
attendre_echec "rendu HTML brut du contenu, forme React"

# ---------------------------------------------------------------------------
# Cas 2 : l'affectation directe sur un noeud du DOM.
#
# CE CAS EXISTE PARCE QUE LE PREMIER NE SUFFIT PAS. Un contrôle ancré sur le
# seul `dangerouslySetInnerHTML` laisserait passer cette forme, qui produit
# exactement le même effet sans employer l'API React.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
export function Apercu(noeud: HTMLElement, contenu: string) {
  noeud.innerHTML = contenu;
}
TEMOIN_FIN
attendre_echec "affectation directe innerHTML, hors API React"

# ---------------------------------------------------------------------------
# Cas 3 : l'insertion de balisage à côté d'un noeud.
#
# Troisième forme du même effet, et la moins connue : elle n'emploie ni React ni
# le mot `innerHTML` seul.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
export function Apercu(noeud: HTMLElement, contenu: string) {
  noeud.insertAdjacentHTML("beforeend", contenu);
}
TEMOIN_FIN
attendre_echec "insertion insertAdjacentHTML"

# ---------------------------------------------------------------------------
# Cas 4 : la règle disparaît du document de conception.
#
# SANS CE CAS, LE SENS 2 SERAIT DÉCORATIF. Un contrôle qui applique une règle
# que plus aucun document n'énonce protège un accord dont la session suivante
# n'a aucune trace : elle écrirait le composant public de LS-105 sans savoir que
# le champ est du texte simple.
# ---------------------------------------------------------------------------
muter "$REGLE" 's/dangerouslySetInnerHTML/un rendu HTML/g'
attendre_echec "règle C23 retirée de frontend-design.md"

# ---------------------------------------------------------------------------
# Cas 5 : l'interdiction n'est plus rattachée au champ.
#
# La règle peut rester écrite en perdant son objet : « pas de HTML » sans dire
# où s'applique l'interdiction ne dit pas à la session suivante que le champ
# concerné est `SectionProduit.contenu`.
# ---------------------------------------------------------------------------
muter "$REGLE" 's/`SectionProduit\.contenu` est du \*\*texte simple\*\*/Ce champ est du **texte simple**/'
attendre_echec "interdiction détachée de SectionProduit.contenu"

echo
echo "-----------------------------------------"
if [ "$detectes" -eq "$total" ]; then
  echo "  $total mutations, $total détectées"
else
  echo "  $total mutations, $((total - detectes)) NON détectées"
fi
echo "-----------------------------------------"

[ "$detectes" -eq "$total" ]
