-- Compteur d'echecs par COMPTE VISE. LS-83, ADR-021 mesure 2, ADR-027.
--
-- TABLE PROPRE ET NON `rate_limit`, celle de Better Auth, et c'est une
-- correction de revue. Son limiteur lance `deleteExpiredRows`, un `deleteMany`
-- SANS AUCUN FILTRE DE CLE, des qu'il croise une de SES lignes hors fenetre :
-- le seuil vaut soixante secondes, donc toute ligne du projet plus vieille
-- d'une minute partait avec les siennes. La fenetre de quinze minutes annoncee
-- par le service n'existait pas, et la mesure ne protegeait donc pas contre
-- l'attaque repartie qu'elle vise, lente par construction.
--
-- AUCUNE ADRESSE EMAIL DANS CETTE TABLE, invariant 9. `cle` porte une
-- empreinte SHA-256 tronquee a 32 caracteres : le depot est public, et une
-- fuite de cette table ne doit pas etre une fuite de fichier client.

CREATE TABLE "compteur_compte_vise" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "compte" INTEGER NOT NULL,
    "derniere_a" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compteur_compte_vise_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compteur_compte_vise_cle_key" ON "compteur_compte_vise"("cle");

-- L'INDEX SUR LA DATE SERT LA PURGE, jamais une lecture metier : le service
-- ne lit que par cle. Sans lui, la purge quotidienne balaierait la table
-- entiere, qui grossit precisement sous attaque, c'est-a-dire au pire moment.
CREATE INDEX "compteur_compte_vise_derniere_a_idx" ON "compteur_compte_vise"("derniere_a");

-- LE COMPTE EST STRICTEMENT POSITIF. Une ligne existe parce qu'un echec a eu
-- lieu : un compte nul ou negatif n'a aucun sens metier, et un decompte fautif
-- accorderait des tentatives au lieu d'en retirer. C40.
ALTER TABLE "compteur_compte_vise"
    ADD CONSTRAINT "chk_compteur_compte_vise_positif" CHECK ("compte" >= 1);

-- LA CLE N'EST JAMAIS VIDE, et surtout elle porte une EMPREINTE. Une chaine
-- vide signifierait qu'un appelant a calcule la cle sur rien, donc que tous
-- les comptes partageraient un compteur unique : une seule campagne de
-- balayage ralentirait alors toute personne qui se trompe de mot de passe.
ALTER TABLE "compteur_compte_vise"
    ADD CONSTRAINT "chk_compteur_compte_vise_cle_non_vide" CHECK (length(trim("cle")) > 0);
