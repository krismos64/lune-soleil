-- Promotions libres, LS-324, amendement d'ADR-051 du 14 novembre 2026.
--
-- AUCUNE DONNÉE EXISTANTE N'EST MODIFIÉE : une table neuve, deux colonnes
-- ajoutées, une colonne rendue facultative. Les promotions passées gardent
-- leur taux et la portée `TOUT`, celle de l'époque ; les lignes de commande
-- déjà écrites gardent `taux_reduction_fige` nul et se lisent sur le taux de
-- leur promotion. Aucune promotion n'est activée.

-- La portée : toute la boutique à un taux général, ou les seuls articles
-- choisis. Les promotions passées valaient pour toute la boutique.
ALTER TABLE "promotion" ADD COLUMN "portee" TEXT NOT NULL DEFAULT 'TOUT';

-- Le taux général n'existe que sous la portée `TOUT`.
ALTER TABLE "promotion" ALTER COLUMN "taux_pourcentage" DROP NOT NULL;

-- Le taux appliqué à la ligne, figé avec le prix payé, invariant 3.
ALTER TABLE "ligne_commande" ADD COLUMN "taux_reduction_fige" INTEGER;

-- Le taux d'un article dans une promotion : une ligne par produit choisi.
-- Écrite à l'activation et jamais modifiée ensuite, c'est l'historique.
CREATE TABLE "promotion_produit" (
    "promotion_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "taux_pourcentage" INTEGER NOT NULL,

    CONSTRAINT "promotion_produit_pkey" PRIMARY KEY ("promotion_id","produit_id")
);

-- AddForeignKey
ALTER TABLE "promotion_produit" ADD CONSTRAINT "promotion_produit_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_produit" ADD CONSTRAINT "promotion_produit_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "promotion"
  ADD CONSTRAINT "chk_promotion_portee_connue"
  CHECK ("portee" IN ('TOUT', 'SELECTION'));

-- TOUTE LA BOUTIQUE PORTE UN TAUX GÉNÉRAL, UNE SÉLECTION N'EN PORTE AUCUN :
-- sans cela, un article non choisi hériterait d'un taux que personne n'a saisi.
ALTER TABLE "promotion"
  ADD CONSTRAINT "chk_promotion_portee_taux"
  CHECK (("portee" = 'TOUT' AND "taux_pourcentage" IS NOT NULL)
      OR ("portee" = 'SELECTION' AND "taux_pourcentage" IS NULL));

ALTER TABLE "promotion_produit"
  ADD CONSTRAINT "chk_promotion_produit_taux"
  CHECK ("taux_pourcentage" BETWEEN 1 AND 90);

-- UN TAUX FIGÉ N'EXISTE QUE SUR UNE LIGNE VENDUE SOUS PROMOTION.
ALTER TABLE "ligne_commande"
  ADD CONSTRAINT "chk_ligne_commande_taux_reduction"
  CHECK ("taux_reduction_fige" IS NULL
      OR ("promotion_id" IS NOT NULL AND "taux_reduction_fige" BETWEEN 1 AND 90));

-- Le nom de l'opération reste une liste fermée, élargie. Remplacer une
-- contrainte CHECK passe par un DROP CONSTRAINT : `migrate-production.sh`
-- classe donc cette migration destructive. Toute valeur présente reste admise.
ALTER TABLE "promotion"
  DROP CONSTRAINT "chk_promotion_code_connu";

ALTER TABLE "promotion"
  ADD CONSTRAINT "chk_promotion_code_connu"
  CHECK ("code" IN (
    'BLACK_WEEK', 'SOLDES_HIVER', 'SOLDES_ETE', 'SAINT_VALENTIN',
    'JOURNEE_FEMMES', 'OCTOBRE_ROSE', 'NOVEMBRE_BLEU', 'NOEL', 'PROMOTION'
  ));
