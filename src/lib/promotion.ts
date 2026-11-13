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

/**
 * Clé du verrou consultatif qui sérialise l'activation d'une promotion et
 * tout changement de prix, revue critique de LS-319 : sans lui, un prix
 * pouvait changer entre la garde du gel et l'activation. Un entier fixe,
 * propre à ce verrou, que les tests reprennent.
 */
export const CLE_VERROU_PROMOTION = 31_903;

/*
 * AUCUNE CARENCE ENTRE DEUX ACTIVATIONS, amendement d'ADR-051 du 13 novembre
 * 2026, arbitrage de Christophe : l'exploitante active et désactive librement.
 * Le risque d'un prix barré faux sur une promotion trop proche d'une autre
 * est accepté par lui, et l'ADR le nomme.
 */

/**
 * Le prix réduit, au centime INFÉRIEUR, à l'avantage du client. Entiers de
 * bout en bout, invariant 1 : `prix * (100 - taux)` est entier, et la
 * division entière tronque, les deux opérandes étant positifs.
 */
export function prixDeVente(prixCentimes: number, taux: number): number {
  return Math.floor((prixCentimes * (100 - taux)) / 100);
}

/**
 * La période annoncée, deux jours civils réglés par l'exploitante, amendement
 * d'ADR-051. Les deux ou aucun ; la fin ne précède pas le début. Même règle
 * que `chk_parametre_periode_promotion`.
 */
export const schemaPeriodePromotion = z
  .strictObject({
    debut: z.union([z.iso.date("Date de début invalide."), z.literal("")], {
      error: "Date de début invalide.",
    }),
    fin: z.union([z.iso.date("Date de fin invalide."), z.literal("")], {
      error: "Date de fin invalide.",
    }),
  })
  .refine(({ debut, fin }) => (debut === "") === (fin === ""), {
    message: "Indiquez les deux dates, ou aucune.",
  })
  .refine(({ debut, fin }) => debut === "" || fin >= debut, {
    message: "La date de fin ne peut pas précéder la date de début.",
  })
  .transform(({ debut, fin }) => (debut === "" ? null : { debut, fin }));

const JOUR = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  timeZone: "UTC",
});
const MOIS = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  timeZone: "UTC",
});
const ANNEE = new Intl.DateTimeFormat("fr-FR", {
  year: "numeric",
  timeZone: "UTC",
});

/**
 * « du lundi 23 au dimanche 29 novembre », le mois et l'année n'étant
 * répétés que s'ils changent. Les dates sont des jours civils, lus en UTC
 * pour ne pas glisser d'un jour, `@db.Date` les rendant à minuit UTC.
 */
export function formaterPeriode(debut: Date, fin: Date): string {
  const jourDebut = JOUR.format(debut);
  const jourFin = JOUR.format(fin);
  const moisDebut = MOIS.format(debut);
  const moisFin = MOIS.format(fin);
  const anneeDebut = ANNEE.format(debut);
  const anneeFin = ANNEE.format(fin);
  if (debut.getTime() === fin.getTime()) {
    return `le ${jourDebut} ${moisDebut}`;
  }
  if (anneeDebut !== anneeFin) {
    return `du ${jourDebut} ${moisDebut} ${anneeDebut} au ${jourFin} ${moisFin} ${anneeFin}`;
  }
  if (moisDebut !== moisFin) {
    return `du ${jourDebut} ${moisDebut} au ${jourFin} ${moisFin}`;
  }
  return `du ${jourDebut} au ${jourFin} ${moisFin}`;
}
