#!/usr/bin/env bash
#
# Hook Stop : avertit s'il reste du travail non livré en fin de session.
#
# Pourquoi il existe. Le 28 juillet 2026, deux stories ont été déclarées
# terminées sur les quatre canaux de traçabilité alors que six commits
# n'avaient jamais quitté la machine. Le skill `story` s'arrêtait au commit,
# et CONTRIBUTING.md exige une pull request fusionnée.
#
# Ce hook AVERTIT, il ne bloque pas : une session peut légitimement s'arrêter
# en cours de travail. Il sort toujours en 0.
#
# Il écrit sur stderr, lu par l'assistant, pas par l'utilisateur.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# Pas un dépôt git, ou git indisponible : rien à dire.
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

branche=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
[ "$branche" = "HEAD" ] && exit 0   # détaché, cas hors périmètre

avertissements=()

# 1. Modifications non commitées.
if ! git diff --quiet HEAD 2>/dev/null; then
    n=$(git status --porcelain 2>/dev/null | grep -cv '^??' || true)
    [ "${n:-0}" -gt 0 ] && avertissements+=("$n fichier(s) modifié(s) non commité(s)")
fi

# 2. Commits absents de main distante.
#    C'est le contrôle qui compte : un commit sur une branche locale, ou sur une
#    branche poussée mais non fusionnée, ne livre rien.
if git rev-parse --verify origin/main >/dev/null 2>&1; then
    non_livres=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
    if [ "${non_livres:-0}" -gt 0 ]; then
        if [ "$branche" = "main" ]; then
            avertissements+=("$non_livres commit(s) sur main local, non poussés")
        else
            avertissements+=("$non_livres commit(s) sur '$branche' absents de origin/main")
        fi
    fi
fi

[ ${#avertissements[@]} -eq 0 ] && exit 0

{
    echo "TRAÇABILITÉ, canal Dépôt non clos :"
    for a in "${avertissements[@]}"; do
        echo "  - $a"
    done
    echo
    echo "Un commit local ne livre rien. Si une story vient d'être déclarée"
    echo "terminée, elle ne l'est pas : pousser, ouvrir la pull request,"
    echo "attendre les contrôles, fusionner en rebase. Voir CONTRIBUTING.md."
    echo
    echo "Si la session s'arrête volontairement en cours de travail, ignorer"
    echo "cet avertissement et le dire à Christophe."
} >&2

exit 0
