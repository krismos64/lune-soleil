#!/usr/bin/env bash
# Preuve par mutation du controle Nginx. LS-91.
#
# MOTIF. `verifier-nginx.sh` protege une directive unique et contre-intuitive.
# Un controle qui n'a jamais echoue sur le defaut qu'il pretend attraper n'est
# pas un controle : ce script fabrique chaque defaut et exige un refus.
#
# LE PREMIER CAS EST LE PLUS IMPORTANT. Il retablit
# `$proxy_add_x_forwarded_for`, c'est-a-dire la forme repandue que quelqu'un
# posera de bonne foi. Le fichier de configuration EXPLIQUE pourquoi elle est
# refusee, il contient donc deja cette chaine dans ses commentaires : ce cas
# verifie du meme coup que le controle juge la DIRECTIVE ACTIVE et non le
# commentaire qui la nie.
#
# Usage : ./scripts/verifier-nginx-mutation.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONF="docker/nginx/lune-soleil.conf"
ENVEX=".env.example"

for f in "$CONF" "$ENVEX"; do
  [ -r "$f" ] || { echo "ECHEC fichier illisible : $f"; exit 1; }
done

# LE TRAVAIL EN COURS N'EST JAMAIS ECRASE. Ce script modifie puis restaure ces
# fichiers : une modification non commitee serait perdue sans recours, les
# restaurations repartant de la copie prise ici. Le cas s'est produit sur ce
# projet, un fichier neuf jamais indexe restaure par `git checkout`.
if ! git diff --quiet -- "$CONF" "$ENVEX" 2>/dev/null; then
  echo "ABANDON : $CONF ou $ENVEX porte des modifications non commitees."
  echo "Ce script les modifie puis les restaure, il refuse d'ecraser un travail"
  echo "en cours. Commiter d'abord."
  exit 1
fi

TMP="$(mktemp -d)"
cp "$CONF" "$TMP/conf.origine"
cp "$ENVEX" "$TMP/env.origine"

restaurer() {
  cp "$TMP/conf.origine" "$CONF"
  cp "$TMP/env.origine" "$ENVEX"
}
nettoyer() { restaurer; rm -rf "$TMP"; }
trap nettoyer EXIT

echecs=0
mutations=0

# Applique une substitution et exige que le controle REFUSE.
#
# `avant` et `apres` sont compares : une substitution qui ne modifie rien
# accuserait le controle a la place du script, defaut deja rencontre ici sur le
# script de mutation des tests.
cas() {
  local nom="$1" fichier="$2" expression="$3"
  mutations=$((mutations + 1))

  local avant
  avant=$(cksum <"$fichier")

  perl -0pi -e "$expression" "$fichier"

  if [ "$(cksum <"$fichier")" = "$avant" ]; then
    echo "  ECHEC $nom -> la mutation n'a modifie aucun caractere"
    echo "        L'expression ne correspond plus au fichier : corriger le"
    echo "        script, pas le controle."
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  if ./scripts/verifier-nginx.sh >"$TMP/sortie.txt" 2>&1; then
    echo "  RATE  $nom -> le controle reste VERT, il est aveugle"
    echecs=$((echecs + 1))
  else
    echo "  OK    $nom -> refuse"
    grep -E '^  - ' "$TMP/sortie.txt" | head -1 | cut -c1-100 | sed 's/^/          /'
  fi

  restaurer
}

echo "Controle Nginx, LS-91"
echo

# Etat de reference : le controle doit etre VERT avant toute mutation, sans quoi
# aucun refus ne prouverait quoi que ce soit.
if ! ./scripts/verifier-nginx.sh >/dev/null 2>&1; then
  echo "  ECHEC le controle n'est pas vert AVANT mutation."
  echo "        Aucune mutation ne peut rien prouver dans cet etat."
  exit 1
fi

# Cas 1 : LA mutation qui compte. La forme repandue revient, celle que
# quelqu'un posera en croyant bien faire. Elle laisse le client choisir la
# partie gauche de la chaine, donc se rendre invisible au journal.
cas "X-Forwarded-For concatene au lieu d'etre ecrase" "$CONF" \
  's/proxy_set_header X-Forwarded-For \$remote_addr;/proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/'

# Cas 2 : la directive disparait entierement. Better Auth ne recevrait plus
# aucune adresse, et la colonne se viderait sans bruit.
cas "directive X-Forwarded-For retiree" "$CONF" \
  's/\n *proxy_set_header X-Forwarded-For \$remote_addr;//'

# Cas 3 : une valeur arbitraire, ni concatenation ni ecrasement. Le cas couvre
# la substitution par une variable voisine, `$http_x_forwarded_for` par exemple,
# qui rendrait au client le controle total de l'en-tete.
cas "X-Forwarded-For pose depuis une valeur fournie par le client" "$CONF" \
  's/proxy_set_header X-Forwarded-For \$remote_addr;/proxy_set_header X-Forwarded-For \$http_x_forwarded_for;/'

# Cas 4 : la route interne redevient joignable depuis l'exterieur. Le secret
# partage la protege toujours, mais la surface reapparait sans symptome.
cas "bloc location \/api\/interne\/ retire" "$CONF" \
  's/location \/api\/interne\/ \{\n *deny all;\n *\}//'

# Cas 5 : la variable disparait de .env.example. Le critere 2 du ticket exige
# que son nom y figure, sans quoi personne ne saura qu'elle existe.
cas "BETTER_AUTH_TRUSTED_PROXIES retiree de .env.example" "$ENVEX" \
  's/\nBETTER_AUTH_TRUSTED_PROXIES=//'

# Cas 6 : la variable est renseignee avec une plage large, le piege exact
# decrit dans le commentaire. Tous les sauts deviennent de confiance et `getIp`
# rend `null` : le defaut d'origine revient, sous une configuration qui a l'air
# d'avoir ete faite.
cas "BETTER_AUTH_TRUSTED_PROXIES renseignee avec une plage large" "$ENVEX" \
  's/\nBETTER_AUTH_TRUSTED_PROXIES=\n/\nBETTER_AUTH_TRUSTED_PROXIES=172.16.0.0\/12\n/'

# Cas 7 : UN EMPLACEMENT STATIQUE EXPOSE LES DOCUMENTS COMPTABLES, LS-132
# critere 6. C'est le contournement le plus direct du jeton signe : la facture
# devient lisible par son URL, sans expiration, sans revocation et sans
# controle de propriete, et rien dans le code applicatif ne le montre. Le
# defaut vit entierement dans la configuration du serveur.
cas "alias Nginx vers le volume des documents" "$CONF" \
  's/    location \/ \{/    location \/documents\/ \{\n        alias \/var\/lib\/lune-soleil\/documents\/;\n    \}\n\n    location \/ \{/'

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations detectees"
else
  echo "  $mutations mutations, $echecs NON detectees"
fi
echo "-----------------------------------------"

exit "$echecs"
