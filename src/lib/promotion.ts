/**
 * Les promotions de catalogue, ADR-051, LS-319, amendé par LS-324.
 *
 * LE NOM DE L'OPÉRATION EST UNE LISTE FERMÉE, comme les thèmes d'ADR-046 :
 * l'exploitante le choisit, elle ne le rédige pas. Il finit sur la facture,
 * et un champ libre y laisserait passer une formule qu'aucun contrôle ne
 * relirait.
 *
 * LE TAUX, LUI, EST SAISI PAR L'EXPLOITANTE DEPUIS LS-324, arbitrage de
 * Christophe du 14 novembre 2026 : un entier borné, par article ou pour toute
 * la boutique. La borne arrête la faute de frappe, 70 pour 7.
 *
 * SANS AUCUNE DÉPENDANCE SERVEUR : l'écran des paramètres, composant client,
 * lit ces libellés et ces bornes.
 */
import { z } from "zod";

export const PROMOTIONS = {
  BLACK_WEEK: { libelle: "Black Week" },
  SOLDES_HIVER: { libelle: "Soldes d'hiver" },
  SOLDES_ETE: { libelle: "Soldes d'été" },
  SAINT_VALENTIN: { libelle: "Saint-Valentin" },
  JOURNEE_FEMMES: { libelle: "Journée des droits des femmes" },
  OCTOBRE_ROSE: { libelle: "Octobre rose" },
  NOVEMBRE_BLEU: { libelle: "Novembre bleu" },
  NOEL: { libelle: "Noël" },
  PROMOTION: { libelle: "Promotion" },
} as const;

export type CodePromotion = keyof typeof PROMOTIONS;

export const CODES_PROMOTION = Object.keys(PROMOTIONS) as [
  CodePromotion,
  ...CodePromotion[],
];

/** Même liste que `chk_promotion_code_connu`. */
export const schemaCodePromotion = z.enum(CODES_PROMOTION);

/**
 * Les bornes du taux saisi, ADR-051 amendé par LS-324. La base garde un filet
 * plus large, 1 à 90, `chk_promotion_taux` et `chk_promotion_produit_taux`.
 */
export const TAUX_MINIMUM = 5;
export const TAUX_MAXIMUM = 70;

const MESSAGE_TAUX = `Le taux est un nombre entier entre ${TAUX_MINIMUM} et ${TAUX_MAXIMUM} %.`;

export const schemaTauxPromotion = z
  .number({ error: MESSAGE_TAUX })
  .int(MESSAGE_TAUX)
  .min(TAUX_MINIMUM, MESSAGE_TAUX)
  .max(TAUX_MAXIMUM, MESSAGE_TAUX);

const schemaArticlePromotion = z.strictObject({
  produitId: z.uuid("Article inconnu."),
  taux: schemaTauxPromotion,
});

const sansDoublon = (articles: readonly { produitId: string }[]): boolean =>
  new Set(articles.map((article) => article.produitId)).size ===
  articles.length;

/**
 * Ce que l'exploitante demande en activant une promotion, LS-324. Deux
 * portées, mêmes règles que `chk_promotion_portee_taux` :
 * - `TOUT`, un taux général, et des articles qui portent un autre taux ;
 * - `SELECTION`, au moins un article, chacun à son taux, aucun taux général.
 *
 * UN IDENTIFIANT D'ARTICLE N'AUTORISE RIEN, invariant 2 : le rôle est exigé
 * avant, et un article inconnu est refusé par la clé étrangère.
 */
export const schemaDemandePromotion = z.discriminatedUnion("portee", [
  z.strictObject({
    code: schemaCodePromotion,
    portee: z.literal("TOUT"),
    taux: schemaTauxPromotion,
    articles: z
      .array(schemaArticlePromotion)
      .max(500)
      .refine(sansDoublon, "Un article figure deux fois.")
      .default([]),
  }),
  z.strictObject({
    code: schemaCodePromotion,
    portee: z.literal("SELECTION"),
    articles: z
      .array(schemaArticlePromotion)
      .min(1, "Choisissez au moins un article.")
      .max(500)
      .refine(sansDoublon, "Un article figure deux fois."),
  }),
]);

export type DemandePromotion = z.infer<typeof schemaDemandePromotion>;

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
