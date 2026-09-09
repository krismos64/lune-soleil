#!/usr/bin/env bash
#
# Incident 3 de LS-139 : disque plein. Repetition d'incident, critères 5 et 6.
#
# CE QU'IL EPROUVE. Que fait la sauvegarde quand le disque qui la recoit est
# plein ? La reponse ecrite est « elle s'arrete plutot que de produire une
# sauvegarde douteuse ». Ce script la MESURE.
#
# IL NE REMPLIT JAMAIS LE DISQUE REEL, et cette phrase est la plus importante du
# fichier. La machine est PARTAGEE avec SmartPlanning depuis ADR-036, un produit
# payant avec des clients. Saturer `/` arreterait les deux projets, et un
# incident joue ne doit jamais devenir l'incident qu'il simule.
#
# LE DECOR EST UN SYSTEME DE FICHIERS DEDIE : une image disque de 20 Mo montee
# en boucle. Elle se remplit en quelques secondes, se demonte proprement, et sa
# saturation n'a AUCUN effet sur `/`. Le script refuse de tourner si le point de
# montage n'est pas ce qu'il attend.
#
# CE QU'IL NE COUVRE PAS. La saturation du disque de la BASE, qui est un volume
# Docker sur `/var/lib/docker`. PostgreSQL y reagit autrement, en refusant les
# ecritures. Cet incident-ci porte le disque de SAUVEGARDE, qui est le poste que
# la rotation borne et celui qu'ADR-037 designe.
#
# Usage : sudo ./incident-disque-plein.sh
#         sudo ./incident-disque-plein.sh --nettoyer   (si un passage a laisse
#                                                       un montage derriere lui)

set -uo pipefail

IMAGE="/var/tmp/lune-soleil-incident-disque.img"
MONTAGE="/mnt/lune-soleil-incident"
TAILLE_MO=20
CONTENEUR="${CONTENEUR_DB:-lune-soleil-db}"
# LE CHEMIN QUE L'UNITE systemd APPELLE, releve par `systemctl cat` et non
# suppose : `/usr/local/sbin/` porte le deployeur et la passerelle, pas la
# sauvegarde. Eprouver un autre fichier que celui qui tourne la nuit ne
# prouverait rien sur la production.
SCRIPT_SAUVEGARDE="${SCRIPT_SAUVEGARDE:-/opt/lune-soleil/deploiement/sauvegarder-base.sh}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Arret : ce script demande root, losetup et mount en ont besoin." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Demontage, appele aussi bien a la fin qu'en cas d'interruption.
#
# UN MONTAGE OUBLIE EST UN PIEGE DIFFERE : le repertoire paraitrait normal, et
# la sauvegarde suivante ecrirait dans 20 Mo au lieu du disque. Le `trap` couvre
# donc l'interruption autant que la sortie normale.
# ---------------------------------------------------------------------------
demonter() {
  if mountpoint -q "$MONTAGE" 2>/dev/null; then
    umount "$MONTAGE" 2>/dev/null || umount -l "$MONTAGE" 2>/dev/null
  fi
  # `losetup -j` liste les peripheriques attaches a CETTE image, jamais tous :
  # un `losetup -D` global detacherait ce qui appartient a SmartPlanning.
  local BOUCLE
  for BOUCLE in $(losetup -j "$IMAGE" 2>/dev/null | cut -d: -f1); do
    losetup -d "$BOUCLE" 2>/dev/null || true
  done
  rm -f "$IMAGE"
  rmdir "$MONTAGE" 2>/dev/null || true
}

if [ "${1:-}" = "--nettoyer" ]; then
  echo "Nettoyage d'un passage precedent"
  demonter
  echo "Fait."
  exit 0
fi

trap demonter EXIT

# ---------------------------------------------------------------------------
# GARDE-FOU D'ENTREE : refuser tout ce qui ressemble au disque reel.
#
# Le point de montage est fixe et verifie. Si `$MONTAGE` existait deja comme
# point de montage, le script s'arrete : ecrire dans un montage qu'on n'a pas
# cree est exactement le geste qui transformerait la simulation en incident.
# ---------------------------------------------------------------------------
if mountpoint -q "$MONTAGE" 2>/dev/null; then
  echo "Arret : $MONTAGE est deja un point de montage, refus d'y toucher." >&2
  echo "Relancer avec --nettoyer si c'est le reliquat d'un passage precedent." >&2
  exit 1
fi

case "$MONTAGE" in
  /mnt/lune-soleil-incident) ;;
  *)
    echo "Arret : point de montage inattendu, $MONTAGE." >&2
    exit 1
    ;;
esac

echo "=========================================================================="
echo "INCIDENT 3, DISQUE PLEIN. LS-139, criteres 5 et 6."
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================================================="
echo

echo "Etat du disque reel AVANT, il ne doit pas bouger de tout l'incident"
df -h / | tail -1 | sed 's/^/  /'
AVANT_UTILISE=$(df --output=used / | tail -1 | tr -d ' ')
echo

# ---------------------------------------------------------------------------
# Le decor
# ---------------------------------------------------------------------------

echo "1. Systeme de fichiers dedie de ${TAILLE_MO} Mo"
dd if=/dev/zero of="$IMAGE" bs=1M count="$TAILLE_MO" status=none
mkfs.ext4 -q -F "$IMAGE" >/dev/null 2>&1
mkdir -p "$MONTAGE"
mount -o loop "$IMAGE" "$MONTAGE"

if ! mountpoint -q "$MONTAGE"; then
  echo "Arret : le montage a echoue." >&2
  exit 1
fi

chmod 700 "$MONTAGE"
df -h "$MONTAGE" | tail -1 | sed 's/^/  /'
echo

# ---------------------------------------------------------------------------
# Temoin : la sauvegarde REUSSIT sur ce disque tant qu'il a de la place.
#
# SANS CE TEMOIN, l'echec de l'etape suivante ne prouverait rien : il pourrait
# venir du montage, des droits, ou de n'importe quoi d'autre que la saturation.
# ---------------------------------------------------------------------------

echo "2. Temoin, sauvegarde sur le disque dedie encore vide"
if BACKUP_DIR="$MONTAGE" CONTENEUR_DB="$CONTENEUR" "$SCRIPT_SAUVEGARDE" 2>&1 | sed 's/^/  /'; then
  echo "  -> la sauvegarde reussit, le decor est sain"
else
  echo "  ARRET : le temoin echoue, l'incident ne prouverait rien." >&2
  exit 1
fi
echo
ls -la "$MONTAGE" | sed 's/^/  /'
echo

# On repart d'un disque propre pour la saturation.
rm -f "$MONTAGE"/quotidienne-*.dump "$MONTAGE"/fichiers-*.tar.gz

# ---------------------------------------------------------------------------
# La saturation
#
# `fallocate` reserve sans ecrire, donc c'est immediat. On laisse volontairement
# quelques kilo-octets : un disque a 100,0 % exact est moins realiste qu'un
# disque ou il reste de quoi creer un fichier mais pas de quoi l'ecrire. C'est
# le cas qui piege, celui ou `touch` reussit et `write` echoue.
# ---------------------------------------------------------------------------

echo "3. Saturation du disque dedie"
fallocate -l "$(( (TAILLE_MO - 1) * 1024 * 1024 ))" "$MONTAGE/remplissage.bin" 2>/dev/null \
  || dd if=/dev/zero of="$MONTAGE/remplissage.bin" bs=1M count="$((TAILLE_MO - 1))" status=none 2>/dev/null
# Puis on finit a ras bord, en acceptant l'echec d'ecriture qui signale le plein.
dd if=/dev/zero of="$MONTAGE/finition.bin" bs=1k status=none 2>/dev/null || true
sync
df -h "$MONTAGE" | tail -1 | sed 's/^/  /'
echo

# ---------------------------------------------------------------------------
# L'incident
# ---------------------------------------------------------------------------

echo "4. Sauvegarde sur le disque plein"
SORTIE=$(BACKUP_DIR="$MONTAGE" CONTENEUR_DB="$CONTENEUR" "$SCRIPT_SAUVEGARDE" 2>&1)
CODE=$?
printf '%s\n' "$SORTIE" | sed 's/^/  /'
echo "  code de sortie : $CODE"
echo

# ---------------------------------------------------------------------------
# Le jugement, TROIS sens et non un seul
# ---------------------------------------------------------------------------

echo "5. Jugement"
ECHECS=0

# Sens 1 : le script s'arrete. Un code 0 signifierait qu'il annonce une
# sauvegarde reussie sur un disque plein, ce qui est le pire des cas : la
# supervision lirait un succes.
if [ "$CODE" -ne 0 ]; then
  echo "  OK   le script s'arrete, code $CODE"
else
  echo "  ECHEC le script annonce un succes sur un disque plein"
  ECHECS=$((ECHECS + 1))
fi

# Sens 2 : aucune sauvegarde tronquee ne subsiste. Un dump partiel laisse en
# place serait promu « derniere sauvegarde » par la restauration, et
# `migrate-production.sh` le refuserait au moment ou on en a besoin.
RESTES=$(find "$MONTAGE" -maxdepth 1 -type f \( -name 'quotidienne-*.dump' -o -name 'fichiers-*.tar.gz' \) 2>/dev/null | wc -l | tr -d ' ')
if [ "$RESTES" -eq 0 ]; then
  echo "  OK   aucune sauvegarde tronquee laissee derriere"
else
  echo "  ECHEC $RESTES fichier(s) de sauvegarde laisse(s) sur un disque plein :"
  find "$MONTAGE" -maxdepth 1 -type f \( -name 'quotidienne-*.dump' -o -name 'fichiers-*.tar.gz' \) -exec ls -la {} \; | sed 's/^/       /'
  ECHECS=$((ECHECS + 1))
fi

# Sens 3 : le disque REEL n'a pas bouge. C'est le sens qui protege
# SmartPlanning, et il se verifie plutot que de se supposer.
APRES_UTILISE=$(df --output=used / | tail -1 | tr -d ' ')
DELTA=$(( APRES_UTILISE - AVANT_UTILISE ))
# Une tolerance de 50 Mo : les journaux et l'activite normale de deux
# applications ecrivent pendant l'incident.
if [ "$DELTA" -lt 51200 ]; then
  echo "  OK   le disque reel n'a pas ete rempli, delta ${DELTA} Ko"
else
  echo "  ECHEC le disque reel a cru de ${DELTA} Ko pendant l'incident"
  ECHECS=$((ECHECS + 1))
fi
echo

# ---------------------------------------------------------------------------
# Le retablissement, CRITERE 6
#
# Le critere ne demande pas seulement que le service resiste a l'incident, mais
# qu'il se retablisse SANS INTERVENTION une fois la cause levee.
# ---------------------------------------------------------------------------

echo "6. Retablissement, critere 6"
rm -f "$MONTAGE/remplissage.bin" "$MONTAGE/finition.bin"
sync
df -h "$MONTAGE" | tail -1 | sed 's/^/  /'

SORTIE_APRES=$(BACKUP_DIR="$MONTAGE" CONTENEUR_DB="$CONTENEUR" "$SCRIPT_SAUVEGARDE" 2>&1)
CODE_APRES=$?
printf '%s\n' "$SORTIE_APRES" | sed 's/^/  /'

if [ "$CODE_APRES" -eq 0 ]; then
  echo "  OK   la sauvegarde reprend seule une fois la place rendue"
else
  echo "  ECHEC la sauvegarde ne reprend pas apres liberation, code $CODE_APRES"
  ECHECS=$((ECHECS + 1))
fi
echo

# ---------------------------------------------------------------------------
# L'application pendant l'incident
#
# La saturation portait un disque dedie, donc l'application ne devait RIEN
# ressentir. On le verifie plutot que de l'affirmer : c'est ce qui distingue
# « l'incident etait circonscrit » de « je crois qu'il l'etait ».
# ---------------------------------------------------------------------------

echo "7. L'application n'a rien ressenti"
SANTE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3002/api/sante 2>/dev/null || echo "000")
echo "  /api/sante -> $SANTE"
if [ "$SANTE" = "200" ]; then
  echo "  OK   l'application repond normalement"
else
  echo "  ATTENTION /api/sante rend $SANTE, a examiner"
fi
echo

echo "=========================================================================="
if [ "$ECHECS" -eq 0 ]; then
  echo "INCIDENT 3 : tous les sens verifies."
else
  echo "INCIDENT 3 : $ECHECS sens en echec."
fi
echo "Etat du disque reel APRES"
df -h / | tail -1 | sed 's/^/  /'
echo "=========================================================================="

exit "$ECHECS"
