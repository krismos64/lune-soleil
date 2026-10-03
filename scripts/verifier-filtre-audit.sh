#!/bin/bash
# Éprouve le filtre d'exemption de l'audit des dépendances, LS-258.
#
# CE QUE CE CONTRÔLE PROTÈGE. `filtrer-audit.mjs` laisse passer un audit rouge
# quand chaque paquet signalé remonte à un avis exempté et non échu. C'est un
# relâchement de l'invariant « npm audit à zéro », il doit rester étroit : un
# avis non exempté qui passerait est le pire sens d'erreur, comme pour LS-176.
#
# À LA DIFFÉRENCE DE `verifier-verdict-audit.sh`, il exécute LE VRAI FILTRE,
# pas une copie : la décision vit dans un fichier Node que le workflow appelle,
# donc aucune divergence entre l'éprouvé et l'appliqué. Le garde-fou de fin
# vérifie que le workflow l'appelle bien, et seulement après la panne.
#
# LES RAPPORTS SONT FABRIQUÉS SUR LA FORME RÉELLE, relevée le 3 octobre 2026 :
# un seul paquet porte l'avis en objet, les autres ne citent que le nom de leur
# dépendance. Une forme commode à écrire mais absente du réel ne prouverait rien.
#
# Usage : ./scripts/verifier-filtre-audit.sh
# Prérequis : Node. Ni réseau, ni base.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
FILTRE="$RACINE/scripts/filtrer-audit.mjs"
WORKFLOW="$RACINE/.github/workflows/nocturne.yml"

[ -r "$FILTRE" ] || { echo "ECHEC filtre introuvable : $FILTRE"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ko=0
verifies=0

AVIS="GHSA-vfj7-8cjw-p6xm"
URL="https://github.com/advisories/$AVIS"

# $1 identifiant, $2 paquet, $3 ajoute_le, $4 jusqu_au
exemption() {
  cat <<EOF
{"avis": "$1", "paquet": "$2", "ticket": "LS-258", "ajoute_le": "$3",
 "jusqu_au": "$4", "motif": "essai"}
EOF
}

# $1 contenu de la liste, sans crochets
ecrire_exemptions() { printf '[%s]\n' "$1" >"$TMP/exemptions.json"; }

# Fiche d'un paquet porteur d'avis. $1 paquet, $2 url, $3 gravité
avis() {
  printf '"%s": {"name": "%s", "severity": "%s", "via": [{"source": 1, "name": "%s", "title": "essai", "url": "%s", "severity": "%s"}]}' \
    "$1" "$1" "$3" "$1" "$2" "$3"
}

# Fiche d'un paquet vulnérable par dépendance. $1 paquet, $2.. dépendances
par() {
  local paquet="$1"
  shift
  local liste
  liste=$(printf '"%s",' "$@")
  printf '"%s": {"name": "%s", "severity": "high", "via": [%s]}' "$paquet" "$paquet" "${liste%,}"
}

# La chaîne réelle du 3 octobre 2026.
CHAINE="$(avis braces "$URL" high), $(par micromatch braces), $(par fast-glob micromatch),
$(par @next/eslint-plugin-next fast-glob), $(par eslint-config-next @next/eslint-plugin-next)"

# $1 fiches, sans accolades
rapport() { printf '{"auditReportVersion": 2, "vulnerabilities": {%s}}\n' "$1"; }

# Le code seul ne suffit pas : à la première preuve par mutation, un filtre
# muté plantait et sortait en 1, le code attendu d'un refus. Un refus doit donc
# aussi NOMMER sa raison, ce que $4 vérifie.
#
# $1 code attendu, $2 intitulé, $3 date du jour, $4 motif attendu en sortie
# (facultatif), stdin le rapport
attendre() {
  local attendu="$1" intitule="$2" jour="$3" motif="${4:-}" obtenu
  verifies=$((verifies + 1))
  AUJOURDHUI="$jour" node "$FILTRE" "$TMP/exemptions.json" >"$TMP/sortie.txt" 2>&1
  obtenu=$?
  if [ "$obtenu" != "$attendu" ]; then
    echo "ECHEC $intitule"
    echo "      code attendu $attendu, obtenu $obtenu"
    sed 's/^/      /' "$TMP/sortie.txt"
    ko=$((ko + 1))
  elif [ -n "$motif" ] && ! grep -qF -- "$motif" "$TMP/sortie.txt"; then
    echo "ECHEC $intitule"
    echo "      code $obtenu attendu, mais la sortie ne dit pas « $motif »"
    sed 's/^/      /' "$TMP/sortie.txt"
    ko=$((ko + 1))
  fi
}

ecrire_exemptions "$(exemption "$AVIS" braces 2026-10-03 2026-10-17)"

# --- Le cas visé : la chaîne entière est couverte.
attendre 0 "la chaîne réelle de braces est couverte" 2026-10-03 "couverts par une exemption : 5" < <(rapport "$CHAINE")
attendre 0 "le dernier jour de validité couvre encore" 2026-10-17 < <(rapport "$CHAINE")
attendre 0 "un audit vide passe, l'exemption devient inutile" 2026-10-03 "INUTILE GHSA-vfj7-8cjw-p6xm" < <(rapport "")

# --- Un avis non exempté fait échouer, même à côté de l'exempté.
attendre 1 "un avis bas non exempté à côté de la chaîne fait échouer" 2026-10-03 "NON EXEMPTE semver" < <(rapport "$CHAINE, $(avis semver https://github.com/advisories/GHSA-aaaa-bbbb-cccc low)")

attendre 1 "un intermédiaire porteur de son propre avis fait échouer" 2026-10-03 "NON EXEMPTE micromatch" < <(rapport "$(avis braces "$URL" high), $(avis micromatch https://github.com/advisories/GHSA-aaaa-bbbb-cccc moderate),
$(par fast-glob micromatch)")

attendre 1 "un paquet qui cite l'exempté ET porte un autre avis fait échouer" 2026-10-03 "NON EXEMPTE micromatch" < <(rapport "$(avis braces "$URL" high),
\"micromatch\": {\"name\": \"micromatch\", \"severity\": \"high\", \"via\": [\"braces\", {\"source\": 2, \"name\": \"micromatch\", \"title\": \"x\", \"url\": \"https://github.com/advisories/GHSA-aaaa-bbbb-cccc\", \"severity\": \"low\"}]}")

# --- L'exemption désigne un avis ET un paquet, rien d'autre.
attendre 1 "le même avis sur un autre paquet n'est pas couvert" 2026-10-03 "NON EXEMPTE lodash" < <(rapport "$(avis lodash "$URL" high)")
attendre 1 "un autre avis sur braces n'est pas couvert" 2026-10-03 "NON EXEMPTE braces" < <(rapport "$(avis braces https://github.com/advisories/GHSA-aaaa-bbbb-cccc high)")

# --- La date limite tient.
attendre 1 "une exemption échue fait échouer" 2026-10-18 "ECHUE GHSA-vfj7-8cjw-p6xm" < <(rapport "$CHAINE")

# --- Défaut fermé sur les cas que le point fixe pourrait laisser passer.
attendre 1 "un cycle sans avis ne passe pas" 2026-10-03 "NON EXEMPTE a" < <(rapport "$(par a b), $(par b a)")
attendre 1 "un paquet sans cause ne passe pas" 2026-10-03 "NON EXEMPTE x" < <(rapport '"x": {"name": "x", "severity": "high", "via": []}')

# --- Entrées illisibles : code 2, jamais 0.
attendre 2 "un rapport illisible bloque" 2026-10-03 < <(echo "pas du json")
attendre 2 "un rapport de forme inconnue bloque" 2026-10-03 < <(echo '{"auditReportVersion": 1, "advisories": {}}')

ecrire_exemptions "$(exemption "$AVIS" braces 2026-10-03 2026-11-04)"
attendre 2 "une exemption de 32 jours est refusée" 2026-10-03 < <(rapport "$CHAINE")

ecrire_exemptions "$(exemption "GHSA-*" braces 2026-10-03 2026-10-17)"
attendre 2 "un identifiant joker est refusé" 2026-10-03 < <(rapport "$CHAINE")

ecrire_exemptions "$(exemption "$AVIS" braces 2026-10-03 2026-02-30)"
attendre 2 "une date impossible est refusée" 2026-10-03 < <(rapport "$CHAINE")

ecrire_exemptions '{"avis": "x"}'
attendre 2 "un fichier d'exemptions qui n'est pas une liste est refusé" 2026-10-03 < <(rapport "$CHAINE")

# --- Le fichier versionné est lisible tel qu'il est. Sa date limite N'EST PAS
# exercée ici : elle échoit, et ce contrôle de PR deviendrait rouge pour une
# raison étrangère à la PR. Le nocturne la juge chaque nuit.
verifies=$((verifies + 1))
debut=$(node -e 'const l=require(process.argv[1]);console.log(l.map(e=>e.ajoute_le).sort()[0]??"")' \
  "$RACINE/scripts/audit-exemptions.json" 2>/dev/null)
if [ -n "$debut" ]; then
  rapport "" | AUJOURDHUI="$debut" node "$FILTRE" "$RACINE/scripts/audit-exemptions.json" >"$TMP/sortie.txt" 2>&1
  if [ $? -eq 2 ]; then
    echo "ECHEC scripts/audit-exemptions.json est refusé par le filtre :"
    sed 's/^/      /' "$TMP/sortie.txt"
    ko=$((ko + 1))
  fi
fi

# --- Le workflow appelle le filtre, après la reconnaissance de panne et avant
# l'échec. Appelé avant, il pourrait excuser une panne ; absent, toute
# exemption serait lettre morte.
verifies=$((verifies + 1))
bloc=$(awk '
  /^ *- name: Audit des dependances$/ { dedans = 1; next }
  dedans && /^ *- name: / { exit }
  dedans && !/^ *#/ { print }
' "$WORKFLOW")
l_panne=$(grep -n "audit endpoint returned an error" <<<"$bloc" | head -1 | cut -d: -f1)
l_filtre=$(grep -n "node scripts/filtrer-audit.mjs scripts/audit-exemptions.json" <<<"$bloc" | head -1 | cut -d: -f1)
l_echec=$(grep -n "exit 1" <<<"$bloc" | tail -1 | cut -d: -f1)
if [ -z "$l_filtre" ]; then
  echo "ECHEC l'étape « Audit des dependances » n'appelle plus le filtre d'exemption."
  ko=$((ko + 1))
elif [ -z "$l_panne" ] || [ -z "$l_echec" ] || [ "$l_filtre" -lt "$l_panne" ] || [ "$l_filtre" -gt "$l_echec" ]; then
  echo "ECHEC le filtre d'exemption n'est pas entre la reconnaissance de panne et l'échec."
  ko=$((ko + 1))
fi

# --- Chaque cas écrit a bien été compté. Un `rapport ... | attendre` exécute
# `attendre` dans un sous-shell, dont les compteurs se perdent : à la première
# écriture, 2 cas comptés sur 19, et un échec y serait sorti vert. D'où la
# redirection `< <(...)`, et ce garde qui confronte au nombre d'appels écrits.
ecrits=$(grep -cE '^attendre [0-9] ' "$0")
if [ "$verifies" -ne $((ecrits + 2)) ]; then
  echo "ECHEC $verifies cas comptés pour $ecrits appels à « attendre » plus 2 gardes."
  echo "      Un cas tourne hors du shell principal, son verdict est perdu."
  ko=$((ko + 1))
fi

echo "Cas du filtre d'audit vérifiés : $verifies"

if [ "$ko" -gt 0 ]; then
  echo "ECHEC $ko cas ne rendent pas le verdict attendu"
  exit 1
fi

echo "OK l'exemption d'audit reste limitée à un avis, un paquet et une date"
