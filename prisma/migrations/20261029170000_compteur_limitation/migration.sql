-- Compteurs de limitation du PROJET, sortis de `rate_limit`. LS-294.
--
-- MEME DEFAUT QUE `compteur_compte_vise`, LS-83, REVENU PAR UN AUTRE CHEMIN.
-- Le limiteur de Better Auth purge `rate_limit` SANS FILTRE DE CLE au-dela de
-- sa plus longue fenetre configuree, soixante secondes ici. Les plafonds d'une
-- heure du formulaire de contact et des signalements d'avis y vivaient : un
-- robot qui attendait une minute repartait de zero. Mesure en revue de la
-- montee en Better Auth 1.7, le defaut existait deja en 1.6.
--
-- MIGRATION ADDITIVE. Les compteurs en cours dans `rate_limit` ne sont pas
-- recopies : ils durent au plus une heure, et la purge de Better Auth les
-- emporte de toute facon. Le premier envoi apres deploiement repart a un.

CREATE TABLE "compteur_limitation" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "compte" INTEGER NOT NULL,
    "derniere_a" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compteur_limitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compteur_limitation_cle_key" ON "compteur_limitation"("cle");

-- L'INDEX SUR LA DATE SERT LA PURGE, jamais une lecture metier : le service
-- ne lit que par cle.
CREATE INDEX "compteur_limitation_derniere_a_idx" ON "compteur_limitation"("derniere_a");

-- LE COMPTE EST STRICTEMENT POSITIF. Une ligne existe parce qu'une tentative a
-- eu lieu, et un decompte fautif accorderait des tentatives au lieu d'en
-- retirer.
ALTER TABLE "compteur_limitation"
    ADD CONSTRAINT "chk_compteur_limitation_positif" CHECK ("compte" >= 1);

-- LA CLE N'EST JAMAIS VIDE. Une chaine vide ferait partager un compteur unique
-- a tous les appelants : un seul robot fermerait le formulaire a tout le monde.
ALTER TABLE "compteur_limitation"
    ADD CONSTRAINT "chk_compteur_limitation_cle_non_vide" CHECK (length(trim("cle")) > 0);
