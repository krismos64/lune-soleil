-- LS-51 et LS-82, ADR-033 : l'outbox transactionnelle des emails.
--
-- CE QUE CETTE MIGRATION FERME. `journal_email_systeme_unique` protege la base,
-- pas l'appel au serveur SMTP. Le scenario qui passait entre les mailles : le
-- message part, le processus tombe avant d'ecrire la ligne `ENVOYE`, la reprise
-- ne trouve rien qui la bloque, et le client recoit une SECONDE confirmation de
-- commande. La meme faille existait en sens inverse, une coupure reseau apres
-- acceptation du message faisant retenter un envoi deja parti.
--
-- L'intention d'envoi s'ecrit desormais dans la transaction qui produit l'effet
-- metier, et une tache planifiee la consomme. Les deux existent, ou aucune.
--
-- ELLE NE REMPLACE PAS `journal_email`, qui reste le journal de ce qui est
-- parti et se conserve. Celle-ci porte ce qui DOIT partir, et se purge.

-- CreateEnum
--
-- ENVOI_EN_COURS EST UN ETAT AMBIGU, ET C'EST VOULU. Il est pose et commite
-- AVANT l'appel SMTP : une ligne qui y reste signifie que personne ne sait si
-- le message est parti. Elle n'est jamais rejouee automatiquement, sans quoi le
-- doublon que cette table ferme se rouvrirait a un autre endroit. Au-dela du
-- delai de garde, elle est signalee et l'administratrice tranche par le renvoi
-- manuel, regle E6.
--
-- ECHOUE est different : l'appel a rendu une erreur, donc le message n'est pas
-- parti, et la retentative est sure.
CREATE TYPE "StatutEnvoi" AS ENUM ('EN_ATTENTE', 'ENVOI_EN_COURS', 'ENVOYE', 'ECHOUE');

-- CreateTable
--
-- Le contenu du message n'est PAS stocke, seulement de quoi le reconstruire :
-- le modele et ses variables, precaution 3 d'ADR-008. `variables` ne porte
-- jamais de secret, invariant 9.
--
-- `prise_a` rend le delai de garde mesurable : sans lui, une ligne bloquee
-- serait indistinguable d'une ligne prise a l'instant.
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

-- CreateIndex
--
-- PREMIERE LIGNE DE DEFENSE D'ADR-033, celle de `journal_email` restant la
-- seconde. Sans elle, deux transactions metier concurrentes ecriraient deux
-- intentions pour la meme commande et le meme modele : la tache enverrait DEUX
-- messages, et seule la SECONDE ecriture de trace serait refusee, donc trop
-- tard, le client ayant deja recu les deux.
--
-- Le filtre exclut les lignes terminees, et c'est ce qui autorise le renvoi
-- manuel de la regle E6 : une ligne ENVOYE n'occupe plus la cle.
CREATE UNIQUE INDEX "envoi_en_attente_actif_unique" ON "envoi_en_attente"("commande_id", "modele") WHERE (statut IN ('EN_ATTENTE','ENVOI_EN_COURS'));

-- CreateIndex
-- Chemin de lecture de la tache, a chaque cycle.
CREATE INDEX "envoi_en_attente_statut_cree_a" ON "envoi_en_attente"("statut", "cree_a");

-- AddForeignKey
--
-- SET NULL et non CASCADE, comme `journal_email` : la trace d'un envoi survit a
-- la dissociation d'une commande.
ALTER TABLE "envoi_en_attente" ADD CONSTRAINT "envoi_en_attente_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;
