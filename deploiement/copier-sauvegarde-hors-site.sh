#!/usr/bin/env bash
#
# Copie hors site des sauvegardes chiffrees, vers Backblaze B2. LS-107.
#
# CE QU'IL FERME. ADR-037 rangeait explicitement parmi ses risques acceptes :
# « la sauvegarde reste sur la meme machine que la base, une perte totale du VPS
# emporte les deux ». Photocopier un document et ranger la photocopie dans le
# meme tiroir ne protege pas de l'incendie du tiroir. Une panne disque, un
# incident OVH ou un chiffrement par rancongiciel emportait tout d'un coup.
#
# CHEZ UN FOURNISSEUR DIFFERENT D'OVH, ET C'EST LE POINT. Le stockage objet
# d'OVH aurait couvert le disque mort, jamais la panne globale du fournisseur ni
# la suspension du compte.
#
# CE SCRIPT NE CHIFFRE RIEN. Les fichiers arrivent deja chiffres en AES256 par
# `sauvegarder-base.sh`, et la passphrase ne quitte jamais le VPS. Backblaze ne
# stocke donc que des octets illisibles pour lui. C'est aussi pourquoi le
# chiffrement cote serveur du bucket doit rester DESACTIVE : il n'ajouterait
# qu'une couche dont nous ne detenons pas la cle.
#
# DEUX FICHIERS PAR JEU, contrairement a SmartPlanning qui n'en a qu'un : le
# dump ET l'archive des medias. Envoyer le premier sans le second restaurerait
# un catalogue dont chaque fiche pointe vers une photographie absente, ADR-007.
# Les deux partent ensemble ou aucun ne part.
#
# POURQUOI L'API NATIVE B2 ET NON S3. L'API S3-compatible impose une signature
# AWS v4, quelques dizaines de lignes de HMAC en shell, donc du code fragile
# pour rien. L'API native s'utilise en `curl` simple. Aucun outil supplementaire
# n'est installe sur le VPS : `curl`, `jq`, `gpg` et `sha1sum` y sont deja,
# verifie le 10 septembre 2026.
#
# RETENTION IDENTIQUE AU LOCAL, quatorze jeux, ADR-037. Une copie hors site qui
# s'accumulerait sans fin depasserait les 10 Go gratuits une fois le catalogue
# photographie, et conserver sans limite des donnees personnelles de clients
# contredirait la minimisation du RGPD.
#
# Usage : ./copier-sauvegarde-hors-site.sh
# Sortie : 0 si l'envoi est fait ET verifie, 1 sinon.

set -euo pipefail

REP_SAUVEGARDE="${BACKUP_DIR:-/var/backups/lune-soleil}"

# IDENTIFIANTS B2, DANS UN FICHIER A PART, EN 0600.
#
# JAMAIS dans `/etc/lune-soleil/production.env` : celui-ci est lu par le
# conteneur applicatif, et une cle d'ecriture sur le stockage de secours n'a
# rien a faire dans un processus expose au reseau. Meme raisonnement que la cle
# de chiffrement.
FICHIER_CONF="${B2_CONF_FILE:-/etc/lune-soleil/b2.conf}"

RETENTION="${RETENTION_JOURS:-14}"

API_AUTH="https://api.backblazeb2.com/b2api/v4/b2_authorize_account"

echo "Copie hors site des sauvegardes, $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------------------------------------------------------------------------
# Gardes d'entree
#
# MEME PRINCIPE QUE `sauvegarder-base.sh` : chaque etape qui ne peut pas
# conclure arrete le script. Un envoi qui echoue en silence recree exactement le
# defaut que ce ticket corrige, un dispositif qui parait proteger et ne protege
# pas.
# ---------------------------------------------------------------------------

if [ ! -r "$FICHIER_CONF" ]; then
  echo "Arret : $FICHIER_CONF illisible, identifiants B2 introuvables." >&2
  echo "  Attendu : B2_KEY_ID, B2_APP_KEY, B2_BUCKET." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$FICHIER_CONF"
set +a

: "${B2_KEY_ID:?B2_KEY_ID absente de $FICHIER_CONF}"
: "${B2_APP_KEY:?B2_APP_KEY absente de $FICHIER_CONF}"
: "${B2_BUCKET:?B2_BUCKET absente de $FICHIER_CONF}"

if [ ! -d "$REP_SAUVEGARDE" ]; then
  echo "Arret : $REP_SAUVEGARDE n'existe pas, rien a envoyer." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Le jeu du jour, DUMP ET ARCHIVE
#
# LE NOM PORTE L'HORODATAGE, `quotidienne-AAAAMMJJ-HHMMSS.dump.gpg`, donc un tri
# lexicographique donne le meme resultat qu'un tri par date de modification.
# `find -printf` est evite, absent du find BSD : le script tourne sur Ubuntu
# mais doit rester eprouvable sur un Mac, et un garde-fou qu'on ne peut pas
# tester est un garde-fou qu'on ne teste pas.
# ---------------------------------------------------------------------------

DUMP=$(find "$REP_SAUVEGARDE" -maxdepth 1 -name 'quotidienne-*.dump.gpg' 2>/dev/null | sort | tail -1)

if [ -z "$DUMP" ]; then
  echo "Arret : aucun dump CHIFFRE dans $REP_SAUVEGARDE." >&2
  echo "  Un dump en clair ne part PAS hors site : il porte les adresses et les" >&2
  echo "  emails des clients, et Backblaze chiffre avec SES cles, pas les notres." >&2
  echo "  Poser /etc/lune-soleil/backup.key puis rejouer la sauvegarde." >&2
  exit 1
fi

# L'ARCHIVE DU MEME HORODATAGE, jamais la plus recente independamment : un dump
# et une archive de deux nuits differentes restaureraient un catalogue dont les
# fiches et les fichiers ne se correspondent pas.
HORODATAGE=$(basename "$DUMP" | sed 's/^quotidienne-//; s/\.dump\.gpg$//')
ARCHIVE="$REP_SAUVEGARDE/fichiers-$HORODATAGE.tar.gz.gpg"

if [ ! -f "$ARCHIVE" ]; then
  echo "Arret : $(basename "$ARCHIVE") absente, le jeu est incomplet." >&2
  echo "  Un dump sans son archive restaure un catalogue sans photographie, ADR-007." >&2
  exit 1
fi

# UNE SAUVEGARDE DU JOUR, PAS UNE VIEILLE. Si `sauvegarder-base.sh` a cesse de
# tourner, la plus recente peut dater de plusieurs jours : ce script l'enverrait
# sans broncher et le hors-site paraitrait sain alors que la sauvegarde locale
# est morte. On refuse au-dela de 48 h, ce qui laisse passer un decalage
# d'horaire ou un timer rejoue tard, mais pas un arret reel.
#
# `stat -c` est GNU, `stat -f` est BSD : on prend celui qui repond, meme raison
# de testabilite que le tri ci-dessus.
if MODIF=$(stat -c %Y "$DUMP" 2>/dev/null); then
  :
elif MODIF=$(stat -f %m "$DUMP" 2>/dev/null); then
  :
else
  echo "Arret : impossible de lire la date de $(basename "$DUMP")." >&2
  exit 1
fi

AGE_S=$(( $(date +%s) - MODIF ))
if [ "$AGE_S" -gt 172800 ]; then
  echo "Arret : la sauvegarde date de $(( AGE_S / 3600 )) h, la locale a cesse." >&2
  echo "  Verifier lune-soleil-sauvegarde.timer avant de relancer." >&2
  exit 1
fi

echo "  Jeu du $HORODATAGE"

# ---------------------------------------------------------------------------
# Authentification
#
# Le jeton vaut 24 h, on en prend un neuf a chaque execution : le script tourne
# une fois par jour, un cache couterait plus de code que l'appel qu'il economise.
# ---------------------------------------------------------------------------

# `-u` construit lui-meme l'en-tete Basic : les identifiants ne passent donc pas
# par la ligne de commande, lisible dans /proc par tout utilisateur de cette
# machine PARTAGEE.
REPONSE_AUTH=$(curl -sS --max-time 30 -u "${B2_KEY_ID}:${B2_APP_KEY}" "$API_AUTH" 2>&1) || {
  echo "Arret : appel d'authentification B2 impossible." >&2
  echo "  $REPONSE_AUTH" >&2
  exit 1
}

if ! echo "$REPONSE_AUTH" | jq -e '.authorizationToken' >/dev/null 2>&1; then
  echo "Arret : authentification B2 refusee." >&2
  # B2 REND UN `message` VIDE SUR `bad_auth_token`, mesure sur SmartPlanning le
  # 10 septembre 2026 : n'afficher que `.message` ne montrait RIEN, et le
  # diagnostic devenait impossible depuis le journal.
  echo "$REPONSE_AUTH" \
    | jq -r 'if (.message // "") != "" then .message elif (.code // "") != "" then .code else tostring end' 2>/dev/null \
    | sed 's/^/  /' >&2

  # AIDE AU DIAGNOSTIC SANS REVELER LE SECRET. La mise en service de
  # SmartPlanning a bute sur une cle collee depuis un rendu visuel, ou `K003`
  # etait devenu `ЧKOO` : un caractere cyrillique et deux lettres O a la place
  # des zeros. Invisible a l'oeil, et la longueur seule ne suffisait pas.
  LONGUEUR=${#B2_APP_KEY}
  # LA CLE EST EN BASE64 : `/` et `+` y sont legitimes. Seuls comptent les
  # caracteres hors de cet alphabet.
  HORS_BASE64=$(printf '%s' "$B2_APP_KEY" | tr -d 'A-Za-z0-9+/=' | wc -c | tr -d ' ')
  if [ "$LONGUEUR" -ne 31 ] || [ "$HORS_BASE64" -ne 0 ] || [ "${B2_APP_KEY:0:1}" != "K" ]; then
    echo "  Indice de forme : une cle applicative B2 fait 31 caracteres base64" >&2
    echo "  (lettres, chiffres, + et /) et commence par K. Ici : $LONGUEUR caracteres," >&2
    echo "  dont $HORS_BASE64 hors base64, commencant par '${B2_APP_KEY:0:1}'." >&2
  else
    echo "  La cle a une forme valide : le refus vient donc de sa VALEUR." >&2
    echo "  Des sosies visuels (O pour 0, l pour 1) survivent a un controle de" >&2
    echo "  forme. La recopier depuis le gestionnaire de mots de passe, sans" >&2
    echo "  passer par un affichage intermediaire." >&2
  fi
  exit 1
fi

JETON=$(echo "$REPONSE_AUTH" | jq -r '.authorizationToken')
API_URL=$(echo "$REPONSE_AUTH" | jq -r '.apiInfo.storageApi.apiUrl')

# LE bucketId VIENT DE LA REPONSE D'AUTHENTIFICATION, pas d'une valeur ecrite en
# dur. La cle etant restreinte a un seul bucket, B2 le renvoie dans
# `allowed.buckets`. Une divergence entre le bucket autorise et `B2_BUCKET` est
# une erreur de configuration qu'il vaut mieux voir tout de suite.
BUCKET_ID=$(echo "$REPONSE_AUTH" \
  | jq -r --arg n "$B2_BUCKET" '.apiInfo.storageApi.allowed.buckets[]? | select(.name == $n) | .id')

if [ -z "$BUCKET_ID" ] || [ "$BUCKET_ID" = "null" ]; then
  echo "Arret : la cle B2 ne donne pas acces au bucket '$B2_BUCKET'." >&2
  echo "  Buckets autorises :" >&2
  echo "$REPONSE_AUTH" | jq -r '.apiInfo.storageApi.allowed.buckets[]?.name // "(aucun, cle non restreinte)"' \
    | sed 's/^/    /' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Envoi des deux fichiers
#
# LE SHA1 EST CALCULE LOCALEMENT ET VERIFIE PAR B2 A LA RECEPTION : un transfert
# tronque est donc REJETE par le serveur, pas accepte silencieusement. C'est la
# difference entre « envoye » et « arrive intact ».
# ---------------------------------------------------------------------------

# envoyer <chemin local> -> echo l'empreinte envoyee
envoyer() {
  local FICHIER="$1"
  local NOM TAILLE SHA1 REPONSE_URL URL_ENVOI JETON_ENVOI REPONSE_ENVOI

  NOM=$(basename "$FICHIER")
  TAILLE=$(wc -c < "$FICHIER" | tr -d ' ')
  SHA1=$(sha1sum "$FICHIER" | cut -d' ' -f1)

  # UNE URL D'ENVOI PAR FICHIER, et c'est impose par B2 : un jeton d'envoi est
  # lie a une seule requete reussie. Le reutiliser pour le second fichier rend
  # une erreur qui ressemble a un probleme d'authentification.
  REPONSE_URL=$(curl -sS --max-time 30 \
    -H "Authorization: $JETON" \
    "$API_URL/b2api/v4/b2_get_upload_url?bucketId=$BUCKET_ID" 2>&1) || {
    echo "Arret : impossible d'obtenir une URL d'envoi pour $NOM." >&2
    echo "  $REPONSE_URL" >&2
    return 1
  }

  URL_ENVOI=$(echo "$REPONSE_URL" | jq -r '.uploadUrl // empty')
  JETON_ENVOI=$(echo "$REPONSE_URL" | jq -r '.authorizationToken // empty')

  if [ -z "$URL_ENVOI" ] || [ -z "$JETON_ENVOI" ]; then
    echo "Arret : URL d'envoi non obtenue pour $NOM." >&2
    echo "$REPONSE_URL" | jq -r '.message // .' 2>/dev/null | sed 's/^/  /' >&2
    return 1
  fi

  REPONSE_ENVOI=$(curl -sS --max-time 300 \
    -H "Authorization: $JETON_ENVOI" \
    -H "X-Bz-File-Name: $NOM" \
    -H "Content-Type: application/octet-stream" \
    -H "Content-Length: $TAILLE" \
    -H "X-Bz-Content-Sha1: $SHA1" \
    --data-binary "@$FICHIER" \
    "$URL_ENVOI" 2>&1) || {
    echo "Arret : l'envoi de $NOM a echoue." >&2
    echo "  $REPONSE_ENVOI" >&2
    return 1
  }

  if [ -z "$(echo "$REPONSE_ENVOI" | jq -r '.fileId // empty')" ]; then
    echo "Arret : envoi de $NOM refuse par B2." >&2
    echo "$REPONSE_ENVOI" | jq -r '.message // .' 2>/dev/null | sed 's/^/  /' >&2
    return 1
  fi

  printf '%s %s %s' "$NOM" "$TAILLE" "$SHA1"
}

echo "  Envoi vers b2://$B2_BUCKET"

ENVOI_DUMP=$(envoyer "$DUMP") || exit 1
ENVOI_ARCH=$(envoyer "$ARCHIVE") || exit 1

# ---------------------------------------------------------------------------
# Verification APRES envoi
#
# UN CODE 200 DIT QUE LA REQUETE A ABOUTI, pas que le fichier est lisible et
# complet cote B2. On relit donc la liste distante et on compare taille ET
# empreinte a ce qu'on a envoye, pour les DEUX fichiers.
# ---------------------------------------------------------------------------

REPONSE_LISTE=$(curl -sS --max-time 30 \
  -H "Authorization: $JETON" \
  "$API_URL/b2api/v4/b2_list_file_names?bucketId=$BUCKET_ID&maxFileCount=1000" 2>&1) || {
  echo "Arret : impossible de relire la liste distante." >&2
  echo "  $REPONSE_LISTE" >&2
  exit 1
}

# verifier <nom> <taille> <sha1>
verifier() {
  local NOM="$1" TAILLE="$2" SHA1="$3" DISTANT TAILLE_D SHA1_D

  DISTANT=$(echo "$REPONSE_LISTE" | jq -r --arg n "$NOM" \
    '.files[]? | select(.fileName == $n) | "\(.contentLength) \(.contentSha1)"' | head -1)

  if [ -z "$DISTANT" ]; then
    echo "Arret : $NOM absent du bucket apres envoi." >&2
    return 1
  fi

  TAILLE_D=$(echo "$DISTANT" | cut -d' ' -f1)
  SHA1_D=$(echo "$DISTANT" | cut -d' ' -f2)

  if [ "$TAILLE_D" != "$TAILLE" ]; then
    echo "Arret : $NOM, taille distante $TAILLE_D, attendue $TAILLE." >&2
    return 1
  fi

  if [ "$SHA1_D" != "$SHA1" ]; then
    echo "Arret : $NOM, empreinte distante $SHA1_D, attendue $SHA1." >&2
    return 1
  fi

  echo "  Verifie hors site : $NOM, $TAILLE_D octets, sha1 concordant"
}

# shellcheck disable=SC2086
verifier $ENVOI_DUMP || exit 1
# shellcheck disable=SC2086
verifier $ENVOI_ARCH || exit 1

# ---------------------------------------------------------------------------
# Rotation distante
#
# ELLE NE FAIT PAS ECHOUER LE SCRIPT : la copie du jour est faite et verifiee,
# c'est ce qui compte. Un echec de menage se signale sans annuler le travail
# utile.
# ---------------------------------------------------------------------------

LIMITE_MS=$(( ($(date +%s) - RETENTION * 86400) * 1000 ))
SUPPRIMES=0
ECHECS_MENAGE=0

while read -r ancien_nom ancien_id; do
  [ -z "$ancien_nom" ] && continue
  if curl -sS --max-time 30 -X POST \
    -H "Authorization: $JETON" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg n "$ancien_nom" --arg i "$ancien_id" '{fileName: $n, fileId: $i}')" \
    "$API_URL/b2api/v4/b2_delete_file_version" >/dev/null 2>&1; then
    SUPPRIMES=$(( SUPPRIMES + 1 ))
  else
    ECHECS_MENAGE=$(( ECHECS_MENAGE + 1 ))
  fi
done < <(echo "$REPONSE_LISTE" | jq -r --argjson lim "$LIMITE_MS" \
  '.files[]? | select(.uploadTimestamp < $lim) | "\(.fileName) \(.fileId)"')

# LE COMPTE SE RELIT, IL NE SE CALCULE PAS. Deduire « ce qu'il y avait, moins ce
# qu'on a supprime, plus ce qu'on a envoye » suppose que la liste lue apres
# envoi ne contenait pas deja les fichiers du jour, ce qui est faux.
REPONSE_FINALE=$(curl -sS --max-time 30 \
  -H "Authorization: $JETON" \
  "$API_URL/b2api/v4/b2_list_file_names?bucketId=$BUCKET_ID&maxFileCount=1000" 2>/dev/null || echo '{}')

CONSERVES=$(echo "$REPONSE_FINALE" | jq -r '[.files[]? | select(.fileName | startswith("quotidienne-"))] | length' 2>/dev/null || echo "?")

echo "  Rotation distante : $SUPPRIMES supprime(s), $CONSERVES jeu(x) conserve(s) sur $RETENTION."
if [ "$ECHECS_MENAGE" -gt 0 ]; then
  echo "  Note : $ECHECS_MENAGE suppression(s) distante(s) en echec, a surveiller."
fi

echo "Termine, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
