#!/bin/bash
# Preuve par mutation de `verifier-route-echec.sh`, LS-191.
#
# Motif. Ce contrôle garde une page qui LÈVE à dessein, et dont la seule
# protection est l'ordre de ses deux instructions : `notFound()` avant `throw`.
# Un contrôle qui vérifie un ordre est exactement le genre à rester vert en
# regardant la mauvaise chose, et c'est arrivé ici.
#
# LE CAS 1 A DÉJÀ TROUVÉ UN DÉFAUT RÉEL. La première version du contrôle
# cherchait `notFound()` dans le fichier entier, commentaires compris : l'en-tête
# de la page EXPLIQUE que la garde s'exécute avant le `throw`, donc le motif
# était trouvé dans la phrase qui le décrit, vingt lignes avant l'instruction.
# Le contrôle restait vert sur l'ordre inversé, c'est-à-dire sur une page qui
# lève en production. Motif « contrôle satisfait par un commentaire », en fiche.
#
# Usage : ./scripts/verifier-route-echec-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-route-echec.sh"
PAGE="src/app/administration/echec-rendu/page.tsx"

detectes=0
total=0

# La page est SAUVEGARDÉE PAR COPIE et non par `git checkout` : une restauration
# qui dépend de l'index échoue sur un fichier non encore suivi, ce qui est le cas
# tant que la story n'est pas commitée. Motif « git checkout est atomique », en
# fiche sur ce dépôt.
SAUVEGARDE="$(mktemp -d)"
cp "$PAGE" "$SAUVEGARDE/page.tsx"

restaurer() {
  cp "$SAUVEGARDE/page.tsx" "$PAGE"
}

nettoyer() {
  restaurer
  rm -rf "$SAUVEGARDE"
}
trap nettoyer EXIT INT TERM

# Le contrôle doit être VERT avant toute mutation, sans quoi les rouges qui
# suivent ne prouveraient rien : un script cassé rougit sur tout.
if ! "$CONTROLE" > /dev/null 2>&1; then
  echo "ECHEC le contrôle rougit AVANT toute mutation, l'arbre n'est pas sain"
  "$CONTROLE"
  exit 1
fi

essayer() {
  local intitule="$1"
  total=$((total + 1))

  if "$CONTROLE" > /dev/null 2>&1; then
    echo "  RATÉ     $intitule"
    echo "           le contrôle reste vert sur ce défaut"
  else
    echo "  détecté  $intitule"
    detectes=$((detectes + 1))
  fi

  restaurer
}

echo "Mutations de la route qui échoue à dessein"
echo

# ---------------------------------------------------------------------------
# CAS 1 : l'ordre inversé, le défaut que le contrôle existe pour attraper.
#
# Dans cet ordre la page lève AVANT sa garde, qui n'est donc jamais atteinte :
# n'importe qui pourrait provoquer une erreur serveur en production. Le fichier
# se relit pourtant sans alerter, les deux instructions étant toujours là.
# ---------------------------------------------------------------------------
perl -0777 -i -pe '
  my $garde = qq{  if (process.env.AUTORISER_ECHEC_RENDU !== "1") {\n    notFound();\n  }\n};
  my $echec = qq{  throw new Error("Echec de rendu provoque pour le test de LS-191");\n};
  s/\Q$garde\E//;
  s/\Q$echec\E/$echec\n$garde/;
' "$PAGE"
essayer "la garde passe APRÈS le throw"

# ---------------------------------------------------------------------------
# CAS 2 : la garde devient un défaut ouvert.
#
# `=== "0"` a l'air équivalent et ne l'est pas : la variable est ABSENTE en
# production, donc la comparaison est fausse, donc la page lève. C'est la forme
# la plus discrète du défaut, parce qu'elle marche parfaitement en test.
# ---------------------------------------------------------------------------
perl -i -pe 's/AUTORISER_ECHEC_RENDU !== "1"/AUTORISER_ECHEC_RENDU === "0"/' "$PAGE"
essayer "la garde s'ouvre quand la variable est absente"

# ---------------------------------------------------------------------------
# CAS 3 : la garde disparaît entièrement.
# ---------------------------------------------------------------------------
# `\Q...\E` NE CONVIENT PAS ICI, et la mutation l'a montré : il rend `\n`
# littéral en même temps qu'il échappe les métacaractères, donc le motif ne
# correspond à aucun saut de ligne réel et la substitution ne retire RIEN. Le
# cas passait alors pour non détecté alors qu'aucun défaut n'avait été
# introduit. La garde est donc construite en variable, comme au cas 1.
perl -0777 -i -pe '
  my $garde = qq{  if (process.env.AUTORISER_ECHEC_RENDU !== "1") {\n    notFound();\n  }\n};
  s/\Q$garde\E//;
' "$PAGE"
essayer "la garde est retirée"

# ---------------------------------------------------------------------------
# CAS 4 : la page ne lève plus.
#
# Le contrôle doit le voir : sans le `throw`, la suite de bout en bout ne
# traverserait plus la frontière d'erreur tout en restant VERTE, ses assertions
# portant alors sur une page ordinaire qui n'a ni message d'erreur ni bouton de
# réessai. Une frontière redeviendrait une intention.
# ---------------------------------------------------------------------------
perl -i -pe 's/^  throw new Error\("Echec de rendu.*$/  return null;/' "$PAGE"
essayer "la page ne lève plus du tout"

echo
echo "-----------------------------------------"
if [ "$detectes" -eq "$total" ]; then
  echo "  $detectes mutation(s) sur $total detectee(s)"
  echo "-----------------------------------------"
  exit 0
fi

echo "  $detectes sur $total seulement"
echo "-----------------------------------------"
echo
echo "Une mutation non detectee est un trou du controle, pas une reussite :"
echo "le defaut qu'elle introduit passerait la chaine d'integration."
exit 1
