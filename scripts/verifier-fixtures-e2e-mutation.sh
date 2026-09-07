#!/usr/bin/env bash
# Preuve par mutation de `verifier-fixtures-e2e.sh`, LS-168.
#
# POURQUOI CE SCRIPT EXISTE. Un contrôle qui n'a jamais échoué sur le défaut
# qu'il prétend attraper n'est pas un contrôle : il peut chercher au mauvais
# endroit, sur un chemin périmé, ou se satisfaire d'un commentaire. Ce dépôt a
# rencontré les trois cas.
#
# CE QU'IL FAIT. Il réintroduit le défaut réel, une adresse construite à
# l'exécution puis un réessai espacé, vérifie que le contrôle ROUGIT sur chacun,
# et restaure. Un contrôle resté vert sous mutation est un contrôle mort.
#
# LA RESTAURATION PASSE PAR `git checkout`, atomique : un chemin non suivi ferait
# échouer la commande entière, ce qui est le comportement voulu.
#
# Usage : ./scripts/verifier-fixtures-e2e-mutation.sh
# Prérequis : un arbre git propre sur le fichier muté.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
CIBLE="tests/e2e/session-verifiee.setup.ts"
CONTROLE="$RACINE/scripts/verifier-fixtures-e2e.sh"
cd "$RACINE" || exit 1
ko=0

if ! git diff --quiet -- "$CIBLE"; then
  echo "ÉCHEC : $CIBLE porte des modifications non commitées."
  echo "La mutation écraserait du travail : commiter d'abord."
  exit 1
fi

# ---------------------------------------------------------------------------
# ÉTAT DE RÉFÉRENCE. Sans lui, un contrôle déjà rouge avant toute mutation ferait
# conclure « la mutation est détectée » alors que rien n'a été mesuré. Motif
# « mutation sans état de référence » déjà en fiche sur ce dépôt.
# ---------------------------------------------------------------------------
if ! "$CONTROLE" > /dev/null 2>&1; then
  echo "ÉCHEC : le contrôle est DÉJÀ rouge avant toute mutation."
  echo "Aucune conclusion possible tant qu'il n'est pas vert au départ."
  exit 1
fi

echo "État de référence : contrôle vert."

restaurer() {
  git checkout -- "$CIBLE"
}
trap restaurer EXIT

# ---------------------------------------------------------------------------
# MUTATION 1 : l'adresse redevient horodatée, le défaut historique exact.
# ---------------------------------------------------------------------------
perl -0pi -e 's/const email = EMAIL_VERIFIE;/const email = `e2e-x-\$\{Date.now()\}\@exemple.test`;/' "$CIBLE"

# La substitution ci-dessus ne trouve sa cible que si le fichier porte cette
# forme. On MUTE donc par ajout, ce qui ne dépend d'aucune forme préexistante :
# une correction qui échoue en silence accuse le contrôle à tort.
printf '\nconst ADRESSE_MUTANTE = `e2e-mutation-${Date.now()}@exemple.test`;\nvoid ADRESSE_MUTANTE;\n' >> "$CIBLE"

if "$CONTROLE" > /dev/null 2>&1; then
  echo "ÉCHEC mutation 1 : le contrôle reste VERT sur une adresse horodatée."
  ko=1
else
  echo "OK mutation 1 : adresse construite à l'exécution -> le contrôle rougit."
fi

restaurer

# ---------------------------------------------------------------------------
# MUTATION 2 : le réessai espacé revient.
# ---------------------------------------------------------------------------
printf '\nasync function reessaiMutant(p: { waitForTimeout: (n: number) => Promise<void> }) {\n  await p.waitForTimeout(21_000);\n}\nvoid reessaiMutant;\n' >> "$CIBLE"

if "$CONTROLE" > /dev/null 2>&1; then
  echo "ÉCHEC mutation 2 : le contrôle reste VERT sur une attente de 21 s."
  ko=1
else
  echo "OK mutation 2 : réessai espacé -> le contrôle rougit."
fi

restaurer

# ---------------------------------------------------------------------------
# MUTATION 3 : une largeur disparaît de `PROJETS_LARGEUR`.
#
# C'est le défaut silencieux : la suite passerait, et le compte de la largeur
# retirée ne serait plus amorcé. Il ne se verrait qu'au moment où le plafond se
# retrouve consommé, très loin de sa cause.
#
# LA CIBLE EST UN AUTRE FICHIER, d'où sa propre garde et sa propre restauration.
# ---------------------------------------------------------------------------
CIBLE_MODULE="tests/e2e/chemin-session.ts"

if ! git diff --quiet -- "$CIBLE_MODULE"; then
  echo "ÉCHEC : $CIBLE_MODULE porte des modifications non commitées."
  exit 1
fi

perl -0pi -e 's/  "mobile-390",\n//' "$CIBLE_MODULE"

if "$CONTROLE" > /dev/null 2>&1; then
  echo "ÉCHEC mutation 3 : le contrôle reste VERT alors qu'une largeur manque."
  ko=1
else
  echo "OK mutation 3 : largeur retirée de PROJETS_LARGEUR -> le contrôle rougit."
fi

git checkout -- "$CIBLE_MODULE"

# ---------------------------------------------------------------------------
# CONTRÔLE DE RETOUR. La restauration a-t-elle vraiment eu lieu ? Un fichier
# resté muté ferait passer la suite entière pour cassée à la prochaine
# exécution, motif « mutation non restaurée » déjà en fiche.
#
# IL COUVRE LES DEUX FICHIERS MUTÉS, pas seulement le dernier.
# ---------------------------------------------------------------------------
if ! "$CONTROLE" > /dev/null 2>&1; then
  echo "ÉCHEC : le contrôle est rouge APRÈS restauration, le fichier est resté muté."
  ko=1
else
  echo "OK : restauration vérifiée, contrôle de nouveau vert."
fi

exit "$ko"
