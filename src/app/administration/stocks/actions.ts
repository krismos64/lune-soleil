"use server";

/**
 * Adaptateur d'entree du stock multicanal, LS-106. Parcours 2.
 *
 * CE FICHIER NE DECIDE RIEN : il lit les en-tetes, exige le role, delegue au
 * service et traduit le resultat en valeurs que l'interface sait afficher. Les
 * regles S4, S5, S6, S9, S14 et S15 vivent dans `services/stock-multicanal.ts`.
 *
 * CHAQUE ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE.
 * Une Server Action est invocable DIRECTEMENT, sans passer par le rendu de
 * l'ecran : proteger la page seule laisserait ce chemin ouvert. C'est le defaut
 * trouve en relecture de LS-89.
 *
 * L'ACTEUR VIENT DE LA SESSION, jamais d'un parametre, invariant 2. Aucune
 * signature ici n'accepte d'identifiant d'utilisateur : `exigerRole` rend
 * l'identite, et c'est elle qui alimente `acteurId` au journal d'audit et aux
 * mouvements. Un `acteurId` venant d'un `FormData` permettrait d'attribuer une
 * vente a n'importe qui, S9.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import type { IdentiteAppelant } from "@/services/autorisation";
import {
  ajusterInventaire,
  corrigerMouvement,
  enregistrerVenteExterne,
  reactiverVenteWeb,
  suspendreVenteWeb,
} from "@/services/stock-multicanal";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * LES REFUS METIER SONT DES VALEURS, pas des pannes. « Une reservation est
 * active » n'est pas une erreur : c'est une situation prevue du parcours 2, qui
 * se presente avec une action plutot qu'avec un message d'echec.
 */
export type ResultatAction =
  | { statut: "SUCCES" }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, avec le message destine au champ concerne. */
  | { statut: "INVALIDE"; message: string }
  /** Un client paie en ligne cette piece, parcours 2, cas d'erreur 1. */
  | { statut: "RESERVATION_ACTIVE" }
  /** Stock physique insuffisant, la contrainte l'empecherait de toute facon. */
  | { statut: "STOCK_INSUFFISANT" }
  /** La variante ou le mouvement n'existe pas, ou la variante est archivee. */
  | { statut: "INTROUVABLE" }
  /** Ce mouvement porte deja une correction, S15. */
  | { statut: "DEJA_COMPENSE" }
  /** Un compensateur ne se compense pas : la chaine s'arrete a un maillon. */
  | { statut: "NON_COMPENSABLE" }
  /** Comptage conforme, aucun mouvement ecrit : ce n'est pas un echec. */
  | { statut: "SANS_ECART" }
  /** Panne technique, deja journalisee. */
  | { statut: "INDISPONIBLE" };

/** Chemin de l'ecran, revalide apres chaque ecriture. */
const CHEMIN_STOCKS = "/administration/stocks";

/**
 * Exige le role et rend l'IDENTITE, pas seulement un booleen.
 *
 * C'est ce qui distingue cette garde de celle des categories : le stock a
 * besoin de l'acteur pour tracer qui a vendu quoi, S9. Le rendre ici evite
 * qu'une action le relise, ou pire, l'accepte en parametre.
 *
 * Session absente et role insuffisant rendent la MEME valeur, comme
 * `AutorisationRefuseeError` les confond : les separer renseignerait sur
 * l'existence du compte d'administration.
 */
async function exigerRole(): Promise<IdentiteAppelant | null> {
  const enTetes = await headers();

  try {
    return await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return null;
    }
    throw erreur;
  }
}

/**
 * Traduit un refus du service en valeur d'interface.
 *
 * LA TABLE EST EXHAUSTIVE ET TYPEE : ajouter un refus au service sans le
 * traduire ici ferait echouer la compilation, plutot que de rendre un
 * `INDISPONIBLE` qui accuserait la base pour un cas parfaitement prevu.
 */
function traduireRefus(
  refus:
    | "RESERVATION_ACTIVE"
    | "STOCK_INSUFFISANT"
    | "VARIANTE_INTROUVABLE"
    | "MOUVEMENT_INTROUVABLE"
    | "DEJA_COMPENSE"
    | "NON_COMPENSABLE",
): ResultatAction {
  switch (refus) {
    case "RESERVATION_ACTIVE":
      return { statut: "RESERVATION_ACTIVE" };
    case "STOCK_INSUFFISANT":
      return { statut: "STOCK_INSUFFISANT" };
    case "VARIANTE_INTROUVABLE":
    case "MOUVEMENT_INTROUVABLE":
      return { statut: "INTROUVABLE" };
    case "DEJA_COMPENSE":
      return { statut: "DEJA_COMPENSE" };
    case "NON_COMPENSABLE":
      return { statut: "NON_COMPENSABLE" };
  }
}

/**
 * Traduit les erreurs previsibles en valeurs d'interface.
 *
 * TOUT CE QUI N'EST PAS UNE ENTREE INVALIDE EST UNE PANNE, journalisee puis
 * rendue en `INDISPONIBLE`. Rendre `INVALIDE` par defaut ferait accuser la
 * saisie de l'administratrice pour une base injoignable.
 */
function traduireErreur(erreur: unknown, operation: string): ResultatAction {
  if (erreur instanceof EntreeInvalideError) {
    return { statut: "INVALIDE", message: erreur.message };
  }

  // AUCUNE DONNEE SAISIE DANS LE JOURNAL, invariant 9 : ce depot est public et
  // le journal vit en sortie standard. Ni le canal de vente, ni le prix, ni le
  // motif n'y entrent.
  journaliser("error", "Operation de stock indisponible", {
    operation,
    erreur: erreur instanceof Error ? erreur.name : typeof erreur,
  });
  return { statut: "INDISPONIBLE" };
}

/**
 * Suspend la vente web d'une variante, etape 1 du parcours 2.
 *
 * AUCUN MOUVEMENT DE STOCK, invariant 6. Une entree au journal d'audit trace
 * l'action, le service s'en charge.
 */
export async function suspendreVenteWebAction(
  varianteId: string,
): Promise<ResultatAction> {
  const identite = await exigerRole();
  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    const { refus } = await suspendreVenteWeb({
      varianteId,
      acteurId: identite.utilisateurId,
    });
    if (refus) {
      return traduireRefus(refus);
    }
    revalidatePath(CHEMIN_STOCKS);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "suspendre-vente-web");
  }
}

/** Remet la piece en vente en ligne, etape 4 du parcours 2. */
export async function reactiverVenteWebAction(
  varianteId: string,
): Promise<ResultatAction> {
  const identite = await exigerRole();
  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    const { refus } = await reactiverVenteWeb({
      varianteId,
      acteurId: identite.utilisateurId,
    });
    if (refus) {
      return traduireRefus(refus);
    }
    revalidatePath(CHEMIN_STOCKS);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "reactiver-vente-web");
  }
}

/**
 * Enregistre une vente externe, etape 3 du parcours 2.
 *
 * LE PRIX ARRIVE EN EUROS SOUS FORME DE CHAINE, tel que le formulaire le porte.
 * La conversion en centimes appartient a la validation du service, invariant 1 :
 * la faire ici la placerait dans un adaptateur d'entree.
 */
export async function enregistrerVenteExterneAction(entree: {
  varianteId: string;
  quantite: number;
  prixUnitaireEuros: string;
  canal: string;
}): Promise<ResultatAction> {
  const identite = await exigerRole();
  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    const { refus } = await enregistrerVenteExterne({
      ...entree,
      acteurId: identite.utilisateurId,
    });
    if (refus) {
      return traduireRefus(refus);
    }
    revalidatePath(CHEMIN_STOCKS);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "vente-externe");
  }
}

/**
 * Ajuste le stock sur un comptage reel.
 *
 * UN COMPTAGE CONFORME REND `SANS_ECART`, ET CE N'EST PAS UN ECHEC. L'ecran doit
 * le dire autrement qu'une erreur : l'inventaire a bien eu lieu, il n'a
 * simplement rien revele.
 */
export async function ajusterInventaireAction(entree: {
  varianteId: string;
  quantiteConstatee: number;
  motif: string;
}): Promise<ResultatAction> {
  const identite = await exigerRole();
  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    const { refus, sansEcart } = await ajusterInventaire({
      ...entree,
      acteurId: identite.utilisateurId,
    });
    if (refus) {
      return traduireRefus(refus);
    }
    if (sansEcart) {
      return { statut: "SANS_ECART" };
    }
    revalidatePath(CHEMIN_STOCKS);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "ajustement-inventaire");
  }
}

/**
 * Corrige un mouvement par compensation, S14 et ADR-030.
 *
 * NE MODIFIE JAMAIS LA LIGNE D'ORIGINE : une seconde ligne l'annule, et les deux
 * racontent ce qui s'est passe.
 */
export async function corrigerMouvementAction(entree: {
  mouvementId: string;
  motif: string;
}): Promise<ResultatAction> {
  const identite = await exigerRole();
  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    const { refus } = await corrigerMouvement({
      ...entree,
      acteurId: identite.utilisateurId,
    });
    if (refus) {
      return traduireRefus(refus);
    }
    revalidatePath(CHEMIN_STOCKS);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "correction-mouvement");
  }
}
