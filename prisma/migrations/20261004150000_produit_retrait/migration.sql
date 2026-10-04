-- Retrait d'un produit archivé de l'espace d'administration. LS-266.
--
-- DEMANDE DE CHRISTOPHE, 4 OCTOBRE 2026 : l'exploitante veut faire disparaître
-- définitivement de son espace un article archivé. Rien ne se supprime en base
-- de production, arbitrage du 23 septembre 2026, LS-246 : le produit reste en
-- base, avec ses variantes, ses médias, et tout ce qui le référence. Seul le
-- développeur le récupère, en remettant cette date à NULL, procédure dans
-- `docs/deploiement/EXPLOITATION.md`.
--
-- UNE DATE ET NON UN BOOLÉEN : elle dit quand, ce qui sert la récupération,
-- « l'article retiré la semaine dernière » se retrouve par sa date.
--
-- MIGRATION ADDITIVE, NULLABLE ET SANS DÉFAUT : PostgreSQL ajoute la colonne
-- sans réécrire la table, et aucun produit existant n'est retiré.
ALTER TABLE "produit" ADD COLUMN "retire_a" TIMESTAMPTZ(3);

-- C45, UN PRODUIT RETIRÉ EST ARCHIVÉ. Implication et non équivalence : un
-- archivé peut rester dans l'espace. Sans cette contrainte, republier un
-- produit retiré le mettrait en vente sur la boutique pendant qu'aucun écran
-- de l'administration ne le montre plus, donc sans moyen de l'en retirer. La
-- base refuse, y compris si le service se trompe ou qu'une publication croise
-- le retrait.
ALTER TABLE "produit"
  ADD CONSTRAINT "chk_produit_retrait_archive"
  CHECK ("retire_a" IS NULL OR "statut" = 'ARCHIVE');
