"use server";

/**
 * Adaptateur d'entree de l'editeur de fiche produit, LS-100 et LS-87.
 *
 * CE FICHIER NE DECIDE RIEN : il lit les en-tetes, exige le role, delegue au
 * service et traduit le resultat en valeurs que l'interface sait afficher. Les
 * regles C20, C22 et C23 vivent dans `services/sections-produit.ts`.
 *
 * CHAQUE ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE.
 * Une Server Action est invocable DIRECTEMENT, sans passer par le rendu de
 * l'ecran : proteger la page seule laisserait ce chemin ouvert. C'est le defaut
 * trouve en relecture de LS-89.
 *
 * L'IDENTITE VIENT DE LA SESSION, jamais d'un parametre, invariant 2. Les
 * identifiants recus DESIGNENT une ressource, ils ne l'autorisent pas, et le
 * service verifie l'appartenance d'une section a son produit.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import { exigerRole } from "@/services/autorisation";
import {
  ProduitIntrouvableError as ProduitIntrouvableCatalogueError,
  enregistrerInformationsProduit,
} from "@/services/catalogue";
import {
  OrdreSectionsIncompletError,
  ProduitIntrouvableError,
  SectionIntrouvableError,
  ajouterSection,
  basculerVisibilite,
  modifierSection,
  reordonnerSections,
  supprimerSection,
} from "@/services/sections-produit";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * Une exception qui traverse une Server Action produit la page d'erreur
 * generique de Next.js, et l'administratrice perd le texte qu'elle etait en
 * train d'ecrire. Les issues previsibles sont des VALEURS, meme convention
 * qu'en LS-89 et LS-99.
 */
export type ResultatSection =
  | { statut: "SUCCES" }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, avec le message destine au champ concerne. */
  | { statut: "INVALIDE"; message: string }
  /** La section ou le produit n'existe plus, ou n'appartient pas a ce produit. */
  | { statut: "INTROUVABLE" }
  /** L'ordre transmis ne couvre pas toutes les sections du produit. */
  | { statut: "ORDRE_INCOMPLET" }
  | { statut: "INDISPONIBLE" };

/**
 * Traduit les refus previsibles du service en valeurs d'interface.
 *
 * TOUT CE QUI N'EST PAS UN REFUS CONNU EST UNE PANNE, journalisee puis rendue
 * en `INDISPONIBLE`. Rendre `INVALIDE` par defaut ferait accuser la saisie de
 * l'administratrice pour une base injoignable.
 */
function traduireErreur(erreur: unknown, operation: string): ResultatSection {
  if (erreur instanceof EntreeInvalideError) {
    return { statut: "INVALIDE", message: erreur.message };
  }
  if (
    erreur instanceof SectionIntrouvableError ||
    erreur instanceof ProduitIntrouvableError ||
    erreur instanceof ProduitIntrouvableCatalogueError
  ) {
    return { statut: "INTROUVABLE" };
  }
  if (erreur instanceof OrdreSectionsIncompletError) {
    return { statut: "ORDRE_INCOMPLET" };
  }

  // AUCUNE DONNEE SAISIE DANS LE JOURNAL, invariant 9 : ce depot est public et
  // le journal vit en sortie standard. Le contenu d'une section est du texte
  // libre ecrit par l'exploitante, il n'a rien a y faire.
  journaliser("error", "Operation de fiche produit indisponible", {
    operation,
    erreur: erreur instanceof Error ? erreur.name : typeof erreur,
  });
  return { statut: "INDISPONIBLE" };
}

/** Chemin revalide apres toute ecriture, pour que l'ecran rendu suive. */
function chemin(produitId: string): string {
  return `/administration/produits/${produitId}`;
}

/**
 * Enregistre les informations generales du produit.
 *
 * CETTE ACTION NE RECREE AUCUNE SECTION, ADR-026 decision 5. C'est le geste
 * ordinaire de l'administratrice, et c'est exactement celui qu'une
 * initialisation defensive detournerait pour faire revenir une section
 * supprimee.
 */
export async function enregistrerInformationsAction(
  id: unknown,
  nom: unknown,
  descriptionCourte: unknown,
): Promise<ResultatSection> {
  if (!(await exigerRole(await headers()))) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await enregistrerInformationsProduit({ id, nom, descriptionCourte });
    if (typeof id === "string") {
      revalidatePath(chemin(id));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "enregistrerInformationsProduit");
  }
}

export async function ajouterSectionAction(
  produitId: unknown,
  titre: unknown,
): Promise<ResultatSection> {
  if (!(await exigerRole(await headers()))) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await ajouterSection({ produitId, titre });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "ajouterSection");
  }
}

/**
 * Ecrit le titre et le contenu d'une section.
 *
 * `produitId` NE SERT QU'A REVALIDER LE CHEMIN, jamais a autoriser : le droit
 * vient de la session, et le service refuse un identifiant de section inconnu.
 */
export async function modifierSectionAction(
  produitId: unknown,
  id: unknown,
  titre: unknown,
  contenu: unknown,
): Promise<ResultatSection> {
  if (!(await exigerRole(await headers()))) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await modifierSection({ id, titre, contenu });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "modifierSection");
  }
}

/** Masque ou reaffiche. LE CONTENU N'EST PAS TOUCHE, C22. */
export async function basculerVisibiliteAction(
  produitId: unknown,
  id: unknown,
  visible: unknown,
): Promise<ResultatSection> {
  if (!(await exigerRole(await headers()))) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await basculerVisibilite({ id, visible });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "basculerVisibilite");
  }
}

/**
 * Supprime une section, contenu compris, ADR-026 decision 5.
 *
 * L'AVERTISSEMENT AVANT SUPPRESSION EST PORTE PAR L'INTERFACE, et cette action
 * ne le rejoue pas : une confirmation cote serveur supposerait un etat de
 * dialogue que le serveur n'a pas.
 */
export async function supprimerSectionAction(
  produitId: unknown,
  id: unknown,
): Promise<ResultatSection> {
  if (!(await exigerRole(await headers()))) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await supprimerSection({ id });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "supprimerSection");
  }
}

/**
 * Reordonne les sections selon la liste complete transmise.
 *
 * L'ENTREE RESTE `unknown` JUSQU'AU SERVICE, qui la valide. La typer en
 * `string[]` ici donnerait une fausse assurance : une Server Action recoit ce
 * que l'appelant envoie, et TypeScript ne verifie rien a l'execution.
 */
export async function reordonnerSectionsAction(
  produitId: unknown,
  ids: unknown,
): Promise<ResultatSection> {
  if (!(await exigerRole(await headers()))) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await reordonnerSections({ produitId, ids });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "reordonnerSections");
  }
}
