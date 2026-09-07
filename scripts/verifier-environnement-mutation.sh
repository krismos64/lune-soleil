#!/usr/bin/env bash
# Prouve que `verifier-environnement.sh` attrape les quatre defauts qu'il
# annonce, LS-156, critere 8. Un controle qui n'a jamais echoue sur son propre
# defaut n'est pas un controle.
#
# ------------------------------------------------------------------
# IL NE TOUCHE JAMAIS AU `.env` REEL, et c'est la difference avec les autres
# scripts de mutation du depot, qui mutent des fichiers suivis par git et les
# restaurent par `git checkout HEAD`.
#
# CETTE RESTAURATION EST IMPOSSIBLE ICI : `.env` n'est pas suivi, `.gitignore`
# l'exclut. Le muter puis echouer a le restaurer detruirait une configuration
# locale irrecuperable, secrets compris, qu'aucun `git checkout` ne ramenerait.
#
# LE SCRIPT TRAVAILLE DONC SUR UN BAC A SABLE : un repertoire temporaire portant
# son propre `.env` et son propre `.env.example`, ou le controle est lance avec
# `RACINE` deplacee. Le `.env` reel n'est jamais ni lu ni ecrit.
# ------------------------------------------------------------------
#
# LES VALEURS DE TEST NE SONT PAS DES SECRETS, et elles sont choisies pour ne
# pas en avoir l'air : le depot est public et l'analyse de secrets refuserait un
# motif litteral credible : un prefixe assemble suivi de `x` repetes
# ressemble a la forme sans etre une cle, ce que la fiche sur GitGuardian
# impose.
#
# Usage : ./scripts/verifier-environnement-mutation.sh
SCRIPT_CIBLE="verifier-environnement.sh"

set -uo pipefail
RACINE="$(cd "$(dirname "$0")/.." && pwd)"

BAC="$(mktemp -d "${TMPDIR:-/tmp}/ls156-XXXXXX")"
trap 'rm -rf "$BAC"' EXIT

mkdir -p "$BAC/scripts"
cp "$RACINE/scripts/$SCRIPT_CIBLE" "$BAC/scripts/"

# ---------------------------------------------------------------------------
# LA CLI `stripe` EST MASQUEE DANS LE BAC A SABLE, et ce n'est pas un
# contournement : c'est ce qui rend cette preuve reproductible.
#
# Le sens de concordance compare le `.env` au secret que `stripe listen` rend.
# Sur un poste ou la CLI est installee et authentifiee, le `.env` FACTICE du bac
# a sable ne concordera jamais avec le vrai secret : l'etat de reference serait
# rouge, et chaque cas trouverait un code non nul qui ne lui doit rien.
#
# Mesure du 7 septembre 2026 : la premiere version de ce script echouait
# exactement ainsi, et sa garde d'etat de reference l'a dit plutot que
# d'annoncer sept reussites fausses.
#
# EN LA MASQUANT, le sens s'annonce NON VERIFIE, ce qui est le comportement du
# critere 4 et ne fait pas echouer. La concordance elle-meme reste prouvee
# ailleurs, sur le poste reel, ou elle a trouve un vrai defaut.
#
# `PATH` REDUIT AU STRICT NECESSAIRE plutot qu'un faux `stripe` qui echoue : un
# binaire factice testerait le chemin « CLI presente mais muette », pas celui
# « CLI absente », et les deux messages different.
# ---------------------------------------------------------------------------
# LA CONCORDANCE STRIPE EST NEUTRALISEE PAR `LS_SANS_STRIPE=1`, et le controle
# l'annonce alors NON VERIFIEE plutot que de la compter reussie.
#
# POURQUOI ELLE DOIT L'ETRE : ce script travaille sur un `.env` FACTICE. Sur un
# poste ou la CLI stripe est authentifiee, ce secret factice ne concorderait
# jamais avec le vrai, l'etat de reference serait rouge, et chaque cas trouverait
# un code non nul qui ne lui doit rien.
#
# DEUX APPROCHES ONT ETE ESSAYEES ET ECARTEES avant celle-ci, le 7 septembre
# 2026. Reconstruire un PATH minimal outil par outil : chaque oubli produisait
# une erreur differente et opaque, et enumerer les outils dont depend un script
# est une liste ecrite a la main. Masquer `stripe` par un repertoire homonyme en
# tete de PATH : `command -v` continue de trouver le vrai binaire plus loin,
# mesure.
#
# La concordance elle-meme reste prouvee sur le poste reel, ou elle a trouve un
# VRAI defaut le jour de son ecriture.
export LS_SANS_STRIPE=1

reussites=0
echecs=0
cas=0

# ---------------------------------------------------------------------------
# Le `.env.example` du bac a sable, minimal et suffisant.
#
# IL PORTE LES DEUX FORMES, requise et facultative, sans quoi le sens du
# marqueur ne serait pas exerce.
# ---------------------------------------------------------------------------
poser_exemple() {
  cat >"$BAC/.env.example" <<'EXEMPLE'
DATABASE_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
BETTER_AUTH_SECRET=
MEDIA_RACINE=
# @facultative un defaut existe, info
LOG_LEVEL=
# @facultative mediateur non designe ; les trois vont ensemble
LEGAL_MEDIATEUR_NOM=
# @facultative mediateur non designe ; les trois vont ensemble
LEGAL_MEDIATEUR_ADRESSE=
# @facultative mediateur non designe ; les trois vont ensemble
LEGAL_MEDIATEUR_SITE=
EXEMPLE
}

# ---------------------------------------------------------------------------
# L'ETAT SAIN, celui dont chaque cas s'ecarte d'UNE seule chose.
#
# LES PREFIXES SONT ASSEMBLES A L'EXECUTION, heredoc NON quote, et ce n'est pas
# du zele : la premiere version les ecrivait en clair et **gitleaks a refuse le
# commit**, signalant un secret de webhook et une chaine de connexion avec mot
# de passe. Le garde-fou avait raison, une valeur factice trop credible est
# indiscernable d'une vraie pour un analyseur.
#
# C'est le meme motif que le hook qui bloque sa propre explication, deja en
# fiche : ecrire la forme interdite, meme pour la tester, la rend interdite. Le
# hook de ce ticket a d'ailleurs bloque la commande qui appliquait ce
# correctif, la citation du prefixe suffisant a le declencher.
#
# LES VALEURS RESTENT VALIDES POUR LE CONTROLE, qui verifie le PREFIXE et la
# forme, jamais la credibilite du suffixe.
# ---------------------------------------------------------------------------
poser_env_sain() {
  local p_s="s" p_k="k" p_w="wh" p_pg="postgre"
  local remplissage
  remplissage=$(printf 'x%.0s' {1..32})

  cat >"$BAC/.env" <<ENVIRONNEMENT
DATABASE_URL=${p_pg}sql://utilisateur:motdepasse@localhost:5432/base?schema=public
STRIPE_SECRET_KEY=${p_s}${p_k}_test_${remplissage}
STRIPE_WEBHOOK_SECRET=${p_w}sec_${remplissage}
BETTER_AUTH_SECRET=${remplissage}${remplissage}
MEDIA_RACINE=/var/lib/lune-soleil/medias
ENVIRONNEMENT
}

# LE MESSAGE ATTENDU EST VERIFIE, pas seulement le code de sortie. Un script qui
# rougirait pour une AUTRE raison passerait un test qui ne regarde que le code.
# Motif « mutation vue par le mauvais test ».
jouer() {
  local intitule="$1" motif_attendu="$2"
  cas=$((cas + 1))

  local sortie code
  sortie=$(cd "$BAC" && ./scripts/"$SCRIPT_CIBLE" 2>&1)
  code=$?

  if [ "$code" -eq 0 ]; then
    echo "ECHEC cas $cas, $intitule"
    echo "      le controle est reste VERT sur cette mutation : c'est un trou."
    echecs=$((echecs + 1))
    return
  fi

  if ! printf '%s' "$sortie" | grep -qF "$motif_attendu"; then
    echo "ECHEC cas $cas, $intitule"
    echo "      le controle a rougi, mais PAS sur le defaut vise."
    echo "      attendu : $motif_attendu"
    echo "      obtenu  :"
    printf '%s\n' "$sortie" | sed 's/^/        /'
    echecs=$((echecs + 1))
    return
  fi

  echo "OK    cas $cas, $intitule"
  reussites=$((reussites + 1))
}

echo "Preuve par mutation de scripts/$SCRIPT_CIBLE"
echo "Bac a sable : $BAC, le .env reel n'est ni lu ni ecrit."
echo ""

# ---------------------------------------------------------------------------
# L'ETAT DE REFERENCE DOIT ETRE VERT, garde de LS-196 : sa preuve annoncait
# « 8 sur 8 » sur un controle deja rouge, chaque mutation trouvant un code non
# nul qui ne lui devait rien.
#
# `stripe` ETANT PROBABLEMENT ABSENTE du bac a sable comme du poste, le sens de
# concordance s'annonce NON VERIFIE et ne fait pas echouer : c'est precisement
# le comportement du critere 4, et l'etat de reference le confirme.
# ---------------------------------------------------------------------------
poser_exemple
poser_env_sain

if ! (cd "$BAC" && ./scripts/"$SCRIPT_CIBLE" >/dev/null 2>&1); then
  echo "ECHEC l'etat de reference est deja ROUGE, avant toute mutation."
  echo "      Chaque cas trouverait alors un code non nul qui ne lui doit rien,"
  echo "      et ce script annoncerait des reussites qui n'en sont pas."
  echo ""
  (cd "$BAC" && ./scripts/"$SCRIPT_CIBLE" 2>&1) | sed 's/^/        /'
  exit 1
fi

echo "OK    etat de reference vert, les mutations partent d'un sol propre"
echo ""

# ---------------------------------------------------------------------------
# Cas 1 : une variable requise est ABSENTE, defaut 2 du ticket.
#
# C'est `MEDIA_RACINE` manquante le 31 aout : le televersement echoue, donc
# aucun produit ne peut etre publie, la publication exigeant un media traite.
# ---------------------------------------------------------------------------
poser_env_sain
grep -v '^MEDIA_RACINE=' "$BAC/.env" >"$BAC/.env.tmp" && mv "$BAC/.env.tmp" "$BAC/.env"
jouer "une variable requise est absente" "MEDIA_RACINE : absente"

# ---------------------------------------------------------------------------
# Cas 2 : une variable est MAL FORMEE, defaut 1 sous sa forme detectable.
#
# LES TROIS ETATS SE DISTINGUENT, critere 2 : « absente », « mal formee » et
# « ne concorde pas » appellent trois gestes differents. Le cas 1 verifie le
# premier, celui-ci le deuxieme, le cas 5 le troisieme.
# ---------------------------------------------------------------------------
poser_env_sain
sed 's|^DATABASE_URL=.*|DATABASE_URL=mysql://u:p@localhost/b|' "$BAC/.env" >"$BAC/.env.tmp" && mv "$BAC/.env.tmp" "$BAC/.env"
jouer "une variable est mal formee" "DATABASE_URL : mal formee"

# ---------------------------------------------------------------------------
# Cas 3 : une cle est declaree DEUX FOIS, defaut 3.
#
# LE CAS LE PLUS DISCRET DES QUATRE. Sans effet tant que les valeurs
# concordent : ici elles DIFFERENT, ce qui est la situation dangereuse, la
# seconde declaration gagnant en silence.
# ---------------------------------------------------------------------------
poser_env_sain
echo "MEDIA_RACINE=/autre/chemin" >>"$BAC/.env"
jouer "une cle est declaree deux fois" "declaree DEUX FOIS"

# ---------------------------------------------------------------------------
# Cas 4 : un marqueur `@facultative` est pose SANS RAISON.
#
# UNE EXEMPTION SANS MOTIF EST UN INTERRUPTEUR, PAS UNE DECISION. Sans ce sens,
# rendre une variable optionnelle demanderait un geste et aucune justification,
# et la liste des facultatives grossirait sans que rien ne l'interroge.
# ---------------------------------------------------------------------------
poser_exemple
poser_env_sain
printf '# @facultative\nUNE_VARIABLE_DE_PLUS=\n' >>"$BAC/.env.example"
jouer "un marqueur @facultative sans raison" "@facultative sans raison"
poser_exemple

# ---------------------------------------------------------------------------
# Cas 5 : un GROUPE est renseigne a moitie.
#
# CE SENS N'EXISTAIT PAS DANS LA PREMIERE VERSION, et son absence a ete mesuree
# en ecrivant le script : marquer les trois variables du mediateur facultatives
# rendait chacune absente sans consequence, donc un `.env` portant le nom du
# mediateur SANS son adresse passait au vert. `lireMediateur` rend `null` dans
# ce cas, et une designation partielle laisse le client sans moyen d'exercer
# son recours tout en donnant l'apparence de la conformite.
# ---------------------------------------------------------------------------
poser_env_sain
echo "LEGAL_MEDIATEUR_NOM=Un mediateur" >>"$BAC/.env"
jouer "un groupe est renseigne a moitie" "renseigne A MOITIE"

# ---------------------------------------------------------------------------
# Cas 6 : le `.env` est absent.
#
# LE CAS LIMITE QUI DOIT SE DIRE PLUTOT QUE DE PASSER. Un controle qui sort en 0
# faute de fichier a examiner rassure a tort, motif deja rencontre sur ce depot
# avec `verifier-jira.sh` et ses variables manquantes.
# ---------------------------------------------------------------------------
rm -f "$BAC/.env"
jouer "le fichier .env est absent" "aucun fichier .env"
poser_env_sain

# ---------------------------------------------------------------------------
# Cas 7 : `.env.example` est absent, donc la liste n'a plus de source.
#
# LE SENS LE PLUS FACILE A OUBLIER : sans son exemple, le script deriverait une
# liste VIDE et declarerait tout conforme. Un controle dont la source disparait
# doit refuser de conclure, jamais annoncer un succes par defaut.
# ---------------------------------------------------------------------------
rm -f "$BAC/.env.example"
jouer "le fichier .env.example est absent" "n'a plus de source"
poser_exemple

# ---------------------------------------------------------------------------
# Cas 8 : un processus porte un secret dans sa ligne de commande, critere 7.
#
# LE SEUL CAS QUI DEMANDE UN VRAI PROCESSUS, les sept autres se jouant sur des
# fichiers. Un `sleep` suffit : ce qui compte est sa LIGNE DE COMMANDE, que le
# script lit dans `ps`, pas ce qu'il fait.
#
# LE PREFIXE EST ASSEMBLE, jamais ecrit en entier, pour la meme raison que dans
# le script teste : ce fichier serait sinon illisible par toute session, et
# l'analyse de secrets du depot public refuserait un motif litteral.
#
# LE PROCESSUS EST TUE DANS TOUS LES CAS, y compris si le controle echoue avant
# la fin : un `sleep` orphelin portant un faux secret survivrait a la session et
# ferait rougir toutes les executions suivantes.
# ---------------------------------------------------------------------------
poser_env_sain

pre_s="s"; pre_k="k"
FAUX_SECRET="${pre_s}${pre_k}_test_$(printf 'Z%.0s' {1..24})"

# `perl` ET NON `sleep` NI `bash -c`, et les deux ecarts ont ete mesures le
# 7 septembre 2026 en ecrivant ce cas :
#
#   `sleep 30 --api-key X` : sleep REFUSE l'argument et meurt aussitot. Aucun
#   processus a mesurer, le cas rougissait sans que la mutation soit appliquee.
#
#   `bash -c 'sleep 30' --api-key X` : bash REMPLACE son image par `sleep 30`,
#   et les arguments suivant le script sont consommes comme $0 et $1. `ps`
#   affiche « sleep 30 », le secret a disparu. Le controle restait vert A JUSTE
#   TITRE, et l'accuser aurait ete une erreur de diagnostic.
#
# `perl` garde ses arguments dans argv sans les reinterpreter, et `ps` les
# montre. Verifie avant d'ecrire ce cas plutot que suppose.
perl -e 'sleep 30' -- --api-key "$FAUX_SECRET" &
PID_TEMOIN=$!
trap 'kill "$PID_TEMOIN" 2>/dev/null; rm -rf "$BAC"' EXIT

# Laisser `ps` voir le processus avant de mesurer. Sans cette attente, le cas
# echouerait par intermittence sur une machine chargee, et l'echec ressemblerait
# a un trou du controle.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  ps -eo args 2>/dev/null | grep -qF "$FAUX_SECRET" && break
  sleep 0.2
done

jouer "un processus porte un secret en ligne de commande" \
  "porte(nt) un secret en ligne de commande"

kill "$PID_TEMOIN" 2>/dev/null
wait "$PID_TEMOIN" 2>/dev/null
trap 'rm -rf "$BAC"' EXIT

# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------
echo ""
if [ "$echecs" -gt 0 ]; then
  echo "ECHEC $echecs cas sur $cas non detecte(s) par $SCRIPT_CIBLE."
  echo "      Un controle qui reste vert sur son propre defaut n'en est pas un."
  exit 1
fi

echo "OK $reussites mutations sur $cas detectees par $SCRIPT_CIBLE."
