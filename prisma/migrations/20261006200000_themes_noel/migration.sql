-- Deux thèmes de Noël remplacent le premier. LS-277, amendement d'ADR-046.
--
-- `NOEL` (LS-267) est écarté au profit de `NOEL_1`, sobre, et `NOEL_2`, franc.
-- Remplacer une contrainte CHECK passe par un DROP CONSTRAINT :
-- `migrate-production.sh` classe donc cette migration destructive et demande
-- `--confirm-destructive`. Aucune donnée n'est perdue, aucun thème n'est
-- activé : seule une valeur `NOEL` déjà choisie devient `NOEL_1`.
--
-- L'ORDRE EST IMPOSÉ. L'ancienne contrainte refuse `NOEL_1` : la conversion
-- vient après son retrait et avant la nouvelle, qui refuse `NOEL`.
ALTER TABLE "parametre_boutique"
  DROP CONSTRAINT "chk_parametre_theme_connu";

UPDATE "parametre_boutique"
  SET "theme_saisonnier" = 'NOEL_1'
  WHERE "theme_saisonnier" = 'NOEL';

-- LE THÈME EST L'UN DES THÈMES ÉCRITS DANS LE CODE, liste identique à
-- `THEMES_SAISONNIERS` de `src/lib/theme-saisonnier.ts`.
ALTER TABLE "parametre_boutique"
  ADD CONSTRAINT "chk_parametre_theme_connu"
  CHECK ("theme_saisonnier" IN ('AUCUN', 'NOEL_1', 'NOEL_2'));
