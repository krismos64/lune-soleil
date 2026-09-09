#!/usr/bin/env bash
#
# Confronte les trois plafonds de taille de la chaine de televersement.
# LS-207.
#
# CE QU'IL REPOND : « le refus se produira-t-il dans la couche qui sait le
# nommer ». Un fichier trop gros doit etre refuse par le SERVICE, avec son
# message « 25 Mo au maximum », et jamais par le transport, qui rend un 413 nu
# devant lequel l'ecran reste sur sa progression.
#
# LES TROIS VALEURS, et leur ordre est ce qui compte :
#
#   TAILLE_MAX_OCTETS   25 Mo   le FICHIER, src/services/media-validation.ts
#   bodySizeLimit       26 Mo   le CORPS transporte, next.config.ts
#   client_max_body_size 26 Mo  le TRANSPORT, docker/nginx/lune-soleil.conf
#
# Le corps depasse le fichier d'environ 175 octets d'encodage multipart, mesure
# consignee dans `next.config.ts` : egaler les deux ouvrirait une fenetre de
# deux cents octets ou un fichier ACCEPTE par le service serait REFUSE par le
# transport, sur la zone exacte que le message invite a approcher.
#
# POURQUOI IL EXISTE. `client_max_body_size` valait 12M, ecrit en LS-91 avant
# que le plafond du service soit fixe a 25 Mo. Une photographie de 17 Mo, cas
# eprouve par ADR-007, recevait un 413 de Nginx avant meme que la Server Action
# ne s'execute. Le commentaire de `next.config.ts` DESIGNE cette directive comme
# la borne de production, et personne n'avait verifie qu'elle suivait : les
# trois valeurs vivent dans trois fichiers sans lien, TypeScript, configuration
# Next et configuration Nginx.
#
# CODE DE SORTIE : 0 si la chaine est coherente, 1 sinon. Ne pas enchainer de
# pipe pour le lire, un `| tail` rendrait le code de `tail`.
#
# Usage : ./scripts/verifier-plafonds-corps.sh

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VALIDATION="$RACINE/src/services/media-validation.ts"
NEXT_CONFIG="$RACINE/next.config.ts"
NGINX="$RACINE/docker/nginx/lune-soleil.conf"

anomalies=()

abandonner() {
  echo "ABANDON : $1" >&2
  echo "Ce script ne peut pas conclure, il refuse de rendre un vert trompeur." >&2
  exit 2
}

for f in "$VALIDATION" "$NEXT_CONFIG" "$NGINX"; do
  [ -f "$f" ] || abandonner "$f introuvable."
done

# ---------------------------------------------------------------------------
# Extraction des trois valeurs, ramenees en OCTETS pour etre comparables.
#
# LES TROIS S'ECRIVENT DANS TROIS UNITES DIFFERENTES, et c'est la moitie du
# probleme : un produit en octets, une chaine « 26mb », une directive « 26M ».
# Les comparer suppose de les normaliser, ce qu'aucune relecture humaine ne fait
# spontanement.
# ---------------------------------------------------------------------------

# `25 * 1024 * 1024`
FICHIER_MO=$(grep -oE 'TAILLE_MAX_OCTETS = [0-9]+ \* 1024 \* 1024' "$VALIDATION" \
  | grep -oE '[0-9]+ \*' | head -1 | grep -oE '[0-9]+')

# `bodySizeLimit: "26mb"`
CORPS_MO=$(grep -oE 'bodySizeLimit:[[:space:]]*"[0-9]+mb"' "$NEXT_CONFIG" \
  | grep -oE '[0-9]+' | head -1)

# `client_max_body_size 26M;`, en ignorant les lignes de commentaire
TRANSPORT_MO=$(grep -E '^[[:space:]]*client_max_body_size' "$NGINX" \
  | grep -oE '[0-9]+' | head -1)

# UN ANCRAGE CASSE DOIT ABANDONNER, jamais comparer des valeurs vides et les
# declarer coherentes. Le projet a deja vu un controle devenir vert en perdant
# sa cible.
[ -n "$FICHIER_MO" ] || abandonner "TAILLE_MAX_OCTETS introuvable dans $VALIDATION."
[ -n "$CORPS_MO" ] || abandonner "bodySizeLimit introuvable dans $NEXT_CONFIG."
[ -n "$TRANSPORT_MO" ] || abandonner "client_max_body_size introuvable dans $NGINX."

# ---------------------------------------------------------------------------
# Les deux relations qui doivent tenir
# ---------------------------------------------------------------------------

# 1. Le corps doit depasser STRICTEMENT le fichier, pour laisser passer le
#    surcout d'encodage. Egaux, un fichier a la limite exacte serait refuse par
#    le transport : c'est le defaut que next.config.ts a deja paye une fois.
if [ "$CORPS_MO" -le "$FICHIER_MO" ]; then
  anomalies+=("bodySizeLimit ($CORPS_MO Mo) ne depasse pas TAILLE_MAX_OCTETS ($FICHIER_MO Mo) : un fichier a la limite serait refuse par le transport, sans message utilisable")
fi

# 2. Le transport ne doit JAMAIS etre plus bas que le corps. C'est le defaut de
#    LS-207 : 12 contre 26, donc Nginx refusait avant que l'application ne voie
#    la requete.
if [ "$TRANSPORT_MO" -lt "$CORPS_MO" ]; then
  anomalies+=("client_max_body_size ($TRANSPORT_MO Mo) est INFERIEUR a bodySizeLimit ($CORPS_MO Mo) : Nginx rendra 413 avant que la Server Action ne s'execute, l'ecran restera sur sa progression")
fi

# 3. Un transport nettement plus haut n'est pas un defaut de refus, mais il
#    elargit inutilement ce qu'un client peut envoyer avant tout controle
#    applicatif. On le signale au-dela du double.
if [ "$TRANSPORT_MO" -gt $((CORPS_MO * 2)) ]; then
  anomalies+=("client_max_body_size ($TRANSPORT_MO Mo) depasse le double de bodySizeLimit ($CORPS_MO Mo) : le transport accepte bien plus que ce que l'application traitera")
fi

# ---------------------------------------------------------------------------

echo "PLAFONDS DE CORPS, LS-207"
echo

if [ ${#anomalies[@]} -eq 0 ]; then
  echo "  fichier    $FICHIER_MO Mo   TAILLE_MAX_OCTETS"
  echo "  corps      $CORPS_MO Mo   bodySizeLimit"
  echo "  transport  $TRANSPORT_MO Mo   client_max_body_size"
  echo
  echo "OK le refus se produira dans le service, qui sait le nommer"
  exit 0
fi

echo "  fichier $FICHIER_MO Mo, corps $CORPS_MO Mo, transport $TRANSPORT_MO Mo"
echo
for a in "${anomalies[@]}"; do
  echo "  ECHEC $a"
done
echo
echo "Un refus par le transport ne dit rien a l'exploitante : la Server Action"
echo "n'est jamais atteinte, donc aucun message de taille ne s'affiche."
exit 1
