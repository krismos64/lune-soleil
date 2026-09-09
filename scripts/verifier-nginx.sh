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

# ---------------------------------------------------------------------------
# 4. Aucun document comptable servi statiquement, LS-132 critere 6
# ---------------------------------------------------------------------------
#
# UNE FACTURE NE DOIT JAMAIS ETRE ATTEIGNABLE PAR UNE URL DIRECTE. Son acces
# passe par un jeton signe verifie cote serveur, invariant 2 : un `alias` ou un
# `root` vers le volume des documents court-circuiterait entierement ce
# controle, et le defaut serait invisible depuis le code applicatif.
#
# LE CONTROLE PORTAIT SUR LA DIRECTIVE, IL PORTE MAINTENANT SUR LE CHEMIN,
# LS-205. Le changement est motive et non un assouplissement de confort.
#
# CE QUE LA VERSION PRECEDENTE FAISAIT. Elle refusait TOUTE directive `alias` ou
# `root`, quel que soit son chemin, au motif que chercher le mot « documents »
# laisserait passer un `alias /var/lib/lune-soleil/` pose une ligne plus haut,
# qui expose le meme contenu par un chemin parent. Le raisonnement etait juste.
#
# POURQUOI ELLE NE POUVAIT PAS TENIR. ADR-007 decide que **Nginx sert les
# medias** et ecarte nommement un gestionnaire de route Next.js. La regle
# rendait donc cet ADR inapplicable, et le resultat mesure le 8 septembre 2026
# etait qu'AUCUN chemin ne servait `/medias/` : le catalogue aurait affiche des
# images cassees pendant que `/api/sante` rendait 200. La contradiction naissait
# de l'ordre des decisions, ADR-007 supposant Nginx capable de servir des
# fichiers, ce que LS-132 a interdit apres lui.
#
# LE SENS RETENU, arbitrage de Christophe du 9 septembre 2026 : c'est le CHEMIN
# qui porte le risque, pas la directive. Une liste blanche EXHAUSTIVE remplace
# l'interdiction, et tout ce qui n'y figure pas est refuse.
#
# UN SEUL CHEMIN EST AUTORISE, exactement : `medias/public/`. Ni la racine du
# volume, qui publierait `quarantaine/` et ses originaux portant la position GPS
# du domicile ; ni la racine des documents, dont chaque facture passe par un
# jeton signe, invariant 2 et LS-132 critere 6 ; ni aucun chemin parent, qui
# atteindrait les deux.
#
# CE N'EST PAS UNE EXEMPTION MAIS UN RESSERREMENT. La version precedente
# refusait une forme, celle-ci exige une valeur : un `alias` vers
# `/var/lib/lune-soleil/` etait refuse avant et l'est toujours, et un `alias`
# vers `/var/lib/lune-soleil/documents/` aussi. Ce qui change est qu'un seul
# chemin, celui qu'ADR-007 designe, cesse d'etre refuse.
#
# `rendu-document.ts` porte l'autre moitie de cette garantie, la racine des
# documents etant distincte de celle des medias.
CHEMIN_MEDIAS_AUTORISE='/var/lib/lune-soleil/medias/public/'

while IFS= read -r ligne; do
  [ -n "$ligne" ] || continue

  NUM="${ligne%%:*}"
  CONTENU="${ligne#*:}"

  # Le chemin est le second mot de la directive, sans son point-virgule final.
  CHEMIN=$(printf '%s' "$CONTENU" | awk '{print $2}' | tr -d ';')

  if [ "$CHEMIN" != "$CHEMIN_MEDIAS_AUTORISE" ]; then
    anomalies+=("ligne $NUM, une directive alias ou root sert '$CHEMIN' : seul '$CHEMIN_MEDIAS_AUTORISE' est autorise, ADR-007. Tout autre chemin atteindrait la quarantaine et ses donnees EXIF, ou les documents comptables qui exigent un jeton signe, LS-132 critere 6")
  fi
done < <(grep -nE '^[[:space:]]*(alias|root)[[:space:]]' "$CONF" || true)

# LE CHEMIN AUTORISE DOIT ETRE PRESENT, sans quoi ce controle deviendrait un
# garde-fou qui ne garde rien : un fichier ou personne ne sert les medias le
# satisferait silencieusement, et c'est exactement l'etat que LS-205 corrige.
if ! grep -qE "^[[:space:]]*alias[[:space:]]+${CHEMIN_MEDIAS_AUTORISE}[[:space:]]*;" "$CONF"; then
  anomalies+=("aucun alias ne sert '$CHEMIN_MEDIAS_AUTORISE' : les medias ne seraient servis par personne et le catalogue afficherait des images cassees, ADR-007 et LS-205")
fi

echo "CONFIGURATION NGINX, LS-91"
echo

if [ ${#anomalies[@]} -eq 0 ]; then
  echo "  X-Forwarded-For ecrase par \$remote_addr"
  echo "  route interne non exposee"
  echo "  BETTER_AUTH_TRUSTED_PROXIES declaree et vide"
  echo "  seul medias/public/ est servi statiquement, ni quarantaine ni documents"
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
