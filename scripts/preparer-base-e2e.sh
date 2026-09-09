#!/bin/bash
# Prepare la base de BOUT EN BOUT, LS-189.
#
# ---------------------------------------------------------------------------
# POURQUOI CETTE BASE EXISTE, ET POURQUOI ELLE N'EST PAS CELLE DU DEVELOPPEMENT
#
# La suite Playwright promeut son propre compte d'administration,
# `e2e-administration@exemple.test`, pour ouvrir une session sur les ecrans
# proteges. L'index partiel `utilisateur_administratrice_unique` n'admet QU'UNE
# ligne dont le role vaut ADMINISTRATRICE, regle E1.
#
# Sur la base de developpement, le compte REEL de l'exploitante occupe cette
# place unique. La preparation echouait donc avant tout test :
#
#   error: duplicate key value violates unique constraint
#          "utilisateur_administratrice_unique"
#
# et Playwright marquait la suite entiere « did not run ». Mesure du 5 septembre
# 2026 en livrant LS-180, reproduite le 8 septembre : echec en 189 ms.
#
# LA PARADE N'EST PAS UNE CLAUSE SQL PLUS LARGE. La retrogradation ecrite dans
# `tests/e2e/session-administration.setup.ts` ne vise que le prefixe `e2e-`, et
# cette etroitesse PROTEGE le compte reel : un `UPDATE` sans clause lui
# retirerait son role en silence sur un poste de developpement. Elargir la
# clause fermerait un defaut en ouvrant celui que le garde-fou existant empeche.
#
# L'ISOLEMENT PAR LA BASE FERME LES DEUX, et il le fait STRUCTURELLEMENT :
# aucune requete de la suite n'atteint la base qui porte le compte reel, quelle
# que soit la clause qu'un futur ticket ecrira. C'est le critere 2 de LS-189,
# tenu par construction plutot que par vigilance.
# ---------------------------------------------------------------------------
#
# CE SCRIPT NE POSE AUCUNE FIXTURE. Il pose le SCHEMA, rien d'autre : les
# comptes, produits et commandes de test sont amorces par les cinq fichiers
# `.setup.ts` du projet `preparation` de Playwright, qui en restent la seule
# source. Deux endroits qui amorcent divergent, ce depot en a fait l'experience.
#
# Usage :
#   ./scripts/preparer-base-e2e.sh                  # prepare, conserve les donnees
#   ./scripts/preparer-base-e2e.sh --reinitialiser  # repart d'une base vide
#
# `npm run test:e2e` l'appelle seul, il n'y a donc rien a lancer a la main dans
# le cas courant.
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE"

CONTENEUR=lune-soleil-db-e2e
SERVICE=db-e2e

REINITIALISER=0
if [ "${1:-}" = "--reinitialiser" ]; then
  REINITIALISER=1
elif [ -n "${1:-}" ]; then
  echo "Argument inconnu : $1"
  echo "Usage : $0 [--reinitialiser]"
  exit 2
fi

echec() {
  echo
  echo "ECHEC : $1"
  echo
  exit 1
}

command -v docker >/dev/null 2>&1 || echec "docker introuvable dans le PATH"
docker info >/dev/null 2>&1 || echec "le demon Docker ne repond pas, est-il demarre ?"

# LE FICHIER EST EXIGE EN LOCAL, PAS EN INTEGRATION CONTINUE, ou il n'existe
# jamais : le depot est public, invariant 9, et la chaine compose ses variables
# dans l'environnement. Exiger le fichier partout rendait ce script inutilisable
# en CI, donc la suite de bout en bout injouable, donc les huit parcours
# critiques rejoues par personne.
#
# LA DISTINCTION SE FAIT SUR LA PRESENCE DES VARIABLES et non sur un drapeau
# `CI`, qui se pose et s'oublie : ce qui compte est de savoir OU lire, pas dans
# quel decor on tourne.
if [ ! -f "$RACINE/.env" ] && [ -z "${DATABASE_URL_E2E:-}" ]; then
  echec "fichier .env absent, et DATABASE_URL_E2E absente de l'environnement.
       En local, creer .env a partir de .env.example, puis renseigner
       POSTGRES_PASSWORD, DATABASE_URL et DATABASE_URL_E2E.
       En integration continue, composer les deux URL dans l'environnement."
fi

# ---------------------------------------------------------------------------
# DATABASE_URL_E2E EST EXIGEE, ET ELLE EST COMPAREE A DATABASE_URL.
#
# C'EST LE GARDE-FOU CENTRAL DE CE SCRIPT. Les deux bases partageant leurs
# identifiants et leur nom, seul le PORT les distingue : une variable recopiee
# sans changer le port ferait tourner la suite sur la base de developpement, et
# le defaut de LS-189 reviendrait a l'identique sans que rien ne le signale.
#
# La lecture passe par node plutot que par un `grep` sur .env : les valeurs
# n'apparaissent ainsi dans aucun argument de commande, donc dans aucun `ps`.
#
# ---------------------------------------------------------------------------
# LA COMPARAISON PORTE SUR LE FICHIER `.env`, JAMAIS SUR L'ENVIRONNEMENT, et
# c'est une correction MESUREE, pas une precaution.
#
# Playwright appelle ce script depuis `webServer`, apres avoir pose
# `DATABASE_URL = DATABASE_URL_E2E` pour tout le processus. Lire
# `process.env.DATABASE_URL` compare alors la variable a ELLE-MEME : le verdict
# tombait sur « IDENTIQUES » et le script refusait de preparer, faisant echouer
# le demarrage entier du serveur. Mesure du 8 septembre 2026, premiere execution
# apres la bascule : « Process from config.webServer was not able to start ».
#
# LE REFUS ETAIT JUSTE DANS SON PRINCIPE ET FAUX DANS SON ANCRAGE. Ce qu'il faut
# comparer est ce que l'exploitant a ECRIT dans `.env`, la seule chose qu'une
# recopie sans changement de port peut rendre identique. `dotenv.parse` lit le
# fichier sans toucher a `process.env`, donc sans subir la surcharge.
#
# ---------------------------------------------------------------------------
# EN INTEGRATION CONTINUE IL N'Y A PAS DE `.env`, ET CE SCRIPT Y ECHOUAIT DONC
# TOUJOURS. Mesure du 9 septembre 2026 : le controle nocturne echouait depuis
# deux nuits sur « Process from config.webServer was not able to start », le
# script s'arretant sur « DATABASE_URL_E2E absente de .env » pour un fichier que
# la chaine ne cree jamais et n'aura jamais, invariant 9, le depot etant public.
#
# CE QUE CET ECHEC MASQUAIT EST PIRE QUE LUI. L'etape `npm audit` du nocturne
# vient APRES celle-ci : sautee, elle sortait `skipped` et non `failure`. Sept
# vulnerabilites sont entrees sans un mot, dont une CRITIQUE sur Next.js,
# atteignable en production. L'etape porte desormais `if: always()`.
#
# LE FICHIER RESTE LA SOURCE QUAND IL EXISTE, l'environnement prend le relais
# sinon. La garde ne se relache pas pour autant : les deux URL sont comparees
# dans les deux cas, et deux valeurs au meme port sont refusees de la meme
# facon. Ce qui disparait est la seule EXIGENCE d'un fichier, jamais le controle
# qu'il permettait.
#
# LE DEMARRAGE DU CONTENEUR PORTE LA MEME DOUBLE VOIE, plus bas : `docker
# compose` en local, `docker run` sans `.env`. Les deux vont ensemble, corriger
# l'une sans l'autre ne fait pas tourner la suite d'un pouce.
# ---------------------------------------------------------------------------
verdict=$(node -e '
const fs = require("node:fs");
const dotenv = require("dotenv");
const existe = fs.existsSync(".env");
const fichier = existe ? dotenv.parse(fs.readFileSync(".env")) : {};
// LA SOURCE REELLEMENT LUE EST ANNONCEE, jamais supposee : un message qui
// designe `.env` quand la valeur vient de l`environnement fait corriger au
// mauvais endroit. Motif deja rencontre sur ce depot, LS-138.
const source = existe && fichier.DATABASE_URL_E2E ? ".env" : "l`environnement";
// Le fichier prime quand il existe : lui seul peut porter une recopie sans
// changement de port. Sans lui, en CI, l environnement est la seule source.
const dev = fichier.DATABASE_URL ?? process.env.DATABASE_URL;
const e2e = fichier.DATABASE_URL_E2E ?? process.env.DATABASE_URL_E2E;
if (!e2e) { console.log("ABSENTE"); process.exit(0); }
if (!dev) { console.log("DEV_ABSENTE"); process.exit(0); }
if (dev === e2e) { console.log("IDENTIQUES " + source); process.exit(0); }
try {
  const a = new URL(dev), b = new URL(e2e);
  console.log(a.port === b.port && a.hostname === b.hostname ? "MEME_PORT " + source : "OK " + b.port);
} catch { console.log("MALFORMEE"); }
' 2>/dev/null) || echec "la lecture de l'environnement a echoue"

case "$verdict" in
  ABSENTE)
    echec "DATABASE_URL_E2E absente de .env ET de l'environnement.
       Elle doit pointer la base de bout en bout, port 55433 par defaut, la
       meme URL que DATABASE_URL au PORT pres. Voir .env.example, LS-189.
       En integration continue, la composer comme DATABASE_URL, au port pres." ;;
  DEV_ABSENTE)
    echec "DATABASE_URL absente de .env, la comparaison ne peut pas conclure." ;;
  IDENTIQUES*)
    echec "DATABASE_URL_E2E est IDENTIQUE a DATABASE_URL dans ${verdict#IDENTIQUES }.
       La suite tournerait sur la base de developpement et retrograderait des
       comptes reels. Changer le port, 55433 par defaut, LS-189." ;;
  MEME_PORT*)
    echec "DATABASE_URL_E2E designe, dans ${verdict#MEME_PORT }, le MEME hote et le MEME port
       que DATABASE_URL. Les deux bases seraient confondues, LS-189." ;;
  MALFORMEE)
    echec "DATABASE_URL_E2E n'est pas une URL analysable." ;;
esac
echo "== Environnement =="
echo "   DATABASE_URL_E2E distincte de DATABASE_URL, port ${verdict#OK }"

# ---------------------------------------------------------------------------
# Conteneur, DEUX VOIES SELON L'ENVIRONNEMENT.
#
# `docker compose` en local, `docker run` en integration continue, et ce n'est
# pas un confort : le fichier Compose interpole `${POSTGRES_USER:?}` et deux
# autres variables depuis `.env`, fichier que la chaine ne cree JAMAIS, le depot
# etant public, invariant 9. `docker compose config` y echoue donc avant meme de
# demarrer quoi que ce soit, mesure faite.
#
# CE QUE CE MANQUE A COUTE. Le controle nocturne echouait depuis le 8 septembre
# 2026 sur « Process from config.webServer was not able to start », donc les
# huit parcours critiques n'etaient rejoues par personne. Pire, l'etape
# `npm audit` qui SUIT sortait `skipped` et non `failure` : sept vulnerabilites
# sont entrees sans un mot, dont une RCE critique atteignable en production.
#
# LS-189 A ANNONCE CE CAS COUVERT ET IL NE L'ETAIT PAS. Son critere 4 raisonnait
# sur `controles.yml`, ou le controle 9x est purement TEXTUEL et ne lance jamais
# la suite. Seul le nocturne l'execute. Motif « un defaut absent n'est pas un
# defaut empeche », deja en fiche.
#
# LA CHAINE FAIT DEJA CE `docker run` POUR LA BASE 55432, etape « Demarrer la
# base de controle » du nocturne : cette branche en est la jumelle, au port et
# au nom pres.
# ---------------------------------------------------------------------------
if [ -f .env ]; then
  MODE_CONTENEUR=compose
else
  MODE_CONTENEUR=run
  echo "== Pas de .env, demarrage par docker run =="
fi

if [ "$REINITIALISER" -eq 1 ]; then
  echo "== Reinitialisation, suppression du volume de test =="
  # Ne touche QUE le service de test : `docker compose down -v` sans argument
  # detruirait aussi le volume de developpement et ses donnees reelles.
  if [ "$MODE_CONTENEUR" = compose ]; then
    docker compose rm -sfv "$SERVICE" >/dev/null 2>&1 || true
  else
    docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
  fi
  docker volume rm lune-soleil-pgdata-e2e >/dev/null 2>&1 || true
fi

echo "== Demarrage de PostgreSQL 18, base de test =="
if [ "$MODE_CONTENEUR" = compose ]; then
  # UN CONTENEUR NE PORTANT PAS LES ETIQUETTES COMPOSE BLOQUE `compose up`, le
  # nom etant deja pris. Le cas arrive des qu'on a joue le mode CI sur la meme
  # machine, et le message de Docker ne le dit pas : « n'a pas demarre » sans
  # plus. Rencontre a l'ecriture de cette correction.
  if [ -n "$(docker ps -aq -f "name=^${CONTENEUR}$")" ] &&
     [ -z "$(docker ps -aq -f "name=^${CONTENEUR}$" -f 'label=com.docker.compose.project')" ]; then
    echo "   conteneur hors Compose trouve sous le meme nom, il est retire"
    docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
  fi
  docker compose up -d "$SERVICE" >/dev/null 2>&1 || echec "le conteneur $CONTENEUR n'a pas demarre.
       Journaux : docker compose logs $SERVICE"
else
  # Le port vient de l'URL plutot que d'une constante : les deux ne peuvent pas
  # diverger, et un port change dans l'environnement est suivi sans retouche.
  PORT_E2E=$(node -e 'process.stdout.write(new URL(process.env.DATABASE_URL_E2E).port || "5432")')
  # Idempotent : une execution qui rejoue ne doit pas echouer sur un conteneur
  # deja la, ce qui arrive des qu'une etape amont est relancee.
  if [ -z "$(docker ps -q -f "name=^${CONTENEUR}$")" ]; then
    docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
    # LES IDENTIFIANTS VIENNENT DE L'ENVIRONNEMENT, jamais d'un argument en
    # clair : `-e VAR` sans valeur transmet celle du processus, invisible a
    # `ps`. Meme motif que la surcharge de DATABASE_URL plus bas.
    docker run -d --name "$CONTENEUR" \
      -e POSTGRES_USER \
      -e POSTGRES_PASSWORD \
      -e POSTGRES_DB \
      -e POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale=C.UTF-8" \
      -p "127.0.0.1:${PORT_E2E}:5432" \
      postgres:18.4 >/dev/null || echec "le conteneur $CONTENEUR n'a pas demarre"
  fi
fi

echo -n "   attente de la base"
sante=""
for _ in $(seq 1 60); do
  if [ "$MODE_CONTENEUR" = compose ]; then
    sante=$(docker inspect --format '{{.State.Health.Status}}' "$CONTENEUR" 2>/dev/null || echo absent)
  else
    # AUCUN `healthcheck` SUR UN `docker run` NU, donc l'etat de sante n'existe
    # pas : c'est la REQUETE qui fait foi, et elle vaut mieux qu'un `pg_isready`
    # qui repond avant que la base applicative n'existe. Meme motif que le
    # nocturne pour la base 55432.
    if docker exec "$CONTENEUR" psql -U "${POSTGRES_USER:-lunesoleil}" \
         -d "${POSTGRES_DB:-lunesoleil}" -c 'SELECT 1' >/dev/null 2>&1; then
      sante=healthy
    else
      sante=absent
    fi
  fi
  [ "$sante" = "healthy" ] && break
  echo -n "."
  sleep 2
done
echo
[ "$sante" = "healthy" ] || echec "la base de test n'est pas saine apres 120 secondes (etat : $sante).
       Journaux : docker logs $CONTENEUR"
echo "   sain"

# ---------------------------------------------------------------------------
# Migration
#
# `migrate deploy` et NON `db push` : la base de test doit valoir exactement ce
# que les migrations produisent, contraintes CHECK et unicite differable
# comprises. `db push` derive du schema Prisma et laisserait de cote le SQL que
# Prisma ne sait pas exprimer, ADR-006 et ADR-026. Motif deja en fiche sur ce
# depot.
#
# DATABASE_URL EST SURCHARGEE POUR CETTE COMMANDE SEULEMENT, par
# l'environnement du processus et non par un argument : une URL en argument
# porterait le mot de passe dans la ligne de commande, lisible par tout `ps`.
# ---------------------------------------------------------------------------
echo "== Migration Prisma sur la base de test =="
node -e '
const fs = require("node:fs");
const dotenv = require("dotenv");
// MEME SOURCE QUE LA COMPARAISON CI-DESSUS, le fichier quand il existe et non
// l`environnement : Playwright a pu surcharger DATABASE_URL avant d`appeler ce
// script. Sans fichier, en integration continue, l`environnement est la seule
// source et il n`a subi aucune surcharge, ce script y etant appele avant
// Playwright.
const fichier = fs.existsSync(".env") ? dotenv.parse(fs.readFileSync(".env")) : {};
process.env.DATABASE_URL = fichier.DATABASE_URL_E2E ?? process.env.DATABASE_URL_E2E;
const { spawnSync } = require("node:child_process");
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: process.env });
process.exit(r.status === null ? 1 : r.status);
' || echec "l'application des migrations a echoue sur la base de test"

# ---------------------------------------------------------------------------
# Etat final, mesure et non suppose.
#
# Les comptes attendus sont CALCULES depuis les fichiers de reference, jamais
# figes : un nombre ecrit ici deviendrait faux a la premiere contrainte
# ajoutee, et ce depot en a deja fait l'experience.
# ---------------------------------------------------------------------------
interroger() {
  docker exec -i "$CONTENEUR" psql -U "${POSTGRES_USER:-lunesoleil}" -d "${POSTGRES_DB:-lunesoleil}" -tAq -c "$1" | tr -d '[:space:]'
}

tables=$(interroger "SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations';")
checks=$(interroger "SELECT count(*) FROM pg_constraint
    WHERE contype = 'c' AND connamespace = 'public'::regnamespace
      AND conname LIKE 'chk_%';")
checks_attendus=$(grep -c "ADD CONSTRAINT" "$RACINE/prisma/sql-manuel/001_contraintes_check.sql")

# L'INDEX QUI MOTIVE CETTE BASE EST VERIFIE NOMMEMENT. Sans lui, la suite
# passerait sur une base ou DEUX administratrices coexistent : elle ne dirait
# alors plus rien de la regle E1 servie en production, et le defaut d'origine
# serait remplace par un test aveugle.
index_e1=$(interroger "SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'utilisateur_administratrice_unique';")

echo
echo "-----------------------------------------"
echo "  Base de bout en bout prete"
echo "    tables            : $tables"
echo "    contraintes CHECK : $checks sur $checks_attendus attendues"
echo "    index E1 present  : $index_e1"
echo "-----------------------------------------"
echo

[ "$checks" = "$checks_attendus" ] || echec "la migration n'a pose que $checks contraintes CHECK sur $checks_attendus."
[ "$index_e1" = "1" ] || echec "l'index utilisateur_administratrice_unique est absent de la base de test.
       La regle E1 ne serait plus exercee par la suite, LS-189."
