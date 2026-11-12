/**
 * Les promotions de catalogue écrites dans le code, ADR-051, LS-319.
 *
 * UN JEU FERMÉ, comme les thèmes d'ADR-046 : un code, un taux, un libellé et
 * la période annoncée. L'exploitante active et désactive, elle ne saisit
 * aucun texte ni aucun taux : un champ libre laisserait passer une réduction
 * qu'aucun contrôle ne relirait.
 *
 * SANS AUCUNE DÉPENDANCE SERVEUR : l'écran des paramètres, composant client,
 * lit ces libellés.
 */
import { z } from "zod";

export const PROMOTIONS = {
  BLACK_WEEK: {
    taux: 30,
    libelle: "Black Week",
    /**
     * LA PÉRIODE ANNONCÉE AUX VISITEURS, arbitrage de Christophe du
     * 12 novembre 2026 : l'exploitante active et désactive à ces dates. Une
     * promotion laissée active au-delà rendrait cette phrase fausse.
     */
    periodeAnnoncee: "du lundi 23 au dimanche 29 novembre",
  },
} as const;

export type CodePromotion = keyof typeof PROMOTIONS;

/** Même liste que `chk_promotion_code_connu`. */
export const schemaCodePromotion = z.enum(["BLACK_WEEK"]);

/**
 * Ancienneté minimale d'une variante, et durée sans changement de prix, pour
 * entrer dans une promotion : le prix antérieur de L112-1-1 et de l'arrêt
 * C-330/23 est le plus bas des trente jours précédents. Arbitrage 1.
 */
export const JOURS_PRIX_ANTERIEUR = 30;

/** Réactivation permise après une désactivation, arbitrage 2. */
export const HEURES_REACTIVATION = 24;

/** Au-delà, aucune activation pendant ces jours, arbitrage 2. */
export const JOURS_CARENCE = 30;

/**
 * Le prix réduit, au centime INFÉRIEUR, à l'avantage du client. Entiers de
 * bout en bout, invariant 1 : `prix * (100 - taux)` est entier, et la
 * division entière tronque, les deux opérandes étant positifs.
 */
export function prixDeVente(prixCentimes: number, taux: number): number {
  return Math.floor((prixCentimes * (100 - taux)) / 100);
}
