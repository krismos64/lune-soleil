-- Promotion de catalogue, ADR-051, LS-319. Migration ADDITIVE : deux tables,
-- deux colonnes nullables, aucune donnée existante touchée, aucune promotion
-- activée.

-- AlterTable
ALTER TABLE "ligne_commande" ADD COLUMN "prix_reference_fige_centimes" INTEGER,
ADD COLUMN "promotion_id" TEXT;

-- CreateTable
CREATE TABLE "promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "taux_pourcentage" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "active_depuis" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desactivee_a" TIMESTAMPTZ(3),
    "activee_par_id" TEXT,
    "desactivee_par_id" TEXT,

    CONSTRAINT "promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historique_prix_variante" (
    "id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "ancien_prix_centimes" INTEGER NOT NULL,
    "nouveau_prix_centimes" INTEGER NOT NULL,
    "modifie_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historique_prix_variante_pkey" PRIMARY KEY ("id")
);

-- UNE SEULE PROMOTION ACTIVE À LA FOIS.
CREATE UNIQUE INDEX "promotion_active_unique" ON "promotion"("active") WHERE (active);

-- CreateIndex
CREATE INDEX "historique_prix_variante_idx" ON "historique_prix_variante"("variante_id", "modifie_a");

-- AddForeignKey
ALTER TABLE "ligne_commande" ADD CONSTRAINT "ligne_commande_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_activee_par_id_fkey" FOREIGN KEY ("activee_par_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_desactivee_par_id_fkey" FOREIGN KEY ("desactivee_par_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_prix_variante" ADD CONSTRAINT "historique_prix_variante_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LA PROMOTION EST L'UNE DES PROMOTIONS ÉCRITES DANS LE CODE, liste identique
-- à `PROMOTIONS` de `src/lib/promotion.ts`.
ALTER TABLE "promotion"
  ADD CONSTRAINT "chk_promotion_code_connu"
  CHECK ("code" IN ('BLACK_WEEK'));

ALTER TABLE "promotion"
  ADD CONSTRAINT "chk_promotion_taux"
  CHECK ("taux_pourcentage" BETWEEN 1 AND 90);

-- `active` et l'absence de désactivation disent la même chose, toujours.
ALTER TABLE "promotion"
  ADD CONSTRAINT "chk_promotion_active_coherente"
  CHECK ("active" = ("desactivee_a" IS NULL));

ALTER TABLE "promotion"
  ADD CONSTRAINT "chk_promotion_desactivation_posterieure"
  CHECK ("desactivee_a" IS NULL OR "desactivee_a" >= "active_depuis");

ALTER TABLE "historique_prix_variante"
  ADD CONSTRAINT "chk_historique_prix_variante"
  CHECK ("ancien_prix_centimes" >= 0 AND "nouveau_prix_centimes" >= 0
         AND "ancien_prix_centimes" <> "nouveau_prix_centimes");

-- SANS PROMOTION, NI RÉFÉRENCE NI PROMOTION ; AVEC, LE PRIX PAYÉ EST
-- STRICTEMENT SOUS LE PRIX DE RÉFÉRENCE. Une « réduction » nulle ou négative
-- ne se fige jamais.
ALTER TABLE "ligne_commande"
  ADD CONSTRAINT "chk_ligne_commande_promotion"
  CHECK (("promotion_id" IS NULL AND "prix_reference_fige_centimes" IS NULL)
      OR ("promotion_id" IS NOT NULL AND "prix_reference_fige_centimes" IS NOT NULL
          AND "prix_fige_centimes" < "prix_reference_fige_centimes"));
