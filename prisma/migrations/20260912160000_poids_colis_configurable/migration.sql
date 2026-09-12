-- Poids forfaitaire du colis, rendu configurable. LS-218, critere 11.
--
-- CE QUE CETTE MIGRATION CORRIGE, ET QUI EST UN ECART CONSTATE. L'arbitrage de
-- Christophe du 10 septembre 2026 exige un poids « configurable et non une
-- constante », « lisible et modifiable, jamais enfoui dans le code ». La
-- livraison du meme jour l'a pose en constante TypeScript,
-- `POIDS_FORFAITAIRE_GRAMMES`, donc modifiable seulement par un deploiement.
-- Le critere ajoute par cet arbitrage n'etait pas rempli, et le tableau de
-- cloture ne le listait pas.
--
-- MEME MOTIF QU'ADR-043 POUR LES TARIFS : une valeur commerciale qui se regle
-- au fil de l'exploitation ne doit pas exiger un redeploiement. Le jour ou le
-- catalogue porte une piece plus lourde, l'exploitante corrige sans attendre.
--
-- MIGRATION ADDITIVE AVEC DEFAUT, aucune donnee touchee. Le defaut vaut la
-- valeur qui vivait dans le code, donc la ligne existante en production garde
-- exactement le comportement d'avant la migration.
ALTER TABLE "parametre_boutique"
  ADD COLUMN "poids_colis_grammes" INTEGER NOT NULL DEFAULT 200;

-- LA BORNE HAUTE EST LA TRANCHE ELLE-MEME, et c'est ce qui distingue ce champ
-- des autres reglages. Les trois methodes d'expedition retenues couvrent la
-- tranche 0 a 0,251 kg, `methodes.ts` porte leurs identifiants : une valeur
-- au-dela ferait acheter une etiquette de la mauvaise tranche, que le
-- transporteur rattrape en facturant un supplement apres coup.
--
-- 250 ET NON 251 : la borne de Sendcloud est exclusive a 0,251 kg, et poser la
-- limite a sa valeur exacte inviterait a s'y coller. La marge de cinquante
-- grammes sous le defaut de 200 couvre le carton, le papier de soie et
-- l'etiquette.
--
-- LA BORNE BASSE EST 15 ET NON 1, ET ELLE VIENT DU TRANSPORTEUR. `min_weight`
-- vaut 0,015 kg sur la methode domicile et 0,011 sur le locker, releve sur
-- l'API le 10 septembre 2026 : un poids sous ce seuil fait REFUSER la creation
-- par Sendcloud, apres l'aller-retour. La base refuse donc ici ce que le
-- transporteur refuserait plus tard, c'est-a-dire avant que l'exploitante
-- decouvre le refus sur un colis qu'elle prepare.
ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_poids_colis_borne"
  CHECK ("poids_colis_grammes" >= 15 AND "poids_colis_grammes" <= 250);
