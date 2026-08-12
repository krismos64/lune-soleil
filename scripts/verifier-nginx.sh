#!/usr/bin/env bash
# Verifie la configuration Nginx qui porte la resolution de l'adresse client.
# LS-91, ADR-027.
#
# POURQUOI CE CONTROLE EXISTE. Toute la protection de LS-91 tient dans UNE
# directive, `proxy_set_header X-Forwarded-For $remote_addr`. Elle est
# contre-intuitive : la forme repandue sur internet est
# `$proxy_add_x_forwarded_for`, elle est meme celle que la plupart des guides
# recommandent, et quelqu'un la retablira de bonne foi en croyant corriger une
# perte d'information.
#
# CE QUE COUTERAIT LA SUBSTITUTION, mesure dans `tests/unitaire/adresse-ip.test.ts` :
# la concatenation laisse le client choisir la partie gauche de la chaine, et
# `getIPFromHeader` rend `null` des qu'un jeton n'est pas analysable. Un
# attaquant envoie `X-Forwarded-For: pasuneip` et n'apparait plus dans le
# journal des connexions, ni dans le comptage par adresse d'ADR-027. Il CHOISIT
# de ne pas etre trace, ce qui est pire que le defaut d'origine.
#
# Le defaut serait SILENCIEUX : le site fonctionne, les connexions marchent, et
# seule la colonne `adresse_ip` se vide peu a peu.
#
# CE QU'IL NE FAIT PAS. Il ne valide pas la syntaxe Nginx, ce que ferait
# `nginx -t` sur l'hote, ni ne verifie que le fichier est effectivement installe
# sur le serveur. Il verifie la DECISION, pas le deploiement.
#
# Usage : ./scripts/verifier-nginx.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONF="docker/nginx/lune-soleil.conf"
anomalies=()

if [ ! -f "$CONF" ]; then
  echo "ECHEC $CONF est absent."
  echo "      LS-91 fait reposer la resolution de l'adresse client sur ce"
  echo "      fichier. Sans lui, la decision n'est ecrite nulle part."
  exit 1
fi

# ---------------------------------------------------------------------------
# LES DIRECTIVES ACTIVES SEULEMENT, JAMAIS LES COMMENTAIRES.
#
# Ce fichier EXPLIQUE longuement pourquoi `$proxy_add_x_forwarded_for` est
# refuse, il contient donc cette chaine plusieurs fois. Un controle ancre sur
# un `grep` brut serait soit toujours rouge, soit satisfait par le commentaire
# qui NIE l'usage de la directive.
#
# C'est le defaut « controle satisfait par un commentaire » deja rencontre sur
# ce projet, dans les deux sens. Les lignes de commentaire sont donc retirees
# AVANT toute recherche.
# ---------------------------------------------------------------------------
directives=$(sed 's/#.*//' "$CONF" | grep -vE '^\s*$')

# ---------------------------------------------------------------------------
# 1. X-Forwarded-For est ECRASE par $remote_addr
# ---------------------------------------------------------------------------
ligne_xff=$(printf '%s\n' "$directives" \
  | grep -iE '^\s*proxy_set_header\s+X-Forwarded-For\s' || true)

if [ -z "$ligne_xff" ]; then
  anomalies+=("aucune directive active 'proxy_set_header X-Forwarded-For' : Better Auth ne recevrait aucune adresse")
elif printf '%s' "$ligne_xff" | grep -q 'proxy_add_x_forwarded_for'; then
  anomalies+=("X-Forwarded-For est CONCATENE par \$proxy_add_x_forwarded_for. Le client controle alors la partie gauche de la chaine et peut se rendre invisible au journal en envoyant un jeton non analysable. Employer \$remote_addr, qui ecrase.")
elif ! printf '%s' "$ligne_xff" | grep -q '\$remote_addr'; then
  anomalies+=("X-Forwarded-For n'est pas pose a partir de \$remote_addr : la valeur retenue ne serait pas l'adresse de la connexion TCP")
fi

# ---------------------------------------------------------------------------
# 2. La route interne des taches n'est pas exposee
# ---------------------------------------------------------------------------
#
# Le secret partage protege deja cette route, invariant 2, et c'est LUI qui
# protege. Refuser ici retire une surface sans rien couter, et l'oubli de ce
# bloc ne produit aucun symptome visible.
if ! printf '%s\n' "$directives" | grep -qE 'location\s+/api/interne/'; then
  anomalies+=("aucun bloc 'location /api/interne/' : la route interne des taches planifiees serait joignable depuis l'exterieur")
fi

# ---------------------------------------------------------------------------
# 3. Coherence avec la variable d'environnement
# ---------------------------------------------------------------------------
#
# Les deux moities de LS-91 doivent rester d'accord. Si Nginx ecrase l'en-tete,
# la chaine ne porte qu'un saut et la liste de proxies DOIT rester vide : une
# liste renseignee ferait sauter ce saut unique et `getIp` rendrait `null`,
# c'est-a-dire le defaut d'origine sous une configuration qui a l'air faite.
#
# Le fichier `.env` reel n'est jamais lu ici, invariant 9 et permissions du
# projet : seul `.env.example` est verifie, qui doit porter le nom de la
# variable et la consigne de la laisser vide.
if [ -f .env.example ]; then
  if ! grep -q '^BETTER_AUTH_TRUSTED_PROXIES=' .env.example; then
    anomalies+=("BETTER_AUTH_TRUSTED_PROXIES absente de .env.example, critere 2 de LS-91")
  elif ! grep -qE '^BETTER_AUTH_TRUSTED_PROXIES=\s*$' .env.example; then
    anomalies+=("BETTER_AUTH_TRUSTED_PROXIES porte une valeur dans .env.example : elle doit rester VIDE tant que Nginx ecrase l'en-tete")
  fi
fi

echo "CONFIGURATION NGINX, LS-91"
echo

if [ ${#anomalies[@]} -eq 0 ]; then
  echo "  X-Forwarded-For ecrase par \$remote_addr"
  echo "  route interne non exposee"
  echo "  BETTER_AUTH_TRUSTED_PROXIES declaree et vide"
  echo
  echo "OK la resolution de l'adresse client est coherente"
  exit 0
fi

echo "  ${#anomalies[@]} anomalie(s) :"
for a in "${anomalies[@]}"; do
  echo "  - $a"
done
echo
exit 1
