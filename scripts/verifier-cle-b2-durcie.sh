#!/usr/bin/env bash
#
# Verifie le durcissement de la cle Backblaze B2, LS-223.
#
# CE QU'IL PROUVE. Trois sens, et le troisieme est le seul qui compte vraiment :
#   1. la cle en service ne porte PLUS `deleteFiles`
#   2. elle porte toujours `writeFiles` et `listFiles`, sans quoi la copie
#      nocturne serait cassee par le durcissement lui-meme
#   3. une tentative de suppression REELLE est refusee par Backblaze
#
# POURQUOI LE SENS 3 EXISTE ALORS QUE LE SENS 1 SEMBLE SUFFIRE. Lire les
# capacites annoncees par `b2_authorize_account` dit ce que Backblaze DECLARE,
# pas ce qu'il APPLIQUE. Un controle qui se contente de la declaration n'a jamais
# vu le refus qu'il pretend garantir. Le sens 3 exerce l'appel et exige un echec.
#
# IL NE DETRUIT RIEN MEME S'IL ECHOUE. La cible du test est un fichier
# INEXISTANT : si le durcissement avait ete manque et que la suppression passait,
# elle ne porterait sur aucune sauvegarde reelle. Un test negatif ne doit pas
# pouvoir devenir destructeur le jour ou il revele le defaut.
#
# Usage : sudo ./verifier-cle-b2-durcie.sh
# Sortie : 0 si les trois sens passent, 1 sinon.

set -euo pipefail

FICHIER_CONF="${B2_CONF_FILE:-/etc/lune-soleil/b2.conf}"

if [ ! -r "$FICHIER_CONF" ]; then
  echo "Arret : $FICHIER_CONF illisible, identifiants B2 introuvables." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$FICHIER_CONF"
set +a

: "${B2_KEY_ID:?B2_KEY_ID absente de $FICHIER_CONF}"
: "${B2_APP_KEY:?B2_APP_KEY absente de $FICHIER_CONF}"
: "${B2_BUCKET:?B2_BUCKET absente de $FICHIER_CONF}"

echo "Verification du durcissement de la cle B2, $(date -u +%Y-%m-%dT%H:%M:%SZ)"

REPONSE=$(curl -sS --fail --max-time 30 \
  -u "${B2_KEY_ID}:${B2_APP_KEY}" \
  https://api.backblazeb2.com/b2api/v4/b2_authorize_account) || {
  echo "Arret : authentification B2 refusee." >&2
  exit 1
}

CAPACITES=$(echo "$REPONSE" | jq -r '.apiInfo.storageApi.allowed.capabilities[]')
JETON=$(echo "$REPONSE" | jq -r '.authorizationToken')
API_URL=$(echo "$REPONSE" | jq -r '.apiInfo.storageApi.apiUrl')
BUCKET_ID=$(echo "$REPONSE" | jq -r '.apiInfo.storageApi.allowed.buckets[0].id')

ECHECS=0

# --------------------------------------------------------------------------
# Sens 1 : deleteFiles est absente
# --------------------------------------------------------------------------
if echo "$CAPACITES" | grep -qx "deleteFiles"; then
  echo "  ECHEC : la cle porte encore deleteFiles, un serveur compromis peut detruire l'historique." >&2
  ECHECS=$(( ECHECS + 1 ))
else
  echo "  OK : deleteFiles absente des capacites."
fi

# --------------------------------------------------------------------------
# Sens 2 : writeFiles et listFiles sont presentes
#
# LE DURCISSEMENT NE DOIT PAS CASSER LA SAUVEGARDE. Une cle trop restreinte
# echouerait a deposer la copie du jour, ce qui serait pire que le risque
# qu'elle ferme.
# --------------------------------------------------------------------------
for REQUISE in writeFiles listFiles; do
  if echo "$CAPACITES" | grep -qx "$REQUISE"; then
    echo "  OK : $REQUISE presente."
  else
    echo "  ECHEC : $REQUISE absente, la copie nocturne ne peut plus fonctionner." >&2
    ECHECS=$(( ECHECS + 1 ))
  fi
done

# --------------------------------------------------------------------------
# Sens 3 : une suppression reelle est refusee
#
# CIBLE INEXISTANTE, VOIR L'EN-TETE. Les deux refus possibles se distinguent et
# ne valent pas la meme chose :
#   401 unauthorized     la cle n'a pas le droit, C'EST CE QU'ON VEUT
#   400 file_not_present la cle A le droit, le fichier n'existe pas, DEFAUT
# --------------------------------------------------------------------------
INEXISTANT="ls223-cible-de-test-qui-n-existe-pas.gpg"
CORPS=$(curl -sS --max-time 30 -X POST \
  -H "Authorization: $JETON" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg n "$INEXISTANT" --arg i "4_zdummy_ls223" '{fileName: $n, fileId: $i}')" \
  "$API_URL/b2api/v4/b2_delete_file_version" 2>/dev/null || echo '{}')

CODE=$(echo "$CORPS" | jq -r '.code // "aucun"')

case "$CODE" in
  unauthorized|access_denied)
    echo "  OK : suppression refusee par Backblaze, code $CODE."
    ;;
  aucun)
    echo "  ECHEC : la suppression n'a PAS ete refusee, la cle peut detruire." >&2
    ECHECS=$(( ECHECS + 1 ))
    ;;
  *)
    echo "  ECHEC : refus pour la mauvaise raison, code $CODE." >&2
    echo "    Un refus 'file_not_present' signifie que la cle AURAIT pu supprimer." >&2
    ECHECS=$(( ECHECS + 1 ))
    ;;
esac

# --------------------------------------------------------------------------
# Sens 4 : la regle de retention existe cote Backblaze
#
# ELLE PREND EN CHARGE CE QUE LA CLE NE PEUT PLUS FAIRE. Sans elle, le stockage
# distant grossirait sans limite, les masquages ne devenant jamais des
# suppressions.
# --------------------------------------------------------------------------
COMPTE=$(echo "$REPONSE" | jq -r '.accountId')
REGLES=$(curl -sS --max-time 30 \
  -H "Authorization: $JETON" -H "Content-Type: application/json" \
  -d "$(jq -nc --arg a "$COMPTE" --arg b "$BUCKET_ID" '{accountId: $a, bucketId: $b}')" \
  "$API_URL/b2api/v4/b2_list_buckets" 2>/dev/null \
  | jq -r '.buckets[0].lifecycleRules[0].daysFromHidingToDeleting // "aucune"')

if [ "$REGLES" = "aucune" ] || [ "$REGLES" = "null" ]; then
  echo "  ECHEC : aucune regle de retention, le stockage distant grossira sans limite." >&2
  ECHECS=$(( ECHECS + 1 ))
else
  echo "  OK : retention de $REGLES jours apres masquage."
fi

echo
if [ "$ECHECS" -gt 0 ]; then
  echo "Durcissement INCOMPLET, $ECHECS sens en echec." >&2
  exit 1
fi

echo "Durcissement verifie, les quatre sens passent."
