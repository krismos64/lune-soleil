-- Parametres commerciaux de la boutique. LS-98, ADR-043.
--
-- CE QUE CETTE MIGRATION CHANGE, ET QUI EST UNE DECISION. Les tarifs de
-- livraison, le seuil de franchise et le seuil de stock faible vivaient dans
-- l'environnement, arbitrage du 31 aout 2026. ADR-043 le remplace pour ces
-- valeurs : une decision commerciale ne doit pas exiger un redeploiement.
--
-- L'ARBITRAGE DU 31 AOUT RESTE EN VIGUEUR POUR L'IDENTITE LEGALE, qui ne bouge
-- pas ici. Un SIRET est un fait administratif, un seuil de franchise un levier
-- commercial : les deux n'ont pas le meme rythme ni le meme decideur.
--
-- MIGRATION ADDITIVE, aucun DROP, aucune donnee existante touchee.
-- `migrate-production.sh` la passe donc sans `--confirm-destructive`.

-- UNE SEULE LIGNE, ET C'EST LA BASE QUI LE GARANTIT. `id` est un booleen
-- contraint a `true` plus bas : deux lignes deviennent impossibles.
--
-- POURQUOI CELA COMPTE ICI PLUS QU'AILLEURS. Deux lignes de parametres qui se
-- contredisent seraient lues par `findFirst`, donc l'une ou l'autre selon le
-- plan d'execution : le tunnel facturerait un port different d'une requete a
-- l'autre, sans qu'aucune erreur ne soit levee. Motif de la cle composee de
-- `compteur_numero`, pousse plus loin.
CREATE TABLE "parametre_boutique" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "tarif_relais_centimes" INTEGER NOT NULL,
    "tarif_domicile_centimes" INTEGER NOT NULL,
    -- NULL DESACTIVE la franchise, et ne vaut PAS zero : un seuil a zero rendrait
    -- toute livraison gratuite, l'inverse exact de l'intention.
    "seuil_franchise_centimes" INTEGER,
    "seuil_stock_faible" INTEGER NOT NULL,
    "email_alertes" TEXT NOT NULL,
    "alerte_commande_payee" BOOLEAN NOT NULL DEFAULT true,
    "alerte_paiement_annule" BOOLEAN NOT NULL DEFAULT true,
    "alerte_stock_faible" BOOLEAN NOT NULL DEFAULT true,
    "alerte_message_recu" BOOLEAN NOT NULL DEFAULT true,
    "alerte_avis_a_moderer" BOOLEAN NOT NULL DEFAULT true,
    "modifie_a" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parametre_boutique_pkey" PRIMARY KEY ("id")
);

-- Les CHECK sont recopies depuis `001_contraintes_check.sql`, convention du
-- depot : Prisma ne les genere pas, ADR-006, et `migrate deploy` doit les
-- embarquer sans quoi la production n'en porterait aucun.

ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_ligne_unique"
  CHECK ("id" = true);

ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_tarifs_positifs"
  CHECK ("tarif_relais_centimes" >= 0 AND "tarif_domicile_centimes" >= 0);

ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_seuil_franchise_positif"
  CHECK ("seuil_franchise_centimes" IS NULL OR "seuil_franchise_centimes" >= 0);

ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_seuil_stock_positif"
  CHECK ("seuil_stock_faible" >= 1);

ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_email_alertes_non_vide"
  CHECK (length(trim("email_alertes")) > 0);

-- AMORCAGE AVEC LES VALEURS D'ADR-035, ET NON DEPUIS L'ENVIRONNEMENT.
--
-- Une migration qui lit l'environnement produit des bases DIFFERENTES selon la
-- machine qui l'execute : developpement, bout en bout et production
-- divergeraient en silence, et le defaut ne se verrait qu'a la premiere
-- facture. Les valeurs sont donc ecrites en clair, elles viennent d'un ADR
-- accepte et non d'une configuration locale.
--
--   410   Point Relais et Locker, ADR-035
--   749   domicile, prix coutant releve le 6 septembre 2026
--   3900  franchise, RESERVEE aux modes en relais, la reserve vivant dans
--         `calculerFraisPort` et non ici, ADR-043 decision 3
--   1     seuil de stock faible, valeur de `SEUIL_STOCK_FAIBLE` avant migration
--
-- L'EMAIL D'ALERTE EST UNE VALEUR DE REMPLACEMENT EXPLICITE, jamais une adresse
-- reelle : une adresse ecrite dans une migration serait versionnee sur un depot
-- PUBLIC, invariant 9. L'ecran de parametres la remplace a la premiere
-- ouverture, et le contrat de `verifier-environnement.sh` la signale.
INSERT INTO "parametre_boutique" (
    "id",
    "tarif_relais_centimes",
    "tarif_domicile_centimes",
    "seuil_franchise_centimes",
    "seuil_stock_faible",
    "email_alertes",
    "modifie_a"
)
VALUES (true, 410, 749, 3900, 1, 'a-configurer@exemple.invalid', now())
ON CONFLICT ("id") DO NOTHING;
