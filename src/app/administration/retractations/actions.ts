"use server";

/**
 * Adaptateur d'entree de la rubrique Retractations, LS-135. Parcours 5,
 * etapes 6 a 9.
 *
 * CE FICHIER NE DECIDE RIEN : il lit le `FormData`, exige le role et delegue.
 * Les transitions, le montant du et l'ordre des ecritures vivent dans
 * `services/traitement-retractation.ts`.
 *
 * CHAQUE ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE. Une
 * Server Action est invocable DIRECTEMENT par HTTP, sans passer par le rendu de
 * l'ecran : proteger la page seule laisserait ce chemin ouvert. Defaut trouve
 * en relecture de LS-89, retrouve en LS-106, et
 * `verifier-gardes-administration.sh` le verifie FONCTION PAR FONCTION.
 *
 * LA GARDE EST LA PREMIERE INSTRUCTION DE CHAQUE ACTION, avant toute lecture du
 * `FormData`. Le service porte la meme regle, et pour le meme motif : ses refus
 * nomment l'etat reel de la demande, ce qui en ferait un oracle si un appelant
 * non autorise pouvait les obtenir.
 *
 * AUCUN MONTANT NE VIENT D'ICI VERS LE PRESTATAIRE SANS PASSER PAR LE SERVICE :
 * `rembourserRetractation` reverifie le montant du et delegue les deux gardes a
 * `demanderRemboursement`, qui porte la fraicheur d'identite.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliserErreur } from "@/lib/journal";
import {
  EntreeInvalideError,
  schemaIdentifiant,
  valider,
} from "@/lib/validation";
import { exigerRole } from "@/services/autorisation";
import { centimesDepuisEuros } from "@/services/variante-validation";
import { fournisseurStripe } from "@/integrations/stripe";
import {
  constaterReception,
  enregistrerPreuveExpedition,
  ouvrirAttenteRetour,
  refuserRetractation,
  rembourserRetractation,
} from "@/services/traitement-retractation";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * LES REFUS SONT DES VALEURS, pas des pannes : « elle est deja remboursee » est
 * une situation prevue, qui se presente avec l'etat reel plutot qu'avec un
 * message d'echec technique.
 */
export type ResultatTransition =
  | { statut: "SUCCES" }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, identifiant difforme ou champ manquant. */
  | { statut: "INVALIDE"; message: string }
  /** Aucune demande sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /** La demande n'est pas dans un etat d'ou cette transition part. */
  | { statut: "STATUT_INCOMPATIBLE"; statutActuel: string }
  /** Un refus exige son motif, regle L2. */
  | { statut: "MOTIF_REQUIS" }
  /** Le colis est deja marque recu, un colis ne se recoit qu'une fois. */
  | { statut: "DEJA_RECUE" }
  /** Panne technique, deja journalisee. */
  | { statut: "INDISPONIBLE" };

/**
 * Ce qu'une demande de remboursement rend a l'ecran.
 *
 * ELLE DISTINGUE TOUS LES REFUS, contrairement aux acces client de LS-132 :
 * l'appelante est l'exploitante, et « le prestataire ne repond pas » appelle un
 * reessai quand « le montant depasse le du » appelle une correction. Les
 * confondre la ferait relancer indefiniment un remboursement impossible.
 */
export type ResultatRemboursement =
  | { statut: "SUCCES"; numeroAvoir: string; montantCentimes: number }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "REAUTHENTIFICATION_REQUISE" }
  | { statut: "INVALIDE"; message: string }
  | { statut: "INTROUVABLE" }
  | { statut: "STATUT_INCOMPATIBLE"; statutActuel: string }
  /** Ni preuve d'expedition ni reception : aucun fait de l'article L221-24. */
  | { statut: "AUCUN_FAIT_DECLENCHEUR" }
  | { statut: "MONTANT_SUPERIEUR_AU_DU"; montantDuCentimes: number }
  | { statut: "AUCUN_PAIEMENT" }
  | { statut: "FACTURE_ABSENTE" }
  | { statut: "MONTANT_TROP_ELEVE"; restantCentimes: number }
  | { statut: "REFUSE_PRESTATAIRE"; code: string }
  | { statut: "PRESTATAIRE_INDISPONIBLE" }
  | { statut: "DEJA_DEMANDE" }
  | { statut: "INDISPONIBLE" };

/** Chemin de la rubrique, revalide apres chaque ecriture. */
const CHEMIN_RETRACTATIONS = "/administration/retractations";

/**
 * Longueur maximale d'une preuve d'expedition.
 *
 * C'EST UN NUMERO DE SUIVI, jamais un recit. La borne existe parce que le champ
 * est persiste et relu : sans elle, un collage accidentel remplirait la colonne
 * d'une page entiere.
 */
const PREUVE_LONGUEUR_MAX = 200;

/** Longueur maximale d'un motif de refus, qui se justifie en quelques lignes. */
const MOTIF_LONGUEUR_MAX = 2000;

/**
 * Lit un identifiant de demande depuis le formulaire.
 *
 * IL PASSE PAR `schemaIdentifiant`, invariant 7 : la valeur vient d'un
 * `FormData`, donc elle n'est pas fiable. Le typage TypeScript n'existe plus a
 * l'execution et ne garantit rien ici.
 */
function lireIdentifiant(donnees: FormData): string {
  return valider(schemaIdentifiant, donnees.get("demandeId"));
}

/** Accuse reception et ouvre l'attente du retour, etapes 5 et 6. */
export async function ouvrirRetour(
  donnees: FormData,
): Promise<ResultatTransition> {
  const identite = await exigerRole(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  let demandeId: string;

  try {
    demandeId = lireIdentifiant(donnees);
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }

  try {
    const issue = await ouvrirAttenteRetour(demandeId);

    if (issue.statut === "APPLIQUEE") {
      revalidatePath(CHEMIN_RETRACTATIONS);
      return { statut: "SUCCES" };
    }

    /*
     * LES TROIS CAS SONT DISCRIMINES UN PAR UN, jamais par un `else` fourre-tout.
     * `IssueTransition` porte aussi `MOTIF_REQUIS`, que ces transitions ne
     * rendent pas : `tsc` l'a refuse plutot que de le laisser passer, et un
     * transtypage aurait ferme le compilateur au lieu du trou. Une issue
     * ajoutee au service fera echouer la compilation ici, ce qui est le but.
     */
    if (issue.statut === "INTROUVABLE") {
      return { statut: "INTROUVABLE" };
    }

    if (issue.statut === "STATUT_INCOMPATIBLE") {
      return {
        statut: "STATUT_INCOMPATIBLE",
        statutActuel: issue.statutActuel,
      };
    }

    return { statut: "INDISPONIBLE" };
  } catch (erreur) {
    journaliserErreur("Ouverture du retour impossible", erreur, {});
    return { statut: "INDISPONIBLE" };
  }
}

/**
 * Enregistre la preuve d'expedition fournie par le client, etape 7a.
 *
 * LA PREUVE EST DECLARATIVE, ET CELA NE CHANGE RIEN A L'OBLIGATION : un numero
 * de suivi transmis par le client suffit a faire courir le remboursement,
 * article L221-24. L'exploitante n'a pas a le verifier aupres du transporteur
 * avant de rembourser, le litige sur un retour jamais expedie se traitant apres.
 */
export async function declarerPreuveExpedition(
  donnees: FormData,
): Promise<ResultatTransition> {
  const identite = await exigerRole(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  let demandeId: string;

  try {
    demandeId = lireIdentifiant(donnees);
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }

  const preuve = String(donnees.get("preuve") ?? "")
    .trim()
    .slice(0, PREUVE_LONGUEUR_MAX);

  if (preuve.length === 0) {
    return {
      statut: "INVALIDE",
      message: "Indiquez le numéro de suivi ou la preuve fournie.",
    };
  }

  try {
    const issue = await enregistrerPreuveExpedition(demandeId, preuve);

    if (issue.statut === "APPLIQUEE") {
      revalidatePath(CHEMIN_RETRACTATIONS);
      return { statut: "SUCCES" };
    }

    /*
     * LES TROIS CAS SONT DISCRIMINES UN PAR UN, jamais par un `else` fourre-tout.
     * `IssueTransition` porte aussi `MOTIF_REQUIS`, que ces transitions ne
     * rendent pas : `tsc` l'a refuse plutot que de le laisser passer, et un
     * transtypage aurait ferme le compilateur au lieu du trou. Une issue
     * ajoutee au service fera echouer la compilation ici, ce qui est le but.
     */
    if (issue.statut === "INTROUVABLE") {
      return { statut: "INTROUVABLE" };
    }

    if (issue.statut === "STATUT_INCOMPATIBLE") {
      return {
        statut: "STATUT_INCOMPATIBLE",
        statutActuel: issue.statutActuel,
      };
    }

    return { statut: "INDISPONIBLE" };
  } catch (erreur) {
    journaliserErreur("Preuve d'expedition non enregistree", erreur, {});
    return { statut: "INDISPONIBLE" };
  }
}

/**
 * Constate la reception du colis, etape 7b.
 *
 * ELLE NE CHANGE AUCUN STATUT, regle L12, et l'ecran le dit en toutes lettres :
 * une demande deja remboursee reste remboursee. C'est ce qui permet de la
 * declarer trois semaines apres le versement.
 */
export async function declarerReception(
  donnees: FormData,
): Promise<ResultatTransition> {
  const identite = await exigerRole(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  let demandeId: string;

  try {
    demandeId = lireIdentifiant(donnees);
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }

  try {
    const issue = await constaterReception(demandeId);

    if (issue.statut === "HORODATEE") {
      revalidatePath(CHEMIN_RETRACTATIONS);
      return { statut: "SUCCES" };
    }

    return issue.statut === "INTROUVABLE"
      ? { statut: "INTROUVABLE" }
      : { statut: "DEJA_RECUE" };
  } catch (erreur) {
    journaliserErreur("Reception non enregistree", erreur, {});
    return { statut: "INDISPONIBLE" };
  }
}

/** Refuse une demande, avec son motif obligatoire, regle L2. */
export async function refuser(donnees: FormData): Promise<ResultatTransition> {
  const identite = await exigerRole(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  let demandeId: string;

  try {
    demandeId = lireIdentifiant(donnees);
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }

  const motif = String(donnees.get("motif") ?? "")
    .trim()
    .slice(0, MOTIF_LONGUEUR_MAX);

  try {
    const issue = await refuserRetractation(demandeId, motif);

    if (issue.statut === "APPLIQUEE") {
      revalidatePath(CHEMIN_RETRACTATIONS);
      return { statut: "SUCCES" };
    }

    if (issue.statut === "MOTIF_REQUIS") {
      return { statut: "MOTIF_REQUIS" };
    }

    /*
     * LES TROIS CAS SONT DISCRIMINES UN PAR UN, jamais par un `else` fourre-tout.
     * `IssueTransition` porte aussi `MOTIF_REQUIS`, que ces transitions ne
     * rendent pas : `tsc` l'a refuse plutot que de le laisser passer, et un
     * transtypage aurait ferme le compilateur au lieu du trou. Une issue
     * ajoutee au service fera echouer la compilation ici, ce qui est le but.
     */
    if (issue.statut === "INTROUVABLE") {
      return { statut: "INTROUVABLE" };
    }

    if (issue.statut === "STATUT_INCOMPATIBLE") {
      return {
        statut: "STATUT_INCOMPATIBLE",
        statutActuel: issue.statutActuel,
      };
    }

    return { statut: "INDISPONIBLE" };
  } catch (erreur) {
    journaliserErreur("Refus de retractation impossible", erreur, {});
    return { statut: "INDISPONIBLE" };
  }
}

/**
 * Rembourse une retractation et emet l'avoir, etape 8.
 *
 * LA REFERENCE DE DEMANDE VIENT DU FORMULAIRE, engendree UNE FOIS au rendu de
 * la page, meme mecanique que l'ecran de remboursement de LS-160 : deux clics
 * l'envoient a l'identique, donc le second sort en « deja demande » sans
 * appeler le prestataire. NE PAS L'ENGENDRER ICI, chaque appel en produirait
 * une neuve et un second remboursement REEL partirait.
 *
 * LE MONTANT EST CONVERTI PAR `saisieVersCentimes`, jamais par un
 * `parseFloat` : invariant 1, aucun flottant dans un calcul monetaire.
 */
export async function rembourser(
  donnees: FormData,
): Promise<ResultatRemboursement> {
  const enTetes = await headers();
  const identite = await exigerRole(enTetes);

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  let demandeId: string;

  try {
    demandeId = lireIdentifiant(donnees);
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }

  /*
   * LA SAISIE EST EN EUROS, LE SERVICE ATTEND DES CENTIMES, invariant 1. La
   * conversion passe par `centimesDepuisEuros`, qui DECOUPE LA CHAINE et refuse
   * tout ce qui n'est pas un decimal a deux chiffres au plus : un `parseFloat`
   * accepterait la notation scientifique et arrondirait un troisieme chiffre en
   * silence, sur un montant qui sort reellement de la caisse.
   */
  const montantCentimes = centimesDepuisEuros(
    String(donnees.get("montant") ?? ""),
  );

  if (montantCentimes === null) {
    return {
      statut: "INVALIDE",
      message: "Montant illisible. Deux décimales au plus, sans signe.",
    };
  }

  if (montantCentimes === 0) {
    /*
     * ZERO N'EST PAS UNE DEMANDE VALIDE : l'appel partirait au prestataire et
     * un avoir naitrait sans qu'aucun argent ne bouge.
     */
    return {
      statut: "INVALIDE",
      message: "Un remboursement de zéro euro n'a pas d'objet.",
    };
  }

  const referenceDemande = String(donnees.get("referenceDemande") ?? "");

  if (referenceDemande.length === 0) {
    return {
      statut: "INVALIDE",
      message: "Rechargez la page avant de relancer le remboursement.",
    };
  }

  try {
    const issue = await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes,
      fournisseur: fournisseurStripe,
      referenceDemande,
    });

    if (issue.statut === "REMBOURSE") {
      revalidatePath(CHEMIN_RETRACTATIONS);

      return {
        statut: "SUCCES",
        numeroAvoir: issue.numeroAvoir,
        montantCentimes: issue.montantCentimes,
      };
    }

    return issue;
  } catch (erreur) {
    journaliserErreur("Remboursement de retractation impossible", erreur, {});
    return { statut: "INDISPONIBLE" };
  }
}
