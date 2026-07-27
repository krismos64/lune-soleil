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
#     Ecriture AUTORISEE. Christophe ne peut pas les editer lui-meme, une
#     protection qui bloque l'assistant devient un obstacle et non une
#     securite. Ajouter une variable, en modifier une, generer un secret
#     avec openssl : tout cela ne necessite pas de lire l'existant.
#
#     Lecture BLOQUEE. Une valeur lue entre dans le contexte de l'assistant,
#     donc dans l'historique de session sur le disque, et peut ressortir
#     dans une sortie de commande ou un message d'erreur. Presque aucune
#     tache ne l'exige : pour diagnostiquer, lister les noms de variables
#     et la longueur des valeurs suffit, sans afficher leur contenu.
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

# Fichiers d'environnement : ecriture autorisee, lecture bloquee
case "$base" in
  .env|.env.*)
    if [ "$tool" = "Read" ]; then
      echo "Hook BLOCK: lecture refusee sur un fichier d'environnement." >&2
      echo "Fichier : $file" >&2
      echo "" >&2
      echo "L'ECRITURE est autorisee sur ce fichier, seule la lecture des" >&2
      echo "valeurs est bloquee : une valeur lue entrerait dans l'historique" >&2
      echo "de session et pourrait ressortir dans une sortie de commande." >&2
      echo "" >&2
      echo "Alternatives sans lire les valeurs :" >&2
      echo "  Lister les variables definies, sans leur contenu" >&2
      echo "    grep -oE '^[A-Z_]+=' \"$file\"" >&2
      echo "  Verifier qu'une variable est renseignee" >&2
      echo "    grep -qE '^NOM_VARIABLE=.+' \"$file\" && echo presente" >&2
      echo "  Comparer avec le fichier d'exemple" >&2
      echo "    comm -23 <(grep -oE '^[A-Z_]+=' .env.example | sort) \\" >&2
      echo "             <(grep -oE '^[A-Z_]+=' \"$file\" | sort)" >&2
      echo "" >&2
      echo "Si la lecture d'une valeur est reellement necessaire, Christophe" >&2
      echo "peut retirer temporairement ce blocage." >&2
      exit 2
    fi
    # Edit et Write passent
    exit 0 ;;
esac

exit 0
