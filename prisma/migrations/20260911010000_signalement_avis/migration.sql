-- LS-77 : le signalement d'un doute sur l'authenticite d'un avis.
--
-- OBLIGATION LEGALE, article L111-7-2 du Code de la consommation, verifie a
-- Legifrance le 11 septembre 2026, version en vigueur depuis le 17 fevrier
-- 2024 : « Elle met en place une fonctionnalite gratuite qui permet aux
-- responsables des produits ou des services faisant l'objet d'un avis en ligne
-- de lui signaler un doute sur l'authenticite de cet avis, a condition que ce
-- signalement soit motive. »
--
-- TROIS POINTS ETAIENT LAISSES A TRANCHER PAR LE TICKET, et les trois le sont
-- ici.
--
-- QUI PEUT SIGNALER : toute personne, sans compte et sans authentification. Le
-- texte vise « les responsables des produits ou des services », qui ne sont pas
-- des clients de la boutique et n'ont aucun compte ici. Exiger une
-- authentification restreindrait un droit que la loi ouvre. La qualite declaree
-- est enregistree pour que l'exploitante juge, elle n'autorise rien,
-- invariant 2.
--
-- ENTITE PERSISTEE ET NON MESSAGE LIBRE : le texte impose un signalement MOTIVE
-- portant sur un avis PRECIS. Un formulaire de contact ne garantit ni l'un ni
-- l'autre, et rien ne relierait le signalement a l'avis vise.
--
-- DELAI DE TRAITEMENT : aucun n'est annonce, et c'est un choix. Le texte n'en
-- impose pas, contrairement au delai de PUBLICATION d'un avis que l'article
-- D111-10 exige d'annoncer. Annoncer un delai qu'aucune loi n'impose creerait
-- une obligation contractuelle de plus, tenable seulement par une personne qui
-- releve ses signalements entre deux marches.
--
-- LE SIGNALEMENT NE DEPUBLIE RIEN, et aucune contrainte ne le permettrait de
-- toute facon : cette table n'ecrit rien sur `avis`. Une depublication
-- automatique ferait de ce formulaire un moyen de retirer les avis d'un
-- concurrent.
--
-- CONSERVATION : trois ans a compter du signalement, meme ancrage que
-- `message`, referentiel CNIL n° 2021-131. La purge se branche sur la tache
-- quotidienne existante, LS-94, sans creer de tache de plus.

-- CreateEnum
CREATE TYPE "StatutSignalement" AS ENUM ('NOUVEAU', 'EXAMINE', 'RETENU', 'ECARTE');

-- CreateTable
CREATE TABLE "signalement_avis" (
    "id" TEXT NOT NULL,
    "avis_id" TEXT NOT NULL,
    "qualite" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "statut" "StatutSignalement" NOT NULL DEFAULT 'NOUVEAU',
    "suite_donnee" TEXT,
    "examine_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signalement_avis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- La liste d'administration lit par ce chemin, les nouveaux d'abord.
CREATE INDEX "signalement_statut_cree_a" ON "signalement_avis"("statut", "cree_a");

-- CreateIndex
-- Les signalements d'un avis donne, lus depuis l'ecran de moderation.
CREATE INDEX "signalement_avis_idx" ON "signalement_avis"("avis_id");

-- AddForeignKey
-- `RESTRICT` COMME PARTOUT SUR CE DOMAINE : un avis ne se supprime jamais,
-- regle R6, donc cette politique ne bloque aucune suppression legitime.
ALTER TABLE "signalement_avis"
  ADD CONSTRAINT "signalement_avis_avis_id_fkey"
  FOREIGN KEY ("avis_id") REFERENCES "avis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Contraintes CHECK, recopiees de prisma/sql-manuel/001_contraintes_check.sql
--
-- Prisma ne genere pas les CHECK, rappel d'ADR-006 : la migration doit les
-- porter, sans quoi `migrate deploy` livrerait une table sans ses garde-fous.
-- ---------------------------------------------------------------------------

-- C42, LE MOTIF N'EST JAMAIS VIDE, et ce n'est pas une regle de confort : la
-- loi conditionne le signalement au fait qu'il soit MOTIVE. Un signalement sans
-- motif n'est pas un signalement au sens de l'article L111-7-2.
--
-- La validation Zod est le controle principal, ceci la derniere ligne de
-- defense : le formulaire est PUBLIC, donc toute entree y est non fiable.
ALTER TABLE "signalement_avis"
  ADD CONSTRAINT "chk_signalement_champs_non_vides"
  CHECK (
    length(trim(qualite)) > 0
    AND length(trim(email)) > 0
    AND length(trim(motif)) > 0
  );

-- C43, l'horodatage suit le statut, EQUIVALENCE et non implication, meme forme
-- que C30 sur les messages. Un signalement examine sans date ne dirait pas
-- quand, et une date sur un signalement NOUVEAU affirmerait un examen qui n'a
-- pas eu lieu.
--
-- LES TROIS STATUTS D'ARRIVEE SONT CITES et non le seul `EXAMINE` : `RETENU` et
-- `ECARTE` sont eux aussi des examens FAITS. Ne citer qu'`EXAMINE` laisserait
-- passer un signalement retenu sans date, defaut que l'enum rend facile a
-- introduire en ajoutant une valeur.
ALTER TABLE "signalement_avis"
  ADD CONSTRAINT "chk_signalement_horodatage_coherent"
  CHECK (
    (statut IN ('EXAMINE', 'RETENU', 'ECARTE')) = (examine_a IS NOT NULL)
  );

-- C44, UNE SUITE DONNEE SUPPOSE UN EXAMEN. Ecrire ce qu'on a repondu a un
-- signalement qu'on n'a pas examine est incoherent, et l'ecran ne le permet
-- pas : la contrainte ferme le chemin que l'ecran ne montre pas.
--
-- IMPLICATION ET NON EQUIVALENCE, a la difference de C43 : un examen peut
-- parfaitement n'appeler aucune suite ecrite. Copier la forme de C43 ici
-- rendrait la suite OBLIGATOIRE sur tout examen, piege « implication et non
-- equivalence » deja rencontre sur ce depot.
ALTER TABLE "signalement_avis"
  ADD CONSTRAINT "chk_signalement_suite_apres_examen"
  CHECK (suite_donnee IS NULL OR examine_a IS NOT NULL);
