#!/bin/bash
# Prototype de verification de la strategie de reservation de stock.
# Voir docs/adr/ADR-006-reservation-de-stock.md pour les resultats et l'analyse.
#
# Usage : ./docs/prototypes/reservation-test.sh
# Prerequis : Docker lance. Le conteneur est cree puis supprime a la fin.
#
# Ce script est conserve pour pouvoir rejouer la verification si la version de
# PostgreSQL change ou si la strategie de reservation est remise en question.

set -u
CT=ls-proto-pg
DIR="$(cd "$(dirname "$0")" && pwd)"
ok=0
ko=0

nettoyer() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap nettoyer EXIT

R() { docker exec -i "$CT" psql -U postgres -d lsproto -tAq -c "$1" 2>/dev/null; }

reset_stock() {
  R "DELETE FROM reservation; UPDATE variante SET quantite_physique=1, quantite_reservee=0, vente_web_activee=true;" >/dev/null
}

# La reservation atomique : verification et ecriture en une seule instruction
reserver() {
  R "WITH reserve AS (
       UPDATE variante SET quantite_reservee = quantite_reservee + 1
       WHERE reference = 'LS-ECLIPSE-01'
         AND vente_web_activee = true
         AND quantite_physique - quantite_reservee >= 1
       RETURNING id
     )
     INSERT INTO reservation (variante_id, quantite, expire_a)
     SELECT id, 1, now() + interval '30 minutes' FROM reserve
     RETURNING variante_id;"
}

verifier() {
  local nom="$1" attendu="$2" obtenu="$3"
  if [ "$attendu" = "$obtenu" ]; then
    echo "  OK   $nom"
    ok=$((ok+1))
  else
    echo "  ECHEC $nom : attendu [$attendu], obtenu [$obtenu]"
    ko=$((ko+1))
  fi
}

echo "Demarrage de PostgreSQL 18..."
nettoyer
docker run -d --name "$CT" -e POSTGRES_PASSWORD=proto -e POSTGRES_DB=lsproto \
  -p 5433:5432 postgres:18-alpine >/dev/null

for i in $(seq 1 60); do
  docker exec "$CT" pg_isready -U postgres -d lsproto >/dev/null 2>&1 && break
  sleep 1
done

docker exec -i "$CT" psql -U postgres -d lsproto -q < "$DIR/reservation-schema.sql" >/dev/null
echo "Base prete, version $(R 'SHOW server_version;')"
echo

echo "Test 1 : deux clientes simultanees sur une piece unique"
reset_stock
reserver >/dev/null & reserver >/dev/null &
wait 2>/dev/null
verifier "une seule reservation" "1" "$(R 'SELECT count(*) FROM reservation;')"
verifier "quantite reservee a 1" "1" "$(R 'SELECT quantite_reservee FROM variante;')"
verifier "stock jamais negatif"  "1" "$(R 'SELECT CASE WHEN quantite_physique-quantite_reservee >= 0 THEN 1 ELSE 0 END FROM variante;')"

echo
echo "Test 2 : vingt clientes simultanees sur une piece unique"
reset_stock
for i in $(seq 1 20); do reserver >/dev/null & done
wait 2>/dev/null
verifier "une seule gagnante sur vingt" "1" "$(R 'SELECT count(*) FROM reservation;')"
verifier "quantite reservee a 1"        "1" "$(R 'SELECT quantite_reservee FROM variante;')"

echo
echo "Test 3 : vente web desactivee, cas du marche"
reset_stock
R "UPDATE variante SET vente_web_activee=false;" >/dev/null
reserver >/dev/null
verifier "aucune reservation possible" "0" "$(R 'SELECT count(*) FROM reservation;')"
verifier "stock physique intact"       "1" "$(R 'SELECT quantite_physique FROM variante;')"

echo
echo "Test 4 : liberation d'une reservation expiree"
reset_stock
R "UPDATE variante SET quantite_reservee=1;
   INSERT INTO reservation(variante_id,quantite,expire_a) VALUES (1,1,now()-interval '1 minute');" >/dev/null
verifier "indisponible avant purge" "0" "$(R 'SELECT quantite_physique-quantite_reservee FROM variante;')"
# La tache planifiee, toutes les cinq minutes
R "WITH expirees AS (DELETE FROM reservation WHERE expire_a < now() RETURNING variante_id, quantite)
   UPDATE variante v SET quantite_reservee = v.quantite_reservee - e.q
   FROM (SELECT variante_id, sum(quantite) AS q FROM expirees GROUP BY variante_id) e
   WHERE v.id = e.variante_id;" >/dev/null
verifier "disponible apres purge"  "1" "$(R 'SELECT quantite_physique-quantite_reservee FROM variante;')"
verifier "nouvelle cliente servie" "1" "$(reserver | wc -l | tr -d ' ')"

echo
echo "Test 5 : conversion d'une reservation en vente payee"
reset_stock
reserver >/dev/null
R "WITH conv AS (DELETE FROM reservation RETURNING variante_id, quantite)
   UPDATE variante v SET quantite_physique = v.quantite_physique - c.q,
                         quantite_reservee = v.quantite_reservee - c.q
   FROM (SELECT variante_id, sum(quantite) AS q FROM conv GROUP BY variante_id) c
   WHERE v.id = c.variante_id;" >/dev/null
verifier "stock physique a zero"    "0" "$(R 'SELECT quantite_physique FROM variante;')"
verifier "quantite reservee a zero" "0" "$(R 'SELECT quantite_reservee FROM variante;')"
reserver >/dev/null
verifier "plus achetable ensuite"   "0" "$(R 'SELECT count(*) FROM reservation;')"

echo
echo "----------------------------------------"
echo "  $ok reussis, $ko echoues"
[ "$ko" -eq 0 ] && echo "  Strategie de reservation validee" || echo "  ATTENTION, la strategie doit etre revue"
echo "----------------------------------------"
exit "$ko"
