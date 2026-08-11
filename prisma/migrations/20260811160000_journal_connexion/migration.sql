-- Journal des connexions, LS-80, ADR-027 decision 2.
--
-- MIGRATION ECRITE A LA MAIN, `prisma migrate dev` etant interactif, meme
-- motif que les migrations de LS-70, LS-79 et LS-81.
--
-- PUREMENT ADDITIVE : deux types et une table, aucune suppression, aucune
-- colonne existante touchee. Rien a reecrire sur les lignes deja en base.
--
-- POURQUOI UNE TABLE DEDIEE ET NON `journal_audit`. Ce dernier exige
-- `type_cible`, `id_cible` et un `detail` JSONB non nul, et son `acteur_id`
-- pointe un compte existant. Une tentative echouee sur une adresse inconnue
-- n'a ni cible ni acteur : elle n'y entrerait qu'au prix d'une cible inventee.
--
-- CE QUI N'ENTRE JAMAIS DANS CETTE TABLE : le mot de passe essaye, meme faux.
-- Aucune colonne ne peut le recevoir, et le code qui l'alimente ne lit jamais
-- le champ correspondant de la requete.

-- CreateEnum
CREATE TYPE "IssueConnexion" AS ENUM ('REUSSITE', 'ECHEC');

-- CreateEnum
CREATE TYPE "MoyenConnexion" AS ENUM ('PASSKEY', 'MOT_DE_PASSE');

-- CreateTable
CREATE TABLE "journal_connexion" (
    "id"                TEXT NOT NULL,
    -- NULLABLE : un echec sur une adresse sans compte ne designe personne.
    "utilisateur_id"    TEXT,
    -- L'adresse SAISIE, qui n'est pas toujours celle d'un compte existant.
    "email_tente"       TEXT NOT NULL,
    "moyen"             "MoyenConnexion" NOT NULL,
    "issue"             "IssueConnexion" NOT NULL,
    -- NULLABLE, et une valeur nulle est NORMALE : depuis Better Auth 1.6.21,
    -- une chaine X-Forwarded-For a plusieurs sauts est refusee tant qu'aucun
    -- proxy de confiance n'est declare. Derriere le Nginx du VPS, l'adresse
    -- restera donc nulle jusqu'a la configuration de `trustedProxies`. Un
    -- NOT NULL ferait echouer l'ecriture du journal a chaque connexion.
    "adresse_ip"        TEXT,
    -- Chaine fournie par le client, donc non fiable. Elle n'autorise rien.
    "agent_utilisateur" TEXT,
    "cree_a"            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_connexion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex, sert la purge par anteriorite, regle E14.
CREATE INDEX "journal_connexion_cree_a_idx" ON "journal_connexion"("cree_a");

-- CreateIndex, sert l'ecran d'administration, liste par compte du plus recent
-- au plus ancien.
CREATE INDEX "journal_connexion_utilisateur_id_cree_a_idx" ON "journal_connexion"("utilisateur_id", "cree_a");

-- AddForeignKey
-- SET NULL et non CASCADE, meme motif que `journal_audit` : si supprimer un
-- compte effacait son historique de connexions, un intrus effacerait ses
-- traces en supprimant le compte qu'il vient de compromettre.
ALTER TABLE "journal_connexion" ADD CONSTRAINT "journal_connexion_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
