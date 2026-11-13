-- Période annoncée de la promotion, réglée par l'exploitante, ADR-051 amendé
-- le 13 novembre 2026, LS-319. Migration ADDITIVE : deux colonnes nullables,
-- initialisées à la période de la Black Week 2026 qu'annonçait le code.

ALTER TABLE "parametre_boutique"
  ADD COLUMN "promotion_debut_annonce" DATE,
  ADD COLUMN "promotion_fin_annonce" DATE;

UPDATE "parametre_boutique"
   SET "promotion_debut_annonce" = DATE '2026-11-23',
       "promotion_fin_annonce" = DATE '2026-11-29'
 WHERE id = true;

-- LES DEUX DATES OU AUCUNE, ET LA FIN NE PRÉCÈDE PAS LE DÉBUT.
ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_periode_promotion"
  CHECK (("promotion_debut_annonce" IS NULL AND "promotion_fin_annonce" IS NULL)
      OR ("promotion_debut_annonce" IS NOT NULL AND "promotion_fin_annonce" IS NOT NULL
          AND "promotion_fin_annonce" >= "promotion_debut_annonce"));
