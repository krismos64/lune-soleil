#!/usr/bin/env bash
#
# Hook PostToolUse : signale une règle qui nomme un identifiant absent du schéma.
#
# Pourquoi il existe. `.claude/rules/*.md` décrit le schéma en prose. Un
# renommage de table ou de colonne rend une règle fausse sans qu'aucun test de
# code n'échoue, et une règle fausse est lue avec autorité : la session qui code
# peut « corriger » le schéma pour s'aligner sur elle.
#
# Trois occurrences le 29 juillet 2026, LS-46 : `taxRate`, `taxAmount` et
# `priceIncludesTax` annoncés comme existants, `evenement_webhook` pour une table
# renommée `evenement_fournisseur`, `quantite_ligne` pour `ligne_commande.quantite`.
#
# La chaîne d'intégration lancera `verifier-regles.sh` à partir de LS-2. Ce hook
# comble l'intervalle : il ne dépend d'aucun choix de la phase 1 et ne la préempte
# pas.
#
# Il AVERTIT, il ne bloque pas, et sort toujours en 0. Une correction en deux
# temps passe légitimement par un état transitoire incohérent, renommer dans le
# schéma puis dans la règle. Bloquer rendrait cet ordre impossible.
#
# Silencieux quand le contrôle est vert : un hook qui parle à chaque écriture
# devient un bruit que l'on apprend à ignorer.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# Le matcher de settings.json porte sur le type d'outil, pas sur le chemin
# écrit. Le filtrage se fait donc ici : sans lui, le contrôle tournerait à
# chaque écriture du dépôt, y compris sur le journal ou un document Confluence.
input=$(cat 2>/dev/null) || exit 0
fichier=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || exit 0

case "$fichier" in
    *.claude/rules/*) ;;
    */prisma/schema.prisma|prisma/schema.prisma) ;;
    *) exit 0 ;;
esac

CONTROLE="./scripts/verifier-regles.sh"

# Le contrôle peut être absent d'un clone partiel, ou non exécutable après une
# copie qui perd les permissions. Ce n'est pas une raison de gêner la session.
[ -x "$CONTROLE" ] || exit 0

# Le contrôle compare les règles au schéma : sans schéma, il n'a rien à dire.
# Le cas se présentera si le dépôt est réinitialisé avant la phase 1.
[ -r "./prisma/schema.prisma" ] || exit 0

sortie=$("$CONTROLE" 2>&1)
code=$?

[ "$code" -eq 0 ] && exit 0

{
    echo "RÈGLES, un identifiant cité n'existe pas dans le schéma :"
    echo
    echo "$sortie" | grep -E "^  ECHEC|^        " || echo "$sortie"
    echo
    echo "Deux corrections possibles, selon le sens de la divergence : soit la"
    echo "règle nomme mal une chose qui existe, soit elle décrit un état du"
    echo "schéma qui n'a jamais été atteint. Vérifier avant de choisir."
    echo
    echo "Si cet état est transitoire, une correction en deux temps par exemple,"
    echo "poursuivre et relancer ./scripts/verifier-regles.sh à la fin."
} >&2

exit 0
