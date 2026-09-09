#!/usr/bin/env bash
#
# Verifie que le statut HTTP reste honnete quand la base est injoignable.
# LS-211, ADR-039.
#
# CE QU'IL GARDE. Le 9 septembre 2026, base de production reellement arretee,
# `/catalogue` rendait 200 avec « Chargement des pieces… » comme etat final, la
# ou l'accueil rendait un vrai 500. Une supervision qui lit le code HTTP
# concluait que tout allait bien pendant une panne de base.
#
# POURQUOI UN CONTROLE TEXTUEL ET PAS SEULEMENT UN TEST. Le comportement tient a
# UNE LIGNE de `next.config.ts`, `htmlLimitedBots: /.*/`. La retirer ne casse
# aucun test unitaire, ne change rien a l'ecran sur une base vivante, et ne se
# voit qu'en arretant la base. C'est exactement le profil d'un reglage qu'une
# refactorisation emporte sans bruit.
#
# CE QU'IL NE PROUVE PAS, et il faut le dire : que le statut soit REELLEMENT 500
# sur une base morte. Un controle textuel ne remplace pas un test d'execution,
# motif en fiche sur ce depot. La mesure d'execution demande d'arreter une base
# et de reconstruire, ce que `verifier-statut-base-morte-mutation.sh` fait, et
# que LS-140 reprendra sur le site deploye.
#
# Usage : ./scripts/verifier-statut-base-morte.sh

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE" || exit 1

CONFIG="next.config.ts"
CATALOGUE="src/app/(boutique)/catalogue/page.tsx"

ECHECS=0
SENS=0

echo "Statut HTTP honnete sur une base morte, ADR-039"
echo

# ---------------------------------------------------------------------------
# Sens 1 : le reglage est present et vise TOUS les agents.
#
# `htmlLimitedBots` accepte n'importe quelle expression : une valeur plus
# etroite, `\/Twitterbot\/` par exemple, laisserait le defaut ouvert pour les
# navigateurs tout en gardant le nom du reglage dans le fichier. Le controle
# exige donc la forme qui couvre tout.
# ---------------------------------------------------------------------------
SENS=$((SENS + 1))
if [ ! -r "$CONFIG" ]; then
  echo "  ECHEC $CONFIG illisible, l'ancrage du controle est casse"
  exit 1
fi

if grep -qE '^\s*htmlLimitedBots:\s*/\.\*/\s*,' "$CONFIG"; then
  echo "  OK    htmlLimitedBots vise tous les agents"
else
  TROUVE=$(grep -nE '^\s*htmlLimitedBots:' "$CONFIG" | head -1)
  if [ -n "$TROUVE" ]; then
    echo "  ECHEC htmlLimitedBots present mais sa portee n'est pas /.*/ :"
    echo "        $TROUVE"
    echo "        Une portee etroite laisse le catalogue rendre 200 base morte"
    echo "        pour les navigateurs, ADR-039."
  else
    echo "  ECHEC htmlLimitedBots absent de $CONFIG"
    echo "        Sans lui, generateMetadata s'execute apres l'engagement de la"
    echo "        reponse et le statut reste fige a 200, ADR-039."
  fi
  ECHECS=$((ECHECS + 1))
fi

# ---------------------------------------------------------------------------
# Sens 2 : le motif est ecrit la ou on le lira.
#
# UN REGLAGE D'UNE LIGNE SANS SON POURQUOI SE FAIT RETIRER. Celui-ci a l'air
# d'une optimisation desactivee, donc d'un candidat naturel au menage. Le
# controle exige que `next.config.ts` cite l'ADR.
# ---------------------------------------------------------------------------
SENS=$((SENS + 1))
if grep -q 'ADR-039' "$CONFIG"; then
  echo "  OK    le motif renvoie a ADR-039"
else
  echo "  ECHEC $CONFIG ne cite pas ADR-039 : le reglage parait gratuit"
  ECHECS=$((ECHECS + 1))
fi

# ---------------------------------------------------------------------------
# Sens 3 : la mise en garde contre le repli est conservee.
#
# LE `try/catch` DANS `generateMetadata` A DEJA ETE LIVRE PUIS ANNULE, le
# 9 septembre 2026 : il faisait REUSSIR la fonction, donc la page rendait son
# titre et Twitterbot passait de 500 a 200. C'est la correction la plus
# naturelle a reproposer, et c'est la mauvaise.
# ---------------------------------------------------------------------------
SENS=$((SENS + 1))
if [ ! -r "$CATALOGUE" ]; then
  echo "  ECHEC $CATALOGUE illisible, l'ancrage du controle est casse"
  ECHECS=$((ECHECS + 1))
elif grep -qiE 'ne pas (reessayer|refaire).{0,40}repli|repli.{0,60}annul' "$CATALOGUE"; then
  echo "  OK    le catalogue garde la mise en garde contre le repli"
else
  echo "  ECHEC $CATALOGUE ne porte plus la mise en garde contre le repli"
  echo "        Un try/catch dans generateMetadata supprime le seul chemin qui"
  echo "        produit un statut honnete, mesure et annule le 9 septembre 2026."
  ECHECS=$((ECHECS + 1))
fi

# ---------------------------------------------------------------------------
# Sens 4 : aucun `try/catch` n'est revenu dans le generateMetadata du catalogue.
#
# Le sens 3 garde le COMMENTAIRE, celui-ci garde le CODE. Les deux sont
# necessaires : un commentaire peut survivre a la reintroduction du defaut qu'il
# decrit, motif « controle satisfait par un commentaire », en fiche.
#
# La portee est bornee au corps de `generateMetadata`, un `try` ailleurs dans le
# fichier etant legitime.
# ---------------------------------------------------------------------------
SENS=$((SENS + 1))
if [ -r "$CATALOGUE" ]; then
  CORPS=$(awk '/^export async function generateMetadata/,/^}/' "$CATALOGUE")
  if printf '%s' "$CORPS" | grep -qE '^\s*(} )?catch\s*\(' ; then
    echo "  ECHEC un catch est revenu dans generateMetadata du catalogue"
    echo "        Il ferait REUSSIR la fonction et rendrait 200 base morte."
    ECHECS=$((ECHECS + 1))
  else
    echo "  OK    aucun catch dans generateMetadata du catalogue"
  fi
fi

echo
if [ "$SENS" -lt 4 ]; then
  echo "ECHEC : $SENS sens joues, 4 attendus. L'ancrage du controle est casse."
  exit 1
fi

if [ "$ECHECS" -eq 0 ]; then
  echo "$SENS sens verifies, aucun ecart."
  exit 0
fi

echo "$SENS sens verifies, $ECHECS ecart(s)."
exit 1
