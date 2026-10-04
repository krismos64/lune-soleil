/**
 * Les thèmes saisonniers écrits dans le code, ADR-046, LS-267.
 *
 * SANS AUCUNE DÉPENDANCE SERVEUR : l'écran des paramètres, composant client,
 * lit ces noms. Les placer dans le service tirait Prisma dans le paquet du
 * navigateur, et la construction échouait.
 */
import { z } from "zod";

/** Les thèmes écrits dans le code. Même liste que `chk_parametre_theme_connu`. */
export const THEMES_SAISONNIERS = ["AUCUN", "NOEL"] as const;

export type ThemeSaisonnier = (typeof THEMES_SAISONNIERS)[number];

export const schemaThemeSaisonnier = z.enum(THEMES_SAISONNIERS);

/**
 * Le nom de chaque thème, tel que les écrans le disent. `Record` exhaustif :
 * un thème ajouté sans son nom casse la compilation, au lieu d'afficher
 * « Noël » pour un autre thème, revue de LS-267.
 */
export const LIBELLES_THEMES: Record<ThemeSaisonnier, string> = {
  AUCUN: "aucun thème",
  NOEL: "le thème de Noël",
};
