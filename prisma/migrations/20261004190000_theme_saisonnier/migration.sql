-- Thème saisonnier activable par l'exploitante. LS-267, ADR-046.
--
-- MIGRATION ADDITIVE AVEC DÉFAUT : la ligne unique de paramètres reçoit
-- `AUCUN`, donc le site garde exactement l'habillage d'avant la migration
-- tant que l'exploitante n'a rien choisi.
--
-- TEXTE BORNÉ PAR UN CHECK ET NON UN TYPE ÉNUMÉRÉ : `verifier-schema.sh`
-- exige que chaque énumération figure au modèle conceptuel, dont cette table
-- de configuration est exclue à dessein, ADR-043. La contrainte donne la même
-- garantie en base.
ALTER TABLE "parametre_boutique"
  ADD COLUMN "theme_saisonnier" TEXT NOT NULL DEFAULT 'AUCUN';

-- LE THÈME EST L'UN DES THÈMES ÉCRITS DANS LE CODE. Un thème inconnu
-- poserait un `data-theme` qu'aucun jeton ne définit : la page s'afficherait
-- sans thème, sans erreur ni avertissement.
ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_theme_connu"
  CHECK ("theme_saisonnier" IN ('AUCUN', 'NOEL'));
