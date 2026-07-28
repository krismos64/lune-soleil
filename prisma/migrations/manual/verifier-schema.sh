#!/bin/bash
# Vérification du modèle logique sur PostgreSQL réel, LS-13.
#
# Rejoue sur le schéma complet ce que le prototype d'ADR-006 vérifiait sur deux
# tables isolées, et couvre en plus les contraintes nées de LS-37 à LS-41 :
# variante archivée, unicité de l'administratrice, idempotence à quatre clés.
#
# Usage : ./prisma/migrations/manual/verifier-schema.sh
# Prérequis : Docker lancé, et le SQL de migration présent dans le dossier.
#
# Le conteneur est créé puis supprimé à la fin.

set -u
CT=ls13-verif
PORT=55414
DIR="$(cd "$(dirname "$0")" && pwd)"
ok=0
ko=0

nettoyer() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap nettoyer EXIT

R() { docker exec -i "$CT" psql -U postgres -d lunesoleil -tAq -c "$1" 2>&1; }

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

echo "Démarrage de PostgreSQL 18.4"
docker run -d --rm --name "$CT" \
  -e POSTGRES_PASSWORD=verif -e POSTGRES_DB=lunesoleil \
  -p "$PORT:5432" postgres:18.4 >/dev/null 2>&1

for _ in $(seq 1 30); do
  docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done

echo "Application du schéma"
docker exec -i "$CT" psql -U postgres -d lunesoleil -q < "$DIR/schema.sql" >/dev/null 2>&1
docker exec -i "$CT" psql -U postgres -d lunesoleil -q < "$DIR/001_contraintes_check.sql" >/dev/null 2>&1

# Jeu d'essai minimal : une pièce unique, le cas qui porte le jalon du projet.
R "INSERT INTO categorie (id,nom,slug,cree_a) VALUES ('cat','Boucles','boucles',now());
   INSERT INTO produit (id,categorie_id,nom,slug,statut,cree_a,modifie_a)
     VALUES ('prod','cat','Eclipse','eclipse','ACTIF',now(),now());
   INSERT INTO variante (id,produit_id,reference,libelle,prix_centimes,quantite_physique,quantite_reservee,vente_web_activee,cree_a)
     VALUES ('var','prod','LS-ECLIPSE-01','unique',1200,1,0,true,now());" >/dev/null

reset_stock() {
  R "DELETE FROM reservation;
     UPDATE variante SET quantite_physique=1, quantite_reservee=0,
       vente_web_activee=true, archivee_a=NULL WHERE id='var';" >/dev/null
}

# La réservation atomique telle que .claude/rules/database.md la définit,
# avec la condition archivee_a ajoutée par LS-37.
reserver() {
  R "WITH reserve AS (
       UPDATE variante SET quantite_reservee = quantite_reservee + 1
       WHERE reference = 'LS-ECLIPSE-01'
         AND vente_web_activee = true
         AND archivee_a IS NULL
         AND quantite_physique - quantite_reservee >= 1
       RETURNING id
     )
     INSERT INTO reservation (id, variante_id, quantite, expire_a, cree_a)
     SELECT gen_random_uuid()::text, id, 1, now() + interval '30 minutes', now() FROM reserve
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
     sous_total_centimes,frais_port_centimes,total_centimes,montant_taxe_centimes,cgu_acceptees_a,cgu_version,cree_a)
   VALUES ('cmd','C-2026-0001','CONFIRMEE','a@x.fr','Client','{}','{}',1200,410,1610,0,now(),'v1',now());" >/dev/null

R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,cree_a)
   VALUES ('pay1','cmd','REUSSI',1610,0,now());" >/dev/null
sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,cree_a)
   VALUES ('pay2','cmd','REUSSI',1610,0,now());")
verifier_rejet "second paiement réussi rejeté, V14" "paiement_reussi_unique" "$sortie"

sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,cree_a)
   VALUES ('pay3','cmd','ECHOUE',1610,0,now());")
verifier_accepte "un paiement échoué reste possible, décision B" "$sortie"

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
R "INSERT INTO ligne_commande (id,commande_id,reference_figee,libelle_fige,prix_fige_centimes,quantite,cree_a)
   VALUES ('lc1','cmd','LS-ECLIPSE-01','Eclipse',1200,1,now());" >/dev/null
sortie=$(R "INSERT INTO avis (id,ligne_commande_id,note,statut,experience_a,depose_a)
   VALUES ('av1','lc1',9,'DEPOSE',now(),now());")
verifier_rejet "note hors barème rejetée" "chk_avis_note_bornee" "$sortie"

R "INSERT INTO avis (id,ligne_commande_id,note,statut,experience_a,depose_a)
   VALUES ('av1','lc1',5,'DEPOSE',now(),now());" >/dev/null
sortie=$(R "INSERT INTO avis (id,ligne_commande_id,note,statut,experience_a,depose_a)
   VALUES ('av2','lc1',4,'DEPOSE',now(),now());")
verifier_rejet "second avis sur la même ligne rejeté, R2" "avis_ligne_commande_id_key" "$sortie"

echo
echo "-----------------------------------------"
echo "  $ok réussites, $ko échecs"
echo "-----------------------------------------"
[ "$ko" -eq 0 ] || exit 1
