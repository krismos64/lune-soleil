-- LS-106, S15 et ADR-030 : un mouvement de stock ne se compense qu'une fois.
--
-- POURQUOI CETTE MIGRATION EXISTE. La regle S14 impose de corriger une vente
-- externe erronee par un mouvement INVERSE, jamais par une modification, S4
-- rendant le journal immuable. Elle est muette sur deux points :
--
--   1. rien ne RELIE le compensateur au mouvement qu'il corrige, le lien
--      n'existant que dans le texte libre du `motif`
--   2. rien n'empeche donc de compenser DEUX fois la meme vente
--
-- Le second point n'est pas theorique : un double clic, un rechargement ou deux
-- onglets font remonter le stock de deux pieces la ou une seule etait partie.
-- L'inventaire devient faux, et le journal ne permet pas de le voir puisqu'il
-- porte deux corrections en apparence legitimes.
ALTER TABLE "mouvement_stock" ADD COLUMN "compense_id" TEXT;

-- RESTRICT ET NON CASCADE. Un mouvement corrige ne peut pas disparaitre en
-- laissant sa correction orpheline. La question est theorique, S4 interdisant
-- toute suppression, mais une cle etrangere permissive affaiblirait la regle
-- sans rien apporter.
ALTER TABLE "mouvement_stock"
  ADD CONSTRAINT "mouvement_stock_compense_id_fkey"
  FOREIGN KEY ("compense_id") REFERENCES "mouvement_stock"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- S15. LA GARANTIE VIT DANS LA BASE, PAS DANS LE SERVICE. Deux corrections
-- lancees simultanement ne peuvent pas passer toutes les deux, la ou un
-- controle applicatif les laisserait passer entre son SELECT et son INSERT.
-- C'est la meme strategie que l'UPDATE conditionnel de la reservation, ADR-006.
--
-- LE PREDICAT `compense_id IS NOT NULL` EST INDISPENSABLE. PostgreSQL traite
-- les NULL comme distincts, donc un index sans predicat ne rejetterait rien de
-- plus ; il indexerait en revanche l'integralite du journal pour ne servir
-- qu'aux rares lignes de compensation, et le journal ne fait que croitre.
--
-- SEPTIEME INDEX PARTIEL DU PROJET. Le piege associe est connu et rencontre
-- deux fois : un predicat qui change ouvre en silence, sans qu'aucune erreur ne
-- le signale. Ne pas modifier celui-ci sans mesurer ce qu'il laisse passer.
CREATE UNIQUE INDEX "mouvement_compense_unique"
  ON "mouvement_stock"("compense_id")
  WHERE (compense_id IS NOT NULL);
