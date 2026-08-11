#!/bin/sh
# Declenche une tache planifiee de l'application. LS-72.
#
# CE SCRIPT NE DECIDE RIEN. Il appelle la route interne, qui verifie le secret
# et prend le verrou. S'il est lance deux fois, la seconde execution se fait
# refuser le verrou : c'est le comportement attendu, pas une erreur.
#
# `set -eu` : sortie immediate sur echec, et une variable non definie est une
# erreur. Sans `-u`, un `CRON_SHARED_SECRET` absent produirait un en-tete vide
# et un appel refuse en 404, symptome trompeur qui ferait chercher du cote de
# la route.
set -eu

TACHE="${1:?usage: declencher.sh <nom-de-tache>}"

# L'URL interne du service applicatif dans le reseau Compose, jamais l'URL
# publique : le trafic ne sort pas de l'hote, et la route n'a donc pas besoin
# d'etre exposee au monde.
BASE="${APP_INTERNAL_URL:?APP_INTERNAL_URL manquante}"
SECRET="${CRON_SHARED_SECRET:?CRON_SHARED_SECRET manquante}"

# `--post-data ''` force la methode POST, exigee par la route : une tache
# modifie l'etat, et un GET serait rejouable par un intermediaire.
#
# `-O -` ecrit la reponse sur la sortie standard, qui part dans `docker logs`.
# Sans cela, wget creerait un fichier par appel dans le conteneur.
#
# LE SECRET N'EST JAMAIS ECRIT DANS LA SORTIE : il voyage dans l'en-tete, et
# aucune trace n'affiche la commande complete. Ne pas ajouter de `set -x` ici,
# invariant 9, le depot est public et les journaux sont lisibles.
wget --quiet -O - \
  --header "x-cron-secret: ${SECRET}" \
  --post-data '' \
  "${BASE}/api/interne/taches/${TACHE}"
