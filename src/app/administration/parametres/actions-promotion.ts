"use server";

/**
 * Adaptateur d'entrée de la promotion de catalogue, ADR-051, LS-319.
 *
 * CE FICHIER NE DÉCIDE RIEN : il lit le formulaire, délègue à
 * `basculerPromotion` et traduit l'issue. La garde de rôle est ici AUSSI,
 * avant toute lecture du formulaire, même redondance délibérée que les
 * tarifs : une Server Action est invocable directement, sans l'écran.
 *
 * REVALIDATION : l'accueil, le catalogue et les fiches affichent le prix
 * réduit, le panier le recalcule, et cet écran rappelle l'état. `"layout"`
 * sur l'administration, règle C37, le tableau de bord pouvant le rappeler.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import { schemaPeriodePromotion } from "@/lib/promotion";
import { exigerRole } from "@/services/autorisation";
import {
  basculerPromotion,
  enregistrerPeriodePromotion,
} from "@/services/promotion";

export type ResultatPromotion =
  | { statut: "ACTIVEE"; libelle: string }
  | { statut: "DESACTIVEE" }
  | { statut: "AUCUNE_ACTIVE" }
  | { statut: "DEJA_ACTIVE" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "REAUTHENTIFICATION_REQUISE" }
  | { statut: "INVALIDE" }
  | { statut: "INDISPONIBLE" };

export async function basculerPromotionAction(
  _precedent: ResultatPromotion | null,
  donnees: FormData,
): Promise<ResultatPromotion> {
  const enTetes = await headers();
  if ((await exigerRole(enTetes)) === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  const action = donnees.get("action");
  try {
    const issue = await basculerPromotion(
      enTetes,
      action === "DESACTIVER"
        ? { action: "DESACTIVER" }
        : { action: "ACTIVER", code: donnees.get("code") },
    );
    if (issue.statut === "ACTIVEE" || issue.statut === "DESACTIVEE") {
      revalidatePath("/", "layout");
    }
    return issue;
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE" };
    }
    journaliser("error", "Bascule de la promotion indisponible", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}

export type ResultatPeriode =
  | { statut: "ENREGISTREE"; periode: string | null }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "PARAMETRES_ABSENTS" }
  | { statut: "INVALIDE"; message: string }
  | { statut: "INDISPONIBLE" };

/**
 * La période annoncée par le bandeau, amendement d'ADR-051 du 13 novembre
 * 2026. Deux champs de date, vides ensemble pour n'annoncer aucune date.
 */
export async function enregistrerPeriodeAction(
  _precedent: ResultatPeriode | null,
  donnees: FormData,
): Promise<ResultatPeriode> {
  const enTetes = await headers();
  if ((await exigerRole(enTetes)) === null) {
    return { statut: "SESSION_ABSENTE" };
  }
  const entree = {
    debut: String(donnees.get("debut") ?? ""),
    fin: String(donnees.get("fin") ?? ""),
  };
  /*
   * LE SCHÉMA EST LU ICI AUSSI, pour un message lisible : l'erreur du service
   * ne porte qu'une chaîne technique. Le service revalide, l'adaptateur
   * n'étant pas le seul chemin possible, `securite.md`.
   */
  const lu = schemaPeriodePromotion.safeParse(entree);
  if (!lu.success) {
    return {
      statut: "INVALIDE",
      message: lu.error.issues[0]?.message ?? "Ces dates ne sont pas valides.",
    };
  }
  try {
    const issue = await enregistrerPeriodePromotion(enTetes, entree);
    if (issue.statut === "ENREGISTREE") {
      revalidatePath("/", "layout");
    }
    return issue;
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: "Ces dates ne sont pas valides." };
    }
    journaliser("error", "Période de la promotion indisponible", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}
