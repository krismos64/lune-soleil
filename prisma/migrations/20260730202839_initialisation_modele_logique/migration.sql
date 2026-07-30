-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'ADMINISTRATRICE');

-- CreateEnum
CREATE TYPE "StatutProduit" AS ENUM ('BROUILLON', 'ACTIF', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "StatutTraitementMedia" AS ENUM ('EN_ATTENTE', 'TRAITE', 'ECHOUE');

-- CreateEnum
CREATE TYPE "TypeMouvementStock" AS ENUM ('VENTE_WEB', 'VENTE_EXTERNE', 'RETOUR', 'AJUSTEMENT', 'ENTREE');

-- CreateEnum
CREATE TYPE "OrigineEcriture" AS ENUM ('SYSTEME', 'ADMIN', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "StatutCommande" AS ENUM ('EN_ATTENTE_PAIEMENT', 'CONFIRMEE', 'EN_PREPARATION', 'EXPEDIEE', 'LIVREE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "StatutPaiement" AS ENUM ('EN_ATTENTE', 'REUSSI', 'ECHOUE', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE');

-- CreateEnum
CREATE TYPE "StatutTraitementEvenement" AS ENUM ('RECU', 'TRAITE', 'IGNORE', 'ECHOUE');

-- CreateEnum
CREATE TYPE "ModeLivraison" AS ENUM ('POINT_RELAIS', 'LOCKER', 'DOMICILE');

-- CreateEnum
CREATE TYPE "StatutRetractation" AS ENUM ('DEPOSEE', 'ACCUSEE', 'RETOUR_ATTENDU', 'EXPEDITION_PROUVEE', 'REMBOURSEMENT_EN_COURS', 'REMBOURSEE', 'REFUSEE');

-- CreateEnum
CREATE TYPE "PorteeJeton" AS ENUM ('DOCUMENT', 'RETRACTATION', 'SUIVI', 'AVIS');

-- CreateEnum
CREATE TYPE "StatutAvis" AS ENUM ('DEPOSE', 'PUBLIE', 'REFUSE', 'RETIRE');

-- CreateEnum
CREATE TYPE "StatutEmail" AS ENUM ('ENVOYE', 'ECHOUE');

-- CreateEnum
CREATE TYPE "GraviteAlerte" AS ENUM ('AVERTISSEMENT', 'CRITIQUE');

-- CreateTable
CREATE TABLE "categorie" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produit" (
    "id" TEXT NOT NULL,
    "categorie_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description_courte" TEXT,
    "statut" "StatutProduit" NOT NULL DEFAULT 'BROUILLON',
    "publie_a" TIMESTAMPTZ(3),
    "archive_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_a" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_produit" (
    "id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_a" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "section_produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variante" (
    "id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dimensions" TEXT,
    "prix_centimes" INTEGER NOT NULL,
    "quantite_physique" INTEGER NOT NULL,
    "quantite_reservee" INTEGER NOT NULL DEFAULT 0,
    "vente_web_activee" BOOLEAN NOT NULL DEFAULT true,
    "archivee_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "texte_alternatif" TEXT,
    "ordre" INTEGER NOT NULL,
    "statut_traitement" "StatutTraitementMedia" NOT NULL DEFAULT 'EN_ATTENTE',
    "identifiant_fournisseur" TEXT,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation" (
    "id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "expire_a" TIMESTAMPTZ(3) NOT NULL,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvement_stock" (
    "id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "commande_id" TEXT,
    "type" "TypeMouvementStock" NOT NULL,
    "quantite" INTEGER NOT NULL,
    "canal" TEXT,
    "prix_unitaire_fige_centimes" INTEGER,
    "motif" TEXT,
    "acteur_id" TEXT,
    "origine" "OrigineEcriture" NOT NULL,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mouvement_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commande" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "statut" "StatutCommande" NOT NULL DEFAULT 'EN_ATTENTE_PAIEMENT',
    "email_normalise" TEXT NOT NULL,
    "nom_client" TEXT NOT NULL,
    "telephone" TEXT,
    "utilisateur_id" TEXT,
    "dissocie_a" TIMESTAMPTZ(3),
    "adresse_livraison" JSONB NOT NULL,
    "adresse_facturation" JSONB NOT NULL,
    "sous_total_centimes" INTEGER NOT NULL,
    "mode_livraison" "ModeLivraison" NOT NULL,
    "point_relais_id" TEXT,
    "point_relais_adresse" JSONB,
    "frais_port_centimes" INTEGER NOT NULL,
    "total_centimes" INTEGER NOT NULL,
    "montant_taxe_centimes" INTEGER NOT NULL DEFAULT 0,
    "cgv_acceptees_a" TIMESTAMPTZ(3) NOT NULL,
    "cgv_version" TEXT NOT NULL,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_commande" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "variante_id" TEXT,
    "reference_figee" TEXT NOT NULL,
    "libelle_produit_fige" TEXT NOT NULL,
    "libelle_variante_fige" TEXT NOT NULL,
    "prix_fige_centimes" INTEGER NOT NULL,
    "quantite" INTEGER NOT NULL,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ligne_commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "statut" "StatutPaiement" NOT NULL DEFAULT 'EN_ATTENTE',
    "montant_centimes" INTEGER NOT NULL,
    "montant_rembourse_centimes" INTEGER NOT NULL DEFAULT 0,
    "identifiant_fournisseur" TEXT,
    "motif_echec" TEXT,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirme_a" TIMESTAMPTZ(3),

    CONSTRAINT "paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenement_fournisseur" (
    "id" TEXT NOT NULL,
    "paiement_id" TEXT,
    "identifiant_fournisseur" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "charge" JSONB NOT NULL,
    "statut_traitement" "StatutTraitementEvenement" NOT NULL DEFAULT 'RECU',
    "traite_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historique_statut" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "statut_precedent" TEXT,
    "statut_nouveau" TEXT NOT NULL,
    "acteur_id" TEXT,
    "origine" "OrigineEcriture" NOT NULL,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historique_statut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expedition" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "transporteur" TEXT NOT NULL,
    "mode" "ModeLivraison" NOT NULL,
    "numero_suivi" TEXT,
    "point_relais_id" TEXT,
    "statut_transporteur" TEXT,
    "expedie_a" TIMESTAMPTZ(3),
    "livre_a" TIMESTAMPTZ(3),
    "synchronise_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expedition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adresse_carnet" (
    "id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "libelle" TEXT,
    "nom_complet" TEXT NOT NULL,
    "ligne1" TEXT NOT NULL,
    "ligne2" TEXT,
    "code_postal" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "pays" TEXT NOT NULL,
    "telephone" TEXT,
    "est_par_defaut" BOOLEAN NOT NULL DEFAULT false,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adresse_carnet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facture" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "montant_total_centimes" INTEGER NOT NULL,
    "montant_avoir_centimes" INTEGER NOT NULL DEFAULT 0,
    "instantane_legal" JSONB NOT NULL,
    "chemin_pdf" TEXT,
    "emise_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avoir" (
    "id" TEXT NOT NULL,
    "facture_id" TEXT NOT NULL,
    "demande_retractation_id" TEXT,
    "numero" TEXT NOT NULL,
    "montant_centimes" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "instantane_legal" JSONB NOT NULL,
    "chemin_pdf" TEXT,
    "emis_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avoir_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demande_retractation" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "statut" "StatutRetractation" NOT NULL DEFAULT 'DEPOSEE',
    "motif_client" TEXT,
    "motif_decision" TEXT,
    "montant_rembourse_centimes" INTEGER,
    "deposee_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accusee_a" TIMESTAMPTZ(3),
    "retour_attendu_a" TIMESTAMPTZ(3),
    "preuve_expedition_retour" TEXT,
    "preuve_expedition_a" TIMESTAMPTZ(3),
    "recue_a" TIMESTAMPTZ(3),

    CONSTRAINT "demande_retractation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jeton_acces" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "portee" "PorteeJeton" NOT NULL,
    "expire_a" TIMESTAMPTZ(3) NOT NULL,
    "utilise_a" TIMESTAMPTZ(3),
    "revoque_a" TIMESTAMPTZ(3),

    CONSTRAINT "jeton_acces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avis" (
    "id" TEXT NOT NULL,
    "ligne_commande_id" TEXT NOT NULL,
    "utilisateur_id" TEXT,
    "note" INTEGER NOT NULL,
    "commentaire" TEXT,
    "statut" "StatutAvis" NOT NULL DEFAULT 'DEPOSE',
    "motif_decision" TEXT,
    "experience_a" TIMESTAMPTZ(3) NOT NULL,
    "depose_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publie_a" TIMESTAMPTZ(3),
    "decide_a" TIMESTAMPTZ(3),
    "modifie_a" TIMESTAMPTZ(3),

    CONSTRAINT "avis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reponse_avis" (
    "id" TEXT NOT NULL,
    "avis_id" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "auteur_id" TEXT NOT NULL,
    "publiee_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiee_a" TIMESTAMPTZ(3),

    CONSTRAINT "reponse_avis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_avis" (
    "id" TEXT NOT NULL,
    "ligne_commande_id" TEXT NOT NULL,
    "jeton_acces_id" TEXT NOT NULL,
    "nombre_envois" INTEGER NOT NULL DEFAULT 0,
    "dernier_envoi_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_avis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "email_verifie" BOOLEAN NOT NULL DEFAULT false,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_audit" (
    "id" TEXT NOT NULL,
    "acteur_id" TEXT,
    "action" TEXT NOT NULL,
    "type_cible" TEXT NOT NULL,
    "id_cible" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "adresse_ip" TEXT,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_email" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT,
    "destinataire" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "statut" "StatutEmail" NOT NULL,
    "origine" "OrigineEcriture" NOT NULL,
    "motif_echec" TEXT,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerte_critique" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "gravite" "GraviteAlerte" NOT NULL,
    "type_cible" TEXT,
    "id_cible" TEXT,
    "acquittee_a" TIMESTAMPTZ(3),
    "acquittee_par_id" TEXT,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerte_critique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verrou_tache" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "acquis_a" TIMESTAMPTZ(3) NOT NULL,
    "expire_a" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verrou_tache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorie_slug_key" ON "categorie"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "produit_slug_key" ON "produit"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "section_produit_cle_unique" ON "section_produit"("produit_id", "cle");

-- CreateIndex
CREATE UNIQUE INDEX "variante_reference_key" ON "variante"("reference");

-- CreateIndex
CREATE INDEX "variante_produit_idx" ON "variante"("produit_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_identifiant_fournisseur_key" ON "media"("identifiant_fournisseur");

-- CreateIndex
CREATE UNIQUE INDEX "media_principal_unique" ON "media"("produit_id") WHERE (ordre = 1);

-- CreateIndex
CREATE INDEX "reservation_expire_idx" ON "reservation"("expire_a");

-- CreateIndex
CREATE INDEX "reservation_variante_idx" ON "reservation"("variante_id");

-- CreateIndex
CREATE INDEX "reservation_commande_idx" ON "reservation"("commande_id");

-- CreateIndex
CREATE INDEX "mouvement_variante_idx" ON "mouvement_stock"("variante_id");

-- CreateIndex
CREATE INDEX "mouvement_periode_idx" ON "mouvement_stock"("cree_a", "type");

-- CreateIndex
CREATE UNIQUE INDEX "mouvement_vente_web_unique" ON "mouvement_stock"("commande_id", "variante_id") WHERE (type = 'VENTE_WEB');

-- CreateIndex
CREATE UNIQUE INDEX "commande_numero_key" ON "commande"("numero");

-- CreateIndex
CREATE INDEX "commande_email_idx" ON "commande"("email_normalise");

-- CreateIndex
CREATE INDEX "ligne_commande_commande_idx" ON "ligne_commande"("commande_id");

-- CreateIndex
CREATE INDEX "ligne_commande_variante_idx" ON "ligne_commande"("variante_id");

-- CreateIndex
CREATE INDEX "paiement_commande_idx" ON "paiement"("commande_id");

-- CreateIndex
CREATE UNIQUE INDEX "paiement_reussi_unique" ON "paiement"("commande_id") WHERE (statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'));

-- CreateIndex
CREATE UNIQUE INDEX "evenement_fournisseur_identifiant_fournisseur_key" ON "evenement_fournisseur"("identifiant_fournisseur");

-- CreateIndex
CREATE INDEX "historique_commande_idx" ON "historique_statut"("commande_id");

-- CreateIndex
CREATE UNIQUE INDEX "expedition_commande_id_key" ON "expedition"("commande_id");

-- CreateIndex
CREATE UNIQUE INDEX "adresse_defaut_unique" ON "adresse_carnet"("utilisateur_id") WHERE (est_par_defaut);

-- CreateIndex
CREATE UNIQUE INDEX "facture_commande_id_key" ON "facture"("commande_id");

-- CreateIndex
CREATE UNIQUE INDEX "facture_numero_key" ON "facture"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "avoir_numero_key" ON "avoir"("numero");

-- CreateIndex
CREATE INDEX "avoir_facture_idx" ON "avoir"("facture_id");

-- CreateIndex
CREATE UNIQUE INDEX "demande_retractation_commande_id_key" ON "demande_retractation"("commande_id");

-- CreateIndex
CREATE UNIQUE INDEX "jeton_acces_empreinte_key" ON "jeton_acces"("empreinte");

-- CreateIndex
CREATE INDEX "jeton_commande_idx" ON "jeton_acces"("commande_id");

-- CreateIndex
CREATE UNIQUE INDEX "avis_ligne_commande_id_key" ON "avis"("ligne_commande_id");

-- CreateIndex
CREATE UNIQUE INDEX "reponse_avis_avis_id_key" ON "reponse_avis"("avis_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_avis_ligne_commande_id_key" ON "invitation_avis"("ligne_commande_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_avis_jeton_acces_id_key" ON "invitation_avis"("jeton_acces_id");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_administratrice_unique" ON "utilisateur"("role") WHERE (role = 'ADMINISTRATRICE');

-- CreateIndex
CREATE UNIQUE INDEX "journal_email_systeme_unique" ON "journal_email"("commande_id", "modele") WHERE (statut = 'ENVOYE' AND origine IN ('SYSTEME','RECONCILIATION'));

-- CreateIndex
CREATE UNIQUE INDEX "verrou_tache_nom_key" ON "verrou_tache"("nom");

-- AddForeignKey
ALTER TABLE "produit" ADD CONSTRAINT "produit_categorie_id_fkey" FOREIGN KEY ("categorie_id") REFERENCES "categorie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_produit" ADD CONSTRAINT "section_produit_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variante" ADD CONSTRAINT "variante_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_commande" ADD CONSTRAINT "ligne_commande_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_commande" ADD CONSTRAINT "ligne_commande_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenement_fournisseur" ADD CONSTRAINT "evenement_fournisseur_paiement_id_fkey" FOREIGN KEY ("paiement_id") REFERENCES "paiement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_statut" ADD CONSTRAINT "historique_statut_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_statut" ADD CONSTRAINT "historique_statut_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expedition" ADD CONSTRAINT "expedition_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adresse_carnet" ADD CONSTRAINT "adresse_carnet_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture" ADD CONSTRAINT "facture_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avoir" ADD CONSTRAINT "avoir_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avoir" ADD CONSTRAINT "avoir_demande_retractation_id_fkey" FOREIGN KEY ("demande_retractation_id") REFERENCES "demande_retractation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_retractation" ADD CONSTRAINT "demande_retractation_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeton_acces" ADD CONSTRAINT "jeton_acces_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avis" ADD CONSTRAINT "avis_ligne_commande_id_fkey" FOREIGN KEY ("ligne_commande_id") REFERENCES "ligne_commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avis" ADD CONSTRAINT "avis_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reponse_avis" ADD CONSTRAINT "reponse_avis_avis_id_fkey" FOREIGN KEY ("avis_id") REFERENCES "avis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reponse_avis" ADD CONSTRAINT "reponse_avis_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_avis" ADD CONSTRAINT "invitation_avis_ligne_commande_id_fkey" FOREIGN KEY ("ligne_commande_id") REFERENCES "ligne_commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_avis" ADD CONSTRAINT "invitation_avis_jeton_acces_id_fkey" FOREIGN KEY ("jeton_acces_id") REFERENCES "jeton_acces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_email" ADD CONSTRAINT "journal_email_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerte_critique" ADD CONSTRAINT "alerte_critique_acquittee_par_id_fkey" FOREIGN KEY ("acquittee_par_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
