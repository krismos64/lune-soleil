"use server";

/**
 * Adaptateur d'entree des variantes d'un produit, LS-101.
 *
 * FICHIER DISTINCT DE `actions.ts`, qui porte les sections. Les deux servent le
 * meme ecran, mais un fichier unique melangerait deux domaines dont les refus
 * n'ont rien de commun : une reference deja prise n'a pas de sens pour une
 * section, un ordre incomplet n'en a pas pour une variante.
 *
 * CE FICHIER NE DECIDE RIEN : il lit les en-tetes, exige le role, delegue au
 * service et traduit le resultat. Les regles C2, C13 et C14 vivent dans
 * `services/variante.ts`.
 *
 * CHAQUE ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE. Une
 * Server Action est invocable DIRECTEMENT, sans passer par le rendu de l'ecran.
 *
 * L'IDENTITE VIENT DE LA SESSION, jamais d'un parametre, invariant 2.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  ProduitIntrouvableError,
  ReferenceDejaPriseError,
  ReservationActiveError,
  VarianteDejaArchiveeError,
  VarianteIntrouvableError,
  archiverVariante,
  creerVariante,
  modifierVariante,
} from "@/services/variante";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * Une exception qui traverse une Server Action produit la page d'erreur
 * generique de Next.js, et l'exploitante perd la saisie en cours.
 */
export type ResultatVariante =
  | { statut: "SUCCES" }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, avec le message destine au champ concerne. */
  | { statut: "INVALIDE"; message: string }
  /**
   * C2, la reference est prise. PORTE LE NOM DU PRODUIT porteur, cas d'erreur
   * du parcours 3 : sans lui, l'exploitante chercherait a la main dans tout le
   * catalogue, variantes archivees comprises, C14.
   */
  | { statut: "REFERENCE_PRISE"; reference: string; nomProduit: string }
  | { statut: "INTROUVABLE" }
  /** C13, la variante est deja sortie du catalogue. */
  | { statut: "DEJA_ARCHIVEE" }
  /**
   * Une reservation active tient la piece, `database.md`. LE REFUS N'EST PAS
   * DEFINITIF : il impose un controle humain avant de retirer du catalogue une
   * piece qu'un client est peut-etre en train de payer.
   */
  | { statut: "RESERVATION_ACTIVE"; nombreReservations: number }
  | { statut: "INDISPONIBLE" };

/**
 * Exige le role et traduit le refus, sans distinguer ses deux causes.
 *
 * Session absente et role insuffisant rendent la MEME valeur : les separer
 * renseignerait sur l'existence du compte d'administration.
 */
async function exigerRole(): Promise<boolean> {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
    return true;
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return false;
    }
    throw erreur;
  }
}

/**
 * Traduit les refus previsibles du service en valeurs d'interface.
 *
 * TOUT CE QUI N'EST PAS UN REFUS CONNU EST UNE PANNE, journalisee puis rendue
 * en `INDISPONIBLE`. Rendre `INVALIDE` par defaut ferait accuser la saisie de
 * l'exploitante pour une base injoignable.
 */
function traduireErreur(erreur: unknown, operation: string): ResultatVariante {
  if (erreur instanceof EntreeInvalideError) {
    return { statut: "INVALIDE", message: erreur.message };
  }
  if (erreur instanceof ReferenceDejaPriseError) {
    return {
      statut: "REFERENCE_PRISE",
      reference: erreur.reference,
      nomProduit: erreur.nomProduit,
    };
  }
  if (
    erreur instanceof VarianteIntrouvableError ||
    erreur instanceof ProduitIntrouvableError
  ) {
    return { statut: "INTROUVABLE" };
  }
  if (erreur instanceof VarianteDejaArchiveeError) {
    return { statut: "DEJA_ARCHIVEE" };
  }
  if (erreur instanceof ReservationActiveError) {
    return {
      statut: "RESERVATION_ACTIVE",
      nombreReservations: erreur.nombreReservations,
    };
  }

  // AUCUNE DONNEE SAISIE DANS LE JOURNAL, invariant 9 : ce depot est public et
  // le journal vit en sortie standard. Ni la reference, ni le prix.
  journaliser("error", "Operation de variante indisponible", {
    operation,
    erreur: erreur instanceof Error ? erreur.name : typeof erreur,
  });
  return { statut: "INDISPONIBLE" };
}

/** Chemin revalide apres toute ecriture, pour que l'ecran rendu suive. */
function chemin(produitId: string): string {
  return `/administration/produits/${produitId}`;
}

export async function creerVarianteAction(
  produitId: unknown,
  reference: unknown,
  libelle: unknown,
  dimensions: unknown,
  prixEuros: unknown,
  quantitePhysique: unknown,
): Promise<ResultatVariante> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await creerVariante({
      produitId,
      reference,
      libelle,
      dimensions,
      prixEuros,
      quantitePhysique,
    });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "creerVariante");
  }
}

/**
 * Modifie une variante active.
 *
 * `produitId` NE SERT QU'A REVALIDER LE CHEMIN, jamais a autoriser : le droit
 * vient de la session, et le service refuse un identifiant de variante inconnu
 * comme une variante archivee.
 */
export async function modifierVarianteAction(
  produitId: unknown,
  id: unknown,
  reference: unknown,
  libelle: unknown,
  dimensions: unknown,
  prixEuros: unknown,
  quantitePhysique: unknown,
): Promise<ResultatVariante> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await modifierVariante({
      id,
      reference,
      libelle,
      dimensions,
      prixEuros,
      quantitePhysique,
    });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "modifierVariante");
  }
}

/**
 * Archive une variante, C13. IL N'EXISTE AUCUNE ACTION DE SUPPRESSION.
 *
 * Ce n'est pas un oubli : une variante supprimee libererait sa reference, qui
 * pourrait etre reattribuee, et les avis comme les statistiques de l'ancienne
 * piece remonteraient sur la nouvelle. L'archivage est le chemin legitime, et le
 * seul.
 */
export async function archiverVarianteAction(
  produitId: unknown,
  id: unknown,
): Promise<ResultatVariante> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await archiverVariante({ id });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "archiverVariante");
  }
}
