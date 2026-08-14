#!/usr/bin/env bash
# Preuve du hook qui bloque les commandes imprimant des secrets, LS-72.
#
# MOTIF. Le hook a ete ecrit apres qu'une relecture a expose un mot de passe de
# base par `docker compose config`. Une revue de securite automatique a ensuite
# trouve trois defauts dans sa premiere version, dont un fail-open et un
# contournement par `--file` : un garde-fou de securite qui n'est pas exerce
# vaut ce que vaut la confiance qu'on lui accorde, c'est-a-dire rien.
#
# CE SCRIPT JOUE LES DEUX SENS. Les cas qui doivent bloquer prouvent que la
# protection existe ; les cas qui doivent passer prouvent qu'elle ne gene pas le
# travail, ce qui est la condition pour qu'elle survive. Un hook qui bloque
# `env -u DATABASE_URL npm run test:unitaire` serait desactive dans la semaine.
#
# Usage : ./scripts/verifier-hook-secrets.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

HOOK=".claude/scripts/hook-block-secret-commands.sh"

if [ ! -x "$HOOK" ]; then
  echo "ECHEC hook introuvable ou non executable : $HOOK"
  exit 1
fi

ok=0
ko=0

jouer() {
  local attendu="$1" commande="$2" code
  code=$(printf '%s' "{\"tool_input\":{\"command\":$(jq -Rn --arg c "$commande" '$c')}}" \
    | "$HOOK" >/dev/null 2>&1; echo $?)

  if [ "$code" = "$attendu" ]; then
    ok=$((ok + 1))
  else
    echo "  ECHEC [$commande] : attendu code $attendu, obtenu $code"
    ko=$((ko + 1))
  fi
}

echo "Commandes qui doivent etre REFUSEES"

# `docker compose config` resout le .env et l'imprime. Les quatre formes
# couvrent les variantes d'invocation, dont `--file` qui contournait la
# premiere version du hook.
jouer 2 'docker compose config'
jouer 2 'docker compose --file docker-compose.yml config'
jouer 2 'docker compose -f docker-compose.yml -f docker-compose.cron.yml config'
jouer 2 'docker-compose config'

# Deversement de l'environnement du processus.
jouer 2 'printenv'
jouer 2 'env'
jouer 2 'export -p'

# Lecture directe d'un fichier d'environnement, y compris derriere un
# separateur de commandes.
jouer 2 'cat .env'
jouer 2 'head -5 .env'
jouer 2 'tail .env'
jouer 2 'less .env'
jouer 2 'source .env'
jouer 2 'echo bonjour; cat .env'

# Lecteurs autres que les commandes d'affichage evidentes. Ajoutes le 14 aout
# 2026 : `cat .env` etait refuse quand `sed -n 1p .env` passait, trou reste
# theorique tant que `sed` demandait une autorisation, devenu atteignable en
# versionnant `Bash(sed:*)` et consorts dans settings.json.
jouer 2 'sed -n 1p .env'
jouer 2 'awk "{print}" .env'
jouer 2 'perl -ne "print" .env'
jouer 2 'nl .env'
jouer 2 'grep SECRET .env'
jouer 2 'cut -d= -f2 .env'

echo "  $ok refus corrects"

echo
echo "Commandes qui doivent PASSER"
avant=$ok

# Les formes de listage de Compose n'impriment aucune valeur.
jouer 0 'docker compose config --services'
jouer 0 'docker compose config --quiet'
jouer 0 'docker compose up -d db'

# `env` qui POSE un environnement plutot que de l'imprimer. Le premier est la
# commande qui prouve que la suite unitaire tourne sans base : le hook doit la
# laisser passer, sans quoi il serait desactive.
jouer 0 'env -u DATABASE_URL npm run test:unitaire'
jouer 0 'env NODE_ENV=test npm test'

# Lister les NOMS de variables sans leur contenu, geste recommande par la
# regle de conduite du projet.
jouer 0 "sed 's/=.*//' .env"
jouer 0 'cut -d= -f1 .env'
jouer 0 'sed -n 1p .env.example'

# Les fichiers d'exemple ne portent que des noms et des formats.
jouer 0 'cat .env.example'
jouer 0 'grep CRON_SHARED_SECRET .env.example'

# Faux positifs a ne pas creer : `config` existe ailleurs.
jouer 0 'git config user.name'
jouer 0 'npm run build'

echo "  $((ok - avant)) passages corrects"

echo
echo "Defaut ferme sur l'outillage"

# UN HOOK DE SECURITE QUI ECHOUE OUVERT NE PROTEGE RIEN, et son absence de
# protection serait invisible. `jq` manquant est un incident d'environnement,
# jamais une autorisation. Defaut trouve par une revue automatique sur la
# premiere version, qui sortait en 0.
code=$(printf '%s' '{"tool_input":{"command":"npm run build"}}' \
  | env PATH=/nonexistent "$RACINE/$HOOK" >/dev/null 2>&1; echo $?)

if [ "$code" = 2 ]; then
  echo "  OK    jq absent : le hook refuse plutot que de laisser passer"
  ok=$((ok + 1))
else
  echo "  ECHEC jq absent : le hook a rendu $code, il devrait bloquer en 2"
  ko=$((ko + 1))
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  $ok cas, tous conformes"
else
  echo "  $ok conformes, $ko ECHECS"
fi
echo "-----------------------------------------"

exit "$ko"
