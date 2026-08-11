#!/bin/bash
# PreToolUse hook (Bash) — bloque les commandes qui IMPRIMENT des secrets.
#
# POURQUOI CE HOOK EXISTE, ET CE QUE L'AUTRE NE COUVRE PAS.
#
# `hook-block-secret-files.sh` lit `tool_input.file_path`, un champ que seuls
# Read, Edit et Write renseignent. Une commande Bash n'en a pas : ce hook-la
# sort en 0 sans rien verifier des lors que l'appel passe par Bash.
#
# Les regles `deny` de settings.json portent sur `Read(./.env)` et attrapent
# bien un `cat .env` ou un `grep X .env`, parce que Claude Code reconnait la
# lecture d'un fichier nomme. Elles ne peuvent rien contre une commande qui
# lit `.env` SANS LE NOMMER, et c'est exactement ce qui s'est produit pendant
# LS-72 : `docker compose config` resout les variables du fichier
# d'environnement et les imprime en clair, mot de passe de base compris. Aucun
# garde-fou ne l'a vu, la commande ne nommant aucun fichier interdit.
#
# CE QUE CE HOOK NE PRETEND PAS FAIRE. Il ne peut pas fermer tous les chemins :
# un script quelconque peut lire `.env` et l'afficher, et aucune liste de
# motifs ne couvrira toutes les formulations. Il ferme les chemins CONNUS et
# nommes, ce qui vaut mieux que rien, et sa liste s'allonge quand un nouveau
# chemin se decouvre. Le garde-fou reel reste la regle de conduite : pour
# diagnostiquer, lister les NOMS de variables sans leur contenu.
#
# Politique identique a celle des fichiers, decidee le 27 juillet 2026 :
# l'ecriture dans un `.env` est autorisee, la lecture des valeurs est bloquee.

set -u
input=$(cat)

commande=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)
[ -z "$commande" ] && exit 0

refuser() {
  echo "Hook BLOCK: cette commande imprimerait des valeurs de secrets." >&2
  echo "" >&2
  echo "Motif reconnu : $1" >&2
  echo "" >&2
  echo "Une valeur lue entre dans l'historique de session sur le disque et" >&2
  echo "peut ressortir dans une sortie de commande ou un message d'erreur." >&2
  echo "" >&2
  echo "Pour diagnostiquer, lister les NOMS sans les valeurs :" >&2
  echo "  sed 's/=.*//' .env" >&2
  echo "  docker compose config --services      # sans resolution des valeurs" >&2
  echo "  docker compose config --quiet         # valide sans rien imprimer" >&2
  exit 2
}

# `docker compose config` sans `--services`, `--volumes`, `--profiles`,
# `--images` ni `--quiet` imprime le fichier resolu, donc les valeurs du
# `.env`. Les sous-commandes de listage, elles, n'impriment aucune valeur.
if echo "$commande" | grep -qE '(docker[[:space:]]+compose|docker-compose)([[:space:]]+-[^[:space:]]+|[[:space:]]+-f[[:space:]]+[^[:space:]]+)*[[:space:]]+config'; then
  if ! echo "$commande" | grep -qE '\-\-(services|volumes|profiles|images|quiet|hash)'; then
    refuser "docker compose config resout et imprime les variables du .env"
  fi
fi

# `printenv`, `env` et `export -p` sans argument deversent tout
# l'environnement, secrets du processus compris.
if echo "$commande" | grep -qE '(^|[;&|][[:space:]]*)(printenv|export[[:space:]]+-p)([[:space:]]*$|[[:space:]]*[;&|])'; then
  refuser "printenv ou export -p imprime tout l'environnement"
fi

# `env` seul, sans commande a executer derriere. `env VAR=x commande` et
# `env -u VAR commande` restent autorises : ils POSENT un environnement, ils
# ne l'impriment pas, et la suite de tests s'en sert.
if echo "$commande" | grep -qE '(^|[;&|][[:space:]]*)env([[:space:]]*$|[[:space:]]*\|)'; then
  refuser "env sans argument imprime tout l'environnement"
fi

exit 0
