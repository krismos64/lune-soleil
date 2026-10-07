"use server";

/**
 * Publier, archiver ou retirer une selection de produits, LS-242 et LS-279.
 *
 * ADAPTATEUR D'ENTREE : session, champs du formulaire, delegation. La regle,
 * passer chaque produit par le chemin unitaire et ses gardes, vit dans le
 * service `publierOuArchiverProduits`.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliserErreur } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import { exigerRole } from "@/services/autorisation";
import {
  publierOuArchiverProduits,
  retirerProduitsDeLEspace,
  type BilanGroupe,
} from "@/services/catalogue";
import {
  appliquerPrixProduits,
  previsualiserPrixProduits,
  RecapitulatifPrixPerimeError,
  type VariantePourPrix,
} from "@/services/variante";

export type ResultatSelectionProduits =
  | ({ statut: "SUCCES" } & BilanGroupe)
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INVALIDE" }
  | { statut: "INDISPONIBLE" };

export async function appliquerSelectionProduits(
  formulaire: FormData,
): Promise<ResultatSelectionProduits> {
  if (!(await exigerRole(await headers()))) {
    return { statut: "SESSION_ABSENTE" };
  }

  /*
   * UNE OPERATION INCONNUE EST UNE ENTREE INVALIDE, jamais une publication
   * par defaut : un formulaire forge ne choisit pas le sens du geste par
   * omission.
   */
  const operation = formulaire.get("operation");

  if (
    operation !== "publier" &&
    operation !== "archiver" &&
    operation !== "retirer"
  ) {
    return { statut: "INVALIDE" };
  }

  try {
    const produitIds = formulaire.getAll("produitId");
    const bilan =
      operation === "retirer"
        ? await retirerProduitsDeLEspace({ produitIds })
        : await publierOuArchiverProduits({ produitIds, operation });

    // `"layout"` : les pastilles de la barre lisent le catalogue.
    revalidatePath("/administration/produits", "layout");

    return { statut: "SUCCES", ...bilan };
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE" };
    }

    journaliserErreur("action groupee sur les produits impossible", erreur, {});

    return { statut: "INDISPONIBLE" };
  }
}

/**
 * Un même prix pour plusieurs articles, LS-265 : récapitulatif puis
 * application, deux actions distinctes. Le récapitulatif ne modifie rien.
 *
 * ADAPTATEURS D'ENTRÉE comme la publication groupée : session, champs,
 * délégation. La règle, toutes les variantes en vente et un prix non nul en
 * centimes entiers, vit dans `services/variante.ts`.
 */
export type ResultatPrixSelection =
  | {
      statut: "RECAPITULATIF";
      lignes: VariantePourPrix[];
      prixCentimes: number;
    }
  | { statut: "APPLIQUE"; variantes: number; prixCentimes: number }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "PERIME" }
  | { statut: "INVALIDE" }
  | { statut: "INDISPONIBLE" };

export async function previsualiserPrixSelection(
  formulaire: FormData,
): Promise<ResultatPrixSelection> {
  if (!(await exigerRole(await headers()))) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    const recapitulatif = await previsualiserPrixProduits({
      produitIds: formulaire.getAll("produitId"),
      prixEuros: formulaire.get("prixEuros"),
    });
    return { statut: "RECAPITULATIF", ...recapitulatif };
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE" };
    }
    journaliserErreur("recapitulatif de prix impossible", erreur, {});
    return { statut: "INDISPONIBLE" };
  }
}

export async function appliquerPrixSelection(
  formulaire: FormData,
): Promise<ResultatPrixSelection> {
  if (!(await exigerRole(await headers()))) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    const bilan = await appliquerPrixProduits({
      produitIds: formulaire.getAll("produitId"),
      varianteIds: formulaire.getAll("varianteId"),
      prixEuros: formulaire.get("prixEuros"),
    });

    /*
     * LA PAGE SEULE, ET NON `"layout"` : la barre ne compte ni ne montre aucun
     * prix, C37 demande de raisonner sur la donnée lue et non sur le dossier.
     */
    revalidatePath("/administration/produits");

    return { statut: "APPLIQUE", ...bilan };
  } catch (erreur) {
    if (erreur instanceof RecapitulatifPrixPerimeError) {
      return { statut: "PERIME" };
    }
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE" };
    }
    journaliserErreur("prix groupe impossible", erreur, {});
    return { statut: "INDISPONIBLE" };
  }
}
