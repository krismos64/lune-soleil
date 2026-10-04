"use server";

/**
 * Adaptateur d'entrée du choix du thème saisonnier, ADR-046, LS-267.
 *
 * SANS RÉAUTHENTIFICATION, à la différence des tarifs : changer d'habillage
 * ne touche ni un montant ni un destinataire d'alerte. Le rôle reste exigé
 * avant toute lecture du formulaire, invariant 2.
 *
 * REVALIDATION DES PAGES QUI LISENT LE THÈME : l'accueil, le catalogue, cet
 * écran et le tableau de bord, qui le rappelle tant qu'il n'est pas `AUCUN`.
 * Les deux pages publiques sont dynamiques ; la règle tient le jour où l'une
 * deviendrait statique, ADR-046 point 5.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import { exigerRole } from "@/services/autorisation";
import { ParametresAbsentsError } from "@/services/parametres";
import {
  choisirThemeSaisonnier,
  type ThemeSaisonnier,
} from "@/services/theme-saisonnier";

export type ResultatTheme =
  | { statut: "SUCCES"; theme: ThemeSaisonnier }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INVALIDE" }
  | { statut: "PARAMETRES_ABSENTS" }
  | { statut: "INDISPONIBLE" };

export async function choisirTheme(
  _precedent: ResultatTheme | null,
  donnees: FormData,
): Promise<ResultatTheme> {
  if ((await exigerRole(await headers())) === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    const theme = await choisirThemeSaisonnier(donnees.get("theme"));
    for (const chemin of [
      "/",
      "/catalogue",
      "/administration",
      "/administration/parametres",
    ]) {
      revalidatePath(chemin);
    }
    return { statut: "SUCCES", theme };
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE" };
    }
    if (erreur instanceof ParametresAbsentsError) {
      return { statut: "PARAMETRES_ABSENTS" };
    }
    journaliser("error", "Choix du thème saisonnier indisponible", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}
