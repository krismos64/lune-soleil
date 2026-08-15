"use server";

/**
 * Adaptateur d'entree des medias d'un produit, LS-102. ADR-007.
 *
 * TROISIEME FICHIER D'ACTIONS DE CET ECRAN, apres les sections et les
 * variantes. Meme motif qu'en LS-101 : les trois domaines servent le meme ecran
 * mais leurs refus n'ont rien de commun. Un format d'image refuse n'a aucun sens
 * pour une section, une reference deja prise n'en a aucun pour un media.
 *
 * CE FICHIER NE DECIDE RIEN : il exige le role, delegue au service et traduit
 * le resultat. Les regles C7, C8 et C9 vivent dans `services/media.ts`.
 *
 * CHAQUE ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE. Une
 * Server Action est invocable DIRECTEMENT, sans passer par le rendu de l'ecran.
 * C'est le critere 8 de la story, et il porte le mot « et » : la garde de la
 * page ne dispense d'aucune des gardes d'action.
 *
 * L'IDENTITE VIENT DE LA SESSION, jamais d'un parametre, invariant 2.
 *
 * LE PLAFOND DE CORPS DES SERVER ACTIONS EST PORTE A 25 Mo dans
 * `next.config.ts`, sans quoi le defaut de 1 Mo de Next.js refuserait toute
 * photographie de telephone AVANT que ce fichier ne s'execute. Le refus
 * viendrait alors du framework, avec une erreur generique, et le message de
 * `FichierTropVolumineuxError` ne serait jamais atteint.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { TAILLE_MAX_OCTETS } from "@/services/media-validation";
import {
  FichierNonImageError,
  FichierTropVolumineuxError,
  FormatRefuseError,
  MediaIntrouvableError,
  OrdreMediasIncompletError,
  ProduitIntrouvableError,
  ecrireTexteAlternatif,
  reordonnerMedias,
  supprimerMedia,
  televerserPhotographie,
} from "@/services/media";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * Une exception qui traverse une Server Action produit la page d'erreur
 * generique de Next.js, et l'exploitante perd la saisie en cours.
 */
export type ResultatMedia =
  | { statut: "SUCCES" }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, avec le message destine au champ concerne. */
  | { statut: "INVALIDE"; message: string }
  | { statut: "INTROUVABLE" }
  /**
   * Le fichier n'est pas une photographie exploitable, ou son format est
   * refuse. LES DEUX CAS SONT FONDUS EN UN SEUL a dessein : pour qui televerse,
   * « ce fichier n'est pas une photographie » est la meme information, et
   * distinguer un SVG d'un fichier illisible renseignerait sur les filtres.
   */
  | { statut: "FICHIER_REFUSE" }
  /** Le fichier depasse la taille acceptee, avec la borne pour le message. */
  | { statut: "TROP_VOLUMINEUX"; tailleMaxOctets: number }
  /**
   * Le traitement a echoue sur un fichier pourtant lisible. LE MEDIA EXISTE EN
   * BASE au statut `ECHOUE` et RIEN N'A ETE PUBLIE, C8 : l'ecran doit l'afficher
   * pour que l'exploitante le voie et le reprenne, plutot que de le masquer.
   */
  | { statut: "TRAITEMENT_ECHOUE" }
  /** L'ordre transmis ne couvre pas exactement les medias du produit. */
  | { statut: "ORDRE_INCOMPLET" }
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
 * en `INDISPONIBLE`. Le disque plein et la base injoignable passent par ici :
 * ADR-007 n'ayant aucun fournisseur tiers, ce sont les deux pannes reelles de
 * ce chemin.
 */
function traduireErreur(erreur: unknown, operation: string): ResultatMedia {
  if (erreur instanceof EntreeInvalideError) {
    return { statut: "INVALIDE", message: erreur.message };
  }
  if (
    erreur instanceof FormatRefuseError ||
    erreur instanceof FichierNonImageError
  ) {
    return { statut: "FICHIER_REFUSE" };
  }
  if (erreur instanceof FichierTropVolumineuxError) {
    return { statut: "TROP_VOLUMINEUX", tailleMaxOctets: TAILLE_MAX_OCTETS };
  }
  if (
    erreur instanceof MediaIntrouvableError ||
    erreur instanceof ProduitIntrouvableError
  ) {
    return { statut: "INTROUVABLE" };
  }
  if (erreur instanceof OrdreMediasIncompletError) {
    return { statut: "ORDRE_INCOMPLET" };
  }

  // AUCUNE DONNEE DU FICHIER DANS LE JOURNAL, invariant 9 : ce depot est
  // public. Ni le nom du fichier, qui porte souvent une date et un lieu, ni
  // ses octets.
  journaliser("error", "Operation de media indisponible", {
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
 * Televerse une photographie et la traite.
 *
 * LE FICHIER ARRIVE PAR UN `FormData`, seule forme qui transporte des octets
 * jusqu'a une Server Action. Tout le reste de cet ecran passe des arguments
 * nommes, et cet ecart est impose par le transport.
 *
 * LES OCTETS SONT LA SEULE SOURCE DE VERITE SUR LE CONTENU. Ni le nom du
 * fichier, ni le type MIME annonce par le navigateur ne sont lus ici : ce sont
 * des donnees non fiables, invariant 7, et `traitement.ts` juge le contenu sur
 * la signature du fichier.
 *
 * UN TRAITEMENT EN ECHEC N'EST PAS UNE EXCEPTION pour le service, qui rend le
 * media au statut `ECHOUE`. L'action le traduit en `TRAITEMENT_ECHOUE` pour que
 * l'ecran le nomme, et revalide QUAND MEME le chemin : le media en echec doit
 * apparaitre dans la liste, C8, faute de quoi l'exploitante croirait le
 * televersement sans effet.
 */
export async function televerserPhotographieAction(
  produitId: unknown,
  donnees: FormData,
): Promise<ResultatMedia> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  if (typeof produitId !== "string") {
    return { statut: "INVALIDE", message: "Produit inconnu." };
  }

  const fichier = donnees.get("fichier");
  if (!(fichier instanceof File)) {
    return { statut: "INVALIDE", message: "Aucun fichier reçu." };
  }

  try {
    const octets = Buffer.from(await fichier.arrayBuffer());
    const media = await televerserPhotographie(produitId, octets);

    revalidatePath(chemin(produitId));

    // LE STATUT DU MEDIA DECIDE, PAS L'ABSENCE D'EXCEPTION. Le service rend un
    // media en echec sans lever quand la panne n'est pas imputable a la saisie.
    if (media.statutTraitement === "ECHOUE") {
      return { statut: "TRAITEMENT_ECHOUE" };
    }

    return { statut: "SUCCES" };
  } catch (erreur) {
    // LE CHEMIN EST REVALIDE MEME EN CAS D'ERREUR, et c'est delibere : un refus
    // de format laisse une ligne `ECHOUE` en base que l'ecran doit montrer.
    revalidatePath(chemin(produitId));
    return traduireErreur(erreur, "televerserPhotographie");
  }
}

/**
 * Ecrit le texte alternatif d'un media, C7.
 *
 * IL RESTE FACULTATIF ICI, et c'est la publication qui l'exigera, LS-103 :
 * l'exploitante televerse ses photographies puis les decrit, plutot que d'etre
 * bloquee au televersement.
 */
export async function ecrireTexteAlternatifAction(
  produitId: unknown,
  id: unknown,
  texteAlternatif: unknown,
): Promise<ResultatMedia> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await ecrireTexteAlternatif({ id, texteAlternatif });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "ecrireTexteAlternatif");
  }
}

/**
 * Supprime un media, ses fichiers compris.
 *
 * UN MEDIA SE SUPPRIME, A LA DIFFERENCE D'UNE VARIANTE. L'ecart avec C13 n'est
 * pas un oubli : une photographie ne porte ni reference reutilisable, ni avis,
 * ni statistique, et aucune ligne de commande ne la cite. Rien ne se
 * reattribuerait a la piece suivante.
 */
export async function supprimerMediaAction(
  produitId: unknown,
  id: unknown,
): Promise<ResultatMedia> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await supprimerMedia({ id });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "supprimerMedia");
  }
}

/**
 * Reecrit l'ordre complet des medias d'un produit, C9.
 *
 * LA LISTE EST EXHAUSTIVE, du premier rang au dernier : le service en tire les
 * rangs 1..n. Un ordre partiel est refuse plutot que complete, faute de quoi
 * deux medias pourraient partager un rang.
 */
export async function reordonnerMediasAction(
  produitId: unknown,
  ids: unknown,
): Promise<ResultatMedia> {
  if (!(await exigerRole())) {
    return { statut: "SESSION_ABSENTE" };
  }

  try {
    await reordonnerMedias({ produitId, ids });
    if (typeof produitId === "string") {
      revalidatePath(chemin(produitId));
    }
    return { statut: "SUCCES" };
  } catch (erreur) {
    return traduireErreur(erreur, "reordonnerMedias");
  }
}
