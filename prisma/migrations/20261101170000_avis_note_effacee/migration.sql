-- La note d'un avis efface est effacee aussi. LS-306, regle R19.
--
-- LS-305 gardait la note d'un avis retire par son auteur, « sans nom ». Reliee
-- a une ligne de commande, donc a un client identifiable, elle restait une
-- donnee personnelle, et aucune finalite ne la justifiait : elle n'est ni
-- affichee ni comptee. Seule reste la trace qu'un avis a existe sur cet achat
-- et a ete retire, qui empeche un second avis (R2) et prouve que la demande a
-- ete respectee.
--
-- AUCUNE COLONNE NI CONTRAINTE N'EST SUPPRIMEE. `DROP NOT NULL` relache une
-- obligation sans rien retirer ; la contrainte de bornage `chk_avis_note_bornee`
-- reste, un CHECK etant satisfait par NULL.
--
-- LA MISE A JOUR PRECEDE LA CONTRAINTE, sans quoi les avis deja effaces depuis
-- le deploiement de LS-305 la feraient echouer.
ALTER TABLE "avis" ALTER COLUMN "note" DROP NOT NULL;

UPDATE "avis" SET "note" = NULL WHERE "efface_a" IS NOT NULL;

ALTER TABLE "avis"
  ADD CONSTRAINT "chk_avis_note_selon_effacement"
  CHECK (("efface_a" IS NULL) = ("note" IS NOT NULL));
