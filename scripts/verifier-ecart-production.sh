#!/usr/bin/env bash
# Vérifie la logique de mesure d'écart entre la production et `main`, LS-220.
#
# MOTIF. Le workflow `ecart-production.yml` ne peut pas être joué localement :
# il demande une clé SSH de production et un exécuteur GitHub. Sa LOGIQUE, elle,
# tient en deux commandes git, et c'est elle qui décide d'ouvrir une issue ou de
# se taire. Ce script l'exerce sur des intervalles RÉELS du dépôt.
#
# CE QU'IL VÉRIFIE, ET LES TROIS SENS COMPTENT :
#
#   1. un intervalle SANS migration ne déclenche rien, critère 3 du ticket
#   2. un intervalle AVEC migration déclenche, quel que soit le nombre de commits
#   3. un SHA inconnu du dépôt DIT qu'il ne peut pas conclure, jamais un vert
#
# LE SENS 3 EST CELUI QUI COMPTE LE PLUS, critère 4 : « le contrôle dit ce qu'il
# n'a pas pu vérifier plutôt que de passer au vert quand il ne peut pas
# conclure ». C'est le mode fail-open que ce dépôt a déjà corrigé deux fois, sur
# `verifier-migration.sh` et sur `verifier-jira.sh`.
#
# LES INTERVALLES SONT CHERCHÉS DANS L'HISTORIQUE RÉEL, jamais fabriqués : un
# cas de laboratoire prouverait que la commande git fonctionne, pas que ce dépôt
# est correctement mesuré.
#
# Usage : ./scripts/verifier-ecart-production.sh
# Prérequis : un dépôt git avec son historique. Ni Docker, ni base, ni réseau.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

WORKFLOW=".github/workflows/ecart-production.yml"
ko=0

[ -r "$WORKFLOW" ] || {
  echo "ECHEC workflow introuvable : $WORKFLOW"
  exit 1
}

# ---------------------------------------------------------------------------
# La référence de comparaison.
#
# `origin/main` S'IL EXISTE, `main` SINON. En intégration continue le dépôt est
# cloné avec sa référence distante ; sur un poste où `origin` n'a pas été
# récupéré, la locale suffit et le contrôle reste jouable.
# ---------------------------------------------------------------------------
if git rev-parse --verify --quiet origin/main >/dev/null; then
  REFERENCE="origin/main"
elif git rev-parse --verify --quiet main >/dev/null; then
  REFERENCE="main"
else
  echo "ECHEC ni origin/main ni main ne sont lisibles."
  echo "      Le contrôle ne peut rien mesurer : il le DIT plutôt que de"
  echo "      rendre un vert sur une comparaison qui n'a pas eu lieu."
  exit 1
fi

# ---------------------------------------------------------------------------
# La logique du workflow, reproduite à l'identique.
#
# ELLE EST RECOPIÉE ICI, ET C'EST LA LIMITE DE CE CONTRÔLE : si le workflow
# change sa commande sans que ce script suive, le script continuera de prouver
# une logique qui n'est plus servie. Le sens 4 ci-dessous garde ce cas en
# confrontant les commandes au texte du workflow.
# ---------------------------------------------------------------------------
mesurer_migrations() {
  git diff --name-only "$1..$REFERENCE" \
    -- 'prisma/migrations/*/migration.sql' 2>/dev/null | wc -l | tr -d ' '
}

mesurer_commits() {
  git rev-list --count "$1..$REFERENCE" 2>/dev/null || echo ""
}

echo "Logique de mesure d'écart, LS-220"
echo

# ---------------------------------------------------------------------------
# Sens 1 : un intervalle SANS migration ne déclenche pas.
#
# CE SENS PORTE LE CRITÈRE 3. Un commit de documentation fusionné il y a dix
# minutes n'est pas un incident : sans cette distinction, le contrôle ouvrirait
# une issue chaque nuit et le bruit ferait ignorer celle qui compte.
# ---------------------------------------------------------------------------
sha_doc=""
for candidat in $(git rev-list --max-count=40 "$REFERENCE"); do
  if [ "$(mesurer_migrations "$candidat")" = "0" ] \
    && [ "$(mesurer_commits "$candidat")" != "0" ]; then
    sha_doc="$candidat"
    break
  fi
done

if [ -z "$sha_doc" ]; then
  echo "  IGNORE aucun intervalle sans migration dans les 40 derniers commits"
  echo "         Le sens 1 n'est pas exerçable sur cet historique, et le dire"
  echo "         vaut mieux que de le compter comme réussi."
else
  commits=$(mesurer_commits "$sha_doc")
  migrations=$(mesurer_migrations "$sha_doc")

  if [ "$migrations" -eq 0 ] && [ "$commits" -gt 0 ]; then
    echo "  OK    $commits commit(s) sans migration -> aucune issue, conforme au critère 3"
  else
    echo "  ECHEC l'intervalle choisi porte $migrations migration(s), le cas n'est pas celui visé"
    ko=$((ko + 1))
  fi
fi

# ---------------------------------------------------------------------------
# Sens 2 : un intervalle AVEC migration déclenche.
#
# L'ÉCART EST RÉEL ET NON FABRIQUÉ, exigence du critère 3 du ticket : le SHA
# retenu est celui qui précède une migration réellement commitée dans ce dépôt.
# ---------------------------------------------------------------------------
sha_avant_migration=$(git log --format=%H --diff-filter=A \
  -- 'prisma/migrations/*/migration.sql' 2>/dev/null | head -1)

if [ -n "$sha_avant_migration" ]; then
  # Le parent du commit qui AJOUTE une migration : l'intervalle qui la contient.
  sha_parent=$(git rev-parse --verify --quiet "${sha_avant_migration}^" || echo "")
fi

if [ -z "${sha_parent:-}" ]; then
  echo "  IGNORE aucune migration dans l'historique, sens 2 non exerçable"
else
  migrations=$(mesurer_migrations "$sha_parent")

  if [ "$migrations" -gt 0 ]; then
    echo "  OK    $migrations migration(s) sur l'intervalle -> issue ouverte, conforme"
  else
    echo "  ECHEC un intervalle contenant une migration en compte zéro"
    echo "        la mesure est fausse, et le signal le plus important serait muet"
    ko=$((ko + 1))
  fi
fi

# ---------------------------------------------------------------------------
# Sens 3 : un SHA inconnu DIT qu'il ne peut pas conclure.
#
# CE SENS PORTE LE CRITÈRE 4, et c'est le plus important du fichier. Un SHA
# inconnu arrive après une réécriture d'historique, ou si la production sert une
# image construite ailleurs. Le compter comme « zéro commit d'écart » ferait
# annoncer une production à jour alors que personne ne sait ce qu'elle sert.
# ---------------------------------------------------------------------------
sha_inconnu="0000000000000000000000000000000000000000"

if git cat-file -e "${sha_inconnu}^{commit}" 2>/dev/null; then
  echo "  ECHEC un SHA nul est reconnu comme un commit, le cas n'est pas exerçable"
  ko=$((ko + 1))
elif [ -n "$(mesurer_commits "$sha_inconnu")" ]; then
  echo "  ECHEC un SHA inconnu rend un compte au lieu de rien"
  echo "        le workflow conclurait sur une valeur qui ne veut rien dire"
  ko=$((ko + 1))
else
  echo "  OK    un SHA inconnu ne rend aucun compte -> « sans conclusion », critère 4"
fi

# ---------------------------------------------------------------------------
# Sens 4 : le workflow emploie bien les commandes que ce script éprouve.
#
# SANS CE SENS, LE SCRIPT PROUVERAIT UNE LOGIQUE QUE PERSONNE NE SERT. C'est le
# motif « contrôle satisfait par un commentaire » pris à l'envers : ici c'est le
# CONTRÔLE qui pourrait dériver de ce qu'il prétend garder.
#
# IL GARDE AUSSI LE CONTRÔLE CONTRE SON PROPRE ANCRAGE : un workflow renommé ou
# réécrit fait rougir ce sens au lieu de laisser passer un OK silencieux.
# ---------------------------------------------------------------------------
attendus=(
  "git rev-list --count"
  "prisma/migrations/*/migration.sql"
  "gh label create ecart-production"
)

manquants=0
for motif in "${attendus[@]}"; do
  grep -qF "$motif" "$WORKFLOW" || {
    echo "  ECHEC le workflow ne porte plus « $motif »"
    manquants=$((manquants + 1))
  }
done

# LA GARDE SUR LE SHA INCONNU SE VERIFIE SUR SA FORME, jamais sur la seule
# presence de `git cat-file -e`.
#
# LA PREUVE PAR MUTATION A TROUVE CE TROU : neutraliser la garde par un
# `if false && ! git cat-file -e` laisse le texte intact, et un contrôle qui
# cherche la CHAINE reste vert sur une garde morte. Motif « contrôle satisfait
# par un commentaire », troisième forme.
#
# LE MOTIF EXIGE LA CONDITION ENTIERE, `if ! git cat-file -e`, donc une garde
# qui teste réellement. Un `if false &&` inséré devant ne la satisfait plus.
if ! grep -qE '^\s*if ! git cat-file -e' "$WORKFLOW"; then
  echo "  ECHEC la garde sur un SHA inconnu n'est plus une condition active"
  echo "        le workflow conclurait sur un SHA qu'il ne connaît pas, et"
  echo "        annoncerait une production à jour sans savoir ce qu'elle sert"
  manquants=$((manquants + 1))
fi

if [ "$manquants" -eq 0 ]; then
  echo "  OK    le workflow emploie les quatre mécanismes éprouvés ici"
else
  ko=$((ko + manquants))
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  la mesure d'écart distingue ce qui mérite une issue"
else
  echo "  $ko problème(s) détecté(s)"
fi
echo "-----------------------------------------"

exit "$ko"
