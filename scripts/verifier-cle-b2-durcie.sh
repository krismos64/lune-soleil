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
# IL NE SE LANCE QU'APRES LE DURCISSEMENT, ET C'EST UNE CONTRAINTE, PAS UN
# DETAIL. La cible du sens 3 est un fichier REEL, avec son vrai `fileId` : un
# identifiant fabrique ferait repondre « Bad file ID » avant tout examen des
# droits, et le controle serait aveugle (voir le sens 3 plus bas).
#
# La contrepartie est qu'il DETRUIT VRAIMENT si la cle porte encore
# `deleteFiles`. L'API Backblaze n'offre aucun dry run pour
# `b2_delete_file_version` : il n'existe pas de facon d'exercer le refus sans
# exercer la suppression.
#
# Mesure du 13 septembre 2026, sur l'autre projet (SP-597) : lance contre une
# cle NON encore durcie pour prouver par mutation qu'il rougissait bien, ce
# controle a supprime deux versions d'archives avant de conclure. La cible etait
# bien choisie, le verdict etait juste, et il a fait exactement ce qu'il servait
# a empecher. Les archives ont ete renvoyees depuis les copies locales.
#
# Donc : durcir d'abord, prouver ensuite. Une preuve par mutation ne vaut que si
# l'echec est reversible.
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
# LA CIBLE EST UN FICHIER REEL, ET LA PREMIERE VERSION DE CE CONTROLE VISAIT UN
# FICHIER INEXISTANT, CE QUI NE PROUVAIT RIEN. Backblaze valide la FORME du
# `fileId` avant d'examiner les droits : un identifiant fabrique rend
# « Bad file ID », code `bad_request`, et la question de l'autorisation n'est
# jamais posee. Le controle passait donc a cote de ce qu'il pretendait verifier,
# mesure le 13 septembre 2026 en durcissant la cle.
#
# VISER UN FICHIER REEL NE RISQUE RIEN UNE FOIS LA CLE DURCIE : Backblaze
# REFUSE, et rien n'est touche. Le seul cas ou la suppression aboutit est celui
# ou le durcissement a ete manque, et elle detruit alors pour de bon. Le
# compartiment garde trente jours de versions, ce qui limite la perte sans
# l'annuler.
#
# D'ou la contrainte d'ordonnancement rappelee en tete de fichier : ce controle
# se lance APRES la bascule, jamais avant.
#
# Les refus possibles ne valent pas la meme chose :
#   401 unauthorized   la cle n'a pas le droit, C'EST CE QU'ON VEUT
#   400 bad_request    la forme est refusee avant les droits, on ne sait RIEN
# --------------------------------------------------------------------------
CIBLE=$(curl -sS --max-time 30 \
  -H "Authorization: $JETON" \
  "$API_URL/b2api/v4/b2_list_file_versions?bucketId=$BUCKET_ID&maxFileCount=1" 2>/dev/null \
  | jq -r '.files[0] | "\(.fileName)\t\(.fileId)"')

CIBLE_NOM="${CIBLE%%$'\t'*}"
CIBLE_ID="${CIBLE##*$'\t'}"

if [ -z "$CIBLE_NOM" ] || [ "$CIBLE_NOM" = "null" ]; then
  # GARDE DU CONTROLE CONTRE LUI-MEME. Sans fichier a viser, le sens 3 ne peut
  # pas conclure : le dire plutot que de rendre un OK silencieux.
  echo "  ECHEC : aucun fichier dans le compartiment, le refus n'a pas pu etre exerce." >&2
  ECHECS=$(( ECHECS + 1 ))
else
  CORPS=$(curl -sS --max-time 30 -X POST \
    -H "Authorization: $JETON" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg n "$CIBLE_NOM" --arg i "$CIBLE_ID" '{fileName: $n, fileId: $i}')" \
    "$API_URL/b2api/v4/b2_delete_file_version" 2>/dev/null || echo '{}')

  CODE=$(echo "$CORPS" | jq -r '.code // "aucun"')

  case "$CODE" in
    unauthorized|access_denied)
      echo "  OK : suppression refusee par Backblaze, code $CODE."
      ;;
    aucun)
      echo "  ECHEC : la suppression a REUSSI, la cle peut detruire l'historique." >&2
      echo "    Fichier supprime : $CIBLE_NOM, recuperable trente jours." >&2
      ECHECS=$(( ECHECS + 1 ))
      ;;
    *)
      echo "  ECHEC : refus pour la mauvaise raison, code $CODE." >&2
      echo "    Seul 'unauthorized' prouve le durcissement ; ici les droits" >&2
      echo "    n'ont meme pas ete examines." >&2
      ECHECS=$(( ECHECS + 1 ))
      ;;
  esac
fi

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
