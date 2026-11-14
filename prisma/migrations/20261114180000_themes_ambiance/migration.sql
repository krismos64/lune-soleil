-- Douze thèmes d'ambiance, LS-323, amendement d'ADR-046 du 14 novembre 2026.
--
-- Remplacer une contrainte CHECK passe par un DROP CONSTRAINT :
-- `migrate-production.sh` classe donc cette migration destructive et demande
-- `--confirm-destructive`. Aucune donnée n'est touchée et aucun thème n'est
-- activé : la liste admise s'élargit de douze valeurs, toute valeur présente
-- reste admise.
ALTER TABLE "parametre_boutique"
  DROP CONSTRAINT "chk_parametre_theme_connu";

-- LE THÈME EST L'UN DES THÈMES ÉCRITS DANS LE CODE, liste identique à
-- `THEMES_SAISONNIERS` de `src/lib/theme-saisonnier.ts`.
ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_theme_connu"
  CHECK ("theme_saisonnier" IN (
    'AUCUN', 'NOEL_1', 'NOEL_2', 'BLACK_WEEK',
    'NOUVEL_AN', 'SOLDES_HIVER', 'SAINT_VALENTIN', 'JOURNEE_FEMMES',
    'PRINTEMPS', 'PAQUES', 'ETE', 'SOLDES_ETE', 'AUTOMNE', 'OCTOBRE_ROSE',
    'NOVEMBRE_BLEU', 'HIVER'
  ));
