-- LS-128, ADR-032 : l'intention de remboursement, ecrite AVANT l'appel au
-- prestataire.
--
-- CE QUE CETTE MIGRATION FERME, defaut trouve par la revue critique le
-- 1er septembre 2026 et mesure. La cle d'idempotence du remboursement etait
-- derivee de `facture.montant_avoir_centimes`, LU HORS TRANSACTION avant
-- l'appel reseau. Deux remboursements concurrents identiques, un double clic
-- ou deux onglets, lisent donc le MEME cumul et derivent la MEME cle.
--
-- L'idempotence de Stripe n'est pas un verrou : deux requetes portant la meme
-- cle ARRIVANT EN PARALLELE ne rendent pas la meme reponse, la seconde recoit
-- `idempotency_key_in_use`. Le code la classait en refus definitif, donc
-- l'exploitante relancait ; le cumul avait alors bouge, la cle changeait, et
-- un SECOND remboursement REEL partait. Mesure : 4000 centimes rendus pour
-- 2000 voulus.
--
-- LE `CHECK` chk_facture_avoir_borne NE RATTRAPE PAS CE CAS. Il protege
-- l'ecriture comptable, F9 tient, mais il se declenche APRES que l'argent est
-- parti : la transaction d'avoir avorte sur une sortie d'argent deja faite.
--
-- L'UNICITE EST LE MECANISME, pas la table. Deux intentions identiques
-- concurrentes : la seconde prend une violation d'unicite AVANT tout appel
-- reseau, et sort en refus lisible sans qu'un centime ne bouge.
--
-- AUCUN VERROU N'EST TENU PENDANT L'APPEL RESEAU, ce que `database.md`
-- interdit explicitement. L'ecriture de l'intention est une transaction courte
-- qui commite, puis l'appel part : c'est le motif « verrou apres l'appel,
-- legitime ».

-- CreateTable
CREATE TABLE "intention_remboursement" (
    "id" TEXT NOT NULL,
    "facture_id" TEXT NOT NULL,
    "cle_idempotence" TEXT NOT NULL,
    "montant_centimes" INTEGER NOT NULL,
    -- Nul tant que l'appel n'a pas abouti. Une intention sans issue est un
    -- appel dont personne ne sait s'il est parti : cet etat sort par une
    -- alerte, jamais par un rejeu muet, meme regle que ENVOI_EN_COURS.
    "aboutie_a" TIMESTAMPTZ(3),
    "cree_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intention_remboursement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- LA CLE PORTE LES DEUX COLONNES : la meme cle sur deux factures differentes
-- est legitime, la meme cle sur la meme facture ne l'est pas.
CREATE UNIQUE INDEX "intention_remboursement_unique"
  ON "intention_remboursement"("facture_id", "cle_idempotence");

-- CreateIndex
CREATE INDEX "intention_remboursement_facture_idx"
  ON "intention_remboursement"("facture_id");

-- AddForeignKey
--
-- RESTRICT ET NON CASCADE : une facture ne se supprime jamais, invariant 4, et
-- la trace d'un remboursement demande doit survivre a tout.
ALTER TABLE "intention_remboursement"
  ADD CONSTRAINT "intention_remboursement_facture_id_fkey"
  FOREIGN KEY ("facture_id") REFERENCES "facture"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
--
-- UN MONTANT DE REMBOURSEMENT EST STRICTEMENT POSITIF. Une intention a zero ou
-- negative n'a aucun sens metier et rendrait de l'argent a l'envers.
ALTER TABLE "intention_remboursement"
  ADD CONSTRAINT "chk_intention_montant_positif"
  CHECK ("montant_centimes" > 0);
