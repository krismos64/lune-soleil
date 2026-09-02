-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

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

-- CreateEnum, LS-97
-- Etat de traitement d'un message de contact. Il ne dit rien du CONTENU, qui
-- est immuable : seul cet etat change apres l'ecriture.
CREATE TYPE "StatutMessage" AS ENUM ('NOUVEAU', 'LU', 'TRAITE');

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

-- ADR-033, LS-82. Etat d'une ligne d'outbox.
--
-- ENVOI_EN_COURS est pose et commite AVANT l'appel SMTP : une ligne qui y reste
-- signifie que personne ne sait si le message est parti. Elle n'est jamais
-- rejouee automatiquement, sans quoi le doublon que cette table ferme se
-- rouvrirait ailleurs.
CREATE TYPE "StatutEnvoi" AS ENUM ('EN_ATTENTE', 'ENVOI_EN_COURS', 'ENVOYE', 'ECHOUE');

-- CreateEnum
CREATE TYPE "GraviteAlerte" AS ENUM ('AVERTISSEMENT', 'CRITIQUE');

-- LS-80, ADR-027 decision 2. Un enum et non un booleen `reussie` : sur un ecran
-- de liste, `ECHEC` se lit sans avoir a se rappeler de quoi `false` est la
-- negation, et un booleen n'aurait pas de place pour le troisieme cas.
--
-- REFUSEE_LIMITATION, ajoutee en relecture : Better Auth rend le 429 dans
-- `onRequest`, donc avant tout hook. Ces tentatives echappaient entierement au
-- journal, et ce sont celles qui caracterisent une attaque automatisee.
CREATE TYPE "IssueConnexion" AS ENUM ('REUSSITE', 'ECHEC', 'REFUSEE_LIMITATION');

-- ADR-021 pose la passkey en principal et le mot de passe en secours. Sans ce
-- champ, le journal ne dirait pas si le secours a servi, alors que son usage
-- repete est le signal qui doit alerter.
CREATE TYPE "MoyenConnexion" AS ENUM ('PASSKEY', 'MOT_DE_PASSE');

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
    -- ADR-026, LS-76 : les colonnes "description", "matieres", "entretien" et
    -- "fabrication" sont devenues des lignes de "section_produit".
    "statut" "StatutProduit" NOT NULL DEFAULT 'BROUILLON',
    "publie_a" TIMESTAMPTZ(3),
    "archive_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_a" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "produit_pkey" PRIMARY KEY ("id")
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
-- ADR-026, LS-76. Contenu editorial ordonne de la fiche produit.
-- L'unicite de (produit_id, ordre) est DIFFERABLE, elle vit donc dans
-- 002_contraintes_unicite.sql et non ici : Prisma ne sait pas l'exprimer.
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
    -- LS-63. Prix réellement pratiqué au moment de la vente, figé. Obligatoire
    -- sur VENTE_EXTERNE par contrainte CHECK, voir 001_contraintes_check.sql.
    "prix_unitaire_fige_centimes" INTEGER,
    "motif" TEXT,
    "acteur_id" TEXT,
    "origine" "OrigineEcriture" NOT NULL,
    -- LS-106, S15 et ADR-030. Le mouvement que celui-ci compense, nul sur un
    -- mouvement ordinaire. L'unicité partielle plus bas en fait une garantie :
    -- un mouvement ne se compense qu'une fois.
    "compense_id" TEXT,
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
    -- LS-76. Confirmation effective de l'encaissement, distincte de "cree_a" qui
    -- date la tentative. Date de rattachement des ventes en ligne.
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
--
-- LS-128. L'intention de remboursement, ecrite AVANT l'appel au prestataire.
-- L'unicite (facture_id, cle_idempotence) serialise deux demandes identiques
-- concurrentes : sans elle, les deux partaient et l'argent sortait deux fois.
CREATE TABLE "intention_remboursement" (
    "id" TEXT NOT NULL,
    "facture_id" TEXT NOT NULL,
    "cle_idempotence" TEXT NOT NULL,
    "montant_centimes" INTEGER NOT NULL,
    "aboutie_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intention_remboursement_pkey" PRIMARY KEY ("id")
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
    -- LS-70. Les trois colonnes attendues par Better Auth. `nom` est nullable
    -- alors que la bibliotheque declare `name` requis : sa route d'inscription
    -- en exige toujours un, aucune ligne qu'elle ecrit ne le laisse vide.
    "nom" TEXT,
    "image" TEXT,
    "mis_a_jour_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Domaine 7 bis, authentification, LS-70
--
-- Quatre tables attendues par Better Auth 1.6, ADR-021 et ADR-023. Leurs NOMS
-- DE CHAMPS restent en camelCase anglais, ce sont les cles de son protocole et
-- non des champs metier ; seuls les noms de tables suivent la convention.
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    -- Derniere preuve d'identite sur cette session, LS-81, ADR-027. Nullable
    -- sans defaut : une session qui n'a rien prouve n'ouvre aucune action
    -- sensible, y compris celles deja ouvertes avant la migration.
    "reauthentifiee_le" TIMESTAMPTZ(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- `password` porte une EMPREINTE, jamais le mot de passe, invariant 9.
CREATE TABLE "compte" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "compte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Aucune cle etrangere vers utilisateur : `identifier` porte une adresse email
-- qui n'a pas encore de compte, cas de la verification a l'inscription.
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "public_key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "device_type" TEXT NOT NULL,
    "backed_up" BOOLEAN NOT NULL,
    "transports" TEXT,
    "aaguid" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
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
-- ADR-033, LS-51 et LS-82. Outbox transactionnelle des emails.
--
-- L'intention d'envoi s'ecrit dans la transaction qui produit l'effet metier,
-- une tache planifiee la consomme. `journal_email_systeme_unique` protege la
-- base, pas l'appel SMTP : sans cette table, un processus qui tombe entre
-- l'envoi et l'ecriture de la trace fait recevoir deux confirmations au client.
--
-- Le contenu du message n'est pas stocke, seulement de quoi le reconstruire.
CREATE TABLE "envoi_en_attente" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT,
    "destinataire" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "statut" "StatutEnvoi" NOT NULL DEFAULT 'EN_ATTENTE',
    "origine" "OrigineEcriture" NOT NULL,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "prise_a" TIMESTAMPTZ(3),
    "motif_echec" TEXT,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envoi_en_attente_pkey" PRIMARY KEY ("id")
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
-- Journal des connexions, LS-80, ADR-027 decision 2.
--
-- DISTINCT DE `journal_audit`, qui exige `type_cible`, `id_cible` et un
-- `detail` non nul et dont l'acteur designe un compte existant. Une tentative
-- echouee sur une adresse inconnue n'a ni cible ni acteur.
--
-- AUCUNE COLONNE NE PEUT RECEVOIR UN MOT DE PASSE, et c'est voulu : les
-- erreurs de saisie sont a un caractere du vrai mot de passe.
CREATE TABLE "journal_connexion" (
    "id" TEXT NOT NULL,
    "utilisateur_id" TEXT,
    "email_tente" TEXT NOT NULL,
    "moyen" "MoyenConnexion" NOT NULL,
    "issue" "IssueConnexion" NOT NULL,
    -- Nullable, et une valeur nulle est NORMALE : Better Auth 1.6.21 refuse une
    -- chaine X-Forwarded-For a plusieurs sauts sans proxy de confiance declare.
    "adresse_ip" TEXT,
    "agent_utilisateur" TEXT,
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_connexion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verrou_tache" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "acquis_a" TIMESTAMPTZ(3) NOT NULL,
    "expire_a" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verrou_tache_pkey" PRIMARY KEY ("id")
);

-- CreateTable, LS-117 et ADR-031
--
-- La numerotation des documents sequentiels, une ligne par type et par annee.
-- Le verrou de ligne de l'`UPDATE` est le mecanisme : la transaction annulee
-- rend le numero avec elle, la ou une `SEQUENCE` non transactionnelle laisserait
-- un trou a chaque refus de stock.
CREATE TABLE "compteur_numero" (
    "type" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL,

    CONSTRAINT "compteur_numero_pkey" PRIMARY KEY ("type","annee")
);

-- CreateTable, LS-97
--
-- Le message de contact, persiste AVANT toute tentative d'envoi d'email. Dette
-- annoncee par `MODELE-CONCEPTUEL.md` et enfin portee.
--
-- AUCUNE CLE ETRANGERE, ET C'EST DELIBERE. Le formulaire est PUBLIC : personne
-- n'est connecte, et rapprocher le message d'un compte par l'adresse email
-- inventerait une donnee que le visiteur n'a pas fournie.
--
-- CONSERVATION : trois ans, referentiel CNIL n° 2021-131, meme ancrage que T2.
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "statut" "StatutMessage" NOT NULL DEFAULT 'NOUVEAU',
    "lu_a" TIMESTAMPTZ(3),
    "traite_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex, LS-97
CREATE INDEX "message_statut_cree_a" ON "message"("statut", "cree_a");

-- CreateIndex, LS-97, la purge de retention balaie par date seule.
CREATE INDEX "message_cree_a" ON "message"("cree_a");

-- CreateIndex
CREATE UNIQUE INDEX "categorie_slug_key" ON "categorie"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "produit_slug_key" ON "produit"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "variante_reference_key" ON "variante"("reference");

-- CreateIndex
CREATE INDEX "variante_produit_idx" ON "variante"("produit_id");

-- CreateIndex
-- ADR-026, C20. L'unicite de (produit_id, cle) est ordinaire : renommer une
-- section ne touche pas sa cle, aucun echange de valeurs n'a donc lieu ici.
-- L'unicite de (produit_id, ordre) est DEFERRABLE et vit dans
-- 002_contraintes_unicite.sql.
--
-- Aucun index sur "produit_id" seul : mesure redondante, les deux unicites le
-- portent en prefixe gauche.
CREATE UNIQUE INDEX "section_produit_cle_unique" ON "section_produit"("produit_id", "cle");

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
-- LS-63. Les statistiques et le futur e-reporting de LS-35 bornent une période
-- puis regroupent par type. Sans cet index, chaque calcul balaie tout le journal.
CREATE INDEX "mouvement_periode_idx" ON "mouvement_stock"("cree_a", "type");

-- CreateIndex
CREATE UNIQUE INDEX "mouvement_vente_web_unique" ON "mouvement_stock"("commande_id", "variante_id") WHERE (type = 'VENTE_WEB');

-- CreateIndex
-- LS-106, S15 et ADR-030. Un mouvement ne se compense qu'une fois, et c'est la
-- BASE qui le garantit : deux corrections simultanées ne peuvent pas passer
-- toutes les deux. Le prédicat est indispensable, sans lui l'index couvrirait
-- l'intégralité du journal pour ne servir qu'aux rares lignes de compensation.
CREATE UNIQUE INDEX "mouvement_compense_unique" ON "mouvement_stock"("compense_id") WHERE (compense_id IS NOT NULL);

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
-- LS-45. Le prédicat couvre les trois états d'encaissement, pas le seul REUSSI.
-- Un paiement remboursé reste un paiement encaissé : filtrer sur REUSSI seul
-- laissait un paiement quitter le filtre en passant à PARTIELLEMENT_REMBOURSE,
-- rouvrant la commande à un second REUSSI. Prouvé, 3220 centimes encaissés sur
-- une commande de 1610.
CREATE UNIQUE INDEX "paiement_reussi_unique" ON "paiement"("commande_id")
  WHERE (statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'));

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

-- LS-128. LA CLE PORTE LES DEUX COLONNES : la meme cle sur deux factures
-- differentes est legitime, la meme cle sur la meme facture ne l'est pas.
CREATE UNIQUE INDEX "intention_remboursement_unique" ON "intention_remboursement"("facture_id", "cle_idempotence");
CREATE INDEX "intention_remboursement_facture_idx" ON "intention_remboursement"("facture_id");

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

-- CreateIndex, authentification, LS-70
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");
CREATE INDEX "session_user_id_idx" ON "session"("user_id");
CREATE INDEX "compte_user_id_idx" ON "compte"("user_id");
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
CREATE INDEX "passkey_user_id_idx" ON "passkey"("user_id");

-- UNIQUE et non un simple index, plus strict que le schema de reference du
-- plugin passkey. Une credential WebAuthn est unique par construction, rien en
-- base ne l'imposait : deux comptes pouvaient porter la meme, et la recherche
-- par credential a la connexion aurait eu deux comptes a departager. C'est le
-- risque d'acces croise qu'ADR-021 demande de couvrir.
CREATE UNIQUE INDEX "passkey_credential_id_unique" ON "passkey"("credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "journal_email_systeme_unique" ON "journal_email"("commande_id", "modele") WHERE (statut = 'ENVOYE' AND origine IN ('SYSTEME','RECONCILIATION'));

-- CreateIndex
-- ADR-033, premiere ligne de defense, celle de journal_email restant la
-- seconde. Sans elle, deux transactions metier concurrentes ecriraient deux
-- intentions pour la meme commande : la tache enverrait DEUX messages, et seule
-- la seconde ecriture de trace serait refusee, trop tard.
--
-- Le filtre exclut les lignes terminees, ce qui laisse le renvoi manuel de la
-- regle E6 possible : une ligne ENVOYE n'occupe plus la cle.
CREATE UNIQUE INDEX "envoi_en_attente_actif_unique" ON "envoi_en_attente"("commande_id", "modele") WHERE (statut IN ('EN_ATTENTE','ENVOI_EN_COURS'));

-- CreateIndex
CREATE INDEX "envoi_en_attente_statut_cree_a" ON "envoi_en_attente"("statut", "cree_a");

-- CreateIndex
CREATE UNIQUE INDEX "verrou_tache_nom_key" ON "verrou_tache"("nom");

-- CreateIndex, LS-80. Le premier sert la purge par anteriorite, regle E14, le
-- second l'ecran d'administration qui liste par compte du plus recent au plus
-- ancien.
CREATE INDEX "journal_connexion_cree_a_idx" ON "journal_connexion"("cree_a");
CREATE INDEX "journal_connexion_utilisateur_id_cree_a_idx" ON "journal_connexion"("utilisateur_id", "cree_a");

-- AddForeignKey
ALTER TABLE "produit" ADD CONSTRAINT "produit_categorie_id_fkey" FOREIGN KEY ("categorie_id") REFERENCES "categorie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variante" ADD CONSTRAINT "variante_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- ADR-026 : CASCADE, une section n'a aucun sens sans son produit et n'est
-- referencee par aucune commande, contrairement a une variante.
ALTER TABLE "section_produit" ADD CONSTRAINT "section_produit_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- ADR-024, LS-53. Restrict et non SET NULL : la colonne est obligatoire depuis
-- que la réservation et la commande s'écrivent dans une seule transaction.
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT et non CASCADE : un mouvement corrigé ne peut pas disparaître en
-- laissant sa correction orpheline. Théorique, S4 interdisant toute
-- suppression, mais une clé permissive affaiblirait la règle pour rien.
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_compense_id_fkey" FOREIGN KEY ("compense_id") REFERENCES "mouvement_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "intention_remboursement" ADD CONSTRAINT "intention_remboursement_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
-- SET NULL et non CASCADE, LS-80 : si supprimer un compte effacait son
-- historique de connexions, un intrus effacerait ses traces en supprimant le
-- compte qu'il vient de compromettre.
ALTER TABLE "journal_connexion" ADD CONSTRAINT "journal_connexion_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_email" ADD CONSTRAINT "journal_email_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "envoi_en_attente" ADD CONSTRAINT "envoi_en_attente_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerte_critique" ADD CONSTRAINT "alerte_critique_acquittee_par_id_fkey" FOREIGN KEY ("acquittee_par_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey, authentification, LS-70
--
-- CASCADE sur les trois : session, compte et passkey sont des moyens d'acces,
-- ils n'ont aucune valeur sans leur compte. A la difference de
-- commande.utilisateur_id, en SET NULL, une commande devant survivre a la
-- suppression du compte avec `dissocie_a` marque AVANT.
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compte" ADD CONSTRAINT "compte_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

