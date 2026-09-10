#!/usr/bin/env bash
# Amorcage du compte d'administration SUR LA PRODUCTION, LS-175.
#
# ---------------------------------------------------------------------------
# POURQUOI CE SCRIPT EXISTE EN PLUS DE `amorcer-compte-administration.sh`.
#
# Celui-la lit `.env` du depot, donc il vise la base de DEVELOPPEMENT, port
# 55432. Le lancer tel quel le jour de l'ouverture promeut un compte sur la
# mauvaise base et rend un succes parfaitement trompeur : la sortie annonce
# « role relu ADMINISTRATRICE » pendant que la production reste sans
# administration.
#
# LE DEPOT N'EST PAS CLONE SUR LE VPS, mesure le 10 septembre 2026 :
# /opt/lune-soleil ne porte que la composition et le repertoire de deploiement,
# et l'image ne contient pas `scripts/`. Les scripts eprouves vivent donc ici,
# et c'est le RELAIS qui leur donne acces a la base distante.
#
# LA BASE N'EXPOSE AUCUN PORT SUR L'HOTE, par conception. Le chemin est celui
# qu'EXPLOITATION.md a deja eprouve pour les migrations : un relais socat
# ephemere dans le reseau Docker, un tunnel SSH par-dessus, et les deux detruits
# a la sortie quoi qu'il arrive.
# ---------------------------------------------------------------------------
#
# AUCUN SECRET EN ARGUMENT NI EN VARIABLE EXPORTEE VERS UN AUTRE PROCESSUS.
# `DATABASE_URL` est composee sur la machine distante, transmise par l'entree
# standard du processus node, jamais par la ligne de commande : un argument est
# lisible par tout `ps`, et le hook de secrets de ce depot le refuse a raison.
#
# Usage :
#   ./scripts/amorcer-production.sh --verifier            etat, n'ecrit rien
#   ./scripts/amorcer-production.sh --promouvoir <email>  pose le role
#   ./scripts/amorcer-production.sh --comptes             controle d'ouverture
#
# Variable d'environnement :
#   HOTE_SSH   l'hote SSH de la machine, defaut `smartplanning`

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE" || exit 1

HOTE_SSH="${HOTE_SSH:-smartplanning}"
PORT_RELAIS=55441
NOM_RELAIS="ls-relais-amorcage"

ACTION="${1:-}"
EMAIL="${2:-}"

echec() {
  echo >&2
  echo "ECHEC : $1" >&2
  echo >&2
  exit 1
}

case "$ACTION" in
  --verifier | --comptes) ;;
  --promouvoir)
    [ -n "$EMAIL" ] || echec "--promouvoir exige une adresse electronique."
    # L'ADRESSE EST CONTROLEE AVANT DE MONTER QUOI QUE CE SOIT. Une saisie
    # difforme se nomme ici plutot que de produire « aucun compte ne porte
    # cette adresse » apres avoir ouvert un tunnel pour rien.
    case "$EMAIL" in
      *@*.*) ;;
      *) echec "« $EMAIL » n'est pas une adresse electronique." ;;
    esac
    ;;
  *)
    echo "Usage : $0 --verifier | --promouvoir <email> | --comptes" >&2
    exit 2
    ;;
esac

command -v node >/dev/null 2>&1 || echec "node introuvable dans le PATH"
command -v ssh >/dev/null 2>&1 || echec "ssh introuvable dans le PATH"

# ---------------------------------------------------------------------------
# LE DEMONTAGE EST POSE AVANT LE MONTAGE, et c'est deliberé.
#
# Un `trap` installe apres coup laisse une fenetre ou une interruption abandonne
# un relais ouvert sur la base de production. Le relais est un acces non
# authentifie a la base depuis l'hote : le laisser tourner apres une erreur est
# le defaut que ce script doit rendre impossible.
# ---------------------------------------------------------------------------
demonter() {
  local code=$?
  pkill -f "ssh -f -N -L ${PORT_RELAIS}:127.0.0.1:${PORT_RELAIS}" 2>/dev/null
  ssh -o ConnectTimeout=15 "$HOTE_SSH" \
    "sudo docker stop ${NOM_RELAIS} >/dev/null 2>&1" 2>/dev/null
  return $code
}
trap demonter EXIT INT TERM

echo "Amorcage de production, hote « $HOTE_SSH »"
echo

# UN RELAIS DEJA PRESENT EST UN RESTE D'EXECUTION INTERROMPUE, pas une base
# saine : le detruire avant d'en monter un neuf, sans quoi `docker run` echoue
# sur le nom deja pris et le message n'oriente vers rien.
ssh -o ConnectTimeout=15 "$HOTE_SSH" \
  "sudo docker stop ${NOM_RELAIS} >/dev/null 2>&1" >/dev/null 2>&1

ssh -o ConnectTimeout=20 "$HOTE_SSH" "sudo docker run -d --rm --name ${NOM_RELAIS} \
  --network lune-soleil-interne -p 127.0.0.1:${PORT_RELAIS}:${PORT_RELAIS} \
  alpine/socat:latest TCP-LISTEN:${PORT_RELAIS},fork,reuseaddr TCP:lune-soleil-db:5432" \
  >/dev/null 2>&1 || echec "le relais n'a pas demarre sur « $HOTE_SSH »."

ssh -f -N -L "${PORT_RELAIS}:127.0.0.1:${PORT_RELAIS}" "$HOTE_SSH" \
  || echec "le tunnel SSH n'a pas pu s'etablir."

# LE RELAIS MET UN INSTANT A ACCEPTER. Attendre qu'il reponde plutot que de
# dormir un nombre de secondes choisi au hasard : une attente fixe est trop
# longue le plus souvent, et trop courte le jour ou la machine est chargee.
pret=0
for _ in $(seq 1 25); do
  if node -e "
    const net = require('net');
    const s = net.connect(${PORT_RELAIS}, '127.0.0.1');
    s.on('connect', () => { s.destroy(); process.exit(0); });
    s.on('error', () => process.exit(1));
  " 2>/dev/null; then
    pret=1
    break
  fi
done
[ "$pret" -eq 1 ] || echec "le relais n'accepte pas de connexion sur ${PORT_RELAIS}."

# ---------------------------------------------------------------------------
# LES IDENTIFIANTS SONT LUS EN CHAMPS SEPARES, jamais assembles en URI dans ce
# fichier. Deux raisons, et la seconde n'est pas du confort :
#
#   1. l'URI n'existe qu'en memoire du processus node, jamais en argument
#      (lisible par tout `ps`) ni dans un fichier
#   2. l'analyse de secrets de ce depot REFUSE la structure d'un URI de
#      connexion, meme quand chaque morceau est une variable, et GitGuardian
#      fait de meme. Les deux ont raison : elles ne peuvent pas distinguer un
#      gabarit d'une vraie fuite. Ecrire la structure ici bloquerait le commit
#
# Le separateur est une TABULATION, aucun mot de passe n'en portant.
# ---------------------------------------------------------------------------
identifiants=$(ssh -o ConnectTimeout=20 "$HOTE_SSH" 'sudo sh -c '"'"'
  eval "$(grep -E "^POSTGRES_(USER|PASSWORD|DB)=" /etc/lune-soleil/production.env)"
  printf "%s\t%s\t%s" "$POSTGRES_USER" "$POSTGRES_PASSWORD" "$POSTGRES_DB"
'"'"'' 2>/dev/null) \
  || echec "impossible de lire les identifiants sur « $HOTE_SSH »."

[ -n "$identifiants" ] || echec "les identifiants lus sont vides."

# L'ASSEMBLAGE SE FAIT DANS NODE, par `URL`, qui echappe lui-meme ce que le mot
# de passe pourrait porter. Un echappement fait a la main en shell rate toujours
# un caractere, et le defaut se manifeste alors comme « authentification
# refusee » sans rien dire de sa cause.
url=$(PORT_RELAIS="$PORT_RELAIS" node -e '
  const [utilisateur, motDePasse, base] = require("fs")
    .readFileSync(0, "utf8").split("\t");
  const u = new URL("postgresql://127.0.0.1");
  u.port = process.env.PORT_RELAIS;
  u.username = encodeURIComponent(utilisateur);
  u.password = encodeURIComponent(motDePasse);
  u.pathname = "/" + base;
  process.stdout.write(u.toString());
' <<<"$identifiants") || echec "la composition de la chaine de connexion a echoue."

unset identifiants

[ -n "$url" ] || echec "la chaine de connexion composee est vide."

# LES MODULES LISENT `DATABASE_URL` DE L'ENVIRONNEMENT, et `dotenv` ne l'ecrase
# JAMAIS quand elle est deja posee : c'est ce qui permet de reutiliser tels
# quels les modules eprouves sur la base e2e sans les modifier.
case "$ACTION" in
  --verifier)
    [ -n "$EMAIL" ] || EMAIL=$(DATABASE_URL="$url" node -e "
      const { Client } = require('pg');
      (async () => {
        const c = new Client({ connectionString: process.env.DATABASE_URL });
        await c.connect();
        const { rows } = await c.query(
          \"SELECT email FROM utilisateur WHERE role = 'ADMINISTRATRICE'\");
        await c.end();
        process.stdout.write(rows[0]?.email ?? '');
      })();
    " 2>/dev/null)

    if [ -z "$EMAIL" ]; then
      echo "-----------------------------------------"
      echo "  AUCUN compte ne porte le role d'administration."
      echo "  L'administration de la production est INACCESSIBLE."
      echo "-----------------------------------------"
      exit 1
    fi

    DATABASE_URL="$url" MODE_VERIFICATION=1 EMAIL_CIBLE="$EMAIL" \
      node scripts/lib/amorcer-compte-administration.mjs
    ;;

  --promouvoir)
    resultat=$(DATABASE_URL="$url" MODE_VERIFICATION=0 EMAIL_CIBLE="$EMAIL" \
      node scripts/lib/amorcer-compte-administration.mjs 2>&1) \
      || echec "l'acces a la base a echoue : $resultat"

    case "$resultat" in
      ABSENT)
        echec "aucun compte ne porte « $EMAIL » sur la PRODUCTION.
       L'exploitante doit d'abord s'inscrire par
       https://lune-soleil.fr/compte/inscription, en choisissant elle-meme son
       mot de passe, seize caracteres au minimum, ADR-023." ;;
      ERREUR\|*)
        echec "la base a refuse l'operation : ${resultat#ERREUR|}" ;;
    esac

    role_final=$(printf '%s' "$resultat" | cut -d'|' -f4)
    echo "-----------------------------------------"
    echo "  adresse             : $EMAIL"
    echo "  comptes retrogrades : $(printf '%s' "$resultat" | cut -d'|' -f2)"
    echo "  comptes promus      : $(printf '%s' "$resultat" | cut -d'|' -f3)"
    echo "  role relu apres     : $role_final"
    echo "-----------------------------------------"

    # LE VERDICT VIENT DE LA RELECTURE, jamais du compte de lignes.
    [ "$role_final" = "ADMINISTRATRICE" ] || echec "la relecture ne montre PAS le role attendu."
    echo
    echo "OK le compte porte le role d'administration EN PRODUCTION."
    ;;

  --comptes)
    # LE MODULE SORT TOUJOURS EN 0, il IMPRIME son verdict. Le code de sortie se
    # derive du texte, exactement comme `verifier-comptes-production.sh` le fait :
    # se fier a `$?` ici rendrait ce controle vert quoi qu'il trouve, ce qui est
    # le defaut precis que ce script est cense empecher le jour de l'ouverture.
    resultat=$(DATABASE_URL="$url" EMAIL_ATTENDU="$EMAIL" \
      node scripts/lib/verifier-comptes-production.mjs 2>&1) \
      || echec "l'acces a la base a echoue : $resultat"

    echo "$resultat"
    printf '%s' "$resultat" | grep -q '^OK ' || exit 1
    ;;
esac
