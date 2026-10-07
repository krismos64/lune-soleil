#!/usr/bin/env bash
# Preuve par mutation de `verifier-deployer-recreer.sh`, LS-289.
#
# CHAQUE MUTATION VISE UNE COPIE du script de déploiement, jamais le fichier du
# dépôt : rien n'est à restaurer, donc rien ne peut être perdu, à la
# différence des preuves qui mutent en place et restaurent par `git checkout`.
#
# SEPT MUTATIONS, une par sens du contrôle, plus une GARDE : le contrôle doit
# échouer sur le script d'avant LS-289, qui n'a pas l'action.
#
# CHAQUE MUTATION EST VÉRIFIÉE EFFECTIVE avant d'être jugée : une expression
# qui ne correspond plus au code rendrait sinon un « détecté » sur un script
# intact, ou un « raté » sans objet.
#
# Usage : ./scripts/verifier-deployer-recreer-mutation.sh

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$RACINE/deploiement/deployer.sh"
CONTROLE="$RACINE/scripts/verifier-deployer-recreer.sh"

BAC=$(mktemp -d)
trap 'rm -rf "$BAC"' EXIT

mutations=0
echecs=0

echo "État de référence"
if "$CONTROLE" "$SOURCE" >/dev/null 2>&1; then
  echo "  OK    le contrôle passe sur le script du dépôt"
else
  echo "ECHEC le contrôle échoue déjà sans mutation, les mutations ne prouveraient rien."
  exit 1
fi
echo

cas() {
  local nom="$1" expression="$2" attendu="$3"
  mutations=$((mutations + 1))
  cp "$SOURCE" "$BAC/mute.sh"
  perl -0pi -e "$expression" "$BAC/mute.sh"

  if cmp -s "$SOURCE" "$BAC/mute.sh"; then
    echo "  RATE  $nom -> la mutation ne modifie rien, l'expression est périmée"
    echecs=$((echecs + 1))
    return
  fi

  local sortie
  sortie=$("$CONTROLE" "$BAC/mute.sh" 2>&1)
  if [ $? -eq 0 ]; then
    echo "  RATE  $nom -> NON détecté"
    echecs=$((echecs + 1))
  elif ! grep -q "$attendu" <<<"$sortie"; then
    # DÉTECTÉ PAR LE MAUVAIS SENS : la mutation passe pour prouvée alors que
    # l'assertion qu'elle vise pourrait être aveugle.
    echo "  RATE  $nom -> détecté, mais pas par « $attendu »"
    grep ECHEC <<<"$sortie" | sed 's/^/          /'
    echecs=$((echecs + 1))
  else
    echo "  OK    $nom -> détecté"
  fi
}

cas "--force-recreate retiré" \
  's/up -d --no-deps --force-recreate app >\/dev\/null 2>&1; then\n    echouer "la recréation/up -d --no-deps app >\/dev\/null 2>&1; then\n    echouer "la recréation/' \
  "ne demande pas"

cas "historique écrit à la recréation" \
  's/(  journaliser "Recréation terminée)/  printf "x\\n" >> "\$HISTORIQUE"\n$1/' \
  "a écrit l'historique"

cas "image tirée à la recréation" \
  's/(  journaliser "RECRÉATION de)/  docker pull "\$IMAGE_DEPOT:\$SHA_EN_SERVICE" >\/dev\/null 2>&1\n$1/' \
  "tire, construit ou purge"

cas "santé ignorée à la recréation" \
  's/  if ! attendre_conteneur_sain; then\n    echouer "le conteneur recréé/  ECOULE=0; ETAT=healthy\n  if false; then\n    echouer "le conteneur recréé/' \
  "conteneur malade"

cas "domaine non vérifié à la recréation" \
  's/  \[ "\$CODE" = "200" \] \|\| echouer "\/api\/sante rend \$CODE par le domaine après la recréation."/  true/' \
  "domaine en 502"

cas "santé cassée au déploiement seulement" \
  's/if ! attendre_conteneur_sain; then\n  journaliser "  état/if true; then\n  journaliser "  état/' \
  "ne va plus au bout"

cas "fichier d'environnement réécrit à la recréation" \
  's/(  journaliser "RECRÉATION de)/  printf "X=1\\n" >> "\$FICHIER_ENV"\n$1/' \
  "modifié le fichier d'environnement"

# GARDE : le script d'avant LS-289 n'a pas l'action, le contrôle doit le voir.
mutations=$((mutations + 1))
sed '/^if \[ "\$ARGUMENT" = "--recreer" \]; then$/,/^fi$/d' "$SOURCE" > "$BAC/sans-action.sh"
if "$CONTROLE" "$BAC/sans-action.sh" >/dev/null 2>&1; then
  echo "  RATE  action retirée -> NON détecté"
  echecs=$((echecs + 1))
else
  echo "  OK    action retirée -> détecté"
fi

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations détectées"
else
  echo "  $mutations mutations, $echecs NON détectées"
fi
echo "-----------------------------------------"

exit "$echecs"
