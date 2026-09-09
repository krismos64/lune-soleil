#!/bin/bash
# Vérifie que les cinq en-têtes de sécurité sont déclarés, ADR-038, LS-139.
#
# CE QU'IL GARDE. La production ne servait qu'UN en-tête sur cinq le 9 septembre
# 2026, HSTS seul, alors que la boutique tourne et que l'espace client est la
# première cible d'une attaque sur un site marchand. Les quatre autres n'étaient
# écrits nulle part : ni dans Nginx, ni dans `next.config.ts`, ni ailleurs.
#
# DEUX SOURCES, ET C'EST DÉLIBÉRÉ, ADR-038 :
#
#   Nginx          HSTS, X-Content-Type-Options, Referrer-Policy,
#                  Permissions-Policy. Ils ne dépendent d'aucune requête, et
#                  Nginx les sert MÊME QUAND L'APPLICATION EST TOMBÉE.
#   `src/proxy.ts` Content-Security-Policy, qui porte un NONCE par requête et
#                  ne peut donc pas être statique.
#
# CE CONTRÔLE EST TEXTUEL, et il faut dire ce qu'il ne prouve pas : il vérifie
# que les en-têtes sont DÉCLARÉS, jamais qu'ils sont SERVIS. Un `add_header`
# dans un `location` qui remplace le jeu hérité passerait ici sans être vu.
# C'est le rôle de la suite de bout en bout, qui les mesure sur des réponses
# réelles, et les deux sont nécessaires.
#
# LE PIÈGE DE NGINX QUE CE CONTRÔLE ATTRAPE. `add_header` dans un `location`
# REMPLACE tout le jeu hérité du bloc serveur, il ne s'y ajoute pas. Un
# `location` qui pose un seul en-tête perd donc les quatre autres, en silence.
# Le sens 2 vérifie que chaque `location` qui en déclare un les déclare TOUS.
#
# Usage : ./scripts/verifier-en-tetes-securite.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$RACINE/docker/nginx/lune-soleil.conf"
PROXY="$RACINE/src/proxy.ts"
ko=0

[ -f "$CONF" ] || { echo "ECHEC configuration nginx introuvable : $CONF"; exit 1; }
[ -f "$PROXY" ] || {
  echo "ECHEC src/proxy.ts introuvable."
  echo "      La Content-Security-Policy vient de là, ADR-038 : sans ce fichier"
  echo "      aucune politique n'est posée, et rien d'autre ne le dit."
  exit 1
}

# ---------------------------------------------------------------------------
# SENS 1 : les quatre en-têtes de Nginx sont déclarés au moins une fois.
# ---------------------------------------------------------------------------
echo "En-têtes servis par Nginx"

for entete in \
  "Strict-Transport-Security" \
  "X-Content-Type-Options" \
  "Referrer-Policy" \
  "Permissions-Policy"; do

  ligne=$(grep -nE "^\s*add_header\s+$entete" "$CONF" | head -1 || true)

  if [ -z "$ligne" ]; then
    echo "  ECHEC $entete n'est déclaré nulle part dans la configuration."
    ko=1
    continue
  fi

  # `always` OU L'EN-TETE NE PART PAS SUR UNE ERREUR. Sans lui, `add_header` ne
  # pose l'en-tête que sur 2xx, 204, 301, 302 et 304 : une page 500 partirait
  # sans protection, ce qui est exactement le moment où elle sert.
  if ! printf '%s' "$ligne" | grep -q "always"; then
    echo "  ECHEC $entete est déclaré sans \`always\`."
    echo "        Il ne partirait pas sur une réponse d'erreur, c'est-à-dire"
    echo "        au moment où le client est le plus exposé."
    ko=1
    continue
  fi

  echo "  OK    $entete, avec always"
done

# ---------------------------------------------------------------------------
# SENS 2 : tout `location` qui déclare un en-tête les déclare TOUS.
#
# C'EST LE SENS QUI ATTRAPE LE PIÈGE DE NGINX, et le sens 1 seul ne le voit
# pas : `add_header` dans un `location` REMPLACE le jeu hérité du bloc serveur.
# Un `location` qui pose `Cache-Control` et rien d'autre sert donc ses réponses
# SANS AUCUN en-tête de sécurité, alors que le bloc serveur les déclare.
#
# Le cas s'est produit ici : `/medias/` reposait HSTS et `nosniff`, mais pas les
# deux ajoutés par ADR-038. Ce sont pourtant des fichiers TÉLÉVERSÉS, donc
# exactement ce qui mérite d'être protégé.
# ---------------------------------------------------------------------------
echo
echo "Blocs location qui redéclarent des en-têtes"

# Le fichier découpé par bloc `location`, avec son numéro de ligne.
blocs=$(grep -nE "^\s*location\s" "$CONF" | cut -d: -f1)
nb_blocs=0
nb_examines=0

for debut in $blocs; do
  nb_blocs=$((nb_blocs + 1))

  # La fin du bloc : le `location` suivant, ou la fin du fichier.
  suivant=$(printf '%s\n' "$blocs" | awk -v d="$debut" '$1 > d {print $1; exit}')
  [ -n "$suivant" ] || suivant=$(wc -l < "$CONF")

  corps=$(sed -n "${debut},${suivant}p" "$CONF")
  nom=$(printf '%s' "$corps" | head -1 | sed 's/^\s*//; s/\s*{.*//')

  # Un bloc sans `add_header` hérite du jeu complet : rien à vérifier.
  printf '%s' "$corps" | grep -qE "^\s*add_header" || continue
  nb_examines=$((nb_examines + 1))

  manquants=""
  for entete in \
    "Strict-Transport-Security" \
    "X-Content-Type-Options" \
    "Referrer-Policy" \
    "Permissions-Policy"; do
    printf '%s' "$corps" | grep -qE "^\s*add_header\s+$entete" ||
      manquants="$manquants $entete"
  done

  if [ -n "$manquants" ]; then
    echo "  ECHEC ligne $debut, \`$nom\` déclare des en-têtes mais pas :$manquants"
    echo "        nginx REMPLACE le jeu hérité dès qu'un add_header est déclaré"
    echo "        dans un location. Les réponses de ce bloc partiraient sans."
    ko=1
  else
    echo "  OK    ligne $debut, \`$nom\` redéclare les quatre"
  fi
done

# LA GARDE D'ANCRAGE. Ce fichier porte plusieurs `location`, dont un qui
# redéclare ses en-têtes : n'en examiner AUCUN signifierait que le motif ne
# trouve plus rien, pas que la configuration est saine.
if [ "$nb_blocs" -eq 0 ]; then
  echo "  ECHEC aucun bloc location trouvé, l'ancrage de ce sens est cassé."
  ko=1
fi

# ---------------------------------------------------------------------------
# SENS 3 : la CSP existe, porte un nonce, et n'ouvre pas ce qu'elle ferme.
# ---------------------------------------------------------------------------
echo
echo "Content-Security-Policy, src/proxy.ts"

if grep -qE "content-security-policy" "$PROXY"; then
  echo "  OK    la politique est posée"
else
  echo "  ECHEC aucune Content-Security-Policy dans le proxy."
  ko=1
fi

# LE NONCE EST CE QUI DISTINGUE UNE VRAIE CSP D'UNE CSP DÉCORATIVE. Sans lui,
# il faudrait `unsafe-inline`, qui annule la protection.
if grep -qE "nonce-\\\$\{nonce\}" "$PROXY"; then
  echo "  OK    script-src porte un nonce par requête"
else
  echo "  ECHEC la politique ne porte aucun nonce."
  echo "        Sans nonce, les scripts inline de Next.js imposent"
  echo "        'unsafe-inline', qui annule l'essentiel de la protection."
  ko=1
fi

# `unsafe-inline` SUR script-src ANNULE LA CSP, et c'est le défaut le plus
# probable d'un futur remaniement : on l'ajoute pour débloquer un script, la
# page remarche, et plus rien ne protège.
#
# LE MOTIF A DÉCLENCHÉ UN FAUX POSITIF À SA PREMIÈRE ÉCRITURE, et c'est le
# motif « contrôle satisfait par un commentaire » pris à l'envers : `grep
# script-src` attrapait la ligne de PROSE qui explique pourquoi `unsafe-inline`
# est refusé, laquelle contient les deux termes. Le contrôle accusait le fichier
# de porter le défaut qu'il documente.
#
# L'ancrage vise donc la DIRECTIVE, ligne commençant par un backtick et
# `script-src`, et les lignes de commentaire sont exclues. `style-src` porte
# légitimement `unsafe-inline`, les attributs `style=` de React n'exécutant
# rien : le motif ne doit pas l'attraper non plus.
if grep -E "^\s*\`script-src" "$PROXY" | grep -v "^\s*\*" | grep -q "unsafe-inline"; then
  echo "  ECHEC script-src porte 'unsafe-inline'."
  echo "        C'est précisément l'injection de script inline que la CSP"
  echo "        existe pour bloquer : la politique devient décorative."
  ko=1
else
  echo "  OK    script-src ne porte pas 'unsafe-inline'"
fi

# `unsafe-eval` EST TOLÉRÉ EN DÉVELOPPEMENT SEULEMENT, React l'employant pour
# reconstruire les piles d'erreur. Le poser sans condition l'emmènerait en
# production, où ni React ni Next.js n'en ont besoin.
#
# L'ANCRAGE PORTE SUR LA LIGNE QUI POSE `unsafe-eval`, jamais sur la présence de
# `development` ailleurs dans le fichier. La première écriture faisait la
# seconde, et sa mutation l'a montré : retirer la condition laissait intacte la
# ligne `NODE_ENV === "development"` qui la LIT plus bas, et le contrôle restait
# vert sur un `unsafe-eval` désormais inconditionnel.
#
# Un ternaire sur la même ligne est la forme retenue ici ; toute autre forme
# doit rendre ce contrôle rouge plutôt que vert, ce qui est le bon sens d'erreur.
if grep -q "unsafe-eval" "$PROXY"; then
  pose=$(grep -nE "unsafe-eval" "$PROXY" | grep -v "^[0-9]*: *[*#]" | grep -v "'unsafe-eval'\\\`" || true)

  if printf '%s' "$pose" | grep -qE "developpement \?|development.*\?"; then
    echo "  OK    'unsafe-eval' est conditionné au développement"
  else
    echo "  ECHEC 'unsafe-eval' est posé sans condition sur la même ligne."
    echo "        Il partirait en production, où ni React ni Next.js n'en ont"
    echo "        besoin. La condition doit être portée par la ligne qui pose"
    echo "        la directive, pas par une lecture ailleurs dans le fichier."
    ko=1
  fi
fi

# LE NONCE DOIT ATTEINDRE LE JSON-LD, sans quoi le navigateur le bloque et les
# données structurées disparaissent pour les moteurs. Le défaut est INVISIBLE à
# l'oeil : la page ne change pas, le référencement se dégrade des semaines plus
# tard.
STRUCT="$RACINE/src/components/donnees-structurees.tsx"
if [ -f "$STRUCT" ]; then
  if grep -qE "nonce=\{" "$STRUCT"; then
    echo "  OK    le bloc JSON-LD porte le nonce"
  else
    echo "  ECHEC le bloc JSON-LD ne porte pas de nonce."
    echo "        La CSP le bloquera, et les données structurées"
    echo "        disparaîtront pour les moteurs sans que rien ne change"
    echo "        à l'écran."
    ko=1
  fi
fi

echo
echo "Blocs location examinés : $nb_examines sur $nb_blocs"
echo

if [ "$ko" -eq 0 ]; then
  echo "OK les cinq en-têtes de sécurité sont déclarés, ADR-038"
else
  echo "ECHEC des en-têtes manquent ou sont affaiblis"
fi

exit "$ko"
