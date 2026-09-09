#!/usr/bin/env bash
#
# Prouve par mutation que `verifier-taches-planifiees.sh` detecte vraiment ce
# qu'il pretend detecter. LS-206.
#
# UN CONTROLE QUI N'A JAMAIS ECHOUE SUR LE DEFAUT QU'IL PRETEND ATTRAPER N'EST
# PAS UN CONTROLE. Ce script pose chaque defaut, exige que le controle rougisse,
# et restaure.
#
# IL TRAVAILLE SUR DES COPIES, dans un bac temporaire, et non sur le depot.
# C'est delibere : les scripts de mutation de ce projet restaurent par
# `git checkout` et ont deja efface du travail non commite, deux fois. Ici rien
# n'est touche dans l'arborescence suivie, donc rien ne peut etre perdu.
#
# CHAQUE MUTATION VISE UNE FORME REELLEMENT PRESENTE, jamais celle qui serait la
# plus commode a ecrire : une mutation ne prouve que la forme qu'elle fabrique.
#
# Usage : ./scripts/verifier-taches-planifiees-mutation.sh

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROLE="$RACINE/scripts/verifier-taches-planifiees.sh"

BAC=$(mktemp -d)
trap 'rm -rf "$BAC"' EXIT

ECHECS=0
CAS=0

# Le controle lit ses deux fichiers par des chemins relatifs a SA racine. On
# fabrique donc une fausse racine, avec la meme arborescence, et on y copie le
# controle : il lira les copies.
FAUSSE_RACINE="$BAC/depot"
mkdir -p "$FAUSSE_RACINE/scripts" "$FAUSSE_RACINE/src/services" "$FAUSSE_RACINE/docker/cron"
cp "$CONTROLE" "$FAUSSE_RACINE/scripts/"
CONTROLE_COPIE="$FAUSSE_RACINE/scripts/$(basename "$CONTROLE")"

SOURCE_REELLE="$RACINE/src/services/tache-planifiee.ts"
CRONTAB_REEL="$RACINE/docker/cron/crontab"
SOURCE_COPIE="$FAUSSE_RACINE/src/services/tache-planifiee.ts"
CRONTAB_COPIE="$FAUSSE_RACINE/docker/cron/crontab"

restaurer() {
  cp "$SOURCE_REELLE" "$SOURCE_COPIE"
  cp "$CRONTAB_REEL" "$CRONTAB_COPIE"
}

# UNE MUTATION QUI NE MODIFIE RIEN NE PROUVE RIEN, et c'est la fausse preuve la
# plus couteuse : le controle reste vert, et on en conclut qu'il est aveugle
# alors qu'il n'a simplement rien eu a examiner. Rencontre sur ce script meme,
# `sed 's/\bUTC\b/'` ne remplacant rien sous le sed de BSD.
#
# Ce garde-fou est appele avant chaque jugement : il exige qu'au moins un des
# deux fichiers differe de son original.
mutation_effective() {
  if diff -q "$SOURCE_REELLE" "$SOURCE_COPIE" >/dev/null 2>&1 \
    && diff -q "$CRONTAB_REEL" "$CRONTAB_COPIE" >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

# attendre_code <description> <code attendu>
attendre_code() {
  local DESC="$1" ATTENDU="$2"
  CAS=$((CAS + 1))

  # Le temoin est le seul cas ou l'absence de mutation est normale.
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

echo "Preuve par mutation du controle des taches planifiees, LS-206"
echo

# ---------------------------------------------------------------------------
# Temoin. Sans lui, un controle qui refuse TOUT passerait toutes les mutations.
# ---------------------------------------------------------------------------

restaurer
echo "Temoin, le depot reel doit passer"
attendre_code "depot intact accepte" 0
echo

# ---------------------------------------------------------------------------
# Mutation 1 : le defaut REELLEMENT rencontre le 8 septembre 2026.
# Une tache declaree que le crontab ne declenche pas.
# ---------------------------------------------------------------------------

echo "Une tache declaree mais non planifiee doit bloquer"

for TACHE in envoi-emails purge-quarantaine-medias liberation-reservations; do
  restaurer
  grep -v "declencher.sh ${TACHE}\$" "$CRONTAB_COPIE" > "$CRONTAB_COPIE.tmp"
  mv "$CRONTAB_COPIE.tmp" "$CRONTAB_COPIE"
  attendre_code "ligne '$TACHE' retiree du crontab" 1
done
echo

# ---------------------------------------------------------------------------
# Mutation 2 : le sens inverse. Une ligne de crontab qui ne correspond a aucune
# tache declaree : la route interne la refuserait a chaque echeance, en silence.
# ---------------------------------------------------------------------------

echo "Une tache planifiee mais non declaree doit bloquer"
restaurer
printf '%s\n' "*/7 * * * * /usr/local/bin/declencher.sh tache-fantome" >> "$CRONTAB_COPIE"
attendre_code "tache inconnue ajoutee au crontab" 1
echo

# ---------------------------------------------------------------------------
# Mutation 3 : une tache ajoutee au SERVICE sans etre planifiee. C'est le
# scenario futur que ce controle existe pour empecher, LS-82 et LS-102 l'ayant
# deja produit une fois.
# ---------------------------------------------------------------------------

echo "Une tache ajoutee au service sans etre planifiee doit bloquer"
restaurer
perl -0pi -e 's/(\n\} as const;)/\n  "purge-paniers-abandonnes": { dureeVerrouSecondes: 3600 },$1/' "$SOURCE_COPIE"
attendre_code "sixieme tache declaree, non planifiee" 1
echo

# ---------------------------------------------------------------------------
# Mutation 4 : le fuseau. Un crontab qui ne dit pas son fuseau se lit en heure
# de Paris par un lecteur francais, alors que la machine est en UTC.
# ---------------------------------------------------------------------------

echo "Un crontab muet sur son fuseau doit bloquer"
restaurer
# PERL ET NON SED, et la premiere version de cette ligne l'a appris a ses
# depens. `sed 's/\bUTC\b/.../'` ne remplace RIEN sur macOS, le sed de BSD ne
# connaissant pas la limite de mot `\b` : la mutation ne mutait pas, et le
# controle etait accuse a tort de ne pas detecter le defaut.
#
# C'est la forme la plus couteuse de fausse preuve : une mutation qui ne modifie
# rien rend le controle vert, et on conclut que le controle est aveugle alors
# qu'il n'a rien eu a voir.
#
# LA MUTATION SE VERIFIE DONC AVANT D'ETRE JUGEE : le fichier doit avoir change.
perl -CSD -i -pe 's/\bUTC\b/heure locale/g' "$CRONTAB_COPIE"
attendre_code "mention du fuseau retiree" 1
echo

# ---------------------------------------------------------------------------
# Mutation 5 : LE CONTROLE CONTRE LUI-MEME.
#
# Un ancrage casse rendrait un OK silencieux : si le motif d'extraction ne
# trouve plus rien, le controle comparerait deux listes vides et les declarerait
# concordantes. Il doit ABANDONNER, code 2, et non rendre 0.
#
# Ce cas vient d'un motif du projet : un controle dont l'ancrage se perime
# devient vert sans que personne le remarque.
# ---------------------------------------------------------------------------

echo "Un ancrage casse doit abandonner, jamais rendre un vert"

restaurer
perl -0pi -e 's/export const TACHES = \{/export const TABLE_DES_TACHES = {/' "$SOURCE_COPIE"
attendre_code "bloc TACHES renomme, extraction vide" 2

restaurer
grep -v 'declencher\.sh' "$CRONTAB_COPIE" > "$CRONTAB_COPIE.tmp"
mv "$CRONTAB_COPIE.tmp" "$CRONTAB_COPIE"
attendre_code "crontab vide de tout appel" 2

restaurer

# ---------------------------------------------------------------------------

echo
if [ "$ECHECS" -eq 0 ]; then
  echo "$CAS cas, tous conformes."
  exit 0
fi
echo "$ECHECS echec(s) sur $CAS cas."
exit 1
