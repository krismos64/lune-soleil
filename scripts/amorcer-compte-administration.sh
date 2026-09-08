#!/bin/bash
# Amorcage du compte d'administration de l'exploitante, LS-175.
#
# ---------------------------------------------------------------------------
# POURQUOI CE SCRIPT EXISTE, ET POURQUOI IL N'Y A PAS D'ECRAN.
#
# ADR-021 decide « un seul compte administrateur, celui de l'exploitante » et une
# authentification par passkey. Il decrit comment elle SE CONNECTE, jamais
# comment son compte APPARAIT.
#
# LE CODE INTERDIT DELIBEREMENT DE SE PROMOUVOIR : `role` porte `input: false`
# dans la configuration de Better Auth, regle E11, donc aucune requete HTTP ne
# peut poser `ADMINISTRATRICE`. C'est exactement l'invariant 2, et ce n'est pas
# un defaut a corriger : un test capable de se promouvoir par l'API signalerait
# un trou de production.
#
# LA PROMOTION PASSE DONC PAR LA BASE, et ce script est le seul chemin. Un ecran
# d'administration des comptes serait une generalisation prematuree, ce projet
# n'ayant qu'un seul compte.
# ---------------------------------------------------------------------------
#
# CE QU'IL NE FAIT PAS, ET QUI RESTE MANUEL :
#
#   - l'INSCRIPTION prealable de l'exploitante par `/compte/inscription`. Elle
#     choisit son mot de passe elle-meme, seize caracteres minimum, ADR-023, et
#     le developpeur ne le connait jamais
#   - l'enregistrement de sa PASSKEY, lie au materiel ET au domaine reel : le
#     `rpID` etant le domaine, une passkey enregistree ailleurs ne vaut rien en
#     production. Cette etape ne se delegue pas
#
# Usage :
#   ./scripts/amorcer-compte-administration.sh contact@exemple.fr
#   ./scripts/amorcer-compte-administration.sh contact@exemple.fr --verifier
#
# `--verifier` ne modifie RIEN : il rend l'etat courant et sort en 1 si le compte
# ne porte pas le role. C'est le mode a employer avant l'ouverture.

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE" || exit 1

EMAIL="${1:-}"
MODE_VERIFICATION=0
[ "${2:-}" = "--verifier" ] && MODE_VERIFICATION=1

echec() {
  echo
  echo "ECHEC : $1" >&2
  echo
  exit 1
}

if [ -z "$EMAIL" ]; then
  echo "Usage : $0 <email> [--verifier]" >&2
  echo >&2
  echo "  <email>      l'adresse du compte a promouvoir, deja inscrit" >&2
  echo "  --verifier   n'ecrit rien, rend l'etat courant" >&2
  exit 2
fi

# L'ADRESSE EST CONTROLEE AVANT TOUT ACCES A LA BASE. Une adresse difforme
# signale une erreur de saisie, qu'il vaut mieux nommer ici que laisser produire
# « aucun compte ne porte cette adresse » plus bas.
case "$EMAIL" in
  *@*.*) ;;
  *) echec "« $EMAIL » n'est pas une adresse electronique." ;;
esac

command -v node >/dev/null 2>&1 || echec "node introuvable dans le PATH"
[ -f "$RACINE/.env" ] || echec "fichier .env absent, DATABASE_URL ne peut pas etre lue."

# LE TRAVAIL EN BASE VIT DANS UN MODULE SEPARE, jamais en ligne dans ce fichier :
# le SQL et le shell ont des regles de citation incompatibles, et les imbriquer a
# produit un script syntaxiquement casse a la premiere ecriture.
#
# AUCUNE URL EN ARGUMENT : le module lit `.env` lui-meme, une chaine de connexion
# en argument etant lisible par tout `ps`.
resultat=$(MODE_VERIFICATION="$MODE_VERIFICATION" EMAIL_CIBLE="$EMAIL" \
  node scripts/lib/amorcer-compte-administration.mjs 2>&1) \
  || echec "l'acces a la base a echoue : $resultat"

case "$resultat" in
  ABSENT)
    echec "aucun compte ne porte l'adresse « $EMAIL ».
       L'exploitante doit d'abord s'inscrire par /compte/inscription, en
       choisissant elle-meme son mot de passe, seize caracteres au minimum,
       ADR-023. Le developpeur ne le connait jamais." ;;
  ERREUR\|*)
    echec "la base a refuse l'operation : ${resultat#ERREUR|}" ;;
esac

if [ "$MODE_VERIFICATION" -eq 1 ]; then
  role=$(printf '%s' "$resultat" | cut -d'|' -f2)
  verification=$(printf '%s' "$resultat" | cut -d'|' -f3)

  echo "-----------------------------------------"
  echo "  Compte : $EMAIL"
  echo "    role  : $role"
  echo "    email : $verification"
  echo "-----------------------------------------"

  [ "$role" = "ADMINISTRATRICE" ] || echec "ce compte ne porte PAS le role d'administration.
       Lancer sans --verifier pour le promouvoir."

  echo
  echo "OK le compte porte le role d'administration."
  exit 0
fi

retrogrades=$(printf '%s' "$resultat" | cut -d'|' -f2)
promus=$(printf '%s' "$resultat" | cut -d'|' -f3)
role_final=$(printf '%s' "$resultat" | cut -d'|' -f4)

echo "-----------------------------------------"
echo "  Amorcage du compte d'administration"
echo "    adresse             : $EMAIL"
echo "    comptes retrogrades : $retrogrades"
echo "    comptes promus      : $promus"
echo "    role relu apres     : $role_final"
echo "-----------------------------------------"
echo

# LE VERDICT VIENT DE LA RELECTURE, jamais du compte de lignes : `rowCount`
# prouve qu'une instruction a porte, pas que l'etat final est celui attendu.
[ "$role_final" = "ADMINISTRATRICE" ] || echec "la relecture ne montre PAS le role attendu.
       Rien ne garantit l'etat de la base, ne pas poursuivre l'ouverture."

echo "OK le compte porte le role d'administration."
echo
echo "IL RESTE DEUX GESTES, ET ILS NE SE DELEGUENT PAS :"
echo
echo "  1. l'exploitante enregistre sa PASSKEY depuis son propre appareil, sur"
echo "     le domaine de PRODUCTION. Le rpID est le domaine : une passkey"
echo "     enregistree ailleurs ne vaut rien en production."
echo
echo "  2. une SECONDE connexion par cette passkey prouve qu'elle fonctionne,"
echo "     avant de considerer l'ouverture possible."
echo
echo "Verifier l'etat a tout moment :"
echo "  $0 $EMAIL --verifier"
