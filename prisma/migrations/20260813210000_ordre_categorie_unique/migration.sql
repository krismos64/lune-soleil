-- LS-99, ordre d'affichage des categories.
--
-- POURQUOI CETTE MIGRATION EXISTE. `Categorie.ordre` est au schema depuis LS-13,
-- LS-49 ayant tranche que l'ordre est choisi par l'exploitante et non
-- alphabetique. Rien n'en garantissait l'unicite : deux categories pouvaient
-- porter l'ordre 3, et l'affichage devenait dependant du plan d'execution de
-- PostgreSQL, donc instable sans qu'aucune erreur ne le signale.
--
-- MEME MOTIF QUE C22 sur `section_produit`, pose par LS-67 et mesure sur
-- PostgreSQL 18.4 : voir prisma/sql-manuel/002_contraintes_unicite.sql pour la
-- demonstration complete, qui n'est pas recopiee ici.
--
-- Les deux consequences de C22 valent a l'identique :
--
-- 1. Aucun `@@unique([ordre])` dans schema.prisma. Il creerait une seconde
--    contrainte NON differable sur la meme colonne, qui rejetterait l'echange.
-- 2. Aucun ON CONFLICT ne peut prendre `ordre` comme arbitre, PostgreSQL le
--    refusant sur une contrainte differable. Le reordonnancement s'ecrit en
--    UPDATE dans une transaction, jamais en upsert.
--
-- CE QUI DIFFERE DE C22 : l'unicite porte sur la SEULE colonne `ordre`, sans
-- discriminant. Les categories sont une liste plate, sans niveau intermediaire,
-- retenu par la section « Dimensionnement du catalogue » de frontend-design.md.
-- La ou deux produits peuvent porter le meme rang de section, deux categories ne
-- peuvent pas porter le meme rang d'affichage.
ALTER TABLE "categorie"
  ADD CONSTRAINT "categorie_ordre_unique"
  UNIQUE ("ordre") DEFERRABLE INITIALLY DEFERRED;

-- C24, l'ordre commence a 1. Un ordre nul ou negatif trierait avant tout le
-- reste sans que l'ecran l'ait propose, et rendrait le calcul du rang suivant
-- faux des la premiere creation.
ALTER TABLE "categorie"
  ADD CONSTRAINT "chk_categorie_ordre_positif"
  CHECK ("ordre" >= 1);

-- C25, le nom d'une categorie n'est jamais vide. Il s'affiche dans le menu du
-- catalogue et sur les cartes produit : une chaine vide y produirait un lien
-- invisible mais cliquable.
ALTER TABLE "categorie"
  ADD CONSTRAINT "chk_categorie_nom_non_vide"
  CHECK (length(trim("nom")) > 0);
