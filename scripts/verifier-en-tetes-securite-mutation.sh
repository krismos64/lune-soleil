#!/bin/bash
# Preuve par mutation de `verifier-en-tetes-securite.sh`, LS-139 critère 7.
#
# LE CRITÈRE EXIGE QUE CHAQUE EN-TÊTE FASSE ROUGIR SÉPARÉMENT, et c'est plus
# exigeant qu'il n'y paraît : un contrôle qui vérifie « au moins un en-tête est
# posé » passerait quatre mutations sur cinq sans rien garder. Chaque cas retire
# UN seul en-tête et vérifie que le contrôle le NOMME.
#
# CE QUE CES MUTATIONS PROUVENT, ET CE QU'ELLES NE PROUVENT PAS. Elles prouvent
# que le contrôle voit une déclaration manquante. Elles ne prouvent pas que
# l'en-tête est SERVI : un `add_header` bien écrit dans un `location` qui
# remplace le jeu hérité resterait vert ici. C'est la suite de bout en bout qui
# mesure les réponses réelles, et les deux sont nécessaires.
#
# Usage : ./scripts/verifier-en-tetes-securite-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-en-tetes-securite.sh"
CONF="docker/nginx/lune-soleil.conf"
PROXY="src/proxy.ts"
STRUCT="src/components/donnees-structurees.tsx"

detectes=0
total=0

# LA RESTAURATION NE PASSE PAS PAR GIT. `git checkout` est atomique et échoue en
# entier sur un chemin non suivi, ce qui laisserait les fichiers suivis non
# restaurés eux non plus. Motif « git checkout est atomique », en fiche.
SAUVEGARDE="$(mktemp -d)"

sauver() {
  for f in "$CONF" "$PROXY" "$STRUCT"; do
    mkdir -p "$SAUVEGARDE/$(dirname "$f")"
    cp "$f" "$SAUVEGARDE/$f"
  done
}

restaurer() {
  for f in "$CONF" "$PROXY" "$STRUCT"; do
    cp "$SAUVEGARDE/$f" "$f"
  done
}

nettoyer() {
  restaurer
  rm -rf "$SAUVEGARDE"
}
trap nettoyer EXIT

sauver

# Joue une mutation et exige que le contrôle la DÉTECTE en la NOMMANT.
#
# Le message attendu est vérifié, pas seulement le code de sortie : un contrôle
# qui rougit pour une autre raison que celle visée ferait corriger la mauvaise
# chose. Motif « mutation vue par le mauvais test », en fiche.
jouer() {
  local titre="$1" attendu="$2" mutation="$3"
  total=$((total + 1))

  local avant
  avant=$(cat "$CONF" "$PROXY" "$STRUCT")

  eval "$mutation"

  # LA GARDE D'EMPREINTE. Une mutation qui ne modifie RIEN ferait accuser le
  # contrôle à tort : c'est arrivé sur ce dépôt, une substitution ratant sa
  # cible après reformatage.
  if [ "$avant" = "$(cat "$CONF" "$PROXY" "$STRUCT")" ]; then
    echo "MUTATION SANS EFFET  $titre"
    echo "                     la substitution n'a rien modifié, sa cible a"
    echo "                     probablement changé de forme."
    restaurer
    return
  fi

  local sortie
  sortie=$("$CONTROLE" 2>&1)
  local code=$?

  if [ "$code" -eq 0 ]; then
    echo "NON DETECTE  $titre"
    echo "             le contrôle est resté VERT sur ce défaut"
    restaurer
    return
  fi

  if ! printf '%s' "$sortie" | grep -q "$attendu"; then
    echo "MAUVAISE CAUSE  $titre"
    echo "                rouge, mais sans nommer : $attendu"
    restaurer
    return
  fi

  echo "detecte  $titre"
  detectes=$((detectes + 1))
  restaurer
}

echo "Preuve par mutation de verifier-en-tetes-securite.sh"
echo

# ---------------------------------------------------------------------------
# CAS 1 à 4 : chacun des quatre en-têtes de Nginx retiré SÉPARÉMENT.
#
# Le motif retire TOUTES les occurrences, le bloc serveur et le `location` qui
# le redéclare : n'en retirer qu'une laisserait l'autre satisfaire le sens 1.
# ---------------------------------------------------------------------------
for entete in \
  "Strict-Transport-Security" \
  "X-Content-Type-Options" \
  "Referrer-Policy" \
  "Permissions-Policy"; do
  jouer "$entete retiré de nginx" "$entete" \
    "perl -ni -e 'print unless /^\s*add_header\s+$entete/' '$CONF'"
done

# ---------------------------------------------------------------------------
# CAS 5 : `always` retiré d'un en-tête.
#
# LE DÉFAUT LE PLUS SUBTIL DE CETTE FAMILLE. L'en-tête est bien déclaré, la
# relecture ne voit rien, et il ne part QUE sur 2xx, 204, 301, 302 et 304. Une
# page 500 sort sans protection, c'est-à-dire au moment où elle sert.
# ---------------------------------------------------------------------------
jouer "always retiré de Referrer-Policy" "sans" \
  "perl -pi -e 's/(add_header Referrer-Policy [^;]+) always;/\$1;/' '$CONF'"

# ---------------------------------------------------------------------------
# CAS 6 : la CSP perd son nonce et gagne `unsafe-inline`.
#
# C'EST LE DÉFAUT LE PLUS PROBABLE D'UN FUTUR REMANIEMENT : un script est
# bloqué, on ajoute `unsafe-inline` pour débloquer, la page remarche, et plus
# rien ne protège. L'en-tête reste là, parfaitement visible, et il est devenu
# décoratif.
# ---------------------------------------------------------------------------
jouer "script-src passe à unsafe-inline" "unsafe-inline" \
  "perl -pi -e \"s/'nonce-\\\\\\\${nonce}' 'strict-dynamic'/'unsafe-inline'/\" '$PROXY'"

# ---------------------------------------------------------------------------
# CAS 7 : `unsafe-eval` posé sans condition d'environnement.
#
# Il partirait alors en production, où ni React ni Next.js n'en ont besoin.
# ---------------------------------------------------------------------------
jouer "unsafe-eval sans condition" "condition" \
  "perl -pi -e \"s/const evaluation = developpement \\\\? \\\" 'unsafe-eval'\\\" : \\\"\\\";/const evaluation = \\\" 'unsafe-eval'\\\";/\" '$PROXY'"

# ---------------------------------------------------------------------------
# CAS 8 : le JSON-LD perd son nonce.
#
# LE DÉFAUT EST INVISIBLE À L'OEIL, et c'est ce qui le rend coûteux : aucune
# page ne change, la CSP bloque le bloc, et les données structurées
# disparaissent pour les moteurs. Le référencement se dégrade des semaines plus
# tard sans qu'on relie les deux.
# ---------------------------------------------------------------------------
jouer "le JSON-LD perd son nonce" "JSON-LD" \
  "perl -0pi -e 's/ nonce=\{nonce\}//' '$STRUCT'"

# ---------------------------------------------------------------------------
# CAS 9 : LE CONTRÔLE CONTRE LUI-MÊME, l'ancrage cassé.
#
# Si `src/proxy.ts` disparaît, le contrôle doit ÉCHOUER et non rendre un OK
# silencieux : sans ce fichier, aucune CSP n'est posée et rien d'autre ne le
# dirait.
# ---------------------------------------------------------------------------
total=$((total + 1))
mv "$PROXY" "$PROXY.absent"
sortie=$("$CONTROLE" 2>&1)
code=$?
mv "$PROXY.absent" "$PROXY"

if [ "$code" -ne 0 ] && printf '%s' "$sortie" | grep -q "introuvable"; then
  echo "detecte  proxy absent, le contrôle refuse de conclure"
  detectes=$((detectes + 1))
else
  echo "NON DETECTE  proxy absent"
  echo "             le contrôle rend un OK alors qu'aucune CSP n'est posée"
fi

# ---------------------------------------------------------------------------
# LE VERT DE RÉFÉRENCE. Sans lui, un contrôle TOUJOURS rouge marquerait neuf
# détections sur neuf en ne prouvant rien. Motif « mutation trop brutale ».
# ---------------------------------------------------------------------------
restaurer
echo
if "$CONTROLE" >/dev/null 2>&1; then
  echo "vert de référence retrouvé après restauration"
else
  echo "ECHEC le contrôle est rouge sur le dépôt restauré."
  echo "      Les détections ci-dessus ne prouvent rien : un contrôle toujours"
  echo "      rouge détecte tout sans rien vérifier."
  exit 1
fi

echo
echo "Mutations détectées : $detectes sur $total"

if [ "$detectes" -eq "$total" ]; then
  echo "OK le contrôle attrape chaque en-tête séparément, critère 7"
  exit 0
fi

echo "ECHEC $((total - detectes)) mutation(s) non détectée(s)"
exit 1
