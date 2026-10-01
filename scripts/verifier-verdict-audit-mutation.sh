#!/usr/bin/env bash
# Preuve par mutation de la garde d'échec différé de l'audit, LS-256.
#
# MOTIF. L'étape « Audit des dependances » du nocturne porte `continue-on-error`
# depuis LS-256, pour qu'un avis publié dans la nuit ne fasse plus sauter la
# base, la construction, le bout en bout et l'image. Ce relâchement n'est sûr
# que si l'étape « Verdict de l'audit des dependances » rend le job rouge en fin
# de course. `verifier-verdict-audit.sh` l'exige ; cette preuve montre qu'il
# rougit quand une des deux moitiés se défait.
#
# CE QUI EST MUTÉ EST LE WORKFLOW, jamais le contrôle, même raison que
# `verifier-ecart-production-mutation.sh`.
#
# LES MUTATIONS SONT ANCRÉES SUR `- name: Verdict`. Le commentaire de l'étape
# d'audit cite le nom de l'étape de verdict et `steps.audit.outcome` : à sa
# première écriture, deux mutations non ancrées ont frappé ce commentaire et
# conclu « RATE » sur une garde qui voyait juste.
#
# UN TÉMOIN DOIT RESTER VERT : l'ancienne forme, sans `continue-on-error` ni
# étape de verdict, est légitime. Une garde qui la refuserait exigerait le
# verdict même quand rien n'est différé.
#
# Usage : ./scripts/verifier-verdict-audit-mutation.sh
# Prérequis : aucun. Ni Docker, ni base, ni réseau.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

WORKFLOW=".github/workflows/nocturne.yml"
CONTROLE="./scripts/verifier-verdict-audit.sh"

[ -r "$WORKFLOW" ] || { echo "ECHEC workflow introuvable : $WORKFLOW"; exit 1; }
[ -x "$CONTROLE" ] || { echo "ECHEC contrôle introuvable : $CONTROLE"; exit 1; }

TMP=$(mktemp -d)
SAUVEGARDE="$TMP/workflow.yml"
cp "$WORKFLOW" "$SAUVEGARDE"

restaurer() { cp "$SAUVEGARDE" "$WORKFLOW"; }

# Nettoyage idempotent puis filet `git checkout`, motifs de LS-230 détaillés
# dans `verifier-ecart-production-mutation.sh`.
DEJA_NETTOYE=0
nettoyer() {
  [ "$DEJA_NETTOYE" -eq 1 ] && return
  DEJA_NETTOYE=1
  restaurer
  git -C "$RACINE" checkout -- "$WORKFLOW" 2>/dev/null || true
  rm -rf "$TMP"
}
trap nettoyer EXIT
trap 'interrompre_mutation' INT TERM
interrompre_mutation() {
  nettoyer
  echo >&2
  echo "INTERROMPU : les fichiers ont ete restaures." >&2
  exit 130
}

echecs=0
mutations=0

if ! "$CONTROLE" >"$TMP/reference.txt" 2>&1; then
  echo "ECHEC le contrôle n'est pas vert AVANT mutation."
  echo "      Aucune mutation ne peut rien prouver dans cet état."
  echo
  sed 's/^/      /' "$TMP/reference.txt"
  exit 1
fi

echo "Etat de reference : le contrôle est vert"
echo

# Refuse une substitution qui ne change rien, motif de `mute` dans
# `verifier-ecart-production-mutation.sh` : sans lui, une expression périmée
# accuserait d'aveuglement un contrôle qui voit.
mute() {
  local expression="$1"
  local avant

  avant=$(cksum <"$WORKFLOW")
  perl -0pi -e "$expression" "$WORKFLOW"

  if [ "$(cksum <"$WORKFLOW")" = "$avant" ]; then
    echo "  ECHEC la mutation n'a modifié aucun caractère du workflow"
    echo "        L'expression ne correspond plus au fichier : corriger ce"
    echo "        script, pas le contrôle."
    echo "        expression : $expression"
    exit 1
  fi
}

# $1 intitulé, $2 motif attendu dans la sortie du contrôle
cas() {
  local nom="$1" motif_attendu="$2"
  mutations=$((mutations + 1))

  if "$CONTROLE" >"$TMP/sortie.txt" 2>&1; then
    echo "  RATE  $nom -> NON détecté, le contrôle est aveugle"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  if grep -qF "$motif_attendu" "$TMP/sortie.txt"; then
    echo "  OK    $nom -> détecté, et par le sens attendu"
  else
    echo "  RATE  $nom -> échec constaté, mais PAS sur le sens attendu"
    echo "          attendu : $motif_attendu"
    grep "ECHEC" "$TMP/sortie.txt" | head -3 | sed 's/^/            /'
    echecs=$((echecs + 1))
  fi

  restaurer
}

VERDICT_ABSENT="aucune étape de fin ne le rend"

# Cas 1 : l'étape de verdict disparaît. Le défaut le plus grave : toute
# vulnérabilité passerait au vert.
mute 's{\n      - name: Verdict de l.audit des dependances\n.*?exit 1\n.*?\n}{\n}s'
cas "étape de verdict retirée" "$VERDICT_ABSENT"

# Cas 2 : l'étape reste, mais ne sort plus en échec.
mute 's{(- name: Verdict de l.audit des dependances\n.*?)exit 1}{${1}true}s'
cas "verdict sans exit 1" "$VERDICT_ABSENT"

# Cas 3 : l'étape relit le résultat d'une autre étape.
mute 's{(- name: Verdict de l.audit des dependances\n.*?)steps\.audit\.outcome}{${1}steps.autre.outcome}s'
cas "verdict qui ne relit plus steps.audit.outcome" "$VERDICT_ABSENT"

# Cas 4 : l'étape ne tourne plus après un échec amont. Avec `success()`, un
# échec de construction ferait aussi sauter le verdict de l'audit.
mute 's{(- name: Verdict de l.audit des dependances\n\s+)if: always\(\)}{${1}if: success()}'
cas "verdict sans if: always()" "$VERDICT_ABSENT"

# Cas 5 : l'identifiant de l'étape d'audit disparaît, `steps.audit` est vide.
mute 's{\n        id: audit\n}{\n}'
cas "id: audit retiré" "sans porter « id: audit »"

# Cas 6 : l'étape d'audit renommée, la garde ne la trouve plus. Elle doit le
# dire plutôt que de conclure sur un bloc vide.
mute 's{- name: Audit des dependances\n}{- name: Audit npm\n}'
cas "étape d'audit introuvable" "est introuvable dans le workflow"

# Cas 7, TÉMOIN : l'ancienne forme, sans échec différé ni verdict, reste verte.
mutations=$((mutations + 1))
mute 's{\n        continue-on-error: true\n}{\n}'
mute 's{\n      - name: Verdict de l.audit des dependances\n.*?exit 1\n.*?\n}{\n}s'

if "$CONTROLE" >"$TMP/sortie.txt" 2>&1; then
  echo "  OK    témoin, audit sans échec différé ni verdict -> vert, légitime"
else
  echo "  RATE  témoin, audit sans échec différé ni verdict -> rouge à tort"
  grep "ECHEC" "$TMP/sortie.txt" | head -3 | sed 's/^/            /'
  echecs=$((echecs + 1))
fi
restaurer

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations conformes"
else
  echo "  $mutations mutations, $echecs NON conformes"
fi
echo "-----------------------------------------"

exit "$echecs"
