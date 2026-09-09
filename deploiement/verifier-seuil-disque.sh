#!/usr/bin/env bash
# Alerte de seuil sur l'espace disque de la machine de production. LS-139.
#
# CE QU'IL FERME. ADR-007 classait l'absence de surveillance du disque en risque
# ACCEPTE, et l'acceptation tenait sur une hypothese qui n'est plus vraie : la
# boutique devait avoir sa propre machine. Depuis ADR-036 le disque est PARTAGE
# avec SmartPlanning, un produit payant avec des clients. Une saturation
# arreterait LES DEUX projets, et la boutique ne serait meme pas la plus
# affectee.
#
# POURQUOI MAINTENANT ET NON QUAND CE SERA URGENT. Mesure du 9 septembre 2026 :
# le disque est passe de 13 % a 20 % en une journee. La cause n'etait aucun des
# trois postes que la documentation surveillait, mais les IMAGES DOCKER, une par
# deploiement, 459 Mo piece, que rien ne purgeait. Le poste croit avec l'activite
# de developpement, pas avec celle de la boutique. La purge est desormais dans
# `deployer.sh` etape 9 ; cette alerte couvre ce que personne n'a prevu.
#
# CE QU'IL N'EST PAS. Une supervision. Il n'a ni historique, ni graphe, ni
# escalade. Il dit une chose, au bon moment, dans un journal qu'un humain lit.
# La supervision complete appartient a LS-107.
#
# LA MACHINE EST PARTAGEE, ET LE MESSAGE LE DIT. Une alerte qui parlerait
# seulement de la boutique laisserait croire a qui la lit que SmartPlanning est
# couvert par ailleurs. Il ne l'est pas : la mesure du 8 septembre 2026 a montre
# que sa base n'etait meme pas sauvegardee.
#
# Usage : ./verifier-seuil-disque.sh
# Codes : 0 sous le seuil, 1 seuil d'alerte franchi, 2 seuil critique franchi.

set -uo pipefail

# 80 % POUR L'ALERTE. A 20 % d'occupation et une croissance mesuree de 7 points
# en un jour de developpement intense, 80 % laisse plusieurs jours de marge
# avant que quoi que ce soit ne casse.
SEUIL_ALERTE="${SEUIL_ALERTE:-80}"

# 90 % POUR LE CRITIQUE. PostgreSQL refuse les ecritures bien avant 100 %, et un
# disque plein ne se repare pas toujours a distance : `apt`, `docker` et
# `journalctl` ont eux-memes besoin de place pour tourner.
SEUIL_CRITIQUE="${SEUIL_CRITIQUE:-90}"

POINT="${POINT_DE_MONTAGE:-/}"

if [ ! -d "$POINT" ]; then
  echo "Arret : $POINT n'existe pas." >&2
  exit 3
fi

# `--output` plutot que le decoupage de `df -h` : le format lisible varie selon
# la longueur du nom de peripherique, et un `awk '{print $5}'` s'est deja
# decale ailleurs quand la ligne se repliait sur deux lignes.
UTILISE_PCT=$(df --output=pcent "$POINT" | tail -1 | tr -d ' %')
LIBRE_LISIBLE=$(df -h --output=avail "$POINT" | tail -1 | tr -d ' ')
TOTAL_LISIBLE=$(df -h --output=size "$POINT" | tail -1 | tr -d ' ')

if ! printf '%s' "$UTILISE_PCT" | grep -qE '^[0-9]+$'; then
  echo "Arret : pourcentage d'occupation illisible, '$UTILISE_PCT'." >&2
  exit 3
fi

HORODATAGE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# LES PLUS GROS POSTES SONT NOMMES DANS L'ALERTE, et c'est ce qui la rend
# actionnable : une alerte qui dit seulement « 85 % » oblige a refaire l'enquete
# a chaud, au pire moment. Ces trois postes sont ceux que la mesure du
# 9 septembre 2026 a designes.
detailler() {
  local IMAGES SAUVEGARDES MEDIAS

  IMAGES=$(docker system df --format '{{.Type}} {{.Size}}' 2>/dev/null \
    | awk '$1=="Images" {print $2}' || true)
  SAUVEGARDES=$(du -sh /var/backups/lune-soleil 2>/dev/null | cut -f1 || true)
  MEDIAS=$(du -sh /var/lib/lune-soleil 2>/dev/null | cut -f1 || true)

  echo "  Postes principaux :"
  echo "    images Docker      ${IMAGES:-non mesure}"
  echo "    sauvegardes        ${SAUVEGARDES:-non mesure}"
  echo "    medias et documents ${MEDIAS:-non mesure}"
  echo "  Machine PARTAGEE avec SmartPlanning, ADR-036 : une saturation"
  echo "  arreterait les deux projets."
  echo "  Conduite a tenir : docs/deploiement/EXPLOITATION.md, section Disque."
}

if [ "$UTILISE_PCT" -ge "$SEUIL_CRITIQUE" ]; then
  echo "$HORODATAGE CRITIQUE : $POINT occupe a ${UTILISE_PCT} %, seuil ${SEUIL_CRITIQUE} %."
  echo "  $LIBRE_LISIBLE libres sur $TOTAL_LISIBLE."
  detailler
  exit 2
fi

if [ "$UTILISE_PCT" -ge "$SEUIL_ALERTE" ]; then
  echo "$HORODATAGE ALERTE : $POINT occupe a ${UTILISE_PCT} %, seuil ${SEUIL_ALERTE} %."
  echo "  $LIBRE_LISIBLE libres sur $TOTAL_LISIBLE."
  detailler
  exit 1
fi

echo "$HORODATAGE Disque $POINT a ${UTILISE_PCT} %, $LIBRE_LISIBLE libres sur $TOTAL_LISIBLE."
exit 0
