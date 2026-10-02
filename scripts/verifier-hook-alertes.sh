#!/usr/bin/env bash
# Exerce la section « alertes ouvertes » du hook de démarrage, LS-257.
#
# CE QUE CE CONTRÔLE PROTÈGE. Le hook injecte au démarrage de session les
# issues ouvertes par les workflows de surveillance. L'issue #498 est restée
# ouverte trois nuits sans qu'aucune session ne la lise, du 29 septembre au
# 1er octobre 2026 : ce contrôle garde le canal qui l'aurait montrée.
#
# `gh` EST SIMULÉ par `LS_HOOK_GH`, un script qui rend ce que le cas demande.
# Sans réseau ni authentification, le contrôle tourne partout, CI comprise.
#
# SIX CAS, et le JSON doit rester valide dans chacun :
#   alerte présente, aucune alerte, gh en échec, gh qui ne répond pas, gh
#   absent, réponse illisible. Les quatre derniers doivent DIRE que rien n'a
#   été vérifié : un silence se lirait comme « aucune alerte ».
#
# LE CAS « NE RÉPOND PAS » LANCE UN SOUS-PROCESSUS, délibérément. Tuer `gh`
# seul laisserait ce descendant tenir le tube ouvert, et le hook attendrait sa
# fin malgré la borne : le cas mesure la durée pour le voir.
#
# Usage : ./scripts/verifier-hook-alertes.sh
# Prérequis : jq et perl. Ni réseau, ni gh.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$RACINE/.claude/scripts/hook-session-start.sh"

[ -x "$HOOK" ] || { echo "ECHEC hook introuvable : $HOOK"; exit 1; }
command -v jq >/dev/null || { echo "ECHEC jq absent, le contrôle ne peut pas conclure"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ko=0
cas_joues=0

# $1 nom du faux gh, $2 corps du script
faux_gh() {
  printf '#!/usr/bin/env bash\n%s\n' "$2" >"$TMP/$1"
  chmod +x "$TMP/$1"
}

REPONSE='[
  {"number":498,"title":"Controle nocturne en echec","createdAt":"2026-09-29T07:50:04Z",
   "labels":[{"name":"controle-nocturne"}]},
  {"number":512,"title":"Ecart entre la production et main","createdAt":"2026-10-03T08:20:00Z",
   "labels":[{"name":"autre"},{"name":"ecart-production"}]},
  {"number":77,"title":"Idee sans rapport","createdAt":"2026-08-01T10:00:00Z",
   "labels":[{"name":"amelioration"}]}
]'

faux_gh alerte "cat <<'FIN'
$REPONSE
FIN"
faux_gh aucune "echo '[]'"
faux_gh echec "echo 'HTTP 401: Bad credentials' >&2; exit 1"
faux_gh muet "sleep 8; echo '[]'"
faux_gh illisible "echo '<html>erreur</html>'"

# $1 intitulé, $2 commande gh (chemin), puis paires « +motif » ou « -motif »
attendre() {
  local intitule="$1" gh="$2"
  shift 2
  local sortie contexte debut duree motif

  cas_joues=$((cas_joues + 1))
  debut=$(date +%s)
  sortie=$(CLAUDE_PROJECT_DIR="$RACINE" LS_HOOK_GH="$gh" LS_HOOK_GH_DELAI=1 "$HOOK")
  duree=$(($(date +%s) - debut))

  if ! contexte=$(jq -er '.hookSpecificOutput.additionalContext' <<<"$sortie" 2>/dev/null); then
    echo "ECHEC $intitule : le JSON produit est invalide ou sans contexte"
    ko=$((ko + 1))
    return
  fi

  # Borne : 1 s demandée, 4 s tolérées pour git et jq sur un runner chargé.
  if [ "$duree" -gt 4 ]; then
    echo "ECHEC $intitule : le hook a mis ${duree} s, la borne ne tient pas"
    ko=$((ko + 1))
    return
  fi

  for motif in "$@"; do
    case "$motif" in
      +*)
        if ! grep -qF -- "${motif:1}" <<<"$contexte"; then
          echo "ECHEC $intitule : absent du contexte, « ${motif:1} »"
          ko=$((ko + 1))
          return
        fi
        ;;
      -*)
        if grep -qF -- "${motif:1}" <<<"$contexte"; then
          echo "ECHEC $intitule : présent à tort dans le contexte, « ${motif:1} »"
          ko=$((ko + 1))
          return
        fi
        ;;
    esac
  done

  echo "OK    $intitule"
}

attendre "alerte ouverte, nommée avec sa date et son étiquette" "$TMP/alerte" \
  "+ALERTE : issue(s) ouverte(s)" \
  "+#498 Controle nocturne en echec, ouverte le 2026-09-29 (controle-nocturne)" \
  "+#512 Ecart entre la production et main, ouverte le 2026-10-03 (ecart-production)" \
  "-#77" \
  "-NON VÉRIFIÉES"

attendre "aucune alerte, rien n'est annoncé" "$TMP/aucune" \
  "-ALERTE" \
  "-NON VÉRIFIÉES"

attendre "gh en échec, le hook le dit" "$TMP/echec" \
  "+ALERTES NON VÉRIFIÉES : gh n'a pas répondu" \
  "-ALERTE : issue"

attendre "gh qui ne répond pas, borné et dit" "$TMP/muet" \
  "+ALERTES NON VÉRIFIÉES : gh n'a pas répondu en 1 s" \
  "-ALERTE : issue"

attendre "gh absent, le hook le dit" "$TMP/inexistant" \
  "+ALERTES NON VÉRIFIÉES : gh est absent"

attendre "réponse illisible, le hook le dit" "$TMP/illisible" \
  "+ALERTES NON VÉRIFIÉES : la réponse de gh est illisible" \
  "-ALERTE : issue"

# Le contrôle refuse de conclure s'il n'a rien joué : un ancrage cassé ne doit
# pas rendre un OK silencieux.
if [ "$cas_joues" -ne 6 ]; then
  echo "ECHEC $cas_joues cas joués au lieu de 6"
  ko=$((ko + 1))
fi

if [ "$ko" -gt 0 ]; then
  echo "ECHEC $ko cas sur $cas_joues ne rendent pas le contexte attendu"
  exit 1
fi

echo "OK les alertes ouvertes sont injectées, et leur absence de lecture est dite, $cas_joues cas"
