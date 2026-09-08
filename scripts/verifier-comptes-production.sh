#!/usr/bin/env bash
# Aucun compte de test ne subsiste sur la base visee, LS-175 critere 10.
#
# ---------------------------------------------------------------------------
# CE QU'IL GARDE. La procedure d'amorcage se termine par une verification en
# base, et une verification faite a l'oeil se saute le jour ou l'on est presse.
# Ce script la rend rejouable et sans ambiguite.
#
# DEUX SENS, ET LE SECOND EST LE PLUS IMPORTANT :
#
#   1. EXACTEMENT UNE administratrice, jamais zero ni deux. Zero rend
#      l'administration inaccessible, deux est impossible par l'index partiel
#      mais le controle ne le suppose pas : il le mesure
#   2. AUCUN compte de test. Les adresses `e2e-` et `@exemple.test` naissent de
#      la suite de bout en bout : sur une base de production, chacune est un
#      moyen d'acces dont personne ne surveille le mot de passe
#
# IL NE S'EXECUTE JAMAIS TOUT SEUL. Aucun hook, aucune etape de CI : il vise la
# base que `DATABASE_URL` designe, et sur un poste de developpement cette base
# porte legitimement des comptes de test. C'est un outil d'ouverture, lance a la
# main avant la bascule.
#
# Usage :
#   ./scripts/verifier-comptes-production.sh
#   ./scripts/verifier-comptes-production.sh --email contact@exemple.fr
#
# `--email` exige en plus que l'administratrice soit CELLE-LA, ce qui ferme le
# cas d'un compte de test promu par megarde.
# ---------------------------------------------------------------------------

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE" || exit 1

EMAIL_ATTENDU=""
[ "${1:-}" = "--email" ] && EMAIL_ATTENDU="${2:-}"

[ -f "$RACINE/.env" ] || {
  echo "ECHEC fichier .env absent, DATABASE_URL ne peut pas etre lue." >&2
  exit 1
}

# LE MODULE LIT `.env` LUI-MEME : une chaine de connexion en argument porte le
# mot de passe, lisible par tout `ps`.
resultat=$(EMAIL_ATTENDU="$EMAIL_ATTENDU" node scripts/lib/verifier-comptes-production.mjs 2>&1) || {
  echo "ECHEC l'acces a la base a echoue : $resultat" >&2
  exit 1
}

echo "$resultat"
printf '%s' "$resultat" | grep -q '^OK ' && exit 0
exit 1
