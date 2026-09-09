#!/usr/bin/env bash
#
# Prouve par mutation que `verifier-plafonds-corps.sh` detecte vraiment ce
# qu'il pretend detecter. LS-207.
#
# LE PREMIER CAS EST LE PLUS IMPORTANT : il rejoue l'etat REEL du depot avant la
# correction, `client_max_body_size 12M`, et exige que le controle rougisse.
# Un controle qui n'a jamais echoue sur le defaut qu'il pretend attraper n'est
# pas un controle, et le seul moyen de le savoir est de lui presenter le defaut
# tel qu'il a EXISTE, pas une forme commode a fabriquer.
#
# IL TRAVAILLE SUR DES COPIES, dans un bac temporaire. Les scripts de mutation
# de ce projet ont deja efface du travail non commite en restaurant par
# `git checkout` : ici l'arborescence suivie n'est jamais touchee.
#
# Usage : ./scripts/verifier-plafonds-corps-mutation.sh

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROLE="$RACINE/scripts/verifier-plafonds-corps.sh"

BAC=$(mktemp -d)
trap 'rm -rf "$BAC"' EXIT

ECHECS=0
CAS=0

FAUSSE_RACINE="$BAC/depot"
mkdir -p "$FAUSSE_RACINE/scripts" "$FAUSSE_RACINE/src/services" "$FAUSSE_RACINE/docker/nginx"
cp "$CONTROLE" "$FAUSSE_RACINE/scripts/"
CONTROLE_COPIE="$FAUSSE_RACINE/scripts/$(basename "$CONTROLE")"

VALIDATION_REEL="$RACINE/src/services/media-validation.ts"
NEXT_REEL="$RACINE/next.config.ts"
NGINX_REEL="$RACINE/docker/nginx/lune-soleil.conf"

VALIDATION_COPIE="$FAUSSE_RACINE/src/services/media-validation.ts"
NEXT_COPIE="$FAUSSE_RACINE/next.config.ts"
NGINX_COPIE="$FAUSSE_RACINE/docker/nginx/lune-soleil.conf"

restaurer() {
  cp "$VALIDATION_REEL" "$VALIDATION_COPIE"
  cp "$NEXT_REEL" "$NEXT_COPIE"
  cp "$NGINX_REEL" "$NGINX_COPIE"
}

# UNE MUTATION QUI NE MODIFIE RIEN NE PROUVE RIEN. C'est la fausse preuve la
# plus couteuse : le controle reste vert et on en conclut qu'il est aveugle,
# alors qu'il n'a simplement rien eu a examiner.
mutation_effective() {
  diff -q "$VALIDATION_REEL" "$VALIDATION_COPIE" >/dev/null 2>&1 || return 0
  diff -q "$NEXT_REEL" "$NEXT_COPIE" >/dev/null 2>&1 || return 0
  diff -q "$NGINX_REEL" "$NGINX_COPIE" >/dev/null 2>&1 || return 0
  return 1
}

attendre_code() {
  local DESC="$1" ATTENDU="$2"
  CAS=$((CAS + 1))

  if [ "$DESC" != "depot intact accepte" ] && ! mutation_effective; then
    echo "  ECHEC $DESC : la mutation n'a modifie aucun fichier, elle ne prouve rien"
    ECHECS=$((ECHECS + 1))
    return
  fi

  local SORTIE OBTENU
  SORTIE=$(bash "$CONTROLE_COPIE" 2>&1)
  OBTENU=$?

  if [ "$OBTENU" -eq "$ATTENDU" ]; then
    echo "  OK    $DESC (code $OBTENU)"
  else
    echo "  ECHEC $DESC : code $OBTENU attendu $ATTENDU"
    printf '%s\n' "$SORTIE" | sed 's/^/        /'
    ECHECS=$((ECHECS + 1))
  fi
}

echo "Preuve par mutation des plafonds de corps, LS-207"
echo

# ---------------------------------------------------------------------------
# Temoin. Sans lui, un controle qui refuse TOUT passerait toutes les mutations.
# ---------------------------------------------------------------------------

restaurer
echo "Temoin, le depot corrige doit passer"
attendre_code "depot intact accepte" 0
echo

# ---------------------------------------------------------------------------
# Cas 2 : L'ETAT REEL D'AVANT LA CORRECTION.
#
# `client_max_body_size 12M` a vecu dans le depot depuis LS-91, et c'est le
# defaut que LS-207 ferme. Le controle doit le refuser.
# ---------------------------------------------------------------------------

echo "L'etat reel d'avant la correction doit bloquer"
restaurer
perl -0pi -e 's/^(\s*client_max_body_size\s+)26M;/${1}12M;/m' "$NGINX_COPIE"
attendre_code "transport a 12M, l'etat d'avant LS-207" 1
echo

# ---------------------------------------------------------------------------
# Cas 3 et 4 : d'autres facons de casser la relation transport >= corps.
# ---------------------------------------------------------------------------

echo "Un transport sous le corps doit bloquer, quelle que soit la valeur"
for VALEUR in 25 1; do
  restaurer
  perl -0pi -e "s/^(\\s*client_max_body_size\\s+)26M;/\${1}${VALEUR}M;/m" "$NGINX_COPIE"
  attendre_code "transport a ${VALEUR}M" 1
done
echo

# ---------------------------------------------------------------------------
# Cas 5 : le corps egale le fichier.
#
# C'est le defaut que `next.config.ts` a DEJA paye une fois : les 175 octets
# d'encodage multipart font qu'un fichier a la limite exacte produit un corps
# plus gros que lui, donc refuse par le transport sans message utilisable.
# ---------------------------------------------------------------------------

echo "Un corps qui n'excede pas le fichier doit bloquer"
restaurer
perl -0pi -e 's/bodySizeLimit:(\s*)"26mb"/bodySizeLimit:${1}"25mb"/' "$NEXT_COPIE"
attendre_code "corps egal au fichier, la fenetre de 175 octets se rouvre" 1
echo

# ---------------------------------------------------------------------------
# Cas 6 : le sens inverse, un fichier remonte au-dela du corps.
#
# La relation se casse aussi en touchant l'AUTRE bout, et un controle qui ne
# regarderait qu'une seule des trois valeurs le raterait.
# ---------------------------------------------------------------------------

echo "Un fichier remonte au-dela du corps doit bloquer"
restaurer
perl -0pi -e 's/TAILLE_MAX_OCTETS = 25 \* 1024 \* 1024/TAILLE_MAX_OCTETS = 40 * 1024 * 1024/' "$VALIDATION_COPIE"
attendre_code "fichier a 40 Mo pour un corps de 26" 1
echo

# ---------------------------------------------------------------------------
# Cas 7 : un transport demesure. Pas un defaut de refus, mais il laisse un
# client envoyer bien plus que ce que l'application traitera.
# ---------------------------------------------------------------------------

echo "Un transport demesure doit etre signale"
restaurer
perl -0pi -e 's/^(\s*client_max_body_size\s+)26M;/${1}512M;/m' "$NGINX_COPIE"
attendre_code "transport a 512M" 1
echo

# ---------------------------------------------------------------------------
# Cas 8 a 10 : LE CONTROLE CONTRE LUI-MEME.
#
# Si un ancrage se perime, le controle comparerait des valeurs vides et les
# declarerait coherentes. Il doit ABANDONNER, code 2, jamais rendre 0.
# ---------------------------------------------------------------------------

echo "Un ancrage casse doit abandonner, jamais rendre un vert"

restaurer
perl -0pi -e 's/TAILLE_MAX_OCTETS = 25 \* 1024 \* 1024/TAILLE_MAXIMALE = 25 * 1024 * 1024/' "$VALIDATION_COPIE"
attendre_code "TAILLE_MAX_OCTETS renomme" 2

restaurer
perl -0pi -e 's/bodySizeLimit:(\s*)"26mb"/tailleMaximaleCorps:${1}"26mb"/' "$NEXT_COPIE"
attendre_code "bodySizeLimit renomme" 2

restaurer
perl -0pi -e 's/^(\s*)client_max_body_size(\s+26M;)/${1}#client_max_body_size${2}/m' "$NGINX_COPIE"
attendre_code "client_max_body_size commente" 2

restaurer

# ---------------------------------------------------------------------------

echo
if [ "$ECHECS" -eq 0 ]; then
  echo "$CAS cas, tous conformes."
  exit 0
fi
echo "$ECHECS echec(s) sur $CAS cas."
exit 1
