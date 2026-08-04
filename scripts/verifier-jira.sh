#!/bin/bash
# Vérifie que le backlog Jira reste structuré : tout ticket a un epic parent, et
# toute dépendance annoncée dans une description porte un lien Jira.
#
# Motif. La convention existait et était appliquée jusqu'à LS-41, puis elle s'est
# arrêtée sans qu'aucune décision ne soit prise. Mesuré le 4 août 2026 :
#
#   LS-9  à LS-41   epic 31/31   lien 20/31
#   LS-42 à LS-64   epic 23/23   lien  2/23
#   LS-65 à LS-87   epic 12/23   lien  0/23
#
# Personne ne l'a vu, parce que chaque ticket créé sans lien ressemblait à un cas
# isolé. Le cumul a produit 38 tickets déclarant une dépendance que l'outil
# ignorait, dont la chaîne LS-65 à LS-69 que la mémoire du projet cite pourtant
# comme imposée.
#
# Une convention écrite mais non vérifiée s'érode en silence. C'est la raison
# d'être de ce script : la fiche mémoire et le skill énoncent la règle, seul un
# contrôle la maintient.
#
# Volontairement hors intégration continue. La CI n'a pas d'identifiants Jira, et
# lui en donner ajouterait un secret sur un dépôt public pour un contrôle qui ne
# casse aucun build.
#
# Prérequis, trois variables dans .env :
#
#   JIRA_BASE_URL    https://votresite.atlassian.net
#   JIRA_USER_EMAIL  l'adresse du compte Atlassian
#   JIRA_API_TOKEN   jeton créé sur id.atlassian.com/manage-profile/security/api-tokens
#
# Usage : ./scripts/verifier-jira.sh
#         ./scripts/verifier-jira.sh --strict   traite les avertissements en échec

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
PROJET="LS"
strict=0
[ "${1:-}" = "--strict" ] && strict=1
ko=0
avert=0

command -v jq >/dev/null || { echo "ECHEC jq est requis"; exit 1; }
command -v curl >/dev/null || { echo "ECHEC curl est requis"; exit 1; }

# Les identifiants viennent de .env, jamais affichés. Le fichier est lu par bash,
# pas par ce script ligne à ligne : aucune valeur ne transite par un echo.
if [ -r "$RACINE/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$RACINE/.env" 2>/dev/null || true
  set +a
fi

manquantes=""
for v in JIRA_BASE_URL JIRA_USER_EMAIL JIRA_API_TOKEN; do
  eval "valeur=\${$v:-}"
  [ -n "$valeur" ] || manquantes="$manquantes $v"
done

if [ -n "$manquantes" ]; then
  echo "CONTROLE JIRA ignoré, à renseigner dans .env :$manquantes"
  echo
  echo "Le jeton se crée sur id.atlassian.com/manage-profile/security/api-tokens,"
  echo "portée lecture suffisante. Le contrôle devient actif dès qu'il est là."
  exit 0
fi

# --------------------------------------------------------------------------
# Récupération, une seule requête pour tout le projet
# --------------------------------------------------------------------------

reponse="$(mktemp)"
trap 'rm -f "$reponse"' EXIT

code="$(curl -sS -o "$reponse" -w '%{http_code}' \
  -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
  -H "Accept: application/json" \
  --get "$JIRA_BASE_URL/rest/api/3/search/jql" \
  --data-urlencode "jql=project = $PROJET AND issuetype != Epic ORDER BY key ASC" \
  --data-urlencode "fields=summary,description,parent,issuelinks,status" \
  --data-urlencode "maxResults=200" 2>/dev/null)"

if [ "$code" != "200" ]; then
  echo "ECHEC appel Jira, code HTTP $code"
  echo "Vérifier JIRA_BASE_URL, l'adresse du compte et la validité du jeton."
  exit 1
fi

total="$(jq -r '.issues | length' "$reponse")"
if [ "$total" = "0" ] || [ "$total" = "null" ]; then
  echo "ECHEC aucun ticket retourné, la requête ou le projet est faux"
  exit 1
fi

# --------------------------------------------------------------------------
# 1. Tout ticket porte un epic parent
# --------------------------------------------------------------------------

orphelins="$(jq -r '.issues[] | select(.fields.parent == null) | .key' "$reponse")"

if [ -n "$orphelins" ]; then
  for k in $orphelins; do
    echo "  - $k sans epic parent"
    ko=$((ko + 1))
  done
fi

# --------------------------------------------------------------------------
# 2. Une dépendance annoncée dans le texte porte un lien Jira
#
# Ancrage volontairement étroit : seules les formulations qui désignent une
# contrainte d'ordre sont retenues. Citer un ticket en référence, « voir LS-12 »,
# n'est pas une dépendance et ne doit pas crier.
# --------------------------------------------------------------------------

epics="$(jq -c '[.issues[].fields.parent.key] | map(select(. != null)) | unique' "$reponse")"

sans_lien="$(jq -r --arg projet "$PROJET" --argjson epics "$epics" '
  # La description arrive en ADF, un arbre JSON, et non en texte. Ramasser
  # récursivement tous les champs "text" de l\''arbre. Un jq qui concaténerait
  # l\''objet directement échoue, et le script sortait alors en 0 sans rien
  # vérifier : le défaut est apparu au premier appel réel, les données de test
  # portant des descriptions en texte simple.
  def texte_adf:
    if type == "object" then
      (if has("text") then .text else "" end) + ((.content // []) | map(texte_adf) | join(" "))
    elif type == "array" then map(texte_adf) | join(" ")
    elif type == "string" then .
    else "" end;
  .issues[]
  | . as $t
  | (($t.fields.description // "") | texte_adf) as $d
  | ($d + " " + ($t.fields.summary // "")) as $texte
  # Ancrage à la PHRASE et non à la description entière. Citer « la chaîne LS-65
  # à LS-69 » ailleurs dans le texte n\''est pas déclarer une dépendance envers
  # chacun. Sans ce resserrement le contrôle signalait 24 tickets, dont une
  # majorité de références de contexte.
  | [$texte | splits("[.;\n]")]
    | map(select(test("(?i)(dépend de|depend de|bloquante pour|bloque |bloquée par|bloquee par|dépendances?\\s*:)")))
    | join(" ") as $phrases
  | select($phrases != "")
  | ($t.fields.issuelinks // [] | map(.outwardIssue.key // .inwardIssue.key)) as $lies
  # L\''epic parent et les autres epics sont exclus : « Story 7 sur 11 du
  # découpage de LS-2 » énonce une appartenance, pas une contrainte d\''ordre.
  # Sans cette exclusion le contrôle criait sur 33 tickets, dont la moitié à
  # tort, et un contrôle qui crie partout finit ignoré.
  | ($phrases | [scan($projet + "-[0-9]+")] | unique
      | map(select(. != $t.key and (IN($epics[]) | not)))) as $cites
  | ($cites - $lies) as $manquants
  | select($manquants | length > 0)
  | "\($t.key)|\($manquants | join(" "))"
' "$reponse")"
jq_code=$?

if [ "$jq_code" -ne 0 ]; then
  echo "ECHEC l'analyse des dépendances a échoué, code jq $jq_code"
  echo "Le format de réponse de l'API a probablement changé. Ne pas ignorer :"
  echo "sans cette garde, l'échec sortait en 0 et le contrôle paraissait vert."
  exit 1
fi

if [ -n "$sans_lien" ]; then
  while IFS='|' read -r cle manquants; do
    [ -n "$cle" ] || continue
    echo "  - $cle annonce une dépendance sans lien Jira : $manquants"
    avert=$((avert + 1))
  done <<< "$sans_lien"
fi

# --------------------------------------------------------------------------
# Verdict
# --------------------------------------------------------------------------

if [ "$ko" -eq 0 ] && [ "$avert" -eq 0 ]; then
  exit 0
fi

echo
echo "BACKLOG JIRA, $total tickets examinés"
[ "$ko" -gt 0 ] && echo "  $ko sans epic parent, mécanique"
[ "$avert" -gt 0 ] && echo "  $avert dépendance(s) textuelle(s) sans lien, à relire"
echo
echo "Un ticket sans epic n'apparaît dans aucune vue de phase. Une dépendance"
echo "écrite dans une description seule n'existe pour aucun outil, et l'ordre"
echo "des stories se reconstitue alors de mémoire."
echo
echo "Les dépendances relevées sont heuristiques : un ticket peut citer un autre"
echo "sans en dépendre, et un bloqueur peut ne pas encore exister comme ticket."
echo "Dans ce dernier cas, le dire dans un commentaire plutôt que forcer un lien."

if [ "$ko" -gt 0 ] || [ "$strict" -eq 1 ]; then
  echo
  echo "CODE DE SORTIE: 1"
  exit 1
fi

exit 0
