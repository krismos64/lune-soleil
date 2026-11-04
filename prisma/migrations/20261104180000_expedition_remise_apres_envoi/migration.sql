-- La remise au client ne precede jamais l'envoi. LS-311, regle V16, ADR-042
-- decision 7.
--
-- `livre_a` ouvre le delai de retractation, article L221-18. Depuis LS-311 il
-- vient de l'historique du transporteur : un numero de suivi recolle a la
-- declaration manuelle ferait lire la remise d'un ancien colis, datee d'avant
-- l'envoi, et le delai s'eteindrait avant meme la livraison reelle. Le service
-- refuse deja ce cas ; la contrainte en fait la derniere ligne de defense.
--
-- `expedie_a` NUL PASSE, la comparaison rendant NULL et un CHECK etant
-- satisfait par NULL : une expedition sans date d'envoi n'a rien a borner.
--
-- ADDITIVE : aucune donnee modifiee. Mesure le 4 novembre 2026 en production,
-- la seule expedition porte `livre_a` nul.
ALTER TABLE "expedition"
  ADD CONSTRAINT "chk_expedition_remise_apres_envoi"
  CHECK ("livre_a" IS NULL OR "livre_a" >= "expedie_a");
