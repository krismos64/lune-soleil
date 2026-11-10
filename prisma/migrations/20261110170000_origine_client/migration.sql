-- Le client annule lui-meme sa commande en attente. LS-315, ADR-050.
--
-- `historique_statut.origine` distingue une renonciation du client d'une
-- annulation par la reconciliation, regle S9.
--
-- ADDITIVE : une valeur d'enum ajoutee, aucune donnee modifiee. Hors du filtre
-- de `journal_email_systeme_unique`, `origine IN ('SYSTEME','RECONCILIATION')` :
-- aucun email automatique ne porte cette origine.
ALTER TYPE "OrigineEcriture" ADD VALUE 'CLIENT';
