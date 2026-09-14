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

# LA CIBLE DOIT EXISTER AVANT DE MUTER, LS-230.
#
# Une mutation dont le fichier a disparu ne mute RIEN : le contrôle reste vert,
# et le cas s'annonce comme un trou du contrôle alors que c'est la preuve qui est
# morte. Deux preuves de ce dépôt mutaient des `loading.tsx` retirés par C32, et
# personne ne l'a su tant qu'elles ne tournaient nulle part.
for _cible in "$CIBLE"; do
  if ! git ls-files --error-unmatch "$_cible" >/dev/null 2>&1; then
    echo "ECHEC cible introuvable ou non suivie par git : $_cible"
    echo "      le chemin a change : cette preuve ne muterait rien, et son vert"
    echo "      ressemblerait a un succes."
    exit 1
  fi
done

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
# UNE INTERRUPTION DOIT SORTIR, PAS SEULEMENT RESTAURER, LS-230.
#
# `trap ... INT TERM` ne fait PAS quitter bash : il execute le gestionnaire,
# puis REPREND le script ou il en etait. Une preuve interrompue restaurait donc
# ses fichiers, puis muait le cas suivant, et le suivant, jusqu'a mourir sur une
# mutation en cours. Mesure le 14 septembre 2026 : le fichier etait sain pendant
# tout le nettoyage, et mute apres.
#
# Ce qui a ete laisse ainsi n'etait pas anodin : `src/lib/auth.ts` sans sa garde
# `input: false`, celle qui empeche un client de se declarer ADMINISTRATRICE, et
# la purge du journal des connexions avec son `lt` inverse en `gt`.
#
# `EXIT` garde le nettoyage de la sortie normale ; `INT TERM` restaure PUIS
# sort, ce qui empeche toute mutation ulterieure.
trap restaurer EXIT
trap 'interrompre_mutation' INT TERM
interrompre_mutation() {
  restaurer
  echo >&2
  echo "INTERROMPU : les fichiers ont ete restaures." >&2
  exit 130
}

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
# MUTATION 4 : la fenêtre recopiée cesse de couvrir le plafond réel.
#
# C'est la dérive silencieuse : `src/lib/auth.ts` durcit son plafond, personne
# ne met à jour l'aide, et l'amorçage échoue en 429 sur une base neuve, très
# loin de la ligne qui a changé. On simule en abaissant la valeur recopiée.
# ---------------------------------------------------------------------------
CIBLE_AIDE="tests/e2e/inscription-espacee.ts"

if ! git diff --quiet -- "$CIBLE_AIDE"; then
  echo "ÉCHEC : $CIBLE_AIDE porte des modifications non commitées."
  exit 1
fi

perl -pi -e 's/^const FENETRE_MS = 60_000;$/const FENETRE_MS = 30_000;/' "$CIBLE_AIDE"

if "$CONTROLE" > /dev/null 2>&1; then
  echo "ÉCHEC mutation 4 : le contrôle reste VERT sur une fenêtre trop courte."
  ko=1
else
  echo "OK mutation 4 : fenêtre inférieure au plafond -> le contrôle rougit."
fi

git checkout -- "$CIBLE_AIDE"

# ---------------------------------------------------------------------------
# MUTATION 5 : une attente CALCULÉE, dont la valeur n'apparaît nulle part.
#
# C'est l'angle mort trouvé le 7 septembre 2026 : le contrôle ne reconnaissait
# qu'un nombre écrit en clair, et restait vert sur
# `waitForTimeout(rang * DECALAGE_MS)`, une attente de 25 à 50 secondes.
#
# LA MUTATION N'ÉCRIT AUCUN CHIFFRE, sans quoi elle serait attrapée par l'autre
# moitié du contrôle et ne prouverait pas ce qu'elle prétend.
# ---------------------------------------------------------------------------
printf '\nconst DELAI_MUTANT = 30_000;\nasync function attenteMutante(p: { waitForTimeout: (n: number) => Promise<void> }) {\n  await p.waitForTimeout(DELAI_MUTANT);\n}\nvoid attenteMutante;\n' >> "$CIBLE"

if "$CONTROLE" > /dev/null 2>&1; then
  echo "ÉCHEC mutation 5 : le contrôle reste VERT sur une attente calculée."
  ko=1
else
  echo "OK mutation 5 : attente par constante nommée -> le contrôle rougit."
fi

restaurer

# ---------------------------------------------------------------------------
# CONTRÔLE DE RETOUR. La restauration a-t-elle vraiment eu lieu ? Un fichier
# resté muté ferait passer la suite entière pour cassée à la prochaine
# exécution, motif « mutation non restaurée » déjà en fiche.
#
# IL COUVRE LES TROIS FICHIERS MUTÉS, pas seulement le dernier.
# ---------------------------------------------------------------------------
if ! "$CONTROLE" > /dev/null 2>&1; then
  echo "ÉCHEC : le contrôle est rouge APRÈS restauration, le fichier est resté muté."
  ko=1
else
  echo "OK : restauration vérifiée, contrôle de nouveau vert."
fi

exit "$ko"
