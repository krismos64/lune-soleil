#!/usr/bin/env bash
# Interblocage sur un panier multi-articles, LS-49.
#
# Motif. ADR-006 affirmait « aucun verrou explicite, aucun risque
# d'interblocage ». La seconde proposition ne decoule pas de la premiere :
# l'UPDATE conditionnel prend un verrou de ligne implicite qu'il tient jusqu'au
# COMMIT. Deux paniers portant les memes variantes dans un ordre oppose se
# bloquent mutuellement.
#
# Ce script le reproduit avec l'instruction exacte d'ADR-006 et rien d'autre.
#
# Ce qu'il montre aussi, et qui fixe la priorite : PostgreSQL detecte le cycle
# et annule une des deux transactions. L'etat final reste coherent, aucune
# survente. Le defaut est un echec de commande sous concurrence, pas une
# atteinte a l'integrite du stock.
#
# La correction est le tri deterministe des variantes par identifiant croissant
# avant mise a jour, portee par un ticket distinct avant la phase 3.
#
# Usage : ./docs/prototypes/interblocage-panier.sh
# Prerequis : Docker lance. Le conteneur est cree puis supprime a la fin.

set -u
CT=ls49-interblocage
PORT=55416

nettoyer() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap nettoyer EXIT

command -v docker >/dev/null 2>&1 || { echo "ECHEC Docker absent"; exit 2; }
docker info >/dev/null 2>&1 || { echo "ECHEC Docker ne repond pas"; exit 2; }

nettoyer
docker run -d --name "$CT" -e POSTGRES_PASSWORD=x -e POSTGRES_DB=lstest \
  -p "$PORT:5432" postgres:18 >/dev/null 2>&1 \
  || { echo "ECHEC demarrage du conteneur"; exit 2; }

pret=0
for _ in $(seq 1 30); do
  docker exec "$CT" pg_isready -U postgres -d lstest >/dev/null 2>&1 && { pret=1; break; }
  sleep 1
done
[ "$pret" -eq 1 ] || { echo "ECHEC la base n'est pas prete"; exit 2; }

PSQL="docker exec -i $CT psql -U postgres -d lstest -v ON_ERROR_STOP=1 -q"

$PSQL <<'SQL' || { echo "ECHEC preparation du schema"; exit 2; }
CREATE TABLE variante (
  id text PRIMARY KEY,
  quantite_physique int NOT NULL,
  quantite_reservee int NOT NULL DEFAULT 0,
  vente_web_activee boolean NOT NULL DEFAULT true,
  archivee_a timestamptz,
  CHECK (quantite_physique >= 0),
  CHECK (quantite_reservee >= 0),
  CHECK (quantite_physique - quantite_reservee >= 0)
);
INSERT INTO variante (id, quantite_physique) VALUES ('A', 1), ('B', 1);
SQL

# L'UPDATE conditionnel exact d'ADR-006, sans modification.
reserver() {
  cat <<SQL
UPDATE variante SET quantite_reservee = quantite_reservee + 1
WHERE id = '$1'
  AND vente_web_activee = true
  AND archivee_a IS NULL
  AND quantite_physique - quantite_reservee >= 1
RETURNING id;
SQL
}

echo "Interblocage sur panier multi-articles, ADR-006"
echo
echo "  T1 reserve A puis B, T2 reserve B puis A."
echo "  La pause garantit que chacune tient son premier verrou avant"
echo "  de demander le second."
echo

sortie1="$(mktemp)"; sortie2="$(mktemp)"
{ echo "BEGIN;"; reserver A; sleep 2; reserver B; echo "COMMIT;"; } \
  | $PSQL >"$sortie1" 2>&1 &
PID1=$!
sleep 0.2
{ echo "BEGIN;"; reserver B; sleep 2; reserver A; echo "COMMIT;"; } \
  | $PSQL >"$sortie2" 2>&1 &
PID2=$!

wait $PID1; R1=$?
wait $PID2; R2=$?

sed 's/^/  [T1] /' "$sortie1"
sed 's/^/  [T2] /' "$sortie2"
echo "  codes de sortie : T1=$R1 T2=$R2"
echo

detecte=0
grep -qi 'deadlock detected' "$sortie1" "$sortie2" && detecte=1

echo "  etat final"
$PSQL -c "SELECT id, quantite_physique, quantite_reservee FROM variante ORDER BY id;" \
  | sed 's/^/  /'

# Aucune ligne ne doit avoir plus de reservations que de stock physique : c'est
# l'invariant qui compte, et il tient meme quand l'interblocage se produit.
survente=$($PSQL -tAc \
  "SELECT count(*) FROM variante WHERE quantite_reservee > quantite_physique;" \
  | tr -d ' ')

rm -f "$sortie1" "$sortie2"

echo
echo "-----------------------------------------"
if [ "$detecte" -eq 1 ] && [ "$survente" = "0" ]; then
  echo "  interblocage reproduit, aucune survente"
  echo "  le tri deterministe des variantes reste requis"
  exit 0
elif [ "$detecte" -eq 0 ]; then
  echo "  interblocage NON reproduit, verifier la temporisation"
  exit 1
else
  echo "  ECHEC survente detectee, $survente ligne(s)"
  exit 1
fi
