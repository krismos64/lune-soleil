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
# 1bis. Alertes ouvertes par les workflows, LS-257
#
# POURQUOI. Trois workflows ouvrent une issue pour être vus : le veilleur du
# nocturne, l'écart de production et la dérive documentaire. L'issue #498 est
# restée ouverte du 29 septembre au 1er octobre 2026, trois nuits de rouge, et
# aucune session ne l'a lue : le journal n'en disait rien, et une alerte qui
# attend qu'on vienne la chercher n'alerte personne.
#
# UNE SEULE REQUÊTE, filtrée par jq. `gh issue list --label a --label b`
# demande les DEUX étiquettes à la fois, pas l'une ou l'autre.
#
# BORNÉE À QUELQUES SECONDES par `perl alarm`, macOS n'ayant pas `timeout`. Un
# réseau absent ou lent ne doit jamais retenir le démarrage. Le délai tue le
# GROUPE de processus et pas seulement `gh` : un descendant survivant garderait
# le tube ouvert, et `$(...)` attendrait sa fin malgré la borne.
#
# UN ÉCHEC SE DIT. Ne rien écrire quand `gh` ne répond pas se lirait comme
# « aucune alerte », ce qui est précisément l'information fausse que ce hook
# s'interdit. `LS_HOOK_GH` et `LS_HOOK_GH_DELAI` servent au test,
# `scripts/verifier-hook-alertes.sh`, qui simule `gh`.
# ---------------------------------------------------------------------------
ETIQUETTES_ALERTE='["controle-nocturne","ecart-production","derive-documentation"]'
gh_cmd="${LS_HOOK_GH:-gh}"
delai="${LS_HOOK_GH_DELAI:-5}"

if ! command -v "${gh_cmd}" >/dev/null 2>&1; then
    lignes+=("")
    lignes+=("ALERTES NON VÉRIFIÉES : gh est absent, les issues d'alerte n'ont pas été lues.")
elif ! issues=$(perl -e '
        my $delai = shift;
        my $pid = fork() // exit 127;
        if ($pid == 0) { setpgrp(0, 0); exec @ARGV or exit 127 }
        $SIG{ALRM} = sub { kill "KILL", -$pid; exit 124 };
        alarm $delai;
        waitpid($pid, 0);
        exit($? >> 8 || ($? & 127 ? 125 : 0));
    ' "${delai}" \
        "${gh_cmd}" issue list --state open --limit 100 \
        --json number,title,createdAt,labels 2>/dev/null); then
    lignes+=("")
    lignes+=("ALERTES NON VÉRIFIÉES : gh n'a pas répondu en ${delai} s ou a échoué,")
    lignes+=("les issues d'alerte n'ont pas été lues. À vérifier : gh issue list.")
elif ! alertes=$(jq -r --argjson etiquettes "${ETIQUETTES_ALERTE}" '
        [ .[]
          | . as $issue
          | ([ .labels[].name ] | map(select(. as $n | $etiquettes | index($n)))) as $e
          | select($e | length > 0)
          | "  #\($issue.number) \($issue.title), ouverte le \($issue.createdAt[0:10]) (\($e | join(", ")))" ]
        | .[]' <<<"${issues}" 2>/dev/null); then
    lignes+=("")
    lignes+=("ALERTES NON VÉRIFIÉES : la réponse de gh est illisible.")
elif [ -n "${alertes}" ]; then
    lignes+=("")
    lignes+=("ALERTE : issue(s) ouverte(s) par un workflow de surveillance, à traiter avant tout :")
    lignes+=("${alertes}")
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
