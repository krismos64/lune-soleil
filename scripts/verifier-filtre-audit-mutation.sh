#!/usr/bin/env bash
# Preuve par mutation du filtre d'exemption de l'audit, LS-258.
#
# MOTIF. `filtrer-audit.mjs` relâche l'invariant « npm audit à zéro » pour un
# avis sans version corrigée. `verifier-filtre-audit.sh` exige que ce
# relâchement reste étroit ; cette preuve montre qu'il rougit quand le filtre
# s'élargit, sur chacune de ses règles, ou quand le workflow cesse de l'appeler
# au bon endroit.
#
# CE QUI EST MUTÉ EST LE FILTRE OU LE WORKFLOW, jamais le contrôle, même raison
# que `verifier-verdict-audit-mutation.sh`.
#
# COMMITER AVANT DE LANCER : la restauration passe par `git checkout`, qui
# efface tout travail non commité sur ces deux fichiers. Mesuré à l'écriture de
# cette preuve, la preuve voisine a ainsi effacé la modification du workflow.
#
# Usage : ./scripts/verifier-filtre-audit-mutation.sh
# Prérequis : Node. Ni Docker, ni base, ni réseau.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

FILTRE="scripts/filtrer-audit.mjs"
WORKFLOW=".github/workflows/nocturne.yml"
CONTROLE="./scripts/verifier-filtre-audit.sh"

for f in "$FILTRE" "$WORKFLOW"; do
  [ -r "$f" ] || { echo "ECHEC fichier introuvable : $f"; exit 1; }
done
[ -x "$CONTROLE" ] || { echo "ECHEC contrôle introuvable : $CONTROLE"; exit 1; }

TMP=$(mktemp -d)
cp "$FILTRE" "$TMP/filtre.mjs"
cp "$WORKFLOW" "$TMP/workflow.yml"

restaurer() {
  cp "$TMP/filtre.mjs" "$FILTRE"
  cp "$TMP/workflow.yml" "$WORKFLOW"
}

DEJA_NETTOYE=0
nettoyer() {
  [ "$DEJA_NETTOYE" -eq 1 ] && return
  DEJA_NETTOYE=1
  restaurer
  git -C "$RACINE" checkout -- "$FILTRE" "$WORKFLOW" 2>/dev/null || true
  rm -rf "$TMP"
}
trap nettoyer EXIT
trap 'interrompre_mutation' INT TERM
interrompre_mutation() {
  nettoyer
  echo >&2
  echo "INTERROMPU : les fichiers ont ete restaures." >&2
  exit 130
}

echecs=0
mutations=0

if ! "$CONTROLE" >"$TMP/reference.txt" 2>&1; then
  echo "ECHEC le contrôle n'est pas vert AVANT mutation."
  echo "      Aucune mutation ne peut rien prouver dans cet état."
  echo
  sed 's/^/      /' "$TMP/reference.txt"
  exit 1
fi

echo "Etat de reference : le contrôle est vert"
echo

# $1 fichier, $2 expression perl. Refuse une substitution qui ne change rien.
mute() {
  local fichier="$1" expression="$2" avant
  avant=$(cksum <"$fichier")
  perl -0pi -e "$expression" "$fichier"
  if [ "$(cksum <"$fichier")" = "$avant" ]; then
    echo "  ECHEC la mutation n'a modifié aucun caractère de $fichier"
    echo "        L'expression ne correspond plus au fichier : corriger ce"
    echo "        script, pas le contrôle."
    echo "        expression : $expression"
    exit 1
  fi
}

# $1 intitulé, $2 motif attendu dans la sortie du contrôle
cas() {
  local nom="$1" motif_attendu="$2"
  mutations=$((mutations + 1))

  if "$CONTROLE" >"$TMP/sortie.txt" 2>&1; then
    echo "  RATE  $nom -> NON détecté, le contrôle est aveugle"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  if grep -qF "$motif_attendu" "$TMP/sortie.txt"; then
    echo "  OK    $nom -> détecté, et par le sens attendu"
  else
    echo "  RATE  $nom -> échec constaté, mais PAS sur le sens attendu"
    echo "          attendu : $motif_attendu"
    grep "ECHEC" "$TMP/sortie.txt" | head -3 | sed 's/^/            /'
    echecs=$((echecs + 1))
  fi

  restaurer
}

# Cas 1 : l'exemption ne regarde plus l'avis, seulement le paquet.
mute "$FILTRE" 's{e\.url === via\.url && }{}'
cas "avis ignoré, paquet seul" "un autre avis sur braces n'est pas couvert"

# Cas 2 : l'exemption ne regarde plus le paquet.
mute "$FILTRE" 's{ && e\.paquet === via\.name}{}'
cas "paquet ignoré, avis seul" "le même avis sur un autre paquet n'est pas couvert"

# Cas 3 : la date limite n'est plus lue.
mute "$FILTRE" 's{if \(aujourdhui > e\.fin\)}{if (false)}'
cas "date limite ignorée" "une exemption échue fait échouer"

# Cas 4 : la durée n'est plus bornée.
mute "$FILTRE" 's{if \(duree > HORIZON_JOURS\)}{if (false)}'
cas "durée non bornée" "une exemption de 32 jours est refusée"

# Cas 5 : une seule cause couverte suffit, le défaut le plus insidieux : un
# paquet qui cite l'exempté passerait avec son propre avis.
mute "$FILTRE" 's{causes\.every\(}{causes.some(}'
cas "une cause couverte suffit" "porte un autre avis fait échouer"

# Cas 6 : un paquet sans cause est couvert d'office.
mute "$FILTRE" 's{if \(causes\.length === 0\) continue;}{if (causes.length === 0) { couverts.add(paquet); progres = true; continue; }}'
cas "paquet sans cause couvert" "un paquet sans cause ne passe pas"

# Cas 7 : un identifiant joker est admis.
mute "$FILTRE" 's{const FORME_AVIS = /\^GHSA\(-\[a-z0-9\]\{4\}\)\{3\}\$/;}{const FORME_AVIS = /^GHSA/;}'
cas "identifiant joker admis" "un identifiant joker est refusé"

# Cas 8 : un rapport de forme inconnue est lu comme vide.
mute "$FILTRE" 's{rapport\?\.auditReportVersion !== 2 \|\|}{false &&}'
cas "forme de rapport non vérifiée" "un rapport de forme inconnue bloque"

# Cas 9 : le filtre sort toujours en succès.
mute "$FILTRE" 's{process\.exit\(echec \? 1 : 0\);}{process.exit(0);}'
cas "verdict final forcé à 0" "un avis bas non exempté à côté de la chaîne fait échouer"

# Cas 10 : le workflow n'appelle plus le filtre.
mute "$WORKFLOW" 's{if node scripts/filtrer-audit\.mjs scripts/audit-exemptions\.json <"\$RUNNER_TEMP/audit\.json"; then}{if false; then}'
cas "workflow sans appel au filtre" "n'appelle plus le filtre d'exemption"

# Cas 11 : le filtre appelé AVANT la reconnaissance de panne, où il pourrait
# excuser une panne du registre. Le bloc d'appel remonte au début du `run`.
mute "$WORKFLOW" 's{(          sortie=\$\(npm audit --audit-level=low 2>&1\)\n)(.*?)(          npm audit --json .*?\n          fi\n)}{$3$1$2}s'
cas "filtre avant la panne" "n'est pas entre la reconnaissance de panne et l'échec"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations conformes"
else
  echo "  $mutations mutations, $echecs NON conformes"
fi
echo "-----------------------------------------"

exit "$echecs"
