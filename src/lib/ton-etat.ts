/**
 * Le ton d'une ligne de travail de l'administration, LS-326 : quatre tons
 * pour tous les écrans, que le layout traduit en un repère de couleur sur le
 * bord de la ligne, `data-etat`.
 *
 * LA COULEUR DOUBLE LE LIBELLÉ, ELLE NE LE REMPLACE JAMAIS : chaque ligne
 * garde son badge écrit, « En préparation », « Brouillon ». Le repère sert à
 * balayer une liste de l'œil.
 *
 * `Record` EXHAUSTIFS : un statut ajouté à une énumération sans son ton casse
 * la compilation, au lieu de rendre une ligne sans repère.
 */
export type TonEtat = "attente" | "cours" | "fait" | "ecarte";

/** Une commande : à encaisser, à traiter, partie ou annulée. */
export const TON_COMMANDE = {
  EN_ATTENTE_PAIEMENT: "attente",
  CONFIRMEE: "cours",
  EN_PREPARATION: "cours",
  EXPEDIEE: "fait",
  LIVREE: "fait",
  ANNULEE: "ecarte",
} as const satisfies Record<string, TonEtat>;

/** Un produit : publié, encore en brouillon, ou archivé. */
export const TON_PRODUIT = {
  ACTIF: "fait",
  BROUILLON: "attente",
  ARCHIVE: "ecarte",
} as const satisfies Record<string, TonEtat>;

/** Un message de contact : à lire, lu, traité. */
export const TON_MESSAGE = {
  NOUVEAU: "attente",
  LU: "cours",
  TRAITE: "fait",
} as const satisfies Record<string, TonEtat>;

/** Une alerte ouverte : critique, ou simple avertissement. */
export const TON_ALERTE = {
  CRITIQUE: "ecarte",
  AVERTISSEMENT: "attente",
} as const satisfies Record<string, TonEtat>;

/** Une demande de rétractation, du dépôt au remboursement ou au refus. */
export const TON_RETRACTATION = {
  DEPOSEE: "attente",
  ACCUSEE: "cours",
  RETOUR_ATTENDU: "cours",
  EXPEDITION_PROUVEE: "cours",
  REMBOURSEMENT_EN_COURS: "cours",
  REMBOURSEE: "fait",
  REFUSEE: "ecarte",
} as const satisfies Record<string, TonEtat>;
