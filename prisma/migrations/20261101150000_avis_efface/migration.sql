-- Effacement d'un avis a la demande de son auteur. LS-305, regle R19.
--
-- AUCUNE LIGNE NE SE SUPPRIME, arbitrage du 23 septembre 2026 (LS-246),
-- reconduit par Christophe le 1er novembre 2026 : l'avis est ANONYMISE. Son
-- commentaire est vide, son lien au compte rompu, et `efface_a` date le geste.
--
-- UNE DATE ET NON UNE VALEUR DE `StatutAvis`, meme raison que l'archivage des
-- messages : l'effacement est independant de la decision de moderation. Un
-- avis refuse puis efface reste refuse.
--
-- LA COLONNE EST LE SEUL MARQUEUR FIABLE. `utilisateur_id` nul et commentaire
-- nul decrivent aussi l'avis sans commentaire d'un compte supprime, qui reste
-- moderable ; un avis efface, lui, ne se republie jamais.
--
-- MIGRATION ADDITIVE, NULLABLE ET SANS DEFAUT : aucune ligne existante n'est
-- touchee, et la contrainte est satisfaite par toutes, `efface_a` y etant nul.
ALTER TABLE "avis" ADD COLUMN "efface_a" TIMESTAMPTZ(3);

ALTER TABLE "avis"
  ADD CONSTRAINT "chk_avis_efface_anonyme"
  CHECK ("efface_a" IS NULL OR ("commentaire" IS NULL AND "utilisateur_id" IS NULL));
