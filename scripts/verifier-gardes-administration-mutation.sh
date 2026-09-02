#!/usr/bin/env bash
# Preuve par mutation du contrôle des gardes d'administration, LS-159.
#
# MOTIF. `verifier-gardes-administration.sh` annonçait « 20 actions, toutes
# gardées » alors que le dépôt en portait 29 : son relevé cherchait
# `-name "actions.ts"` et ne voyait pas les trois fichiers `actions-*.ts`, soit
# NEUF actions hors de sa boucle. Les neuf étaient gardées, le trou était dans
# le filet.
#
# CE QUE CE SCRIPT PROUVE, et que la version d'avant LS-159 ne passait pas :
# une garde retirée dans un fichier `actions-*.ts` fait ÉCHOUER le contrôle en
# NOMMANT la fonction. Sans cette preuve, l'élargissement du motif serait une
# intention, pas une garantie : c'est exactement la leçon de « un contrôle qui
# n'a jamais échoué sur le défaut qu'il prétend attraper n'est pas un contrôle ».
#
# IL RESTAURE TOUJOURS, y compris sur interruption : une garde de sécurité
# retirée qui survivrait à l'exécution serait pire que l'absence de contrôle.
#
# Usage : ./scripts/verifier-gardes-administration-mutation.sh
# Aucun prérequis, ni Docker ni base : purement textuel, quelques secondes.
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-gardes-administration.sh"

# LES CIBLES SONT CHOISIES DANS LES TROIS FICHIERS QUE L'ANCIEN MOTIF RATAIT.
# Muter `actions.ts` ne prouverait rien de neuf : ce fichier était déjà vu.
MEDIAS="src/app/administration/produits/[id]/actions-medias.ts"
VARIANTES="src/app/administration/produits/[id]/actions-variantes.ts"
PUBLICATION="src/app/administration/produits/[id]/actions-publication.ts"

# LA QUATRIEME CIBLE EST DANS `actions.ts`, DEJA VU PAR L'ANCIEN RELEVE, et son
# ajout par LS-160 vise autre chose que le trou de LS-159 : la FORME de la
# garde. Les trois cibles ci-dessus emploient toutes `if (!(await exigerRole`,
# si bien que les trois mutations exercent une seule et meme forme. Une garde
# ecrite `const identite = await exigerRole(...)`, forme de `changerStatut` et
# de `rembourser`, n'etait exercee par aucun cas.
COMMANDES="src/app/administration/commandes/actions.ts"

# LA CINQUIEME CIBLE EST L'EXPEDITION, LS-130. Elle n'exerce pas une forme de
# garde neuve, `expedier` reprenant celle de `changerStatut`, mais un FICHIER
# neuf : le releve est ancre sur le marqueur `use server`, et rien ne prouvait
# qu'un dossier cree apres LS-159 y entre. La preuve vaut pour le releve autant
# que pour la garde.
EXPEDITIONS="src/app/administration/expeditions/actions.ts"

MUTABLES=("$MEDIAS" "$VARIANTES" "$PUBLICATION" "$COMMANDES" "$EXPEDITIONS")

for f in "${MUTABLES[@]}"; do
  [ -r "$f" ] || {
    echo "ECHEC fichier illisible : $f"
    echo "      Cible déplacée ou renommée : corriger ce script, pas le contrôle."
    exit 1
  }
done

TMP="$(mktemp -d)"
for f in "${MUTABLES[@]}"; do
  cp "$f" "$TMP/$(printf '%s' "$f" | tr '/' '_')"
done

restaurer() {
  for f in "${MUTABLES[@]}"; do
    cp "$TMP/$(printf '%s' "$f" | tr '/' '_')" "$f"
  done
}

nettoyer() {
  restaurer
  rm -rf "$TMP"
}
trap nettoyer EXIT INT TERM

echecs=0
mutations=0

echo "Gardes de rôle des Server Actions d'administration, LS-159"
echo

# ---------------------------------------------------------------------------
# Le contrôle doit être VERT avant toute mutation, sans quoi rien ne se prouve.
# ---------------------------------------------------------------------------
if ! $CONTROLE >"$TMP/reference.txt" 2>&1; then
  echo "  ECHEC le contrôle n'est pas vert AVANT mutation."
  echo "        Aucune mutation ne peut rien prouver dans cet état."
  tail -10 "$TMP/reference.txt" | sed 's/^/        /'
  exit 1
fi
echo "  OK    état de référence vert"
echo

# ---------------------------------------------------------------------------
# `cas` neutralise UNE garde et exige que le contrôle échoue EN NOMMANT
# l'action. Un échec sur un autre motif, le plancher de complétude par exemple,
# ne vaut PAS détection : il signalerait que la mutation a emporté la fonction
# entière au lieu de sa seule garde.
# ---------------------------------------------------------------------------
cas() {
  local nom="$1" fichier="$2" fonction="$3"
  mutations=$((mutations + 1))

  local avant
  avant=$(cksum <"$fichier")

  perl -0pi -e "s/(export async function ${fonction}\\([\\s\\S]{0,200}?\\{\\n)  if \\(!\\(await exigerRole\\(await headers\\(\\)\\)\\)\\) \\{/\$1  if (false) {/" "$fichier"

  if [ "$(cksum <"$fichier")" = "$avant" ]; then
    echo "  ECHEC $nom -> la mutation n'a modifié aucun caractère"
    echo "        La garde a changé de forme : corriger ce script, pas le contrôle."
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  local sortie
  sortie=$($CONTROLE 2>&1)
  local code=$?

  if [ "$code" -eq 0 ]; then
    echo "  RATE  $nom -> NON détecté, le contrôle est aveugle sur ce fichier"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  if printf '%s' "$sortie" | grep -qF "l'action \`$fonction\`"; then
    echo "  OK    $nom -> détecté, l'action est nommée"
  else
    echo "  RATE  $nom -> échec constaté, mais l'action n'est PAS nommée"
    echo "          attendu : l'action \`$fonction\`"
    printf '%s\n' "$sortie" | grep -E "ECHEC" | head -2 | sed 's/^/            /'
    echecs=$((echecs + 1))
  fi

  restaurer
}

# Cas 1 : `actions-medias.ts`, invisible de l'ancien relevé. C'est le fichier
# qui a servi à mesurer le trou pendant LS-158.
cas "garde retirée dans actions-medias.ts" "$MEDIAS" "reordonnerMediasAction"

# Cas 2 : `actions-variantes.ts`, deuxième des trois fichiers ratés.
cas "garde retirée dans actions-variantes.ts" "$VARIANTES" "creerVarianteAction"

# Cas 3 : `actions-publication.ts`, troisième. Les trois sont exercés plutôt
# qu'un seul : un motif de relevé peut redevenir étroit sur un nom précis.
cas "garde retirée dans actions-publication.ts" "$PUBLICATION" "publierProduitAction"

# ---------------------------------------------------------------------------
# `cas_affectation` neutralise une garde de la SECONDE FORME, LS-160.
#
# POURQUOI UNE SECONDE FONCTION ET NON UN MOTIF ELARGI. Les deux formes ne se
# neutralisent pas de la meme facon :
#
#     if (!(await exigerRole(await headers()))) {     ->  if (false) {
#     const identite = await exigerRole(await headers());  ->  l'appel disparait
#
# Un motif unique couvrant les deux serait plus fragile que deux motifs
# explicites, et surtout il echouerait EN SILENCE sur l'une des deux : la
# garde-fou `cksum` ne verrait qu'un fichier inchange sans dire laquelle.
#
# LA SUBSTITUTION REMPLACE L'APPEL PAR UNE VALEUR NON NULLE, ce qui laisse le
# code compilable et retire la seule verification de role. Neutraliser le `if`
# a la place laisserait l'appel present, donc le controle textuel VERT : la
# mutation ne prouverait rien. C'est le motif « mutation sans effet observable ».
# ---------------------------------------------------------------------------
cas_affectation() {
  local nom="$1" fichier="$2" fonction="$3"
  mutations=$((mutations + 1))

  local avant
  avant=$(cksum <"$fichier")

  perl -0pi -e "s/(export async function ${fonction}\\([\\s\\S]{0,400}?)const identite = await exigerRole\\(await headers\\(\\)\\);/\$1const identite = { utilisateurId: \"mutation\" };/" "$fichier"

  if [ "$(cksum <"$fichier")" = "$avant" ]; then
    echo "  ECHEC $nom -> la mutation n'a modifié aucun caractère"
    echo "        La garde a changé de forme : corriger ce script, pas le contrôle."
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  local sortie
  sortie=$($CONTROLE 2>&1)
  local code=$?

  if [ "$code" -eq 0 ]; then
    echo "  RATE  $nom -> NON détecté, le contrôle est aveugle sur cette forme"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  if printf '%s' "$sortie" | grep -qF "l'action \`$fonction\`"; then
    echo "  OK    $nom -> détecté, l'action est nommée"
  else
    echo "  RATE  $nom -> échec constaté, mais l'action n'est PAS nommée"
    echo "          attendu : l'action \`$fonction\`"
    printf '%s\n' "$sortie" | grep -E "ECHEC" | head -2 | sed 's/^/            /'
    echecs=$((echecs + 1))
  fi

  restaurer
}

# Cas 4 : `rembourser`, LS-160. La seule Server Action qui fasse SORTIR DE
# L'ARGENT : une garde perdue ici est le defaut le plus cher du depot.
cas_affectation "garde retirée sur rembourser" "$COMMANDES" "rembourser"

# Cas 5 : `expedier`, LS-130, dans un DOSSIER cree apres l'ecriture de ce
# script. Il verifie que le releve par `use server` voit bien un fichier neuf,
# et pas seulement les quatre qu'il connaissait deja : c'est le motif « cible de
# test inexistante » dans sa variante liste INCOMPLETE, celle qui a laisse neuf
# actions hors de la boucle jusqu'a LS-159.
cas_affectation "garde retirée sur expedier" "$EXPEDITIONS" "expedier"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations détectées"
else
  echo "  $mutations mutations, $echecs NON détectées"
fi
echo "-----------------------------------------"

exit "$echecs"
