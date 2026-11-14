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
import {
  schemaDemandePromotion,
  schemaPeriodePromotion,
} from "@/lib/promotion";
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
  | { statut: "ARTICLE_INCONNU" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "REAUTHENTIFICATION_REQUISE" }
  | { statut: "INVALIDE"; message: string }
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
  const demande = action === "DESACTIVER" ? null : demandeDuFormulaire(donnees);
  if (demande !== null) {
    // Le message du premier refus est rendu ici, pour que l'exploitante lise
    // « entre 5 et 70 % » et non « invalide » ; le service revalide de toute
    // façon, il ne se fie pas à ce passage.
    const lu = schemaDemandePromotion.safeParse(demande);
    if (!lu.success) {
      return {
        statut: "INVALIDE",
        message:
          lu.error.issues[0]?.message ?? "Cette promotion n'est pas valide.",
      };
    }
  }
  try {
    const issue = await basculerPromotion(
      enTetes,
      demande === null
        ? { action: "DESACTIVER" }
        : { action: "ACTIVER", demande },
    );
    // `DEJA_ACTIVE` et `AUCUNE_ACTIVE` disent que l'écran était périmé : il
    // se relit aussi, sans quoi chaque nouvel envoi échouerait de même.
    if (
      issue.statut === "ACTIVEE" ||
      issue.statut === "DESACTIVEE" ||
      issue.statut === "DEJA_ACTIVE" ||
      issue.statut === "AUCUNE_ACTIVE"
    ) {
      revalidatePath("/", "layout");
    }
    return issue;
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return {
        statut: "INVALIDE",
        message: "Cette promotion n'est pas valide.",
      };
    }
    journaliser("error", "Bascule de la promotion indisponible", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}

/**
 * La demande telle que le formulaire l'envoie, LS-324 : le nom, la portée, le
 * taux général, et pour chaque article coché son taux, champ `taux-<id>`.
 * RIEN N'EST VALIDÉ ICI : un taux vide devient `NaN`, que le schéma refuse.
 */
function demandeDuFormulaire(donnees: FormData): unknown {
  const nombre = (valeur: FormDataEntryValue | null): number =>
    typeof valeur === "string" && valeur.trim() !== ""
      ? Number(valeur)
      : Number.NaN;
  const articles = donnees
    .getAll("article")
    .filter((valeur): valeur is string => typeof valeur === "string")
    .map((produitId) => ({
      produitId,
      taux: nombre(donnees.get(`taux-${produitId}`)),
    }));
  const code = donnees.get("code");
  return donnees.get("portee") === "SELECTION"
    ? { code, portee: "SELECTION", articles }
    : { code, portee: "TOUT", taux: nombre(donnees.get("taux")), articles };
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
