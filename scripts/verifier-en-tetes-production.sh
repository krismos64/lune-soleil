#!/bin/bash
# Vérifie que les cinq en-têtes de sécurité sont SERVIS par la production,
# ADR-038, LS-139.
#
# POURQUOI CE CONTRÔLE EXISTE, ET IL VIENT D'UN DÉFAUT RÉEL. Le 9 septembre
# 2026, le premier volet de LS-139 était écrit, prouvé par neuf mutations,
# fusionné sur `main` et DÉPLOYÉ : la production ne servait pourtant que DEUX
# en-têtes sur cinq. `verifier-en-tetes-securite.sh` était vert à juste titre,
# le fichier du dépôt étant correct ; la machine servait une version antérieure.
#
# LA CAUSE EST STRUCTURELLE ET ELLE RESTE VRAIE. `docker/nginx/lune-soleil.conf`
# est un fichier de l'HÔTE : ni le workflow de déploiement ni `deployer.sh` ne
# le transportent, et rien ne le fera. Le fichier du dépôt est une RÉFÉRENCE que
# quelqu'un doit copier à la main, jamais une source appliquée.
#
# CE QU'IL AJOUTE AUX DEUX AUTRES CONTRÔLES, et les trois sont nécessaires :
#
#   verifier-en-tetes-securite.sh   les en-têtes sont DÉCLARÉS dans le dépôt.
#                                   Textuel, aucun prérequis.
#   tests/e2e/en-tetes-securite     ils sont SERVIS par le build local, et le
#                                   nonce change à chaque requête.
#   celui-ci                        ils sont servis par LA MACHINE EN SERVICE,
#                                   sur le domaine public, maintenant.
#
# Le second ne peut pas voir ce défaut : il mesure un serveur local monté depuis
# le dépôt, donc il mesure toujours la version correcte. Seule une requête vers
# le domaine réel distingue « écrit » de « en service ».
#
# Usage : ./scripts/verifier-en-tetes-production.sh [domaine]
# Prérequis : un accès réseau sortant. Aucun accès SSH, aucun secret.
set -uo pipefail

DOMAINE="${1:-lune-soleil.fr}"
BASE="https://$DOMAINE"
ko=0

# LES CHEMINS SONT CHOISIS POUR COUVRIR LES TROIS SOURCES DE RÉPONSE, pas pour
# faire nombre. Chacun emprunte un chemin de code différent, et le défaut du
# 9 septembre se logeait précisément dans l'écart entre eux :
#
#   /            page rendue par l'application, code 200
#   /catalogue   seconde page applicative, pour qu'un 200 ne tienne pas à une
#                route unique
#   /medias/     bloc `location` DISTINCT, qui redéclare ses en-têtes et perd
#                le jeu hérité s'il en oublie un. C'est le cas qui a réellement
#                manqué, et ce sont des fichiers téléversés.
#   /page-...    404 applicatif : sans `always`, `add_header` ne pose rien sur
#                un code d'erreur, c'est-à-dire au moment où le client est le
#                plus exposé.
CHEMINS=(
  "/"
  "/catalogue"
  "/medias/"
  "/page-qui-nexiste-pas-controle-ls139"
)

# LA CSP N'EST PAS ATTENDUE PARTOUT, et l'exiger partout rendrait ce contrôle
# faux. Elle vient de l'application, donc `/medias/` que Nginx sert directement
# n'en porte aucune, et c'est le comportement voulu par ADR-038 : un fichier
# statique n'exécute pas de script.
NGINX_ATTENDUS=(
  "strict-transport-security"
  "x-content-type-options"
  "referrer-policy"
  "permissions-policy"
)

echo "En-têtes servis par la production, $BASE"
echo

joignable=0

for chemin in "${CHEMINS[@]}"; do
  # `--max-time` borne l'attente : un contrôle qui pend indéfiniment sur une
  # machine tombée n'est pas un contrôle, il bloque la chaîne sans rien dire.
  reponse=$(curl -sSI --max-time 20 "$BASE$chemin" 2>/dev/null || true)

  if [ -z "$reponse" ]; then
    echo "  ECHEC $chemin injoignable"
    ko=1
    continue
  fi

  joignable=1
  code=$(printf '%s' "$reponse" | head -1 | grep -oE '[0-9]{3}' | head -1)
  manquants=""

  for entete in "${NGINX_ATTENDUS[@]}"; do
    # `grep -i` sur le NOM SUIVI DE DEUX-POINTS, jamais sur le nom seul : une
    # valeur d'en-tête peut contenir le nom d'un autre, et un motif nu s'y
    # ferait satisfaire. Le motif « nom nu hors ancrage » est déjà en fiche.
    if ! printf '%s' "$reponse" | grep -qiE "^$entete:"; then
      manquants="$manquants $entete"
    fi
  done

  if [ -n "$manquants" ]; then
    echo "  ECHEC $chemin ($code) ne sert pas :$manquants"
    ko=1
  else
    echo "  OK    $chemin ($code) sert les quatre en-têtes de Nginx"
  fi
done

echo

# LA CSP SE VÉRIFIE SUR LES SEULES RÉPONSES APPLICATIVES, et son nonce est la
# propriété qui compte : une CSP statique serait devinable, donc réutilisable
# par un script injecté. Deux requêtes suffisent à le prouver.
echo "Content-Security-Policy et nonce par requête"

csp1=$(curl -sSI --max-time 20 "$BASE/" 2>/dev/null | grep -i '^content-security-policy:' || true)
csp2=$(curl -sSI --max-time 20 "$BASE/" 2>/dev/null | grep -i '^content-security-policy:' || true)

if [ -z "$csp1" ]; then
  echo "  ECHEC aucune Content-Security-Policy sur /"
  ko=1
else
  echo "  OK    la politique est servie"

  if printf '%s' "$csp1" | grep -q "'unsafe-inline'.*script-src\|script-src[^;]*'unsafe-inline'"; then
    echo "  ECHEC script-src porte 'unsafe-inline' en production."
    echo "        C'est précisément l'injection de script inline que la CSP"
    echo "        existe pour bloquer, ADR-038."
    ko=1
  else
    echo "  OK    script-src ne porte pas 'unsafe-inline'"
  fi

  nonce1=$(printf '%s' "$csp1" | grep -oE "nonce-[A-Za-z0-9+/=]+" | head -1)
  nonce2=$(printf '%s' "$csp2" | grep -oE "nonce-[A-Za-z0-9+/=]+" | head -1)

  if [ -z "$nonce1" ]; then
    echo "  ECHEC script-src ne porte aucun nonce"
    ko=1
  elif [ "$nonce1" = "$nonce2" ]; then
    echo "  ECHEC le nonce est IDENTIQUE sur deux requêtes."
    echo "        Un nonce figé est devinable, donc réutilisable par un"
    echo "        script injecté : la politique devient décorative."
    ko=1
  else
    echo "  OK    le nonce change à chaque requête"
  fi
fi

echo

# GARDE CONTRE LUI-MÊME. Si aucun chemin n'a répondu, les boucles ci-dessus
# n'ont rien examiné et le script sortirait en 0 en n'ayant rien vérifié. Le
# motif « un contrôle qui ne trouve plus rien à examiner doit rougir » est en
# fiche, et il a déjà rendu un OK silencieux sur ce dépôt.
if [ "$joignable" -eq 0 ]; then
  echo "ECHEC aucun chemin n'a répondu, rien n'a été vérifié"
  exit 1
fi

if [ "$ko" -eq 0 ]; then
  echo "OK la production sert les cinq en-têtes de sécurité, ADR-038"
else
  echo "ECHEC la production ne sert pas ce que le dépôt déclare"
  echo
  echo "      Le fichier Nginx est un fichier de l'HÔTE, que la chaîne de"
  echo "      déploiement ne transporte pas. Le poser à la main :"
  echo "      scp docker/nginx/lune-soleil.conf <machine>:/tmp/ puis"
  echo "      sudo cp, sudo nginx -t, sudo systemctl reload nginx."
  echo "      EXPLOITATION.md porte la procédure complète."
fi

exit "$ko"
