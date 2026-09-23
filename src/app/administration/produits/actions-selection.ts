"use server";

/**
 * Publier ou archiver une selection de produits, LS-242.
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
  type BilanGroupe,
} from "@/services/catalogue";

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

  if (operation !== "publier" && operation !== "archiver") {
    return { statut: "INVALIDE" };
  }

  try {
    const bilan = await publierOuArchiverProduits({
      produitIds: formulaire.getAll("produitId"),
      operation,
    });

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
