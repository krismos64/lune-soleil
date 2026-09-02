-- LS-97 : le message de contact, persiste AVANT toute tentative d'envoi.
--
-- DETTE ANNONCEE PAR `MODELE-CONCEPTUEL.md` ET ENFIN PORTEE. Une entite
-- `Message` figurait dans une premiere version du document, retiree faute de
-- parcours qui la mobilise, avec renvoi explicite a « un ticket propre, ou sa
-- regle principale devra etre posee ».
--
-- LA REGLE PRINCIPALE EST UN ORDRE D'ECRITURE, QUE LE SCHEMA NE PEUT PAS
-- IMPOSER. Aucune contrainte ne garantit « ecrire en base avant d'appeler le
-- fournisseur » : c'est une propriete du code, prouvee par un test de panne et
-- par la mutation qui inverse les deux instructions. Le schema porte le reste.
--
-- AUCUNE CLE ETRANGERE, ET C'EST DELIBERE. Le formulaire est PUBLIC : personne
-- n'est connecte, et rapprocher le message d'un compte par l'adresse email
-- inventerait une donnee que le visiteur n'a pas fournie. Une adresse saisie
-- n'est pas une identite prouvee, invariant 2.
--
-- CONSERVATION : trois ans a compter du message, referentiel CNIL n° 2021-131,
-- meme ancrage que T2 pour les donnees de prospect. La purge est branchee sur
-- la tache quotidienne existante, LS-94, sans creer de sixieme tache.

-- CreateEnum
CREATE TYPE "StatutMessage" AS ENUM ('NOUVEAU', 'LU', 'TRAITE');

-- CreateTable
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

-- CreateIndex
-- La liste d'administration lit par ce chemin, les nouveaux d'abord.
CREATE INDEX "message_statut_cree_a" ON "message"("statut", "cree_a");

-- CreateIndex
-- La purge de retention balaie par date seule.
CREATE INDEX "message_cree_a" ON "message"("cree_a");

-- ---------------------------------------------------------------------------
-- Contraintes CHECK, recopiees de prisma/sql-manuel/001_contraintes_check.sql
--
-- Prisma ne genere pas les CHECK, rappel d'ADR-006 : la migration doit les
-- porter, sans quoi `migrate deploy` livrerait une table sans ses garde-fous.
-- ---------------------------------------------------------------------------

-- C29, aucun champ du message n'est vide apres retrait des espaces. La
-- validation Zod est le controle principal, ceci la derniere ligne de defense.
ALTER TABLE "message"
  ADD CONSTRAINT "chk_message_champs_non_vides"
  CHECK (
    length(trim(nom)) > 0
    AND length(trim(email)) > 0
    AND length(trim(sujet)) > 0
    AND length(trim(corps)) > 0
  );

-- C30, les horodatages suivent le statut, EQUIVALENCE et non implication : un
-- message traite sans date ne dirait pas quand, et une date sur un message
-- NOUVEAU affirmerait un traitement qui n'a pas eu lieu.
ALTER TABLE "message"
  ADD CONSTRAINT "chk_message_horodatages_coherents"
  CHECK (
    (statut IN ('LU', 'TRAITE')) = (lu_a IS NOT NULL)
    AND (statut = 'TRAITE') = (traite_a IS NOT NULL)
  );
