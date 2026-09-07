#!/bin/bash
# PreToolUse hook (Read|Edit|Write) — protege les fichiers de secrets.
#
# Ce hook est la couche de protection principale, et non le filet de secours.
# Un hook qui sort en code 2 bloque l'appel AVANT l'evaluation des regles de
# permission, il prime donc sur toute regle allow.
#
# POLITIQUE, decidee avec Christophe le 27 juillet 2026
#
#   Fichiers d'environnement (.env et variantes)
#     Lecture ET ecriture AUTORISEES depuis le 7 septembre 2026, arbitrage
#     de Christophe. La politique d'avant bloquait la lecture ; elle a ete
#     levee pour que l'assistant voie les defauts de configuration au lieu
#     de les deviner.
#
#     CE QUE CETTE OUVERTURE COUTE, ecrit ici parce qu'une decision se
#     relit avec son prix. Une valeur lue entre dans l'historique de
#     session sur le disque, non chiffre, et transite par l'API a chaque
#     tour. Une cle qui y passe se REVOQUE en cas de doute, l'effacer ne
#     suffit pas : le depot est public et l'historique lui survit.
#
#     CE QUE L'OUVERTURE NE CHANGE PAS : les diagnostics sans lecture
#     restent les meilleurs sur les secrets. Deux chaines de 70 caracteres
#     au meme prefixe sont indiscernables a l'oeil, et c'est une
#     comparaison d'empreintes qui a tranche le 7 septembre 2026, pas une
#     lecture. `scripts/verifier-environnement.sh` porte ces diagnostics.
#
#   Cles privees, certificats, magasins de secrets
#     Lecture ET ecriture BLOQUEES. Une cle privee ne s'edite jamais a la
#     main, elle se genere. Aucun benefice a l'ouvrir, risque de fuite
#     maximal.
#
#   Fichiers d'exemple (.env.example et variantes)
#     Totalement autorises, ils ne contiennent que des noms et des formats.
#
# Repartition avec les regles deny de settings.json : une regle deny ne peut
# pas porter d'exception d'autorisation, elle ne sait donc pas distinguer la
# lecture de l'ecriture sur un meme chemin. C'est ce hook qui porte la nuance.

set -u
input=$(cat)

file=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -z "$file" ] && exit 0

tool=$(echo "$input" | jq -r '.tool_name // ""' 2>/dev/null)
base=$(basename "$file")

# Fichiers d'exemple : toujours autorises
case "$base" in
  .env.example|.env.sample|.env.template) exit 0 ;;
esac

# Cles privees, certificats, magasins de secrets : bloques dans les deux sens
case "$base" in
  *.pem|*.key|*.p12|*.pfx|*.jks|id_rsa|id_ed25519|*.keystore)
    echo "Hook BLOCK: acces refuse a une cle ou un certificat." >&2
    echo "Fichier : $file" >&2
    echo "" >&2
    echo "Lecture et ecriture bloquees. Une cle privee se genere, elle ne" >&2
    echo "s'edite pas a la main. Utiliser ssh-keygen ou openssl, dont la" >&2
    echo "sortie va directement dans le fichier sans passer par l'assistant." >&2
    exit 2 ;;
esac

case "$file" in
  */secrets/*|*/.secrets/*|*/.ssh/*|*/.gnupg/*|*/.aws/credentials*)
    echo "Hook BLOCK: acces refuse a un repertoire de secrets." >&2
    echo "Fichier : $file" >&2
    exit 2 ;;
esac

# Fichiers d'environnement : lecture ET ecriture autorisees depuis le
# 7 septembre 2026. Le `case` est conserve plutot que supprime : il documente
# que ces fichiers sont vus par ce hook et deliberement laisses passer, ce
# qu'une absence de branche ne dirait pas.
case "$base" in
  .env|.env.*)
    exit 0 ;;
esac

exit 0
