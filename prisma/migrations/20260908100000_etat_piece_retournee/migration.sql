-- LS-173, parcours 5 etape 9 : l'etat reel de la piece revenue.
--
-- POURQUOI CES COLONNES EXISTENT. `recue_a` dit qu'un colis est ARRIVE, jamais
-- dans quel etat. La regle S8 lie la reintegration de stock au retour PHYSIQUE
-- et a l'etat REEL de la piece : un bijou revenu casse ne retourne pas au
-- catalogue. Sans ces colonnes, une piece declaree perdue serait indistinguable
-- d'une demande jamais traitee, ni l'une ni l'autre ne portant de mouvement.

-- DEUX VALEURS ET NON TROIS. « Pas encore constate » est l'ABSENCE de valeur,
-- la colonne etant nullable. En faire une troisieme valeur d'enum obligerait a
-- la poser des la creation de la demande, et un defaut de mise a jour
-- deviendrait indistinguable d'un etat delibere.
CREATE TYPE "EtatPieceRetournee" AS ENUM ('REMISE_EN_VENTE', 'PERTE_CONSTATEE');

ALTER TABLE "demande_retractation"
  ADD COLUMN "etat_piece_retournee" "EtatPieceRetournee",
  ADD COLUMN "etat_constate_a" TIMESTAMPTZ(3);

-- C41, l'etat et sa date vont ensemble, dans LES DEUX SENS.
--
-- EQUIVALENCE ET NON IMPLICATION, meme forme que C30 : un etat sans date ne
-- dirait pas QUAND la decision a ete prise, une date sans etat affirmerait un
-- constat qui n'a rien conclu. Copier la forme d'un CHECK voisin en gardant une
-- implication laisse passer exactement la moitie des etats incoherents, piege
-- deja rencontre sur ce depot.
--
-- ELLE NE DIT RIEN DE `recue_a`, ET C'EST DELIBERE. La regle L13 decrit le cas
-- d'une piece JAMAIS revenue, qui se declare `PERTE_CONSTATEE` sans que
-- `recue_a` soit renseigne : lier les deux fermerait le seul geste qui solde une
-- demande dont le colis s'est perdu en transit.
ALTER TABLE "demande_retractation"
  ADD CONSTRAINT "chk_retractation_etat_piece_coherent"
  CHECK (
    ("etat_piece_retournee" IS NOT NULL) = ("etat_constate_a" IS NOT NULL)
  );
