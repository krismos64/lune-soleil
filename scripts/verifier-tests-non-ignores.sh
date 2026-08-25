#!/usr/bin/env bash
#
# Aucun test n'est ignore ni focalise dans la suite automatisee.
#
# POURQUOI CE SCRIPT EXISTE
#
# Le critere 7 de LS-116 exige que le test phare « soit en integration continue
# et ne puisse pas etre ignore ». Mesure le 25 aout 2026 : un `it.skip` pose sur
# le test central passe la CI avec un code de sortie 0, la sortie annoncant
# tranquillement « 6 passed | 1 skipped ». Le jalon technique majeur du projet
# pouvait donc etre neutralise par sept caracteres, sans qu'aucun controle ne
# bronche.
#
# `.only` EST DEJA COUVERT, et par Vitest lui-meme : `allowOnly` vaut `!isCI`
# par defaut, verifie via Context7 sur Vitest 4.1. Ce script le cherche quand
# meme, parce qu'un `.only` commite reste un defaut a corriger avant la CI, et
# parce que Playwright le traite par `forbidOnly` sans rien dire des `skip`.
#
# CE QU'IL NE FAIT PAS
#
# Il ne juge pas la pertinence d'un test, ni sa couverture. Un test vide et un
# test complet lui sont indiscernables : il verifie qu'aucun n'est desactive.
#
# USAGE
#
#   ./scripts/verifier-tests-non-ignores.sh
#
# Sort en 1 des qu'une forme ignoree ou focalisee est trouvee. Aucun mode
# permissif : un test desactive se corrige, il ne s'accepte pas.

set -euo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE"

echo
echo "Tests ignores ou focalises dans tests/"
echo

# Les formes cherchees. `describe` et `it` couvrent Vitest comme Playwright,
# `test` la forme alternative des deux.
#
# LE MOTIF EXIGE UNE PARENTHESE PUIS UN GUILLEMET, et cette precision decide de
# tout. `test.skip("nom", fn)` DESACTIVE un test ; `test.skip(condition, raison)`
# est un skip CONDITIONNEL a l'interieur d'un test, forme legitime et utile :
# le projet l'emploie pour ne pas mesurer un centrage sur un viewport ou il n'a
# pas de sens. Un motif qui les confond signale trois faux positifs et pousse a
# exempter des fichiers entiers, ce qui rouvre le trou ailleurs.
#
# LE MOTIF EXIGE AUSSI UNE PARENTHESE OUVRANTE, sans quoi il capterait le mot
# dans une phrase de commentaire : ce fichier meme en contient plusieurs.
MOTIF='\b(describe|it|test)\.(skip|only|todo|failing)\s*\(\s*[`"'"'"']'

trouves=$(grep -rnE "$MOTIF" tests/ --include='*.ts' || true)

if [ -n "$trouves" ]; then
  echo "$trouves" | while IFS= read -r ligne; do
    echo "  ECHEC  $ligne"
  done
  echo
  echo "-----------------------------------------"
  echo "  un test desactive ne protege rien"
  echo "-----------------------------------------"
  echo
  echo "Un test ignore passe la CI avec un code de sortie 0 : la suite annonce"
  echo "« skipped » et personne ne le lit. Retirer la forme, ou supprimer le"
  echo "test s'il n'a plus d'objet."
  exit 1
fi

fichiers=$(find tests -name '*.test.ts' -o -name '*.spec.ts' | wc -l | tr -d ' ')

echo "  OK    aucun test ignore ni focalise, $fichiers fichiers de test"
echo
echo "-----------------------------------------"
echo "  toute la suite s'execute"
echo "-----------------------------------------"
echo
