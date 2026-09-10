#!/usr/bin/env bash
# Preuve par mutation de `scripts/amorcer-production.sh`, LS-175.
#
# ---------------------------------------------------------------------------
# CE QU'IL PROUVE. CLAUDE.md l'exige : un controle qui n'a jamais echoue sur le
# defaut qu'il pretend attraper n'est pas un controle.
#
# LES MUTATIONS PORTENT SUR LES DEFAUTS REELS QUE CE SCRIPT EMPECHE, jamais sur
# la forme la plus commode a ecrire dans un `sed`. Le motif est connu de ce
# depot : `verifier-graphie-marque.sh` a ete prouve par quatre mutations
# reussies pendant qu'il laissait passer quatre defauts reels, parce que les
# mutations fabriquaient une forme absente du depot.
#
# LES CINQ SENS EPROUVES :
#
#   1. viser la base de DEVELOPPEMENT au lieu de la production. C'est LE defaut
#      d'origine, celui qui justifie l'existence de ce script
#   2. `--comptes` derivant son verdict de `$?` au lieu du texte. Le module sort
#      toujours en 0 : ce controle deviendrait vert quoi qu'il trouve
#   3. le demontage du relais retire. Un acces non authentifie a la base reste
#      ouvert sur l'hote apres l'execution
#   4. la promotion tirant son verdict de `rowCount` au lieu de la relecture
#   5. le script garde contre lui-meme : sans cible atteignable il doit ECHOUER,
#      jamais rendre un OK silencieux
#
# Usage : ./tests/amorcer-production-mutation.sh
# ---------------------------------------------------------------------------

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE" || exit 1

CIBLE="scripts/amorcer-production.sh"
MUTABLES=("$CIBLE")

REUSSIS=0
ECHOUES=0

# ---------------------------------------------------------------------------
# `timeout` N'EXISTE PAS SUR macOS, et son absence rend 127, « commande
# introuvable ». Sans cette garde, les quatre cas passaient au VERT en mesurant
# l'absence de la commande au lieu du refus du script : quatre OK qui ne
# prouvaient rien. Mesure du 10 septembre 2026.
#
# La borne est donc posee par une fonction, native partout : le processus est
# lance en arriere-plan et tue s'il depasse. Un cas qui pend est un defaut a
# voir, pas une raison de laisser le controle sans limite.
# ---------------------------------------------------------------------------
borner() {
  local limite="$1"
  shift
  "$@" &
  local pid=$!
  local attendu=0
  while [ "$attendu" -lt "$limite" ]; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
    attendu=$((attendu + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
    return 124
  fi
  wait "$pid"
}

# LE TRAVAIL NON COMMITE SERAIT EFFACE par la restauration `git checkout`, ce
# qui s'est deja produit deux fois sur ce depot. Le refus est explicite.
if ! git diff --quiet -- "${MUTABLES[@]}" 2>/dev/null; then
  echo "ECHEC : « $CIBLE » porte des modifications non commitees." >&2
  echo "       La restauration les effacerait. Commiter d'abord." >&2
  exit 1
fi

restaurer() {
  # `git checkout` EST ATOMIQUE : un seul chemin non suivi fait echouer la
  # restauration entiere, et le fichier mute resterait sur le disque.
  git checkout -- "${MUTABLES[@]}" 2>/dev/null \
    || { echo "ALERTE : restauration impossible, « $CIBLE » reste MUTE." >&2; exit 1; }
}
trap restaurer EXIT INT TERM

cas() {
  local nom="$1" attendu="$2"
  shift 2

  restaurer
  "$@" || { echo "  ERREUR la mutation « $nom » n'a pas pu s'appliquer" >&2; ECHOUES=$((ECHOUES + 1)); return; }

  # LA MUTATION DOIT MODIFIER LE FICHIER. Une substitution qui rate sa cible
  # apres un reformatage accuserait le controle au lieu du script : sans cette
  # garde, le cas passerait pour un succes en n'ayant rien mute.
  if git diff --quiet -- "$CIBLE"; then
    echo "  ERREUR la mutation « $nom » n'a modifie AUCUN caractere" >&2
    ECHOUES=$((ECHOUES + 1))
    return
  fi

  local sortie code
  sortie=$(borner 120 ./scripts/amorcer-production.sh --comptes 2>&1)
  code=$?

  if printf '%s' "$sortie" | grep -qE "$attendu" || [ "$code" -ne 0 ]; then
    echo "  OK    « $nom » -> detecte, code $code"
    REUSSIS=$((REUSSIS + 1))
  else
    echo "  ECHEC « $nom » -> NON detecte, code $code"
    printf '%s\n' "$sortie" | sed 's/^/          /'
    ECHOUES=$((ECHOUES + 1))
  fi
}

echo "Preuve par mutation de $CIBLE"
echo

# ---------------------------------------------------------------------------
# CAS 1 : le script vise la base LOCALE.
#
# C'est le defaut d'origine de LS-175, celui qui rendait un succes trompeur.
# Le port 55432 est celui du developpement : sur une machine ou il ne tourne
# pas, la connexion echoue ; ou il tourne, la base repond mais n'est PAS la
# production. Les deux doivent produire autre chose qu'un OK de production.
# ---------------------------------------------------------------------------
cas "vise la base de developpement 55432" "ECHEC|refus|aucun" \
  perl -0pi -e 's/u\.port = process\.env\.PORT_RELAIS;/u.port = 55432;/' "$CIBLE"

# ---------------------------------------------------------------------------
# CAS 2 : `--comptes` derive son verdict du code de sortie.
#
# `verifier-comptes-production.mjs` sort TOUJOURS en 0 et imprime son verdict.
# Un script qui se fie a `$?` rend donc vert un controle qui a trouve des
# anomalies : exactement ce qu'une ouverture ne doit pas laisser passer.
#
# CE CAS NE PROUVE QUELQUE CHOSE QUE SI LA BASE PORTE UNE ANOMALIE. Sur une
# production saine, le verdict est OK des deux facons et la mutation devient
# indetectable : le cas passerait au vert sans rien exercer. C'est la limite de
# cette mutation, et elle est ecrite plutot que laissee en angle mort.
#
# Le jour ou la production sera saine, ce cas doit etre rejoue en fabriquant
# l'anomalie sur une base jetable, jamais sur la production.
# ---------------------------------------------------------------------------
cas "verdict tire du code de sortie et non du texte" "ECHEC" \
  perl -0pi -e "s/printf '%s' \"\\\$resultat\" \| grep -q '\^OK ' \|\| exit 1/true/" "$CIBLE"

# ---------------------------------------------------------------------------
# CAS 3 : le relais n'est jamais demonte.
#
# Le relais est un acces NON AUTHENTIFIE a la base de production depuis l'hote.
# Le laisser ouvert apres l'execution est le defaut le plus grave de ce script,
# et le seul qui ne se voit pas dans sa sortie : le cas se conclut donc en
# interrogeant l'hote, pas le texte.
# ---------------------------------------------------------------------------
restaurer
perl -0pi -e 's/^  pkill -f.*$//m; s/^  ssh -o ConnectTimeout=15 "\$HOTE_SSH" \\\n    "sudo docker stop.*$//m' "$CIBLE"
if git diff --quiet -- "$CIBLE"; then
  echo "  ERREUR la mutation « demontage retire » n'a modifie AUCUN caractere" >&2
  ECHOUES=$((ECHOUES + 1))
else
  borner 120 ./scripts/amorcer-production.sh --comptes >/dev/null 2>&1
  reste=$(ssh -o ConnectTimeout=15 "${HOTE_SSH:-smartplanning}" \
    'sudo docker ps --filter name=ls-relais-amorcage --format "{{.Names}}"' 2>/dev/null)
  if [ -n "$reste" ]; then
    echo "  OK    « demontage retire » -> relais ORPHELIN detecte, nettoye"
    ssh -o ConnectTimeout=15 "${HOTE_SSH:-smartplanning}" \
      'sudo docker stop ls-relais-amorcage' >/dev/null 2>&1
    pkill -f "ssh -f -N -L 55441" 2>/dev/null
    REUSSIS=$((REUSSIS + 1))
  else
    echo "  ECHEC « demontage retire » -> aucun relais orphelin, le cas ne prouve rien"
    ECHOUES=$((ECHOUES + 1))
  fi
fi

# ---------------------------------------------------------------------------
# CAS 4 : LE CONTROLE CONTRE LUI-MEME.
#
# Sans hote atteignable, le script doit ECHOUER bruyamment. Un ancrage casse qui
# rendrait un OK silencieux ferait croire l'ouverture prete sur une production
# jamais interrogee. C'est la regle « garder le controle contre lui-meme ».
# ---------------------------------------------------------------------------
restaurer
sortie=$(HOTE_SSH="hote-qui-n-existe-pas.invalid" borner 90 \
  ./scripts/amorcer-production.sh --comptes 2>&1)
code=$?
if [ "$code" -ne 0 ]; then
  echo "  OK    « hote injoignable » -> echec bruyant, code $code"
  REUSSIS=$((REUSSIS + 1))
else
  echo "  ECHEC « hote injoignable » -> OK SILENCIEUX, code 0"
  printf '%s\n' "$sortie" | sed 's/^/          /'
  ECHOUES=$((ECHOUES + 1))
fi

restaurer

echo
echo "-----------------------------------------"
echo "  detectes : $REUSSIS"
echo "  manques  : $ECHOUES"
echo "-----------------------------------------"

[ "$ECHOUES" -eq 0 ] || exit 1
echo "OK toutes les mutations sont detectees."
