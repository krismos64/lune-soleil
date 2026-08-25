-- LS-117, C28 : le total d'une commande est la somme de ses composantes.
--
-- POURQUOI CETTE CONTRAINTE EXISTE. `total_centimes` est stocke EN PLUS de
-- `sous_total_centimes`, `frais_port_centimes` et `montant_taxe_centimes`.
-- `database.md` justifie ailleurs d'ecarter les montants redondants, « un total
-- redondant se desynchronise sans qu'aucune contrainte ne le detecte », a propos
-- du total de ligne qui n'est volontairement pas stocke.
--
-- Ici la redondance est voulue, une commande devant porter le montant exact
-- qu'elle engage, mais elle vivait sans son garde-fou.
--
-- LE SCENARIO N'EST PAS THEORIQUE. Un chemin futur, remise de LS-118 ou avoir de
-- la phase 4, ecrirait `total_centimes` sans faire suivre les composantes : la
-- commande porterait 5399 en total et 4900 + 0 + 0 dans son detail. Rien ne
-- rougirait, et l'ecart n'apparaitrait qu'a la facture, document IMMUABLE que
-- l'invariant 4 interdit de corriger autrement que par un avoir.
--
-- POSEE PENDANT QUE LE CODE EST CORRECT, ce qui est le moment ou elle coute le
-- moins cher : aucune donnee existante a reprendre. Relevee par
-- `ls-critical-reviewer` le 25 aout 2026.
ALTER TABLE "commande"
  ADD CONSTRAINT "chk_commande_total_coherent"
  CHECK ("total_centimes"
         = "sous_total_centimes" + "frais_port_centimes" + "montant_taxe_centimes");
