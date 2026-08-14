#!/usr/bin/env bash
#
# Hook PreCompact : rappelle d'écrire avant que le contexte disparaisse.
#
# Pourquoi il existe. Les sessions de ce projet sont longues, celle du 13 août
# 2026 a traité cinq stories. À la compaction, ce qui n'a pas été écrit dans un
# fichier disparaît : une découverte non portée en mémoire, un journal resté
# dans l'intention, une dérive constatée et jamais tracée.
#
# Le motif est déjà survenu autrement : des scripts de mutation restaurent par
# `git checkout`, et une modification jamais indexée n'est récupérable nulle
# part. La compaction produit le même effet sur le raisonnement.
#
# Ce hook AVERTIT, il ne bloque jamais. Bloquer une compaction automatique
# ferait échouer la session au lieu de la sauver. Il sort toujours en 0.
#
# PreCompact ne peut PAS injecter de contexte, contrairement à SessionStart :
# la documentation réserve additionalContext à SessionStart, UserPromptSubmit
# et UserPromptExpansion. Ce hook écrit donc sur stderr, que l'assistant lit.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

entree=$(cat 2>/dev/null || true)

# `manual` vient d'un /compact demandé, `auto` du remplissage du contexte.
# L'avertissement vaut surtout pour `auto`, non anticipé par définition.
declencheur="auto"
if command -v jq >/dev/null 2>&1 && [ -n "${entree}" ]; then
    declencheur=$(jq -r '.matcher // .trigger // "auto"' <<<"${entree}" 2>/dev/null || echo "auto")
fi

# Ce qui reste non écrit, mesuré et non supposé.
non_ecrit=()

if git rev-parse --verify HEAD >/dev/null 2>&1; then
    modifies=$(git status --porcelain 2>/dev/null | grep -cv '^??' || true)
    [ "${modifies:-0}" -gt 0 ] && non_ecrit+=("${modifies} fichier(s) modifié(s) non commité(s)")

    # Un journal du jour absent alors que du code a été commité aujourd'hui est
    # le signe le plus fiable d'une session qui n'a pas encore tracé.
    aujourdhui=$(date +%Y-%m-%d)
    commits_du_jour=$(git log --since="${aujourdhui} 00:00" --oneline 2>/dev/null | wc -l | tr -d ' ')
    if [ "${commits_du_jour:-0}" -gt 0 ] && ! ls docs/journal/"${aujourdhui}"*.md >/dev/null 2>&1; then
        non_ecrit+=("${commits_du_jour} commit(s) aujourd'hui, aucun journal du ${aujourdhui}")
    fi
fi

{
    echo "COMPACTION IMMINENTE (déclencheur : ${declencheur})."
    echo
    echo "Ce qui n'est pas dans un fichier va disparaître. Avant de continuer :"
    echo "  - une découverte non dérivable du code doit aller en mémoire"
    echo "  - une dérive constatée doit aller au journal, pas seulement en tête"
    echo "  - un arbitrage de Christophe doit être tracé dans Jira ou un ADR"

    if [ ${#non_ecrit[@]} -gt 0 ]; then
        echo
        echo "Constaté dans le dépôt à cet instant :"
        for n in "${non_ecrit[@]}"; do
            echo "  - ${n}"
        done
    fi
} >&2

exit 0
