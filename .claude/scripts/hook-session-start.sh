#!/usr/bin/env bash
#
# Hook SessionStart : injecte l'état réel du projet au démarrage d'une session.
#
# Pourquoi il existe. CLAUDE.md demande de lire le journal le plus récent en
# début de session, et docs/REFERENCES.md avant une session qui conçoit. Cette
# lecture coûtait trois à cinq appels d'outils avant le premier travail utile,
# et rien ne garantissait qu'elle ait lieu : une session qui l'oublie repart sur
# un état périmé et refait ou contredit du travail déjà fait.
#
# Ce que ce hook ne fait PAS. Il ne remplace pas la lecture du journal quand la
# session touche à son sujet : il donne l'amorce, la branche, l'état du dépôt et
# la prochaine étape déclarée. Le détail reste dans le fichier.
#
# Sortie. stdout doit être un JSON portant hookSpecificOutput.additionalContext,
# le seul canal que Claude Code lit pour cet événement. Toute autre écriture sur
# stdout casserait l'analyse : les diagnostics vont sur stderr.
#
# Ce hook n'échoue jamais. Une session doit démarrer même si git est absent, si
# jq manque ou si le dossier des journaux est vide : dans ce cas il n'injecte
# rien plutôt que d'injecter une information fausse.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# jq est indispensable pour produire un JSON correctement échappé. Un journal
# contient des guillemets, des apostrophes et des retours à la ligne : les
# concaténer à la main produirait un JSON invalide, silencieusement ignoré.
command -v jq >/dev/null 2>&1 || {
    echo "hook-session-start : jq absent, aucun contexte injecté" >&2
    exit 0
}

lignes=()

# ---------------------------------------------------------------------------
# 1. État du dépôt
# ---------------------------------------------------------------------------
# La condition porte sur HEAD et non sur --git-dir : un dépôt fraîchement
# initialisé, sans aucun commit, satisfait --git-dir mais fait échouer toutes
# les commandes qui suivent. Mesuré en écrivant ce hook, il affichait alors une
# branche « HEAD » suivie d'une ligne parasite.
if git rev-parse --verify HEAD >/dev/null 2>&1; then
    branche=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
    [ -n "${branche}" ] && [ "${branche}" != "HEAD" ] && lignes+=("Branche : ${branche}")

    modifies=$(git status --porcelain 2>/dev/null | grep -cv '^??' || true)
    if [ "${modifies:-0}" -gt 0 ]; then
        lignes+=("ATTENTION : ${modifies} fichier(s) modifié(s) non commité(s).")
    fi

    if git rev-parse --verify origin/main >/dev/null 2>&1; then
        non_livres=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
        if [ "${non_livres:-0}" -gt 0 ]; then
            lignes+=("ATTENTION : ${non_livres} commit(s) absents de origin/main, rien n'est livré.")
        fi
    fi
fi

# ---------------------------------------------------------------------------
# 2. Journal le plus récent
#
# Le tri est lexicographique sur un nom de fichier commençant par AAAA-MM-JJ,
# ce qui équivaut à un tri chronologique. Volontairement pas `ls -t` : la date
# de modification changerait si un journal ancien était corrigé, et le plus
# récemment touché n'est pas le plus récent.
# ---------------------------------------------------------------------------
dernier=$(find docs/journal -maxdepth 1 -name '20*.md' -type f 2>/dev/null | sort | tail -1)

if [ -n "${dernier}" ]; then
    lignes+=("")
    lignes+=("Journal le plus récent : ${dernier}")

    # La section « Prochaine étape » porte l'amorce de la session suivante.
    # sed s'arrête au titre suivant pour ne pas déverser tout le fichier.
    prochaine=$(sed -n '/^## Prochaine étape/,/^## /p' "${dernier}" 2>/dev/null \
        | sed '1d;/^## /d' \
        | grep -v '^[[:space:]]*$' \
        | head -12)

    if [ -n "${prochaine}" ]; then
        lignes+=("")
        lignes+=("Prochaine étape déclarée par ce journal :")
        lignes+=("${prochaine}")
    fi
fi

# ---------------------------------------------------------------------------
# 3. Rappels qui se perdent
# ---------------------------------------------------------------------------
lignes+=("")
lignes+=("Rappels : tout travail suit le skill story et se clôt sur les quatre canaux")
lignes+=("(dépôt fusionné sur main, journal, mémoire, Jira). docs/REFERENCES.md porte")
lignes+=("les tables d'aiguillage, à lire avant une session qui conçoit.")

contexte=$(printf '%s\n' "${lignes[@]}")

jq -n --arg ctx "${contexte}" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'

exit 0
