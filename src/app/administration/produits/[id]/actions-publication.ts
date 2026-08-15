"use server";

/**
 * Adaptateur d'entree de la publication d'un produit, LS-103. Parcours 3
 * etape 7.
 *
 * QUATRIEME FICHIER D'ACTIONS DE CET ECRAN, apres les sections, les variantes
 * et les medias. Meme motif : les refus n'ont rien de commun. Une reference
 * deja prise n'a pas de sens pour une publication, et la liste des conditions
 * manquantes n'en a aucun pour une section.
 *
 * CE FICHIER NE DECIDE RIEN. Les regles C1, C7, C8 et C11 vivent dans
 * `services/catalogue.ts`, et elles y sont relues DANS la transaction : ce que
 * l'ecran a affiche ne prouve rien au moment d'ecrire, l'etat ayant pu changer
 * entre les deux.
 *
 * CHAQUE ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE. Une
 * Server Action est invocable DIRECTEMENT, sans passer par le rendu de l'ecran.
 * C'est le critere 7 de la story.
 *
 * L'IDENTITE VIENT DE LA SESSION, jamais d'un parametre, invariant 2.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import {
  ProduitIntrouvableError,
  ProduitNonPubliableError,
  TransitionProduitInvalideError,
  archiverProduit,
  publierProduit,
  type MotifNonPubliable,
} from "@/services/catalogue";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * Une exception qui traverse une Server Action produit la page d'erreur
 * generique de Next.js, et l'exploitante perd la saisie en cours.
 */
export type ResultatPublication =
  | { statut: "SUCCES" }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INVALIDE"; message: string }
  | { statut: "INTROUVABLE" }
  /**
   * C1, C7 et C8. PORTE LA LISTE DES MOTIFS et non un simple refus : le
   * parcours 3 exige que l'ecran indique le champ manquant, et l'exploitante
   * doit pouvoir tout corriger en une passe plutot que de decouvrir les
   * conditions une a une.
   */
  | { statut: "NON_PUBLIABLE"; motifs: MotifNonPubliable[] }
  /** Le produit est deja dans l'etat demande, il n'y avait rien a faire. */
  | { statut: "TRANSITION_INVALIDE" }
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
 * en `INDISPONIBLE`. Rendre `NON_PUBLIABLE` par defaut ferait chercher a
 * l'exploitante un champ manquant qui n'existe pas, devant une base injoignable.
 */
function traduireErreur(
  erreur: unknown,
  operation: string,
): ResultatPublication {
  if (erreur instanceof EntreeInvalideError) {
    return { statut: "INVALIDE", message: erreur.message };
  }
  if (erreur instanceof ProduitNonPubliableError) {
    return { statut: "NON_PUBLIABLE", motifs: erreur.motifs };
  }
  if (erreur instanceof TransitionProduitInvalideError) {
    return { statut: "TRANSITION_INVALIDE" };
  }
  if (erreur instanceof ProduitIntrouvableError) {
    return { statut: "INTROUVABLE" };
  }

  // AUCUNE DONNEE DU PRODUIT DANS LE JOURNAL, invariant 9 : ce depot est public.
  journaliser("error", "Operation de publication indisponible", {
    operation,
    erreur: erreur instanceof Error ? erreur.name : typeof erreur,
  });
  return { statut: "INDISPONIBLE" };
}

/**
 * Chemins revalides apres une transition d'etat.
 *
 * DEUX CHEMINS ET NON UN. Publier ou archiver change ce que voit la LISTE du
 * catalogue autant que la fiche : ne revalider que la fiche laisserait la liste
 * afficher « Brouillon » sur un produit publie, jusqu'au prochain rendu.
 */
function revalider(produitId: string): void {
  revalidatePath(`/administration/produits/${produitId}`);
  revalidatePath("/administration/categories");
}

/**
 * Publie un produit, parcours 3 etape 7.
 *
 * LE REFUS N'EST PAS UNE ERREUR TECHNIQUE mais un resultat metier attendu : un
 * produit incomplet se publie souvent en plusieurs tentatives, l'exploitante
 * travaillant au smartphone entre deux photos.
 */
export async function publierProduitAction(
  produitId: unknown,
): Promise<ResultatPublication> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  if (typeof produitId !== "string") {
    return { statut: "INVALIDE", message: "Produit inconnu." };
  }

  try {
    await publierProduit(produitId);
    revalider(produitId);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "publierProduit");
  }
}

/**
 * Archive un produit, il sort du catalogue.
 *
 * AUCUNE LIGNE DE COMMANDE N'EST TOUCHEE, C11, et aucun mouvement de stock
 * n'est cree : la piece reste vendable en main propre, invariant 6. L'ecran le
 * dit avant de confirmer.
 */
export async function archiverProduitAction(
  produitId: unknown,
): Promise<ResultatPublication> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  if (typeof produitId !== "string") {
    return { statut: "INVALIDE", message: "Produit inconnu." };
  }

  try {
    await archiverProduit(produitId);
    revalider(produitId);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "archiverProduit");
  }
}
