#!/bin/bash
# Vérifie qu'aucun rendu HTML brut n'atteint le contenu d'une section de fiche
# produit, LS-100, ADR-026 et règle C23.
#
# Motif. `SectionProduit.contenu` est du texte libre saisi dans l'administration
# et affiché sur la fiche publique. Le risque naît du RENDU, jamais du stockage :
# React échappe le texte par défaut, et une seule ligne de `dangerouslySetInnerHTML`
# suffit à transformer ce champ en injection de script sur une page publique.
#
# CE QUE CE CONTRÔLE VÉRIFIE, DANS LES DEUX SENS :
#
#   1. aucun rendu HTML brut dans `src/`, sous quelque forme que ce soit
#   2. la règle C23 est toujours écrite dans `frontend-design.md`, sans quoi le
#      contrôle protégerait une règle que plus rien n'énonce
#
# LE SENS 2 EXISTE PARCE QU'UN CONTRÔLE À SENS UNIQUE MENT PAR OMISSION. Un
# contrôle qui ne cherche qu'une absence reste vert sur un dépôt vide : il ne
# distingue pas « aucune violation » de « plus rien à protéger ».
#
# POURQUOI UN SCRIPT ET NON UNE RÈGLE ESLINT. `react/no-danger` existe, et sa
# désactivation tient dans un commentaire de ligne que personne ne relit. Un
# script exécuté par la chaîne de contrôle ne se désactive pas au fil de l'eau.
#
# Usage : ./scripts/verifier-rendu-texte-simple.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$RACINE/src"
REGLE="$RACINE/.claude/rules/frontend-design.md"
ko=0

[ -d "$SOURCE" ] || { echo "ECHEC dossier source introuvable : $SOURCE"; exit 1; }
[ -r "$REGLE" ] || { echo "ECHEC règle de conception illisible : $REGLE"; exit 1; }

# ---------------------------------------------------------------------------
# Sens 1 : aucun rendu HTML brut dans le code applicatif.
#
# LES TROIS FORMES SONT CHERCHÉES, et pas seulement la première. Interdire le
# seul `dangerouslySetInnerHTML` laisserait passer les deux équivalents qui
# produisent le même effet, ce que la règle C23 nomme « tout équivalent » :
#
#   dangerouslySetInnerHTML   la forme React
#   innerHTML =               l'affectation directe sur un noeud du DOM
#   insertAdjacentHTML        l'insertion de balisage à côté d'un noeud
#
# `outerHTML` est volontairement absent : il ne s'écrit pas sans passer par l'un
# des deux motifs ci-dessus dans du code React, et l'ajouter sans cas de
# mutation qui l'exerce donnerait une fausse impression de couverture.
#
# LES COMMENTAIRES SONT EXCLUS. Ce fichier lui-même, les commentaires du schéma
# et ceux du service NOMMENT l'interdiction pour l'expliquer : les compter comme
# des violations rendrait le contrôle rouge sur du code exemplaire, et la
# réaction serait de retirer l'explication.
# ---------------------------------------------------------------------------
fichiers_examines=0

while IFS= read -r fichier; do
  [ -n "$fichier" ] || continue
  fichiers_examines=$((fichiers_examines + 1))

  # Les lignes de commentaire partent avant la recherche, `//`, `*` et `/*`.
  violations=$(grep -nE '(dangerouslySetInnerHTML|innerHTML[[:space:]]*=|insertAdjacentHTML)' "$fichier" \
    | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)

  if [ -n "$violations" ]; then
    relatif="${fichier#"$RACINE"/}"
    while IFS= read -r ligne; do
      [ -n "$ligne" ] || continue
      echo "ECHEC $relatif:${ligne%%:*} : rendu HTML brut interdit, règle C23"
      echo "      le contenu d'une section est du texte simple, saisi dans"
      echo "      l'administration et affiché publiquement. React échappe le"
      echo "      texte par défaut : ce motif annule cette protection."
      ko=$((ko + 1))
    done <<INTERNE
$violations
INTERNE
  fi
done <<EOF
$(find "$SOURCE" \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/generated/*" 2>/dev/null | sort || true)
EOF

echo "Fichiers de src/ examinés : $fichiers_examines"

# L'ANCRAGE SE PROUVE. Zéro fichier examiné signifie que le contrôle ne regarde
# plus rien, et un contrôle muet qui rend « OK » est pire que son absence.
if [ "$fichiers_examines" -eq 0 ]; then
  echo "ECHEC aucun fichier examiné : l'ancrage du contrôle est cassé"
  echo "      (src/ a été déplacé, ou l'extension des fichiers a changé)"
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Sens 2 : la règle C23 est toujours énoncée.
#
# Sans ce sens, retirer la règle de `frontend-design.md` laisserait ce script
# vert : il protégerait une interdiction que plus aucun document n'énonce, et la
# session suivante n'aurait aucune raison de la respecter en écrivant un
# nouveau composant.
#
# LE MOTIF ÉVITE LE RETOUR À LA LIGNE. Les documents sont enveloppés à 80
# colonnes : une expression de plusieurs mots peut être coupée en deux lignes et
# échapper à un `grep` ligne à ligne. Le motif porte donc sur un seul mot, et
# les deux conditions sont vérifiées séparément.
# ---------------------------------------------------------------------------
if ! grep -q 'dangerouslySetInnerHTML' "$REGLE"; then
  echo "ECHEC frontend-design.md n'interdit plus explicitement le rendu HTML"
  echo "      la règle C23 doit y nommer dangerouslySetInnerHTML : c'est elle"
  echo "      que ce contrôle applique, et un contrôle sans règle écrite n'a"
  echo "      aucune autorité sur la session qui code."
  ko=$((ko + 1))
fi

if ! grep -q 'SectionProduit.contenu' "$REGLE"; then
  echo "ECHEC frontend-design.md ne rattache plus l'interdiction à SectionProduit.contenu"
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK contenu de section rendu en texte simple, règle C23"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
