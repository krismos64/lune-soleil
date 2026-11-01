/**
 * Le parametre d'URL qui confirme un retrait d'avis, LS-305.
 *
 * HORS DE `actions.ts`, qui porte `"use server"` : un tel fichier n'exporte que
 * des fonctions asynchrones, et une constante y casse la construction.
 */
export const PARAMETRE_RETRAIT = "retrait";
