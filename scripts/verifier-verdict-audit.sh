#!/bin/bash
# Éprouve la discrimination entre panne du registre et vulnérabilité. LS-176.
#
# CE QUE CE CONTRÔLE PROTÈGE. L'étape « Audit des dépendances » ne fait plus
# échouer la chaîne quand le registre npm ne répond pas, LS-176. Ce relâchement
# est étroit et il doit le rester : une vulnérabilité réelle doit continuer de
# faire échouer, sans exception.
#
# LE SENS DE L'ERREUR EST DISSYMÉTRIQUE, comme pour le filtre de portée mais dans
# l'autre sens. Traiter une panne en vulnérabilité coûte un rouge qui ment, et un
# rouge qui ment finit par être relâché d'un clic. Traiter une vulnérabilité en
# panne laisse entrer un paquet vulnérable en production. Le second est le pire,
# donc la reconnaissance de panne vise UN motif précis et rien d'autre.
#
# POURQUOI UN SCRIPT ET NON UN TEST VITEST. La logique vit dans le YAML du
# workflow, hors du monde TypeScript. Ce fichier rejoue la MÊME logique sur des
# sorties fabriquées, et confronte son verdict à celui attendu.
#
# CE QU'IL NE PEUT PAS FAIRE, ET IL FAUT LE SAVOIR. Il éprouve une COPIE de la
# décision, pas le YAML lui-même : une divergence entre les deux ne serait pas
# vue. Le garde-fou de fin de fichier ferme ce trou en exigeant que le motif
# employé ici apparaisse mot pour mot dans le workflow.
#
# Usage : ./scripts/verifier-verdict-audit.sh

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"

# LS-177 : `npm audit` a quitté `controles.yml` pour le contrôle nocturne, une
# vulnérabilité n'apparaissant pas parce qu'un composant a changé mais parce
# qu'un avis de sécurité est publié.
#
# CE CHEMIN A ÉTÉ CORRIGÉ PARCE QUE LE GARDE-FOU L'A SIGNALÉ, et c'est la preuve
# qu'il sert : après le déplacement, il a échoué en disant « le motif de
# reconnaissance de panne est absent du workflow ». Sans lui, ce script aurait
# continué d'éprouver une décision que plus aucun workflow n'appliquait, en
# restant vert. C'est le motif du contrôle de mutation mort, un chemin périmé
# arrêtant le script avant la vérification qui compte.
#
# CE SCRIPT RESTE BRANCHÉ DANS `controles.yml`, lui, et c'est délibéré : il est
# purement textuel, donc rapide, et il protège une décision de sécurité qui doit
# rougir AVANT fusion si quelqu'un l'affaiblit. Le contrôle voyage avec la
# décision qu'il garde, pas avec le fichier qui l'exécute.
WORKFLOW="$RACINE/.github/workflows/nocturne.yml"

# LA CHAÎNE EXACTE que le workflow cherche. Écrite une seule fois ici, et
# confrontée au workflow plus bas : deux littéraux divergeraient un jour.
MOTIF="audit endpoint returned an error"

ko=0
verifies=0

# Rejoue la décision du workflow sur une sortie et un code donnés.
# $1 code de sortie de npm audit, $2 sortie de npm audit
# Rend : "succes", "panne" ou "vulnerabilite"
verdict() {
  local code="$1"
  local sortie="$2"

  if [ "$code" -eq 0 ]; then
    echo "succes"
    return
  fi

  if printf '%s' "$sortie" | grep -q "$MOTIF"; then
    echo "panne"
    return
  fi

  echo "vulnerabilite"
}

# $1 verdict attendu, $2 intitulé, $3 code, $4 sortie
attendre() {
  local attendu="$1"
  local intitule="$2"
  local obtenu

  verifies=$((verifies + 1))
  obtenu=$(verdict "$3" "$4")

  if [ "$obtenu" != "$attendu" ]; then
    echo "ECHEC $intitule"
    echo "      attendu « $attendu », obtenu « $obtenu »"
    ko=$((ko + 1))
  fi
}

# ---------------------------------------------------------------------------
# LA PANNE RÉELLEMENT RENCONTRÉE, recopiée de la sortie du 4 septembre 2026.
# ---------------------------------------------------------------------------
PANNE_REELLE="npm notice This endpoint is being retired. Use the bulk advisory endpoint instead.
npm warn audit 400 Bad Request - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick - Bad Request
{
  statusCode: 400,
  error: 'Bad Request',
  message: 'Invalid package tree, run  npm install  to rebuild your package-lock.json'
}
npm error audit endpoint returned an error"

attendre panne "la panne du 4 septembre 2026 est reconnue" 1 "$PANNE_REELLE"

# ---------------------------------------------------------------------------
# LES VULNÉRABILITÉS DOIVENT TOUTES FAIRE ÉCHOUER.
#
# LA PREMIÈRE EST LE CAS PIÈGE : son texte contient « error » et « audit », mots
# que la panne contient aussi. Un motif trop large la classerait en panne et
# laisserait passer une faille critique, ce qui est le pire sens d'erreur.
# ---------------------------------------------------------------------------
attendre vulnerabilite "une faille critique n'est pas confondue avec une panne" 1 \
  "# npm audit report

lodash  <4.17.21
Severity: critical
Prototype Pollution - https://github.com/advisories/GHSA-error-audit-1234
fix available via \`npm audit fix\`

1 critical severity vulnerability"

attendre vulnerabilite "une faille basse fait echouer aussi" 1 \
  "# npm audit report

semver  <5.7.2
Severity: low
1 low severity vulnerability"

# ---------------------------------------------------------------------------
# LE CAS NOMINAL.
# ---------------------------------------------------------------------------
attendre succes "aucune vulnerabilite" 0 "found 0 vulnerabilities"

# ---------------------------------------------------------------------------
# UN CODE NON NUL SANS MOTIF CONNU FAIT ÉCHOUER, défaut fermé.
#
# Une erreur inattendue, réseau coupé, disque plein, npm absent, ne doit pas être
# rangée en panne de registre : le motif est précis, tout le reste bloque.
# ---------------------------------------------------------------------------
attendre vulnerabilite "une erreur inconnue bloque plutot que d'etre excusee" 1 \
  "npm error code ENOTFOUND
npm error network request to https://registry.npmjs.org failed"

# ---------------------------------------------------------------------------
# LE GARDE-FOU QUI RELIE CE SCRIPT AU WORKFLOW.
#
# Sans lui, ce fichier éprouverait une décision que le workflow n'applique plus.
# Le motif est cherché mot pour mot dans le YAML.
# ---------------------------------------------------------------------------
verifies=$((verifies + 1))

if ! grep -qF "$MOTIF" "$WORKFLOW"; then
  echo "ECHEC le motif de reconnaissance de panne est absent du workflow."
  echo "      Cherché : « $MOTIF »"
  echo "      Dans    : $WORKFLOW"
  echo ""
  echo "      Ce script éprouve alors une décision qui n'est plus appliquée."
  ko=$((ko + 1))
fi

# L'étape doit toujours refuser une vulnérabilité au niveau le plus bas.
verifies=$((verifies + 1))

if ! grep -qF -- "--audit-level=low" "$WORKFLOW"; then
  echo "ECHEC « --audit-level=low » a disparu du workflow."
  echo "      CLAUDE.md exige npm audit à zéro, tous niveaux confondus."
  ko=$((ko + 1))
fi

echo "Cas de verdict d'audit vérifiés : $verifies"

if [ "$ko" -gt 0 ]; then
  echo "ECHEC $ko cas ne rendent pas le verdict attendu"
  exit 1
fi

echo "OK panne du registre et vulnérabilité sont distinguées"
