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

for f in "$DIR/schema.sql" "$DIR/001_contraintes_check.sql"; do
  [ -r "$f" ] || abandon "fichier SQL illisible : $f"
done

echo "Démarrage de PostgreSQL 18.4"
docker run -d --rm --name "$CT" \
  -e POSTGRES_PASSWORD=verif -e POSTGRES_DB=lunesoleil \
  -p "$PORT:5432" postgres:18.4 >/dev/null 2>&1 \
  || abandon "le conteneur PostgreSQL n'a pas démarré, port $PORT déjà pris ?"

pret=0
for _ in $(seq 1 30); do
  if docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1; then pret=1; break; fi
  sleep 2
done
[ "$pret" -eq 1 ] || abandon "PostgreSQL n'est pas prêt après 60 secondes"

echo "Application du schéma"
docker exec -i "$CT" psql -U postgres -d lunesoleil -q -v ON_ERROR_STOP=1 \
  < "$DIR/schema.sql" >/dev/null 2>&1 \
  || abandon "l'application de schema.sql a échoué"
docker exec -i "$CT" psql -U postgres -d lunesoleil -q -v ON_ERROR_STOP=1 \
  < "$DIR/001_contraintes_check.sql" >/dev/null 2>&1 \
  || abandon "l'application de 001_contraintes_check.sql a échoué"

# Jeu d'essai minimal : une pièce unique, le cas qui porte le jalon du projet.
R "INSERT INTO categorie (id,nom,slug,ordre,cree_a) VALUES ('cat','Boucles','boucles',1,now());
   INSERT INTO produit (id,categorie_id,nom,slug,statut,cree_a,modifie_a)
     VALUES ('prod','cat','Eclipse','eclipse','ACTIF',now(),now());
   INSERT INTO variante (id,produit_id,reference,libelle,prix_centimes,quantite_physique,quantite_reservee,vente_web_activee,cree_a)
     VALUES ('var','prod','LS-ECLIPSE-01','unique',1200,1,0,true,now());" >/dev/null

# ADR-024, LS-53 : une réservation porte toujours sa commande. La commande est
# donc créée avant, comme dans la transaction réelle du parcours 1.
R "INSERT INTO commande (id,numero,statut,email_normalise,nom_client,adresse_livraison,adresse_facturation,
     sous_total_centimes,frais_port_centimes,total_centimes,montant_taxe_centimes,cgv_acceptees_a,cgv_version,cree_a)
   VALUES ('cmdres','C-2026-0900','EN_ATTENTE_PAIEMENT','r@x.fr','Client','{}','{}',1200,410,1610,0,now(),'v1',now());" >/dev/null

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
     sous_total_centimes,frais_port_centimes,total_centimes,montant_taxe_centimes,cgv_acceptees_a,cgv_version,cree_a)
   VALUES ('cmd','C-2026-0001','CONFIRMEE','a@x.fr','Client','{}','{}',1200,410,1610,0,now(),'v1',now());" >/dev/null

R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,cree_a)
   VALUES ('pay1','cmd','REUSSI',1610,0,now());" >/dev/null
sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,cree_a)
   VALUES ('pay2','cmd','REUSSI',1610,0,now());")
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
sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,cree_a)
   VALUES ('pay4','cmd','REUSSI',1610,0,now());")
verifier_rejet "second REUSSI après remboursement partiel rejeté, V14" "paiement_reussi_unique" "$sortie"

# Symétrique : un paiement entièrement remboursé ne rouvre pas la commande non
# plus. Rembourser n'efface pas l'encaissement, il le compense.
R "UPDATE paiement SET statut='REMBOURSE', montant_rembourse_centimes=1610
   WHERE id='pay1';" >/dev/null
sortie=$(R "INSERT INTO paiement (id,commande_id,statut,montant_centimes,montant_rembourse_centimes,cree_a)
   VALUES ('pay5','cmd','REUSSI',1610,0,now());")
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
DEMANDE_RETRACTATION|statut|StatutRetractation
JETON_ACCES|portee|PorteeJeton
AVIS|statut|StatutAvis
UTILISATEUR|role|Role
JOURNAL_EMAIL|statut|StatutEmail
ALERTE_CRITIQUE|gravite|GraviteAlerte
"

MODELE="$DIR/../../../docs/architecture/MODELE-CONCEPTUEL.md"

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
attendus=$(echo "$ENUMS_ATTENDUS" | grep -c '|')

if [ "$declares" = "$attendus" ]; then
  verifier "table de correspondance complète, $declares enums couverts" "$declares" "$attendus"
else
  echo "  ECHEC table de correspondance incomplète : $declares enums en base, $attendus contrôlés"
  echo "        non contrôlés : $(R "SELECT string_agg(t.typname, ' ' ORDER BY t.typname)
                                     FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                                     WHERE t.typtype = 'e' AND n.nspname = 'public'
                                       AND t.typname NOT IN ($(echo "$ENUMS_ATTENDUS" | grep '|' | sed "s/.*|/'/;s/\$/'/" | paste -sd, -))")"
  ko=$((ko+1))
fi

echo
echo "-----------------------------------------"
echo "  $ok réussites, $ko échecs"
echo "-----------------------------------------"
[ "$ko" -eq 0 ] || exit 1
