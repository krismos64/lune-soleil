"use server";

/**
 * Adaptateur d'entree des categories du catalogue, LS-99.
 *
 * CE FICHIER NE DECIDE RIEN : il lit les en-tetes, exige le role, delegue au
 * service et traduit le resultat en valeurs que l'interface sait afficher. Les
 * regles C3, C24, C25 et C26 vivent dans `services/catalogue.ts`.
 *
 * CHAQUE ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE.
 * Une Server Action est invocable DIRECTEMENT, sans passer par le rendu de
 * l'ecran : proteger la page seule laisserait ce chemin ouvert. C'est le defaut
 * trouve en relecture de LS-89, ou un client inscrit sur la boutique pouvait
 * atteindre une action reservee.
 *
 * L'IDENTITE VIENT DE LA SESSION, jamais d'un parametre, invariant 2. Aucune
 * signature ici n'accepte d'identifiant d'utilisateur.
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
  CategorieIntrouvableError,
  CategorieNonVideError,
  OrdreIncompletError,
  SlugDejaPrisError,
  creerCategorie,
  creerProduit,
  renommerCategorie,
  reordonnerCategories,
  supprimerCategorie,
} from "@/services/catalogue";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * Une exception qui traverse une Server Action produit la page d'erreur
 * generique de Next.js, et l'administratrice perd le contexte de ce qu'elle
 * faisait. Les issues previsibles sont des VALEURS, meme convention que
 * l'ecran de reauthentification de LS-89.
 */
export type ResultatAction =
  | { statut: "SUCCES" }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, avec le message destine au champ concerne. */
  | { statut: "INVALIDE"; message: string }
  /** Le nom conduit a une adresse deja utilisee, C3. */
  | { statut: "SLUG_DEJA_PRIS" }
  | { statut: "INTROUVABLE" }
  /** C26, la categorie porte des produits. Le nombre sert le message. */
  | { statut: "CATEGORIE_NON_VIDE"; nombreProduits: number }
  /** L'ordre transmis ne couvre pas toutes les categories. */
  | { statut: "ORDRE_INCOMPLET" }
  | { statut: "INDISPONIBLE" };

/** Chemin revalide apres toute ecriture, pour que la liste rendue suive. */
const CHEMIN = "/administration/categories";

/**
 * Exige le role et traduit le refus, sans distinguer ses deux causes.
 *
 * Session absente et role insuffisant rendent la MEME valeur, comme
 * `AutorisationRefuseeError` les confond : les separer renseignerait sur
 * l'existence du compte d'administration.
 */
async function exigerRole(): Promise<Headers | null> {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
    return enTetes;
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return null;
    }
    throw erreur;
  }
}

/**
 * Traduit les refus previsibles du service en valeurs d'interface.
 *
 * TOUT CE QUI N'EST PAS UN REFUS CONNU EST UNE PANNE, journalisee puis rendue
 * en `INDISPONIBLE`. Rendre `INVALIDE` par defaut ferait accuser la saisie de
 * l'administratrice pour une base injoignable.
 */
function traduireErreur(erreur: unknown, operation: string): ResultatAction {
  if (erreur instanceof EntreeInvalideError) {
    return { statut: "INVALIDE", message: erreur.message };
  }
  if (erreur instanceof SlugDejaPrisError) {
    return { statut: "SLUG_DEJA_PRIS" };
  }
  if (erreur instanceof CategorieIntrouvableError) {
    return { statut: "INTROUVABLE" };
  }
  if (erreur instanceof CategorieNonVideError) {
    return {
      statut: "CATEGORIE_NON_VIDE",
      nombreProduits: erreur.nombreProduits,
    };
  }
  if (erreur instanceof OrdreIncompletError) {
    return { statut: "ORDRE_INCOMPLET" };
  }

  // AUCUNE DONNEE SAISIE DANS LE JOURNAL, invariant 9 : ce depot est public et
  // le journal vit en sortie standard. Le nom de l'operation et le type de
  // l'erreur suffisent a diagnostiquer.
  journaliser("error", "Operation de catalogue indisponible", {
    operation,
    erreur: erreur instanceof Error ? erreur.name : typeof erreur,
  });
  return { statut: "INDISPONIBLE" };
}

export async function creerCategorieAction(
  nom: unknown,
): Promise<ResultatAction> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await creerCategorie({ nom });
    revalidatePath(CHEMIN);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "creerCategorie");
  }
}

export async function renommerCategorieAction(
  id: unknown,
  nom: unknown,
): Promise<ResultatAction> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await renommerCategorie({ id, nom });
    revalidatePath(CHEMIN);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "renommerCategorie");
  }
}

/**
 * Reordonne les categories selon la liste complete transmise.
 *
 * L'ENTREE RESTE `unknown` JUSQU'AU SERVICE, qui la valide. La typer en
 * `string[]` ici donnerait une fausse assurance : une Server Action recoit ce
 * que l'appelant envoie, et TypeScript ne verifie rien a l'execution.
 */
export async function reordonnerCategoriesAction(
  ids: unknown,
): Promise<ResultatAction> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await reordonnerCategories(ids);
    revalidatePath(CHEMIN);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "reordonnerCategories");
  }
}

/**
 * Supprime une categorie vide. C26.
 *
 * L'identifiant vient du formulaire, ce qui est legitime : il DESIGNE la
 * ressource, il ne l'autorise pas. Le droit d'agir vient de la session, verifie
 * juste au-dessus, et le service refuse tout identifiant inconnu.
 */
export async function supprimerCategorieAction(
  id: unknown,
): Promise<ResultatAction> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  if (typeof id !== "string") {
    return { statut: "INVALIDE", message: "Categorie non designee." };
  }

  try {
    await supprimerCategorie(id);
    revalidatePath(CHEMIN);
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "supprimerCategorie");
  }
}

export async function creerProduitAction(
  nom: unknown,
  categorieId: unknown,
): Promise<ResultatAction> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await creerProduit({ nom, categorieId });
    revalidatePath(CHEMIN);
    revalidatePath("/administration/produits");
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "creerProduit");
  }
}
