#!/usr/bin/env bash
# Controle de fumee apres deploiement, LS-73.
#
# CE QU'IL REPOND : « l'application qui vient d'etre deployee sert-elle des
# requetes, avec sa base ». Rien de plus. Ce n'est pas une suite de tests, c'est
# le controle qui decide si un deploiement est retenu ou annule.
#
# POURQUOI IL INTERROGE LA ROUTE ET NON LA BASE DIRECTEMENT. Sonder PostgreSQL
# depuis le poste de deploiement prouverait que la base repond A CE POSTE, pas
# que l'application la joint : un mot de passe errone dans l'environnement du
# conteneur, une resolution de nom differente a l'interieur du reseau Docker, et
# le controle serait vert avec un site mort. Le chemin exerce doit etre celui
# des clients.
#
# CODE DE SORTIE : 0 si le service est sain, 1 sinon. C'est ce que le workflow
# de deploiement lit, LS-74.
#
# POUR VERIFIER CE CODE, NE PAS ENCHAINER DE PIPE. `./controle-fumee.sh | tail`
# rend le code de `tail`, donc 0, y compris quand ce script echoue : le controle
# aurait l'air de passer. Meme piege que `pipefail` avec `grep -q` deja rencontre
# sur ce depot. Rediriger vers /dev/null et lire `$?`, ou employer PIPESTATUS.
#
# Usage : ./scripts/controle-fumee.sh [url]
#   url : racine du service, par defaut http://localhost:3000
set -uo pipefail

BASE="${1:-${SMOKE_BASE_URL:-http://localhost:3000}}"
CIBLE="$BASE/api/sante"

# Une application qui vient de demarrer n'accepte pas encore de connexion. Sans
# reessai, le controle mesurerait la vitesse de demarrage plutot que la sante.
TENTATIVES="${SMOKE_TENTATIVES:-10}"
ATTENTE="${SMOKE_ATTENTE:-2}"

echo "Controle de fumee sur $CIBLE"

for tentative in $(seq 1 "$TENTATIVES"); do
  # --max-time borne chaque tentative : une application qui accepte la connexion
  # sans jamais repondre ferait pendre le deploiement indefiniment.
  reponse=$(curl --silent --show-error --max-time 5 \
    --write-out '\n%{http_code}' "$CIBLE" 2>/dev/null)
  statut=$?

  if [ "$statut" -eq 0 ]; then
    code=$(printf '%s' "$reponse" | tail -1)
    corps=$(printf '%s' "$reponse" | sed '$d')

    if [ "$code" = "200" ]; then
      echo "  OK    service sain, HTTP $code"
      echo "        $corps"
      exit 0
    fi

    # 503 est une reponse SAINE du controle lui-meme : l'application repond et
    # declare son indisponibilite. Inutile de reessayer si la base est morte,
    # mais on laisse la boucle finir, une base peut demarrer apres l'application.
    echo "  ...   tentative $tentative/$TENTATIVES, HTTP $code"
    echo "        $corps"
  else
    echo "  ...   tentative $tentative/$TENTATIVES, service injoignable"
  fi

  [ "$tentative" -lt "$TENTATIVES" ] && sleep "$ATTENTE"
done

echo "  ECHEC le service n'est pas sain apres $TENTATIVES tentatives"
echo "        Ne pas retenir ce deploiement."
exit 1
