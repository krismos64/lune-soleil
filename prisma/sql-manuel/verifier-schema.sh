#!/bin/bash
# Vérification du modèle logique sur PostgreSQL réel, LS-13.
#
# Rejoue sur le schéma complet ce que le prototype d'ADR-006 vérifiait sur deux
# tables isolées, et couvre en plus les contraintes nées de LS-37 à LS-41 :
# variante archivée, unicité de l'administratrice, idempotence à quatre clés.
#
# Usage : ./prisma/sql-manuel/verifier-schema.sh [--base-migree]
# Prérequis : Docker lancé, et le SQL de migration présent dans le dossier.
#
# DEUX MODES, ajoutés par LS-66.
#
# Sans argument, mode « conception » : un conteneur jetable est créé, le SQL de
# ce dossier y est appliqué, le conteneur est supprimé à la fin. C'est le mode
# historique de LS-13, qui vérifie que le SQL de RÉFÉRENCE dit ce qu'on croit.
#
# Avec --base-migree, mode « réalité » : les contrôles s'exécutent sur la base
# locale de docker-compose.yml, celle qu'a produite `prisma migrate dev`. Aucun
# fichier de ce dossier n'y est appliqué, la base est prise telle quelle.
#
# Les deux modes sont nécessaires et ne se remplacent pas. Le premier valide
# l'intention, le second valide ce que Prisma a réellement créé. Une divergence
# entre schema.prisma et schema.sql n'est visible QUE par le second : le premier
# passerait au vert sur un SQL de référence juste et une migration fausse.
#
# En mode --base-migree le jeu d'essai est inséré dans la base de travail puis
# retiré à la fin. Le script refuse de s'exécuter si la base n'est pas vide, une
# base de développement pouvant contenir des données que ces contrôles
# détruiraient.

set -u
CT=ls13-verif
PORT=55414
DIR="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(cd "$DIR/../.." && pwd)"
ok=0
ko=0

# Mode d'exécution, voir l'entête.
MODE=jetable
if [ "${1:-}" = "--base-migree" ]; then
  MODE=migree
elif [ -n "${1:-}" ]; then
  echo "Argument inconnu : $1"
  echo "Usage : $0 [--base-migree]"
  exit 2
fi

# Conteneur et rôle visés, selon le mode.
if [ "$MODE" = "migree" ]; then
  CIBLE_CT=lune-soleil-db
  CIBLE_USER=lunesoleil
else
  CIBLE_CT="$CT"
  CIBLE_USER=postgres
fi

nettoyer() {
  # Ne jamais supprimer la base de développement. Le conteneur jetable est le
  # seul que ce script ait le droit de détruire.
  if [ "$MODE" = "jetable" ]; then
    docker rm -f "$CT" >/dev/null 2>&1 || true
  else
    vider_base_migree
  fi
}
trap nettoyer EXIT

R() { docker exec -i "$CIBLE_CT" psql -U "$CIBLE_USER" -d lunesoleil -tAq -c "$1" 2>&1; }

# Retire le jeu d'essai de la base de développement, en mode --base-migree.
#
# TRUNCATE de toutes les tables applicatives plutôt qu'un DELETE ciblé : les
# contrôles insèrent au fil de l'eau, et une liste écrite à la main se
# désynchroniserait du script à la première contrainte ajoutée. La table
# d'historique de Prisma est exclue, l'effacer ferait croire à une base non
# migrée.
vider_base_migree() {
  local tables
  tables=$(docker exec -i "$CIBLE_CT" psql -U "$CIBLE_USER" -d lunesoleil -tAq -c \
    "SELECT string_agg(format('%I', tablename), ', ')
       FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';" 2>/dev/null)
  [ -n "$tables" ] && docker exec -i "$CIBLE_CT" psql -U "$CIBLE_USER" -d lunesoleil -q -c \
    "TRUNCATE $tables RESTART IDENTITY CASCADE;" >/dev/null 2>&1
  return 0
}

verifier() {
  local nom="$1" attendu="$2" obtenu="$3"
  if [ "$attendu" = "$obtenu" ]; then
    echo "  OK    $nom"
    ok=$((ok+1))
  else
    echo "  ECHEC $nom : attendu [$attendu], obtenu [$obtenu]"
    ko=$((ko+1))
  fi
}

# Vérifie qu'une écriture est rejetée PAR LA BONNE CONTRAINTE.
#
# Le nom de contrainte est obligatoire, et ce n'est pas une précaution de style.
# Une version antérieure de ce script se contentait de chercher « violates » :
# le contrôle « second avis rejeté » validait en réalité une violation de clé
# étrangère, et serait passé à l'identique si l'index unique avait été absent du
# schéma. Un test qui passe pour la mauvaise raison est pire qu'un test absent.
verifier_rejet() {
  local nom="$1" contrainte="$2" sortie="$3"
  if echo "$sortie" | grep -q "$contrainte"; then
    echo "  OK    $nom"
    ok=$((ok+1))
  elif echo "$sortie" | grep -qi "violates\|violation"; then
    echo "  ECHEC $nom : rejeté, mais par une autre contrainte que [$contrainte]"
    echo "        $(echo "$sortie" | grep -i 'violates\|violation' | head -1)"
    ko=$((ko+1))
  else
    echo "  ECHEC $nom : la base a accepté l'écriture"
    ko=$((ko+1))
  fi
}

# Vérifie qu'une écriture est ACCEPTÉE. Symétrique de verifier_rejet.
#
# Motif de son existence, trouvé en seconde revue de LS-13 : les contrôles
# d'acceptation s'écrivaient `verifier "..." "" "$(grep -i violation)"`. Or
# PostgreSQL écrit toujours « violates », jamais « violation ». Le grep
# retournait donc une chaîne vide quelle que soit la réponse de la base, et la
# comparaison était vraie par construction.
#
# Sept contrôles ne testaient rien, dont celui qui devait détecter la régression
# de LS-12 sur le panier multi-articles. Une mutation du schéma réintroduisant
# le défaut laissait le contrôle afficher OK.
#
# Le motif ^ERROR: compte autant que violates : une erreur de syntaxe ou une
# colonne inexistante passerait sinon inaperçue.
verifier_accepte() {
  local nom="$1" sortie="$2"
  if echo "$sortie" | grep -qi "^ERROR:\|violates\|violation"; then
    echo "  ECHEC $nom : la base a rejeté l'écriture"
    echo "        $(echo "$sortie" | grep -i '^ERROR:' | head -1)"
    ko=$((ko+1))
  else
    echo "  OK    $nom"
    ok=$((ok+1))
  fi
}

# Sans base, aucun contrôle n'a de sens. Chaque étape de préparation est donc
# fatale, LS-48.
#
# Motif. Le script s'exécutait jusqu'au bout même avec Docker absent, et
# affichait « 7 réussites, 41 échecs ». Les sept étaient des contrôles
# d'acceptation : `verifier_accepte` cherche une erreur SQL dans la sortie, et
# `docker: command not found` n'en est pas une, donc l'écriture était réputée
# acceptée. Même mécanisme que le `grep violation` de LS-13, par un autre chemin.
#
# Un contrôle qui annonce OK sans avoir rien vérifié est le défaut que ce script
# existe pour empêcher.
abandon() {
  echo
  echo "ABANDON : $1"
  echo
  echo "Aucun contrôle n'a été exécuté. Ce script exige une base réelle :"
  echo "sans elle, un contrôle d'acceptation passerait au vert sans rien"
  echo "vérifier."
  exit 2
}

command -v docker >/dev/null 2>&1 || abandon "docker introuvable dans le PATH"
docker info >/dev/null 2>&1 || abandon "le démon Docker ne répond pas, est-il démarré ?"

if [ "$MODE" = "migree" ]; then
  # ---------------------------------------------------------------------------
  # Mode réalité : la base de docker-compose.yml, telle que la migration l'a
  # laissée. Rien n'est appliqué ici, c'est tout l'intérêt du mode.
  # ---------------------------------------------------------------------------
  echo "Mode --base-migree : contrôles sur la base issue de prisma migrate"

  docker inspect "$CIBLE_CT" >/dev/null 2>&1 \
    || abandon "conteneur $CIBLE_CT absent, lancer d'abord : docker compose up -d db"
  [ "$(docker inspect --format '{{.State.Running}}' "$CIBLE_CT" 2>/dev/null)" = "true" ] \
    || abandon "conteneur $CIBLE_CT arrêté, lancer : docker compose up -d db"
  docker exec "$CIBLE_CT" pg_isready -U "$CIBLE_USER" -d lunesoleil >/dev/null 2>&1 \
    || abandon "la base $CIBLE_CT ne répond pas"

  # La base doit être migrée, sinon les contrôles porteraient sur des tables
  # absentes et `verifier_rejet` prendrait un « relation does not exist » pour
  # un rejet légitime. Le compte vient de la table d'historique de Prisma.
  migrations=$(docker exec -i "$CIBLE_CT" psql -U "$CIBLE_USER" -d lunesoleil -tAq -c \
    "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" 2>/dev/null)
  case "$migrations" in
    ''|*[!0-9]*) abandon "table _prisma_migrations illisible, la base n'est pas gérée par Prisma Migrate" ;;
  esac
  [ "$migrations" -ge 1 ] || abandon "aucune migration appliquée, lancer : npx prisma migrate dev"

  # Les CHECK ne viennent pas de Prisma. Sans eux la moitié des contrôles
  # échouerait pour une raison qui n'est pas un défaut du schéma.
  checks=$(docker exec -i "$CIBLE_CT" psql -U "$CIBLE_USER" -d lunesoleil -tAq -c \
    "SELECT count(*) FROM pg_constraint
      WHERE contype = 'c' AND connamespace = 'public'::regnamespace
        AND conname LIKE 'chk_%';" 2>/dev/null)
  case "$checks" in
    ''|*[!0-9]*) abandon "impossible de compter les contraintes CHECK" ;;
  esac
  [ "$checks" -ge 1 ] || abandon "aucune contrainte CHECK en base, appliquer le SQL de $DIR (npm run db:preparer)"

  # Base non vide : refus. Ces contrôles insèrent puis tronquent, ils
  # détruiraient un jeu de données de développement.
  lignes=$(docker exec -i "$CIBLE_CT" psql -U "$CIBLE_USER" -d lunesoleil -tAq -c \
    "SELECT coalesce(sum(n_live_tup), 0) FROM pg_stat_user_tables
      WHERE relname <> '_prisma_migrations';" 2>/dev/null)
  case "$lignes" in
    ''|*[!0-9]*) lignes=0 ;;
  esac
  if [ "$lignes" -gt 0 ]; then
    abandon "la base contient $lignes lignes. Ces contrôles la videraient.
        Repartir d'une base neuve : npm run db:reinitialiser"
  fi

  # Un reste d'exécution interrompue fausserait le premier contrôle d'unicité.
  vider_base_migree

else
  # ---------------------------------------------------------------------------
  # Mode conception : conteneur jetable, SQL de référence de ce dossier.
  # ---------------------------------------------------------------------------
  for f in "$DIR/schema.sql" "$DIR/001_contraintes_check.sql" "$DIR/002_contraintes_unicite.sql"; do
    [ -r "$f" ] || abandon "fichier SQL illisible : $f"
  done

  echo "Démarrage de PostgreSQL 18.4"
  # Mot de passe engendré à chaque exécution plutôt qu'écrit en dur.
  #
  # Ce conteneur est jetable, lié à la boucle locale et détruit à la sortie : la
  # valeur ne protège rien. Elle est engendrée quand même parce qu'un littéral
  # ressemblant à un mot de passe dans un dépôt public déclenche l'analyse de
  # secrets à chaque modification du fichier. LS-66 en a fait l'expérience, le
  # simple déplacement de ce script a fait remonter une alerte sur une ligne
  # inchangée depuis LS-13.
  #
  # Un faux positif permanent est nuisible : il apprend à ignorer l'alerte, et
  # c'est le vrai secret suivant qui passe.
  MDP_JETABLE="$(openssl rand -hex 16)"
  docker run -d --rm --name "$CT" \
    -e POSTGRES_PASSWORD="$MDP_JETABLE" -e POSTGRES_DB=lunesoleil \
    -p "$PORT:5432" postgres:18.4 >/dev/null 2>&1 \
    || abandon "le conteneur PostgreSQL n'a pas démarré, port $PORT déjà pris ?"

  pret=0
  for _ in $(seq 1 30); do
    if docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1; then pret=1; break; fi
    sleep 2
  done
  [ "$pret" -eq 1 ] || abandon "PostgreSQL n'est pas prêt après 60 secondes"

  echo "Application du schéma"

  # LA SORTIE D'ERREUR DE POSTGRESQL EST CONSERVEE ET REAFFICHEE EN CAS D'ECHEC.
  #
  # Elle partait vers /dev/null avec `2>&1`, ce qui rendait le message
  # « ABANDON : l'application de schema.sql a échoué » sans aucune cause. Le
  # 14 août 2026, une panne transitoire de la CI a produit exactement ce message,
  # et le diagnostic s'est fait à l'aveugle : impossible de distinguer un
  # PostgreSQL pas encore prêt d'une vraie erreur de syntaxe.
  #
  # La sortie normale reste silencieuse, `-q` et la redirection : ce sont
  # plusieurs centaines de lignes de `CREATE TABLE` dont personne n'a besoin.
  appliquer() {
    local fichier="$1" journal
    journal=$(mktemp)

    if ! docker exec -i "$CT" psql -U postgres -d lunesoleil -q -v ON_ERROR_STOP=1 \
      < "$DIR/$fichier" >/dev/null 2>"$journal"; then
      echo
      echo "Sortie de PostgreSQL :"
      sed 's/^/  /' "$journal"
      rm -f "$journal"
      abandon "l'application de $fichier a échoué"
    fi

    rm -f "$journal"
  }

  appliquer "schema.sql"
  appliquer "001_contraintes_check.sql"
  appliquer "002_contraintes_unicite.sql"
fi

# Jeu d'essai minimal : une pièce unique, le cas qui porte le jalon du projet.
R "INSERT INTO categorie (id,nom,slug,ordre,cree_a) VALUES ('cat','Boucles','boucles',1,now());
   INSERT INTO produit (id,categorie_id,nom,slug,statut,cree_a,modifie_a)
     VALUES ('prod','cat','Eclipse','eclipse','ACTIF',now(),now());
   INSERT INTO variante (id,produit_id,reference,libelle,prix_centimes,quantite_physique,quantite_reservee,vente_web_activee,cree_a)
     VALUES ('var','prod','LS-ECLIPSE-01','unique',1200,1,0,true,now());" >/dev/null

# ADR-024, LS-53 : une réservation porte toujours sa commande. La commande est
# donc créée avant, comme dans la transaction réelle du parcours 1.
R "INSERT INTO commande (id,numero,statut,email_normalise,nom_client,adresse_livraison,adresse_facturation,
     sous_total_centimes,mode_livraison,point_relais_id,frais_port_centimes,total_centimes,montant_taxe_centimes,cgv_acceptees_a,cgv_version,cree_a)
   VALUES ('cmdres','C-2026-0900','EN_ATTENTE_PAIEMENT','r@x.fr','Client','{}','{}',1200,'POINT_RELAIS','MR-64000-01',410,1610,0,now(),'v1',now());" >/dev/null

reset_stock() {
  R "DELETE FROM reservation;
     UPDATE variante SET quantite_physique=1, quantite_reservee=0,
       vente_web_activee=true, archivee_a=NULL WHERE id='var';" >/dev/null
}

# La réservation atomique telle que .claude/rules/database.md la définit,
# avec la condition archivee_a ajoutée par LS-37 et la commande obligatoire
# d'ADR-024.
reserver() {
  R "WITH reserve AS (
       UPDATE variante SET quantite_reservee = quantite_reservee + 1
       WHERE reference = 'LS-ECLIPSE-01'
         AND vente_web_activee = true
         AND archivee_a IS NULL
         AND quantite_physique - quantite_reservee >= 1
       RETURNING id
     )
     INSERT INTO reservation (id, variante_id, commande_id, quantite, expire_a, cree_a)
     SELECT gen_random_uuid()::text, id, 'cmdres', 1, now() + interval '30 minutes', now() FROM reserve
     RETURNING variante_id;"
}

echo
echo "Réservation de stock, ADR-006"

reset_stock
r1=$(reserver)
verifier "une réservation sur une pièce unique réussit" "var" "$r1"

r2=$(reserver)
verifier "la seconde réservation ne trouve plus de stock" "" "$r2"

reset_stock
R "UPDATE variante SET vente_web_activee=false WHERE id='var';" >/dev/null
r3=$(reserver)
verifier "vente web suspendue, aucune réservation" "" "$r3"

# Le cas né de LS-37 : archiver rend la pièce non réservable. Le prototype
# d'ADR-006 est antérieur et ne le couvre pas.
reset_stock
R "UPDATE variante SET archivee_a=now() WHERE id='var';" >/dev/null
r4=$(reserver)
verifier "variante archivée, aucune réservation, C15" "" "$r4"

reset_stock
sortie=$(R "UPDATE variante SET quantite_reservee = 5 WHERE id='var';")
verifier_rejet "la survente est rejetée par le CHECK, C6" "chk_variante_pas_de_survente" "$sortie"

# ADR-024. Une réservation orpheline n'est pas seulement interdite par le code,
# elle est impossible en base. Sans ce contrôle, retirer le NOT NULL du schéma
# passerait inaperçu et rouvrirait le trou : une panne entre réservation et
# commande bloquerait la pièce trente minutes.
reset_stock
sortie=$(R "INSERT INTO reservation (id, variante_id, commande_id, quantite, expire_a, cree_a)
            VALUES ('resorph','var',NULL,1,now() + interval '30 minutes',now());")
verifier_rejet "réservation sans commande rejetée, ADR-024" "commande_id" "$sortie"

# La contrepartie du champ obligatoire : la commande ne peut pas disparaître
# sous une réservation active. C'est ce que porte le passage en RESTRICT.
reset_stock
reserver >/dev/null
sortie=$(R "DELETE FROM commande WHERE id='cmdres';")
verifier_rejet "commande portant une réservation non supprimable, ADR-024" "reservation_commande_id_fkey" "$sortie"

echo
echo "Mode de livraison, ADR-025"

# Les deux CHECK d'ADR-025 sont arrivés au SQL de contraintes sans qu'aucun
# contrôle ne les exerce. Les quatre cas ci-dessous couvrent l'équivalence dans
# les deux sens, sur les deux entités qui la portent.
#
# Le cas dangereux en premier : DOMICILE avec un point de retrait. L'étiquette
# partirait vers un relais alors que le client a payé pour être livré chez lui.
sortie=$(R "INSERT INTO commande (id,numero,statut,email_normalise,nom_client,adresse_livraison,adresse_facturation,
     sous_total_centimes,mode_livraison,point_relais_id,frais_port_centimes,total_centimes,montant_taxe_centimes,cgv_acceptees_a,cgv_version,cree_a)
   VALUES ('cmdko1','C-2026-0901','EN_ATTENTE_PAIEMENT','d@x.fr','Client','{}','{}',1200,'DOMICILE','MR-64000-01',499,1699,0,now(),'v1',now());")
verifier_rejet "commande DOMICILE avec point de retrait rejetée" "chk_commande_mode_point_relais" "$sortie"

# Le cas inverse : POINT_RELAIS sans identifiant produit une expédition
# impossible à créer, le transporteur exigeant la destination.
sortie=$(R "INSERT INTO commande (id,numero,statut,email_normalise,nom_client,adresse_livraison,adresse_facturation,
     sous_total_centimes,mode_livraison,point_relais_id,frais_port_centimes,total_centimes,montant_taxe_centimes,cgv_acceptees_a,cgv_version,cree_a)
   VALUES ('cmdko2','C-2026-0902','EN_ATTENTE_PAIEMENT','d@x.fr','Client','{}','{}',1200,'POINT_RELAIS',NULL,410,1610,0,now(),'v1',now());")
verifier_rejet "commande POINT_RELAIS sans point de retrait rejetée" "chk_commande_mode_point_relais" "$sortie"

sortie=$(R "INSERT INTO commande (id,numero,statut,email_normalise,nom_client,adresse_livraison,adresse_facturation,
     sous_total_centimes,mode_livraison,point_relais_id,frais_port_centimes,total_centimes,montant_taxe_centimes,cgv_acceptees_a,cgv_version,cree_a)
   VALUES ('cmddom','C-2026-0903','EN_ATTENTE_PAIEMENT','d@x.fr','Client','{}','{}',1200,'DOMICILE',NULL,499,1699,0,now(),'v1',now());")
verifier_accepte "commande DOMICILE sans point de retrait acceptée" "$sortie"

# Sur l'expédition, le mode exécuté peut différer de celui de la commande, un
# échec à domicile étant rebasculé vers un relais. La cohérence interne reste
# exigée : la bascule doit porter l'identifiant du relais de repli.
sortie=$(R "INSERT INTO expedition (id,commande_id,transporteur,mode,point_relais_id,cree_a)
   VALUES ('exko','cmdres','Mondial Relay','POINT_RELAIS',NULL,now());")
verifier_rejet "expédition POINT_RELAIS sans point de retrait rejetée" "chk_expedition_mode_point_relais" "$sortie"

sortie=$(R "INSERT INTO expedition (id,commande_id,transporteur,mode,point_relais_id,cree_a)
   VALUES ('exok','cmdres','Mondial Relay','POINT_RELAIS','MR-64000-02',now());")
verifier_accepte "expédition rebasculée vers un relais acceptée, ADR-025" "$sortie"

echo
echo "Montant d'une vente externe, LS-63"

# Le défaut que ces contrôles existent pour empêcher : une vente de marché
# enregistrée sans montant. Le chiffre d'affaires des marchés devient alors
# incalculable, et il ne se reconstitue pas après coup, le prix du catalogue
# ayant pu changer et une remise de stand n'y figurant jamais.
sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,canal,prix_unitaire_fige_centimes,origine,cree_a)
   VALUES ('mvko1','var','VENTE_EXTERNE',-1,'marche de Bayonne',NULL,'ADMIN',now());")
verifier_rejet "vente externe sans montant rejetée, S12" "chk_mouvement_vente_externe_prix" "$sortie"

sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,canal,prix_unitaire_fige_centimes,origine,cree_a)
   VALUES ('mvok1','var','VENTE_EXTERNE',-1,'marche de Bayonne',1100,'ADMIN',now());")
verifier_accepte "vente externe avec montant acceptée, S12" "$sortie"

# Le prix pratiqué diffère du catalogue, c'est le cas d'usage central : une remise
# consentie sur un stand. Si ce contrôle échouait, le modèle imposerait le prix du
# catalogue et le champ figé ne servirait à rien.
remise=$(R "SELECT prix_unitaire_fige_centimes FROM mouvement_stock WHERE id='mvok1';")
catalogue=$(R "SELECT prix_centimes FROM variante WHERE id='var';")
verifier "le prix figé est indépendant du catalogue ($catalogue)" "1100" "$remise"

# Un prix négatif fausserait toute somme sans qu'aucun contrôle ne le voie. Le
# signe de l'opération est porté par la quantité, jamais par le prix.
sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,canal,prix_unitaire_fige_centimes,origine,cree_a)
   VALUES ('mvko2','var','VENTE_EXTERNE',-1,'marche',-500,'ADMIN',now());")
verifier_rejet "prix de vente externe négatif rejeté" "chk_mouvement_prix_positif" "$sortie"

# Une pièce offerte sur un stand est un cas réel, son mouvement existe et son
# prix vaut zéro. Borner à « strictement positif » l'aurait rendu inenregistrable.
sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,canal,prix_unitaire_fige_centimes,origine,cree_a)
   VALUES ('mvok2','var','VENTE_EXTERNE',-1,'offert',0,'ADMIN',now());")
verifier_accepte "pièce offerte à prix nul acceptée" "$sortie"

# L'autre sens de l'implication, et c'est le contrôle qui distingue cette
# contrainte des deux équivalences d'ADR-025.
#
# Une ENTREE de réassort n'encaisse rien : lui imposer un montant obligerait à
# écrire un zéro qui mentirait, un réassort gratuit et un achat de matière
# devenant indiscernables.
sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,motif,prix_unitaire_fige_centimes,origine,cree_a)
   VALUES ('mvok3','var','ENTREE',3,'reassort',NULL,'ADMIN',now());")
verifier_accepte "entrée de stock sans montant acceptée" "$sortie"

# Le mouvement compensateur de la règle S14, qui corrige une vente externe
# saisie à tort. Il porte le même prix figé pour que les sommes retombent justes.
#
# Ce contrôle est la raison pour laquelle la contrainte est une implication et non
# une équivalence : écrite en équivalence sur le modèle d'ADR-025, elle rejetterait
# cette écriture et rendrait toute correction impossible.
sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,motif,prix_unitaire_fige_centimes,origine,cree_a)
   VALUES ('mvok4','var','AJUSTEMENT',1,'correction de saisie du marche de Bayonne',1100,'ADMIN',now());")
verifier_accepte "mouvement compensateur avec prix accepté, S14" "$sortie"

# Le chiffre d'affaires des marchés, calculé comme STATISTIQUES.md le définit :
# somme de quantite * prix figé, en centimes entiers, sans lire le catalogue.
#
# Le jeu en place porte une vente à 1100, une pièce offerte à 0, et une
# correction de +1 à 1100 qui annule la première. Attendu : 0 centime, ce qui
# vérifie que le compensateur neutralise bien la vente qu'il corrige.
ca=$(R "SELECT COALESCE(SUM(-quantite * prix_unitaire_fige_centimes), 0)
        FROM mouvement_stock
        WHERE prix_unitaire_fige_centimes IS NOT NULL;")
verifier "chiffre d'affaires marché, vente annulée par sa correction" "0" "$ca"

R "DELETE FROM mouvement_stock WHERE id IN ('mvok1','mvok2','mvok3','mvok4');" >/dev/null

echo
echo "Concurrence, deux acheteurs sur la dernière pièce"

reset_stock
for _ in 1 2 3 4 5; do reserver >/dev/null & done
wait
total=$(R "SELECT count(*) FROM reservation;")
verifier "cinq tentatives simultanées, une seule réservation" "1" "$total"

reservee=$(R "SELECT quantite_reservee FROM variante WHERE id='var';")
verifier "la quantité réservée reste à un" "1" "$reservee"

echo
echo "Idempotence, décision D et quatre clés"

R "INSERT INTO commande (id,numero,statut,email_normalise,nom_client,adresse_livraison,adresse_facturation,
     sous_total_centimes,mode_livraison,point_relais_id,frais_port_centimes,total_centimes,montant_taxe_centimes,cgv_acceptees_a,cgv_version,cree_a)
   VALUES ('cmd','C-2026-0001','CONFIRMEE','a@x.fr','Client','{}','{}',1200,'POINT_RELAIS','MR-64000-01',410,1610,0,now(),'v1',now());" >/dev/null

# LS-76 : un paiement dans un état d'encaissement porte sa date de confirmation,
# `chk_paiement_confirmation_coherente` l'exige. Sans elle dans ces jeux d'essai,
# le rejet viendrait de cette contrainte et non de l'index d'idempotence, et les
# contrôles V14 passeraient pour la mauvaise raison. C'est exactement ce que
# `verifier_rejet` est conçu pour attraper, et il l'a attrapé.
R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,confirme_a,cree_a)
   VALUES ('pay1','cmd','REUSSI',1610,0,now(),now());" >/dev/null
sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,confirme_a,cree_a)
   VALUES ('pay2','cmd','REUSSI',1610,0,now(),now());")
verifier_rejet "second paiement réussi rejeté, V14" "paiement_reussi_unique" "$sortie"

sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,cree_a)
   VALUES ('pay3','cmd','ECHOUE',1610,0,now());")
verifier_accepte "un paiement échoué reste possible, décision B" "$sortie"

# LS-45. Le contrôle ci-dessus ne teste que l'insertion frontale d'un second
# REUSSI. Il restait vert alors que V14 était contournable en deux temps :
# faire sortir le paiement encaissé du filtre partiel, puis insérer.
#
# La séquence n'a rien d'exotique, c'est le parcours 3 de PARCOURS.md, un
# remboursement partiel. Sur le prédicat d'origine `WHERE statut = 'REUSSI'`,
# elle produisait 3220 centimes encaissés sur une commande de 1610.
R "UPDATE paiement SET statut='PARTIELLEMENT_REMBOURSE', montant_rembourse_centimes=500
   WHERE id='pay1';" >/dev/null
sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,confirme_a,cree_a)
   VALUES ('pay4','cmd','REUSSI',1610,0,now(),now());")
verifier_rejet "second REUSSI après remboursement partiel rejeté, V14" "paiement_reussi_unique" "$sortie"

# Symétrique : un paiement entièrement remboursé ne rouvre pas la commande non
# plus. Rembourser n'efface pas l'encaissement, il le compense.
R "UPDATE paiement SET statut='REMBOURSE', montant_rembourse_centimes=1610
   WHERE id='pay1';" >/dev/null
sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,confirme_a,cree_a)
   VALUES ('pay5','cmd','REUSSI',1610,0,now(),now());")
verifier_rejet "second REUSSI après remboursement total rejeté, V14" "paiement_reussi_unique" "$sortie"

R "UPDATE paiement SET statut='REUSSI', montant_rembourse_centimes=0 WHERE id='pay1';" >/dev/null

# Cohérence entre le statut de traitement et son horodatage, LS-45.
R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,cree_a)
   VALUES ('payev','cmd','ECHOUE',1610,0,now());" >/dev/null
sortie=$(R "INSERT INTO evenement_fournisseur (id,paiement_id,identifiant_fournisseur,type,charge,statut_traitement,traite_a,cree_a)
   VALUES ('ev1','payev','evt_1','paiement','{}','TRAITE',NULL,now());")
verifier_rejet "événement TRAITE sans horodatage rejeté" "chk_evenement_traitement_coherent" "$sortie"

sortie=$(R "INSERT INTO evenement_fournisseur (id,paiement_id,identifiant_fournisseur,type,charge,statut_traitement,traite_a,cree_a)
   VALUES ('ev2','payev','evt_2','paiement','{}','RECU',now(),now());")
verifier_rejet "événement RECU avec horodatage rejeté" "chk_evenement_traitement_coherent" "$sortie"

sortie=$(R "INSERT INTO evenement_fournisseur (id,paiement_id,identifiant_fournisseur,type,charge,statut_traitement,traite_a,cree_a)
   VALUES ('ev3','payev','evt_3','paiement','{}','RECU',NULL,now());")
verifier_accepte "événement reçu non traité accepté" "$sortie"

R "INSERT INTO mouvement_stock (id,variante_id,commande_id,type,quantite,origine,cree_a)
   VALUES ('mv1','var','cmd','VENTE_WEB',-1,'SYSTEME',now());" >/dev/null
sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,commande_id,type,quantite,origine,cree_a)
   VALUES ('mv2','var','cmd','VENTE_WEB',-1,'SYSTEME',now());")
verifier_rejet "double décrément rejeté, webhook et réconciliation" "mouvement_vente_web_unique" "$sortie"

# Le cas qui avait été cassé en LS-12 : un panier à deux articles produit deux
# mouvements. Une clé sur la commande seule les aurait interdits.
R "INSERT INTO variante (id,produit_id,reference,libelle,prix_centimes,quantite_physique,quantite_reservee,vente_web_activee,cree_a)
   VALUES ('var2','prod','LS-ECLIPSE-02','seconde',1500,1,0,true,now());" >/dev/null
sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,commande_id,type,quantite,origine,cree_a)
   VALUES ('mv3','var2','cmd','VENTE_WEB',-1,'SYSTEME',now());")
verifier_accepte "panier multi-articles, second mouvement accepté" "$sortie"

# S15 et ADR-030, LS-106 : un mouvement ne se compense qu'une fois.
#
# LES TROIS CONTRÔLES VONT ENSEMBLE. Le premier prouve que la compensation est
# possible, le deuxième qu'elle ne se répète pas, le troisième que les
# mouvements ORDINAIRES restent libres.
#
# CE QUE LE TROISIÈME NE PROUVE PAS, et il a fallu le mesurer pour le savoir :
# il ne teste pas le prédicat. PostgreSQL traite les `NULL` comme DISTINCTS
# dans un index unique, donc un index posé sans `WHERE compense_id IS NOT NULL`
# accepterait ces mêmes lignes. Le prédicat n'apporte pas une garantie
# fonctionnelle ici, seulement de ne pas indexer pour rien un journal qui ne
# fait que croître. Mesuré le 18 août 2026, mutation à l'appui.
R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,prix_unitaire_fige_centimes,origine,cree_a)
   VALUES ('mvx1','var','VENTE_EXTERNE',-1,4200,'ADMIN',now());" >/dev/null
sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,compense_id,motif,origine,cree_a)
   VALUES ('mvx2','var','RETOUR',1,'mvx1','saisie erronée','ADMIN',now());")
verifier_accepte "compensation d'une vente externe acceptée, S14" "$sortie"

sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,compense_id,motif,origine,cree_a)
   VALUES ('mvx3','var','RETOUR',1,'mvx1','seconde tentative','ADMIN',now());")
verifier_rejet "double compensation rejetée, S15" "mouvement_compense_unique" "$sortie"

# La compensation ne gêne pas les mouvements ordinaires : deux entrées de stock
# sans `compense_id` restent possibles.
R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,origine,cree_a)
   VALUES ('mvx4','var','ENTREE',1,'ADMIN',now());" >/dev/null
sortie=$(R "INSERT INTO mouvement_stock (id,variante_id,type,quantite,origine,cree_a)
   VALUES ('mvx5','var','ENTREE',1,'ADMIN',now());")
verifier_accepte "deux mouvements sans compensation acceptés, S15 ne gêne pas l'ordinaire" "$sortie"

# Quatrième clé de la décision D, corrigée après la revue de LS-13. Les trois
# contrôles qui suivent couvrent chacun un défaut que la première version du
# filtre laissait passer.
R "INSERT INTO journal_email (id,commande_id,destinataire,modele,statut,origine,cree_a)
   VALUES ('je1','cmd','a@x.fr','confirmation','ENVOYE','SYSTEME',now());" >/dev/null
sortie=$(R "INSERT INTO journal_email (id,commande_id,destinataire,modele,statut,origine,cree_a)
   VALUES ('je2','cmd','a@x.fr','confirmation','ENVOYE','SYSTEME',now());")
verifier_rejet "email automatique en double rejeté, E5" "journal_email_systeme_unique" "$sortie"

# Le webhook tardif arrive après une régularisation par réconciliation : sans
# RECONCILIATION dans le filtre, le client reçoit une seconde confirmation.
sortie=$(R "INSERT INTO journal_email (id,commande_id,destinataire,modele,statut,origine,cree_a)
   VALUES ('je3','cmd','a@x.fr','confirmation','ENVOYE','RECONCILIATION',now());")
verifier_rejet "second chemin, réconciliation, rejeté, décision D" "journal_email_systeme_unique" "$sortie"

# Un envoi échoué ne doit pas condamner la retentative, règle E4.
R "INSERT INTO journal_email (id,commande_id,destinataire,modele,statut,origine,cree_a)
   VALUES ('je4','cmd','a@x.fr','expedition','ECHOUE','SYSTEME',now());" >/dev/null
sortie=$(R "INSERT INTO journal_email (id,commande_id,destinataire,modele,statut,origine,cree_a)
   VALUES ('je5','cmd','a@x.fr','expedition','ENVOYE','SYSTEME',now());")
verifier_accepte "après un échec, la retentative passe, E4" "$sortie"

# Le renvoi manuel reste libre, règle E6.
sortie=$(R "INSERT INTO journal_email (id,commande_id,destinataire,modele,statut,origine,cree_a)
   VALUES ('je6','cmd','a@x.fr','confirmation','ENVOYE','ADMIN',now());")
verifier_accepte "renvoi manuel accepté, E6" "$sortie"

echo
echo "Horodatage, invariant 8"

# Les colonnes doivent être en timestamptz : sans fuseau, CURRENT_TIMESTAMP
# enregistre l'heure murale de la session, et deux clients réglés sur des
# fuseaux différents dateraient la même facture à deux heures d'écart.
typedate=$(R "SELECT data_type FROM information_schema.columns
              WHERE table_name='facture' AND column_name='emise_a';")
verifier "facture.emise_a en timestamptz" "timestamp with time zone" "$typedate"

sansfuseau=$(R "SELECT count(*) FROM information_schema.columns
                WHERE table_schema='public' AND data_type='timestamp without time zone';")
verifier "aucune colonne sans fuseau" "0" "$sansfuseau"

echo
echo "Rôles et autorisation, ADR-023"

R "INSERT INTO utilisateur (id,email,role,email_verifie,cree_a)
   VALUES ('u1','admin@x.fr','ADMINISTRATRICE',true,now());" >/dev/null
sortie=$(R "INSERT INTO utilisateur (id,email,role,email_verifie,cree_a)
   VALUES ('u2','admin2@x.fr','ADMINISTRATRICE',true,now());")
verifier_rejet "seconde administratrice rejetée, E1" "utilisateur_administratrice_unique" "$sortie"

sortie=$(R "INSERT INTO utilisateur (id,email,role,email_verifie,cree_a)
   VALUES ('u3','c1@x.fr','CLIENT',true,now()),('u4','c2@x.fr','CLIENT',true,now());")
verifier_accepte "plusieurs comptes clients acceptés" "$sortie"

echo
echo "Carnet d'adresses, LS-40"

R "INSERT INTO adresse_carnet (id,utilisateur_id,nom_complet,ligne1,code_postal,ville,pays,est_par_defaut,cree_a)
   VALUES ('ad1','u3','C','1 rue','75001','Paris','FR',true,now());" >/dev/null
sortie=$(R "INSERT INTO adresse_carnet (id,utilisateur_id,nom_complet,ligne1,code_postal,ville,pays,est_par_defaut,cree_a)
   VALUES ('ad2','u3','C','2 rue','75002','Paris','FR',true,now());")
verifier_rejet "deux adresses par défaut rejetées, A2" "adresse_defaut_unique" "$sortie"

# A6, l'ordre des écritures. Retirer avant de poser, vérifié sur PostgreSQL.
sortie=$(R "BEGIN;
   UPDATE adresse_carnet SET est_par_defaut=false WHERE utilisateur_id='u3' AND est_par_defaut;
   INSERT INTO adresse_carnet (id,utilisateur_id,nom_complet,ligne1,code_postal,ville,pays,est_par_defaut,cree_a)
     VALUES ('ad3','u3','C','3 rue','75003','Paris','FR',true,now());
   COMMIT;")
verifier_accepte "bascule dans le bon ordre acceptée, A6" "$sortie"

echo
echo "Suppression de compte, A10 et V15"

R "UPDATE commande SET utilisateur_id='u4' WHERE id='cmd';" >/dev/null
R "INSERT INTO adresse_carnet (id,utilisateur_id,nom_complet,ligne1,code_postal,ville,pays,est_par_defaut,cree_a)
   VALUES ('ad4','u4','D','9 rue','75009','Paris','FR',false,now());" >/dev/null

# La transaction 10 : marquer dissocie_a AVANT de supprimer, une politique de
# clé étrangère ne sachant pas écrire un champ.
R "BEGIN;
   UPDATE commande SET dissocie_a=now() WHERE utilisateur_id='u4';
   DELETE FROM utilisateur WHERE id='u4';
   COMMIT;" >/dev/null

reste=$(R "SELECT count(*) FROM adresse_carnet WHERE id='ad4';")
verifier "le carnet part en cascade" "0" "$reste"

survit=$(R "SELECT count(*) FROM commande WHERE id='cmd';")
verifier "la commande survit, invariants 3 et 4" "1" "$survit"

marquee=$(R "SELECT count(*) FROM commande WHERE id='cmd' AND dissocie_a IS NOT NULL AND utilisateur_id IS NULL;")
verifier "commande dissociée et marquée, V15" "1" "$marquee"

echo
echo "Jetons d'accès, LS-39"

R "INSERT INTO jeton_acces (id,commande_id,empreinte,portee,expire_a)
   VALUES ('j1','cmd','abc','AVIS',now() + interval '7 days');" >/dev/null
sortie=$(R "INSERT INTO jeton_acces (id,commande_id,empreinte,portee,expire_a)
   VALUES ('j2','cmd','abc','AVIS',now() + interval '7 days');")
verifier_rejet "empreinte de jeton unique, L5" "jeton_acces_empreinte_key" "$sortie"

echo
echo "Comptabilité, invariant 4"

R "INSERT INTO facture (id,commande_id,numero,montant_total_centimes,montant_avoir_centimes,instantane_legal,emise_a)
   VALUES ('f1','cmd','F-2026-0001',1610,0,'{}',now());" >/dev/null
sortie=$(R "UPDATE facture SET montant_avoir_centimes=2000 WHERE id='f1';")
verifier_rejet "total des avoirs borné par la facture" "chk_facture_avoir_borne" "$sortie"

sortie=$(R "INSERT INTO facture (id,commande_id,numero,montant_total_centimes,montant_avoir_centimes,instantane_legal,emise_a)
   VALUES ('f2','cmd','F-2026-0002',1610,0,'{}',now());")
verifier_rejet "seconde facture sur la même commande rejetée" "facture_commande_id_key" "$sortie"

echo
echo "Avis, obligation légale"

# La ligne de commande est créée dans un appel séparé : deux instructions dans
# un même psql -c partagent une transaction implicite, et le rejet de la note
# annulerait aussi la ligne, faussant le contrôle suivant.
R "INSERT INTO ligne_commande (id,commande_id,reference_figee,libelle_produit_fige,libelle_variante_fige,prix_fige_centimes,quantite,cree_a)
   VALUES ('lc1','cmd','LS-ECLIPSE-01','Eclipse','doree',1200,1,now());" >/dev/null
sortie=$(R "INSERT INTO avis (id,ligne_commande_id,note,statut,experience_a,depose_a)
   VALUES ('av1','lc1',9,'DEPOSE',now(),now());")
verifier_rejet "note hors barème rejetée" "chk_avis_note_bornee" "$sortie"

R "INSERT INTO avis (id,ligne_commande_id,note,statut,experience_a,depose_a)
   VALUES ('av1','lc1',5,'DEPOSE',now(),now());" >/dev/null
sortie=$(R "INSERT INTO avis (id,ligne_commande_id,note,statut,experience_a,depose_a)
   VALUES ('av2','lc1',4,'DEPOSE',now(),now());")
verifier_rejet "second avis sur la même ligne rejeté, R2" "avis_ligne_commande_id_key" "$sortie"

echo
echo "Conformité des enums au modèle conceptuel, LS-45"

# Motif de ce bloc, LS-45 : les 29 contrôles précédents ne testaient la valeur
# d'aucun enum. Deux divergences avec MODELE-CONCEPTUEL.md vivaient dans le
# schéma sans que rien ne les signale.
#
#   StatutPaiement            il manquait PARTIELLEMENT_REMBOURSE, alors que
#                             PARCOURS.md décrit la transition vers cet état
#   StatutTraitementEvenement le type et son champ étaient absents du schéma
#
# Le contrôle est générique et non ciblé sur ces deux-là : cibler les défauts
# connus laisserait passer le suivant, exactement comme ici.
#
# La correspondance est explicite. Le modèle conceptuel nomme ses enums par le
# champ porteur, `statut`, et plusieurs entités ont un champ de ce nom : rien
# dans le document ne permet de déduire le type PostgreSQL. Déduire aurait
# produit un contrôle qui compare le mauvais enum, donc un test vert pour la
# mauvaise raison. L'entité sert d'ancrage, elle est unique dans le document.
ENUMS_ATTENDUS="
COMMANDE|statut|StatutCommande
PAIEMENT|statut|StatutPaiement
EVENEMENT_FOURNISSEUR|statutTraitement|StatutTraitementEvenement
PRODUIT|statut|StatutProduit
MEDIA|statutTraitement|StatutTraitementMedia
MOUVEMENT_STOCK|type|TypeMouvementStock
MOUVEMENT_STOCK|origine|OrigineEcriture
HISTORIQUE_STATUT|origine|OrigineEcriture
JOURNAL_EMAIL|origine|OrigineEcriture
COMMANDE|modeLivraison|ModeLivraison
EXPEDITION|mode|ModeLivraison
DEMANDE_RETRACTATION|statut|StatutRetractation
JETON_ACCES|portee|PorteeJeton
AVIS|statut|StatutAvis
UTILISATEUR|role|Role
JOURNAL_EMAIL|statut|StatutEmail
ALERTE_CRITIQUE|gravite|GraviteAlerte
JOURNAL_CONNEXION|moyen|MoyenConnexion
JOURNAL_CONNEXION|issue|IssueConnexion
"

# Ancré sur la racine du dépôt et non sur une suite de « .. » comptés depuis ce
# fichier. LS-66 a déplacé ce dossier de prisma/sql-manuel vers
# prisma/sql-manuel : le chemin relatif portait un niveau de trop et le contrôle
# de conformité des enums est tombé en échec. Il a fait son travail, mais un
# chemin qui dépend de la profondeur du script casse à chaque déplacement.
MODELE="$RACINE/docs/architecture/MODELE-CONCEPTUEL.md"

# Sans ce garde-fou, un document déplacé ferait rougir les douze enums en
# « introuvable dans le modèle conceptuel ». Le script échouerait bien, mais en
# désignant douze faux coupables au lieu de la cause réelle.
if [ ! -r "$MODELE" ]; then
  echo "  ECHEC modèle conceptuel illisible : $MODELE"
  ko=$((ko+1))
  echo
  echo "-----------------------------------------"
  echo "  $ok réussites, $ko échecs"
  echo "-----------------------------------------"
  exit 1
fi

# Valeurs documentées pour une entité et un champ donnés.
#
# awk plutôt que grep : l'ancrage porte sur le bloc d'entité ouvert par
# `ENTITE {`, sans quoi `enum statut` remonterait la première occurrence venue.
valeurs_documentees() {
  local entite="$1" champ="$2"
  awk -v e="$entite" -v c="$champ" '
    $1 == e && $2 == "{" { dans = 1; next }
    dans && /^[[:space:]]*}/ { dans = 0 }
    dans && $1 == "enum" && $2 == c {
      if (match($0, /"[^"]*"/)) print substr($0, RSTART + 1, RLENGTH - 2)
      exit
    }
  ' "$MODELE"
}

# Valeurs réellement déclarées en base. L'ordre de déclaration d'un enum
# PostgreSQL ne porte aucun sens métier ici, les deux côtés sont donc triés
# avant comparaison : un simple réagencement ne doit pas faire rougir.
valeurs_en_base() {
  R "SELECT string_agg(e.enumlabel, ' ' ORDER BY e.enumlabel)
     FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = '$1';"
}

trier() { tr ' ' '\n' <<< "$1" | grep -v '^$' | sort | tr '\n' ' ' | sed 's/ $//'; }

# La liste est parcourue depuis un tableau, pas depuis un tube.
#
# Deux raisons, la seconde ayant coûté une fausse réussite pendant l'écriture de
# ce bloc. Un `while` alimenté par un tube tourne dans un sous-shell, ses
# incréments de $ok et $ko sont perdus au retour. Surtout, `R()` appelle
# `docker exec -i`, qui hérite du stdin de la boucle et avale le reste de la
# liste : le contrôle s'arrêtait après le premier enum en affichant « OK », et
# les onze suivants, dont les deux défectueux, n'étaient jamais testés.
#
# Un contrôle qui n'examine qu'un douzième de son périmètre en annonçant vert
# est précisément le défaut que cette story corrige.
#
# `for` sur une chaîne découpée, et non `mapfile` : macOS livre bash 3.2, où
# cette commande n'existe pas. Le script tournerait en CI et casserait sur la
# machine de développement.
for ligne in $(echo "$ENUMS_ATTENDUS" | grep -v '^$'); do
  entite="${ligne%%|*}"
  reste="${ligne#*|}"
  champ="${reste%%|*}"
  type="${reste#*|}"
  documente=$(valeurs_documentees "$entite" "$champ")
  en_base=$(valeurs_en_base "$type")

  if [ -z "$documente" ]; then
    echo "  ECHEC $type : introuvable dans le modèle conceptuel [$entite.$champ]"
    ko=$((ko+1))
  elif [ -z "$en_base" ]; then
    echo "  ECHEC $type : type absent de la base, documenté en [$entite.$champ]"
    ko=$((ko+1))
  elif [ "$(trier "$documente")" = "$(trier "$en_base")" ]; then
    echo "  OK    $type conforme au modèle conceptuel"
    ok=$((ok+1))
  else
    manquantes=$(comm -23 <(trier "$documente" | tr ' ' '\n') <(trier "$en_base" | tr ' ' '\n') | tr '\n' ' ')
    en_trop=$(comm -13 <(trier "$documente" | tr ' ' '\n') <(trier "$en_base" | tr ' ' '\n') | tr '\n' ' ')
    echo "  ECHEC $type : divergence avec le modèle conceptuel"
    [ -n "${manquantes// /}" ] && echo "        absentes de la base : $manquantes"
    [ -n "${en_trop// /}" ] && echo "        absentes du modèle  : $en_trop"
    ko=$((ko+1))
  fi
done

# Complétude de la table de correspondance elle-même.
#
# Sans ce contrôle, la liste ci-dessus n'est qu'une opinion : un enum absent de
# la table n'est jamais comparé, et son absence ne produit aucun signal. C'est
# arrivé pendant l'écriture de LS-45. `OrigineEcriture` manquait, parce que le
# modèle conceptuel l'écrivait `texte origine` et non `enum origine` : la liste
# établie en relevant les lignes `enum` du document en comptait douze, et le
# treizième type passait au travers. Retirer `RECONCILIATION`, valeur dont
# dépend la règle E5, laissait le script vert.
#
# Un contrôle censé couvrir tous les enums doit prouver qu'il les couvre tous.
declares=$(R "SELECT count(*) FROM pg_type t
              JOIN pg_namespace n ON n.oid = t.typnamespace
              WHERE t.typtype = 'e' AND n.nspname = 'public';")
# Les **types distincts** couverts, et non le nombre de lignes de la table.
# Depuis ADR-025, `ModeLivraison` est porté par deux entités, COMMANDE et
# EXPEDITION : il occupe deux lignes pour un seul type en base. Compter les
# lignes ferait échouer le contrôle en annonçant une table incomplète alors
# qu'elle est complète, et la correction évidente aurait été de retirer une des
# deux lignes, donc de cesser de contrôler l'un des deux champs.
attendus=$(echo "$ENUMS_ATTENDUS" | grep '|' | cut -d'|' -f3 | sort -u | grep -c .)

# Limite assumée de ce contrôle, mesurée par mutation le 29 juillet 2026 :
# il prouve que chaque **type** est couvert, pas que chaque **champ** l'est.
# Retirer la ligne `EXPEDITION|mode|ModeLivraison` le laisse vert, le type
# restant couvert par la ligne COMMANDE. Le contrôle de couverture des colonnes
# ci-dessous ferme ce trou.

if [ "$declares" = "$attendus" ]; then
  verifier "table de correspondance complète, $declares enums couverts" "$declares" "$attendus"
else
  echo "  ECHEC table de correspondance incomplète : $declares enums en base, $attendus contrôlés"
  echo "        non contrôlés : $(R "SELECT string_agg(t.typname, ' ' ORDER BY t.typname)
                                     FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                                     WHERE t.typtype = 'e' AND n.nspname = 'public'
                                       AND t.typname NOT IN ($(echo "$ENUMS_ATTENDUS" | grep '|' | cut -d'|' -f3 | sort -u | sed "s/^/'/;s/\$/'/" | paste -sd, -))")"
  ko=$((ko+1))
fi

# Couverture par colonne, et non seulement par type.
#
# Le contrôle précédent laisse passer un champ enum retiré de la table dès lors
# qu'un autre champ porte le même type. Depuis ADR-025 le cas est réel :
# `ModeLivraison` est porté par `commande.mode_livraison` et
# `expedition.mode`, et abandonner le contrôle du second resterait invisible.
#
# Celui-ci part de la base : toute colonne dont le type est un enum doit
# apparaître dans la table de correspondance. C'est le sens utile, une colonne
# non contrôlée est une colonne dont les valeurs peuvent diverger du modèle.
colonnes_base=$(R "SELECT string_agg(c.table_name || '.' || c.column_name, ' ' ORDER BY c.table_name, c.column_name)
                   FROM information_schema.columns c
                   JOIN pg_type t ON t.typname = c.udt_name
                   JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE c.table_schema = 'public' AND t.typtype = 'e' AND n.nspname = 'public';")

# La table de correspondance nomme les entités du modèle conceptuel, en
# majuscules, et les champs en camelCase. La base les nomme en snake_case
# minuscule. La conversion se fait dans ce sens, seul déterministe.
colonnes_attendues=$(echo "$ENUMS_ATTENDUS" | grep '|' | while IFS='|' read -r e c _; do
  echo "$(echo "$e" | tr 'A-Z' 'a-z').$(echo "$c" | sed 's/\([A-Z]\)/_\1/g' | tr 'A-Z' 'a-z')"
done | sort | tr '\n' ' ' | sed 's/ $//')

non_couvertes=$(comm -23 <(trier "$colonnes_base" | tr ' ' '\n' | sort) <(echo "$colonnes_attendues" | tr ' ' '\n' | sort) | tr '\n' ' ')

if [ -z "${non_couvertes// /}" ]; then
  echo "  OK    toutes les colonnes enum sont contrôlées"
  ok=$((ok+1))
else
  echo "  ECHEC colonnes enum non contrôlées : $non_couvertes"
  ko=$((ko+1))
fi

echo
echo "== Categories du catalogue, LS-99 =="

# Jeu d'essai : deux categories supplementaires. Noms neutres, sans rapport avec
# le prototype, dont les donnees n'entrent nulle part comme donnees reelles.
R "INSERT INTO categorie (id,nom,slug,ordre,cree_a)
   VALUES ('cat2','Categorie deux','categorie-deux',2,now()),
          ('cat3','Categorie trois','categorie-trois',3,now());" >/dev/null

# TEST 1, C24 : l'echange de deux positions reussit DANS UNE TRANSACTION, grace
# au caractere differable. Meme mecanique que C22, et ce controle rougit si la
# contrainte est recreee non differable.
sortie=$(R "BEGIN;
            UPDATE categorie SET ordre = 3 WHERE id = 'cat2';
            UPDATE categorie SET ordre = 2 WHERE id = 'cat3';
            COMMIT;")
verifier_accepte "echange de deux rangs de categorie accepte en transaction, C24" "$sortie"

# L'echange a-t-il eu lieu ? Un COMMIT devenu ROLLBACK laisserait le controle
# precedent au vert sans que rien ne bouge. Meme piege que pour C22.
verifier "l'echange de rangs de categorie est effectif" "cat2=3 cat3=2" \
  "$(R "SELECT 'cat2=' || (SELECT ordre FROM categorie WHERE id='cat2') ||
               ' cat3=' || (SELECT ordre FROM categorie WHERE id='cat3');")"

# TEST 2, C24 : la protection tient toujours. C'est LE controle qui distingue
# « contrainte differable » de « contrainte absente », le test 1 passant a
# l'identique sans aucune contrainte.
sortie=$(R "BEGIN;
            UPDATE categorie SET ordre = 1 WHERE id = 'cat2';
            COMMIT;")
verifier_rejet "doublon de rang de categorie refuse au COMMIT, C24" \
  "categorie_ordre_unique" "$sortie"

# Et en insertion, pas seulement en mise a jour.
sortie=$(R "BEGIN;
            INSERT INTO categorie (id,nom,slug,ordre,cree_a)
            VALUES ('cat4','Categorie quatre','categorie-quatre',1,now());
            COMMIT;")
verifier_rejet "insertion d'un rang de categorie deja pris refusee, C24" \
  "categorie_ordre_unique" "$sortie"

# Controle structurel, independant du comportement observe ci-dessus.
verifier "la contrainte de rang de categorie est differable et differee, C24" "true|true" \
  "$(R "SELECT condeferrable || '|' || condeferred FROM pg_constraint
        WHERE conname = 'categorie_ordre_unique';")"

# C24, l'ordre commence a 1. Un rang nul trierait avant tout le reste.
sortie=$(R "INSERT INTO categorie (id,nom,slug,ordre,cree_a)
            VALUES ('cat5','Categorie cinq','categorie-cinq',0,now());")
verifier_rejet "un rang de categorie nul est rejete, C24" "chk_categorie_ordre_positif" "$sortie"

sortie=$(R "INSERT INTO categorie (id,nom,slug,ordre,cree_a)
            VALUES ('cat6','Categorie six','categorie-six',-1,now());")
verifier_rejet "un rang de categorie negatif est rejete, C24" "chk_categorie_ordre_positif" "$sortie"

# C25, un nom vide produirait un lien invisible mais cliquable dans le menu.
# Le trim compte : trois espaces ne sont pas un nom.
sortie=$(R "INSERT INTO categorie (id,nom,slug,ordre,cree_a)
            VALUES ('cat7','   ','categorie-sept',7,now());")
verifier_rejet "un nom de categorie vide est rejete, C25" "chk_categorie_nom_non_vide" "$sortie"

# C3, le slug reste unique. Deja garanti avant LS-99, verifie ici parce que
# l'ecran de creation s'appuie dessus pour refuser un doublon.
sortie=$(R "INSERT INTO categorie (id,nom,slug,ordre,cree_a)
            VALUES ('cat8','Autre nom','categorie-deux',8,now());")
verifier_rejet "un slug de categorie en doublon est rejete, C3" "categorie_slug_key" "$sortie"

# C26, une categorie portant un produit ne se supprime pas. La categorie 'cat'
# porte le produit 'prod' du jeu d'essai initial.
sortie=$(R "DELETE FROM categorie WHERE id = 'cat';")
verifier_rejet "suppression d'une categorie portant un produit refusee, C26" \
  "produit_categorie_id_fkey" "$sortie"

# Et la categorie vide, elle, se supprime : sans ce controle, un RESTRICT pose
# sur la mauvaise colonne, ou une suppression bloquee pour une autre raison,
# passerait pour C26 respectee.
sortie=$(R "DELETE FROM categorie WHERE id = 'cat3';")
verifier_accepte "suppression d'une categorie vide acceptee, C26" "$sortie"

# Remise en etat pour les controles suivants, qui comptent sur 'cat' seule.
R "DELETE FROM categorie WHERE id IN ('cat2','cat4');" >/dev/null

echo
echo "== Sections de fiche produit, ADR-026, LS-76 =="

# Jeu d'essai : deux sections sur le produit existant.
R "INSERT INTO section_produit (id,produit_id,cle,titre,contenu,ordre,visible,cree_a,modifie_a)
   VALUES ('s1','prod','description','Description détaillée','Texte un',1,true,now(),now()),
          ('s2','prod','matieres','Matières et composants','Texte deux',2,true,now(),now());" >/dev/null

sortie=$(R "INSERT INTO section_produit (id,produit_id,cle,titre,contenu,ordre,visible,cree_a,modifie_a)
            VALUES ('s3','prod','description','Doublon','x',3,true,now(),now());")
verifier_rejet "deux sections de même clé sur un produit rejetées, C20" \
  "section_produit_cle_unique" "$sortie"

# TEST 1 exigé par LS-76 : l'échange de deux positions réussit DANS UNE
# TRANSACTION, grâce au caractère différable de la contrainte.
#
# Sans DEFERRABLE, la première des deux mises à jour violerait la contrainte
# avant que la seconde ne rétablisse la cohérence. Ce contrôle est donc aussi
# celui qui prouve que la contrainte est bien différable : le rendre non
# différable le fait rougir.
sortie=$(R "BEGIN;
            UPDATE section_produit SET ordre = 2 WHERE id = 's1';
            UPDATE section_produit SET ordre = 1 WHERE id = 's2';
            COMMIT;")
verifier_accepte "échange de deux positions accepté en transaction, C22" "$sortie"

# L'échange a-t-il réellement eu lieu ? Un COMMIT silencieusement transformé en
# ROLLBACK laisserait le contrôle précédent au vert sans que rien ne bouge.
verifier "l'échange de positions est effectif" "s1=2 s2=1" \
  "$(R "SELECT 's1=' || (SELECT ordre FROM section_produit WHERE id='s1') ||
               ' s2=' || (SELECT ordre FROM section_produit WHERE id='s2');")"

# TEST 2 exigé par LS-76 : la protection tient toujours. C'est LE contrôle qui
# distingue « contrainte différable » de « contrainte absente » : le test 1
# passerait à l'identique sans aucune contrainte.
sortie=$(R "BEGIN;
            UPDATE section_produit SET ordre = 1 WHERE id = 's1';
            COMMIT;")
verifier_rejet "doublon d'ordre refusé au COMMIT, C22" \
  "section_produit_ordre_unique" "$sortie"

# Et en insertion, pas seulement en mise à jour.
sortie=$(R "BEGIN;
            INSERT INTO section_produit (id,produit_id,cle,titre,contenu,ordre,visible,cree_a,modifie_a)
            VALUES ('s4','prod','fabrication','Fabrication','x',1,true,now(),now());
            COMMIT;")
verifier_rejet "insertion d'un ordre déjà pris refusée au COMMIT, C22" \
  "section_produit_ordre_unique" "$sortie"

# La contrainte est-elle bien déclarée différable en base ? Un contrôle
# structurel, indépendant du comportement observé ci-dessus.
verifier "la contrainte d'ordre est différable et différée par défaut, C22" "true|true" \
  "$(R "SELECT condeferrable || '|' || condeferred FROM pg_constraint
        WHERE conname = 'section_produit_ordre_unique';")"

# Deux produits distincts peuvent porter le même rang : l'unicité est par
# produit. Une contrainte sur la seule colonne ordre rendrait le catalogue
# impossible dès le deuxième produit.
R "INSERT INTO produit (id,categorie_id,nom,slug,statut,cree_a,modifie_a)
   VALUES ('prod2','cat','Aube','aube','ACTIF',now(),now());" >/dev/null
sortie=$(R "INSERT INTO section_produit (id,produit_id,cle,titre,contenu,ordre,visible,cree_a,modifie_a)
            VALUES ('s5','prod2','description','Description détaillée','y',1,true,now(),now());")
verifier_accepte "deux produits peuvent porter le même rang de section, C22" "$sortie"

sortie=$(R "INSERT INTO section_produit (id,produit_id,cle,titre,contenu,ordre,visible,cree_a,modifie_a)
            VALUES ('s6','prod','entretien','Conseils','x',0,true,now(),now());")
verifier_rejet "un ordre nul est rejeté, C22" "chk_section_ordre_positif" "$sortie"

sortie=$(R "INSERT INTO section_produit (id,produit_id,cle,titre,contenu,ordre,visible,cree_a,modifie_a)
            VALUES ('s7','prod','entretien','   ','x',9,true,now(),now());")
verifier_rejet "un titre vide est rejeté, C23" "chk_section_titre_non_vide" "$sortie"

sortie=$(R "INSERT INTO section_produit (id,produit_id,cle,titre,contenu,ordre,visible,cree_a,modifie_a)
            VALUES ('s8','prod','','Titre','x',10,true,now(),now());")
verifier_rejet "une clé vide est rejetée, C20" "chk_section_cle_non_vide" "$sortie"

# Un contenu vide est légitime : c'est l'état d'une section proposée mais pas
# encore remplie. La règle d'affichage, et non la base, décide de ne pas la
# montrer.
sortie=$(R "INSERT INTO section_produit (id,produit_id,cle,titre,contenu,ordre,visible,cree_a,modifie_a)
            VALUES ('s9','prod','entretien','Conseils d''entretien','',11,true,now(),now());")
verifier_accepte "un contenu vide est accepté, section non remplie, C23" "$sortie"

# ADR-026 : les quatre colonnes éditoriales ne doivent plus exister. Sans ce
# contrôle, une réintroduction par copie d'un ancien schéma passerait inaperçue
# et recréerait les deux systèmes concurrents que l'ADR écarte.
verifier "les quatre colonnes éditoriales ont disparu de produit, ADR-026" "0" \
  "$(R "SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'produit'
          AND column_name IN ('description','matieres','entretien','fabrication');")"

verifier "descriptionCourte est conservée sur produit, ADR-026" "1" \
  "$(R "SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'produit' AND column_name = 'description_courte';")"

verifier "dimensions reste sur variante, source de vérité, ADR-026" "1" \
  "$(R "SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'variante' AND column_name = 'dimensions';")"

echo
echo "== Confirmation du paiement, LS-76 =="

verifier "paiement.confirme_a existe en timestamptz nullable" "timestamp with time zone|YES" \
  "$(R "SELECT data_type || '|' || is_nullable FROM information_schema.columns
        WHERE table_name = 'paiement' AND column_name = 'confirme_a';")"

R "INSERT INTO commande (id,numero,statut,email_normalise,nom_client,adresse_livraison,adresse_facturation,
     sous_total_centimes,mode_livraison,point_relais_id,frais_port_centimes,total_centimes,montant_taxe_centimes,cgv_acceptees_a,cgv_version,cree_a)
   VALUES ('cmdconf','C-2026-0950','EN_ATTENTE_PAIEMENT','conf@x.fr','Client','{}','{}',1200,'POINT_RELAIS','MR-64000-01',410,1610,0,now(),'v1',now());" >/dev/null

# Une tentative en attente n'a pas de date de confirmation.
sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,cree_a)
            VALUES ('payc1','cmdconf','EN_ATTENTE',1610,now());")
verifier_accepte "paiement EN_ATTENTE sans date de confirmation accepté" "$sortie"

# Garde-fou contre un faux vert, défaut rencontré en écrivant cette section.
#
# Les identifiants `pay1` et `pay2` sont déjà pris par la section d'idempotence
# ci-dessus. Un `UPDATE ... WHERE id = 'pay1'` écrit ici par distraction visait
# une ligne REUSSI portant déjà sa date : l'écriture était légitime, donc
# acceptée, et trois contrôles de rejet passaient au vert en ayant testé le
# contraire de ce qu'ils annonçaient.
#
# Un UPDATE qui ne touche aucune ligne ne lève pas d'erreur non plus. La cible
# des contrôles suivants doit donc exister, et dans l'état attendu.
verifier "la cible des contrôles de confirmation existe et est EN_ATTENTE" "EN_ATTENTE|false" \
  "$(R "SELECT statut || '|' || (confirme_a IS NOT NULL) FROM paiement WHERE id = 'payc1';")"

sortie=$(R "UPDATE paiement SET confirme_a = now() WHERE id = 'payc1';")
verifier_rejet "date de confirmation sur un paiement EN_ATTENTE rejetée" \
  "chk_paiement_confirmation_coherente" "$sortie"

sortie=$(R "UPDATE paiement SET statut = 'REUSSI' WHERE id = 'payc1';")
verifier_rejet "passage à REUSSI sans date de confirmation rejeté" \
  "chk_paiement_confirmation_coherente" "$sortie"

sortie=$(R "UPDATE paiement SET statut = 'REUSSI', confirme_a = now() WHERE id = 'payc1';")
verifier_accepte "passage à REUSSI avec date de confirmation accepté" "$sortie"

# Les trois états d'encaissement, leçon de LS-45. Un remboursement ne rend pas la
# commande impayée : la date de confirmation doit survivre au passage en
# REMBOURSE, sinon la vente disparaîtrait des statistiques du mois où elle a eu
# lieu.
sortie=$(R "UPDATE paiement SET statut = 'PARTIELLEMENT_REMBOURSE' WHERE id = 'payc1';")
verifier_accepte "PARTIELLEMENT_REMBOURSE conserve sa date de confirmation, LS-45" "$sortie"

sortie=$(R "UPDATE paiement SET statut = 'REMBOURSE' WHERE id = 'payc1';")
verifier_accepte "REMBOURSE conserve sa date de confirmation, LS-45" "$sortie"

sortie=$(R "UPDATE paiement SET confirme_a = NULL WHERE id = 'payc1';")
verifier_rejet "retirer la date d'un paiement remboursé rejeté, LS-45" \
  "chk_paiement_confirmation_coherente" "$sortie"

# ECHOUE n'est pas un état d'encaissement, il ne porte donc pas de date.
R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,cree_a)
   VALUES ('payc2','cmdconf','ECHOUE',1610,now());" >/dev/null
sortie=$(R "UPDATE paiement SET confirme_a = now() WHERE id = 'payc2';")
verifier_rejet "date de confirmation sur un paiement ECHOUE rejetée" \
  "chk_paiement_confirmation_coherente" "$sortie"

echo
echo "Complétude du SQL de référence, LS-70"

# Le SQL de conception connaît-il toutes les tables de la base ?
#
# POURQUOI CE CONTRÔLE EXISTE. Le mode « conception » construit sa base à
# partir de schema.sql. Si ce fichier ignore une table, aucun contrôle ne la
# vise, et le script annonce « 0 échec » en validant un schéma qui n'est plus
# celui du projet. Ce n'est pas hypothétique : LS-70 a ajouté quatre tables
# d'authentification et le fichier ne les portait pas, la relecture critique
# ayant mesuré 26 tables ici contre 30 en base. Le fichier avait déjà raté
# LS-67 de la même façon.
#
# Un compte est ce qui transforme une liste écrite à la main en garantie.
# Même leçon que la complétude de la table des enums, plus haut : une liste
# reste une opinion tant que rien ne prouve qu'elle est exhaustive.
#
# LE CONTRÔLE VAUT DANS LES DEUX MODES, et il mesure deux choses différentes.
# En mode conception, il compare le fichier à la base qu'il a lui-même
# engendrée, donc vérifie surtout que le compte attendu suit. En mode
# --base-migree, il compare le fichier à ce que `prisma migrate deploy` a
# réellement créé : c'est là qu'un oubli de synchronisation apparaît.
tables_base=$(R "SELECT count(*) FROM information_schema.tables
                 WHERE table_schema = 'public'
                   AND table_type = 'BASE TABLE'
                   AND table_name NOT LIKE '\_prisma%';")
tables_reference=$(grep -c '^CREATE TABLE ' "$DIR/schema.sql")

if [ "$tables_base" = "$tables_reference" ]; then
  verifier "SQL de référence complet, $tables_base tables" \
    "$tables_base" "$tables_reference"
else
  echo "  ECHEC SQL de référence incomplet : $tables_base tables en base, $tables_reference dans schema.sql"
  echo "        Porter les tables manquantes dans prisma/sql-manuel/schema.sql."
  echo "        Sans elles, le mode conception valide un schéma périmé et n'échoue jamais."
  ko=$((ko+1))
fi

echo
echo "-----------------------------------------"
echo "  $ok réussites, $ko échecs"
echo "-----------------------------------------"
[ "$ko" -eq 0 ] || exit 1
