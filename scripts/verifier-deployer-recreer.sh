#!/usr/bin/env bash
# Contrôle de l'action `--recreer` de `deploiement/deployer.sh`, LS-289.
#
# LE SCRIPT EST EXÉCUTÉ POUR DE VRAI, avec un faux `docker` placé en tête du
# PATH qui journalise ses appels et répond ce qu'on lui dit. Aucune machine,
# aucun conteneur : ce qui est mesuré est ce que le script DEMANDE à Docker, et
# c'est exactement ce qui compte sur une machine partagée avec SmartPlanning.
#
# QUATRE SENS :
#   1. la recréation nominale demande `up -d --no-deps --force-recreate app`,
#      et réussit ;
#   2. elle ne tire aucune image, ne construit rien, et n'écrit ni l'historique
#      ni le fichier d'environnement ;
#   3. un conteneur qui ne devient pas sain la fait échouer, en le disant ;
#   4. un domaine qui ne rend pas 200 la fait échouer aussi ;
#   5. le DÉPLOIEMENT normal d'un nouveau SHA va toujours au bout : LS-289 a
#      sorti l'attente de santé et la vérification par le domaine en fonctions
#      partagées, et ce chemin-là est celui de chaque mise en production.
#
# Usage : ./scripts/verifier-deployer-recreer.sh [chemin-du-script]
# Le chemin est un paramètre pour que la preuve par mutation vise une copie.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${1:-$RACINE/deploiement/deployer.sh}"
ko=0

[ -r "$SCRIPT" ] || { echo "ECHEC script introuvable : $SCRIPT"; exit 1; }

BAC=$(mktemp -d)
trap 'rm -rf "$BAC"' EXIT

# --- Le faux docker --------------------------------------------------------
mkdir -p "$BAC/bin" "$BAC/racine"
cat > "$BAC/bin/docker" <<'FAUX'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$APPELS_DOCKER"
case "$1" in
  inspect) printf '%s\n' "$SANTE_SIMULEE" ;;
  # Le compte des migrations appliquées, lu par l'étape 3 du déploiement.
  exec) printf '5\n' ;;
  run) printf '%s' "$CODE_SIMULE" ;;
  compose) exit 0 ;;
  *) exit 0 ;;
esac
FAUX
chmod +x "$BAC/bin/docker"
# `sleep` neutralisé : l'attente de santé ne doit pas ralentir le contrôle.
printf '#!/bin/sh\nexit 0\n' > "$BAC/bin/sleep"
chmod +x "$BAC/bin/sleep"

touch "$BAC/racine/docker-compose.production.yml"
# La sauvegarde préalable du déploiement : simulée, elle n'a rien à prouver ici.
mkdir -p "$BAC/racine/deploiement" "$BAC/sauvegardes"
printf '#!/bin/sh\nexit 0\n' > "$BAC/racine/deploiement/sauvegarder-base.sh"
chmod +x "$BAC/racine/deploiement/sauvegarder-base.sh"

lancer() {
  local sante="$1" code="$2" argument="${3:---recreer}"
  printf 'IMAGE_TAG=%s\nPOSTGRES_USER=u\nPOSTGRES_DB=d\n' "$(printf 'a%.0s' $(seq 1 40))" > "$BAC/env"
  printf '2026-10-01T00:00:00Z %s\n' "$(printf 'b%.0s' $(seq 1 40))" > "$BAC/historique"
  : > "$BAC/appels"
  cp "$BAC/env" "$BAC/env.avant"
  cp "$BAC/historique" "$BAC/historique.avant"

  PATH="$BAC/bin:$PATH" \
    APPELS_DOCKER="$BAC/appels" SANTE_SIMULEE="$sante" CODE_SIMULE="$code" \
    RACINE_DEPLOIEMENT="$BAC/racine" FICHIER_ENV="$BAC/env" \
    HISTORIQUE_DEPLOIEMENT="$BAC/historique" DELAI_SANTE=10 \
    BACKUP_DIR="$BAC/sauvegardes" \
    bash "$SCRIPT" "$argument" > "$BAC/sortie" 2>&1
}

# --- Sens 1 et 2 : la recréation nominale ---------------------------------
lancer healthy 200
CODE_SORTIE=$?

if [ "$CODE_SORTIE" -ne 0 ]; then
  echo "ECHEC la recréation nominale sort en $CODE_SORTIE"
  sed 's/^/      /' "$BAC/sortie"
  ko=$((ko + 1))
fi

if ! grep -qE '^compose .* up -d --no-deps --force-recreate app$' "$BAC/appels"; then
  echo "ECHEC la recréation ne demande pas « up -d --no-deps --force-recreate app »"
  sed 's/^/      /' "$BAC/appels"
  ko=$((ko + 1))
fi

if grep -qE '(^pull |--build| rmi |prune)' "$BAC/appels"; then
  echo "ECHEC la recréation tire, construit ou purge une image"
  grep -E '(^pull |--build| rmi |prune)' "$BAC/appels" | sed 's/^/      /'
  ko=$((ko + 1))
fi

if ! cmp -s "$BAC/historique" "$BAC/historique.avant"; then
  echo "ECHEC la recréation a écrit l'historique : le retour arrière viserait l'image en service"
  ko=$((ko + 1))
fi

if ! cmp -s "$BAC/env" "$BAC/env.avant"; then
  echo "ECHEC la recréation a modifié le fichier d'environnement"
  ko=$((ko + 1))
fi

# --- Sens 3 : un conteneur qui ne devient pas sain -------------------------
lancer unhealthy 200
if [ $? -eq 0 ]; then
  echo "ECHEC un conteneur malade laisse la recréation réussir"
  ko=$((ko + 1))
elif ! grep -q "revoir la dernière modification" "$BAC/sortie"; then
  echo "ECHEC l'échec de santé ne dit pas où chercher"
  sed 's/^/      /' "$BAC/sortie"
  ko=$((ko + 1))
fi

# --- Sens 4 : un domaine qui ne répond pas 200 -----------------------------
lancer healthy 502
if [ $? -eq 0 ]; then
  echo "ECHEC un domaine en 502 laisse la recréation réussir"
  ko=$((ko + 1))
fi

# --- Sens 5 : le déploiement normal d'un nouveau SHA va au bout -----------
NOUVEAU=$(printf 'c%.0s' $(seq 1 40))
lancer healthy 200 "$NOUVEAU"
if [ $? -ne 0 ] || ! grep -q "Déploiement terminé" "$BAC/sortie"; then
  echo "ECHEC le déploiement normal d'un nouveau SHA ne va plus au bout"
  sed 's/^/      /' "$BAC/sortie"
  ko=$((ko + 1))
elif ! grep -q "^IMAGE_TAG=$NOUVEAU$" "$BAC/env"; then
  echo "ECHEC le déploiement normal n'a pas posé le nouveau tag"
  ko=$((ko + 1))
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  OK --recreer recrée app seule, sans image ni historique, et échoue en le disant"
else
  echo "  $ko anomalie(s) sur --recreer"
fi
echo "-----------------------------------------"

exit "$ko"
