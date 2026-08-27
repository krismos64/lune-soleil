#!/usr/bin/env bash
# Interblocage entre la liberation des reservations et la confirmation, LS-120.
#
# Motif. La confirmation de LS-119 prend ses verrous dans l'ordre `variante`
# PUIS `reservation` : `consommerReservationEtSortirStock` verrouille la
# variante, du travail suit, puis `supprimerReservations` touche la table des
# reservations, dans la MEME transaction. La premiere version de la tache de
# liberation prenait l'ordre INVERSE, supprimant les reservations echues avant
# de rendre `quantite_reservee`.
#
# Deux transactions qui prennent les memes verrous dans un ordre oppose
# s'attendent mutuellement. Releve par `ls-critical-reviewer` le 27 aout 2026.
#
# CE QUE CE SCRIPT MONTRE, ET POURQUOI C'EST GRAVE ICI. A la difference de
# l'interblocage de panier de LS-49, ou l'etat final restait coherent, c'est
# SYSTEMATIQUEMENT LA CONFIRMATION qui est tuee : le paiement n'est pas
# enregistre, le stock pas sorti, et la piece PAYEE repart au catalogue,
# immediatement revendable. Sur une piece unique, c'est la double vente que le
# jalon du projet interdit.
#
# La correction est l'alignement de l'ordre : la liberation verrouille les
# variantes AVANT de supprimer les reservations, `ORDER BY` par identifiant.
# Ce script joue les deux ordres et montre le contraste.
#
# CE SCRIPT N'EST PAS DANS LA SUITE DE TESTS, et c'est delibere : la fenetre
# tient a un `pg_sleep` entre les deux ecritures de la confirmation, que le
# service ne permet pas d'ouvrir depuis un test sans ajouter un point d'accroche
# au code de production. Le test d'integration couvre le CROISEMENT des deux
# taches, ce script couvre l'ORDRE DES VERROUS.
#
# Usage : ./docs/prototypes/interblocage-liberation-confirmation.sh
# Prerequis : Docker lance, conteneur `lune-soleil-db` demarre. La base de banc
# est creee puis supprimee, la base de developpement n'est jamais touchee.

set -u

CONTENEUR=lune-soleil-db
BASE=banc_interblocage_ls120

psql_banc() {
  docker exec -i "$CONTENEUR" psql -U lunesoleil -d "$BASE" -q -v ON_ERROR_STOP=1 "$@"
}

psql_admin() {
  docker exec -i "$CONTENEUR" psql -U lunesoleil -d postgres -q "$@"
}

nettoyer() {
  psql_admin -c "DROP DATABASE IF EXISTS $BASE" >/dev/null 2>&1 || true
}
trap nettoyer EXIT

command -v docker >/dev/null 2>&1 || {
  echo "ECHEC Docker absent"
  exit 2
}

docker exec "$CONTENEUR" true >/dev/null 2>&1 || {
  echo "ECHEC conteneur $CONTENEUR non demarre, lancer npm run db:preparer"
  exit 2
}

preparer() {
  nettoyer
  psql_admin -c "CREATE DATABASE $BASE" >/dev/null
  psql_banc \
    -c "CREATE TABLE variante (id text PRIMARY KEY, quantite_physique int, quantite_reservee int CHECK (quantite_reservee >= 0));" \
    -c "CREATE TABLE reservation (id text PRIMARY KEY, variante_id text, commande_id text, quantite int, expire_a timestamptz);" \
    >/dev/null
  psql_banc \
    -c "INSERT INTO variante VALUES ('v1', 1, 1);" \
    -c "INSERT INTO reservation VALUES ('r1','v1','c1',1, now() - interval '1 minute');" \
    >/dev/null
}

# La CONFIRMATION, fidele a `webhook-paiement.ts` : verrou sur la variante,
# travail intermediaire, PUIS suppression des reservations, meme transaction.
confirmation() {
  psql_banc <<'SQL' 2>&1 | grep -iE "deadlock|ERROR" | sed 's/^/  confirmation : /'
BEGIN;
WITH avant AS (
  SELECT quantite_physique FROM variante WHERE id = 'v1' FOR UPDATE
),
maj AS (
  UPDATE variante
  SET quantite_physique = GREATEST(0, quantite_physique - 1),
      quantite_reservee = GREATEST(0, quantite_reservee - 1)
  WHERE id = 'v1'
  RETURNING quantite_physique
)
SELECT (SELECT quantite_physique FROM avant) - (SELECT quantite_physique FROM maj);
SELECT pg_sleep(1.5);
DELETE FROM reservation WHERE commande_id = 'c1';
COMMIT;
SQL
}

# La LIBERATION, ordre FAUTIF : suppression d'abord, variante ensuite.
liberation_fautive() {
  psql_banc <<'SQL' 2>&1 | grep -iE "deadlock|ERROR" | sed 's/^/  liberation   : /'
BEGIN;
WITH echues AS (
  DELETE FROM reservation WHERE expire_a <= now()
  RETURNING id, variante_id, quantite
),
par_variante AS (
  SELECT variante_id, SUM(quantite)::int AS quantite FROM echues GROUP BY variante_id
),
rendu AS (
  UPDATE variante SET quantite_reservee = variante.quantite_reservee - par_variante.quantite
  FROM par_variante WHERE variante.id = par_variante.variante_id
  RETURNING variante.id
)
SELECT count(*) FROM echues;
COMMIT;
SQL
}

# La LIBERATION, ordre ACTUEL : verrou sur les variantes d'abord.
liberation_corrigee() {
  psql_banc <<'SQL' 2>&1 | grep -iE "deadlock|ERROR" | sed 's/^/  liberation   : /'
BEGIN;
WITH cibles AS (
  SELECT id, variante_id, quantite FROM reservation WHERE expire_a <= now()
),
verrous AS (
  SELECT v.id FROM variante v
  WHERE v.id IN (SELECT variante_id FROM cibles)
  ORDER BY v.id
  FOR UPDATE
),
echues AS (
  DELETE FROM reservation
  WHERE id IN (SELECT id FROM cibles) AND (SELECT count(*) FROM verrous) >= 0
  RETURNING id, variante_id, quantite
),
par_variante AS (
  SELECT variante_id, SUM(quantite)::int AS quantite FROM echues GROUP BY variante_id
),
rendu AS (
  UPDATE variante SET quantite_reservee = variante.quantite_reservee - par_variante.quantite
  FROM par_variante
  WHERE variante.id = par_variante.variante_id
    AND variante.quantite_reservee >= par_variante.quantite
  RETURNING variante.id
)
SELECT count(*) FROM echues;
COMMIT;
SQL
}

jouer() {
  local nom="$1" liberation="$2"
  preparer

  echo "--- $nom ---"
  confirmation &
  sleep 0.4
  "$liberation" &
  wait

  local etat
  etat=$(psql_banc -t -c "SELECT 'physique=' || quantite_physique || ' reservee=' || quantite_reservee FROM variante;" | tr -d ' ')
  echo "  etat final   : $etat"
  echo
}

echo "Interblocage liberation / confirmation, LS-120"
echo

jouer "ORDRE FAUTIF, suppression avant verrou de variante" liberation_fautive
jouer "ORDRE ACTUEL, verrou de variante avant suppression" liberation_corrigee

echo "Attendu :"
echo "  fautif  -> deadlock detected sur la CONFIRMATION, physique=1 (piece payee NON destockee)"
echo "  actuel  -> aucun interblocage, physique=0 (piece vendue correctement)"
