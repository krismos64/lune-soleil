"use server";

/**
 * Adaptateur d'entree de l'administration des commandes, LS-121.
 *
 * CE FICHIER NE DECIDE RIEN : il lit les en-tetes, exige le role, delegue au
 * service et traduit le resultat. La table des transitions permises et
 * l'historisation vivent dans `services/administration-commandes.ts`.
 *
 * CHAQUE ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE. Une
 * Server Action est invocable DIRECTEMENT, sans passer par le rendu de l'ecran :
 * proteger la page seule laisserait ce chemin ouvert. Defaut trouve en relecture
 * de LS-89, retrouve en LS-106.
 *
 * L'ACTEUR VIENT DE LA SESSION, jamais d'un `FormData`, invariant 2. Aucune
 * signature ici n'accepte d'identifiant d'utilisateur : un `acteurId` recu de
 * l'interface permettrait d'attribuer une transition a n'importe qui, S9.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliserErreur } from "@/lib/journal";
import { EntreeInvalideError, schemaIdentifiant } from "@/lib/validation";
import type { StatutCommande } from "@/generated/prisma/enums";
import { exigerRole } from "@/services/autorisation";
import { changerStatutCommande } from "@/services/administration-commandes";
import { rendreFacture } from "@/services/document-comptable";
import { demanderRemboursement } from "@/services/avoir";
import { centimesDepuisEuros } from "@/services/variante-validation";
import { fournisseurStripe } from "@/integrations/stripe";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * LES REFUS SONT DES VALEURS, pas des pannes : « elle est deja expediee » est
 * une situation prevue, qui se presente avec l'etat reel plutot qu'avec un
 * message d'echec technique.
 */
export type ResultatTransition =
  | { statut: "SUCCES"; nouveauStatut: StatutCommande }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, identifiant difforme ou statut inconnu. */
  | { statut: "INVALIDE" }
  /** Aucune commande sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /** La transition n'est pas permise depuis l'etat courant. */
  | { statut: "TRANSITION_REFUSEE"; statutActuel: StatutCommande }
  /** Panne technique, deja journalisee. */
  | { statut: "INDISPONIBLE" };

/** Chemin de l'ecran, revalide apres chaque ecriture. */
const CHEMIN_COMMANDES = "/administration/commandes";

/**
 * Les valeurs de statut qu'une entree d'interface peut porter.
 *
 * LA LISTE EST FERMEE ET VERIFIEE ICI, invariant 7 : le statut arrive d'un
 * `FormData`, donc il n'est pas fiable. Le passer tel quel au service ferait
 * dependre la securite du typage TypeScript, qui n'existe plus a l'execution.
 */
const STATUTS_CONNUS = [
  "EN_ATTENTE_PAIEMENT",
  "CONFIRMEE",
  "EN_PREPARATION",
  "EXPEDIEE",
  "LIVREE",
  "ANNULEE",
] as const;

function estStatutConnu(valeur: unknown): valeur is StatutCommande {
  return (
    typeof valeur === "string" &&
    (STATUTS_CONNUS as readonly string[]).includes(valeur)
  );
}

/**
 * Fait avancer une commande, sur decision de l'exploitante.
 *
 * LA GARDE EST LA PREMIERE INSTRUCTION, avant toute lecture de l'entree : la
 * verifier apres reviendrait a laisser un appelant non autorise sonder
 * l'existence d'une commande par la difference entre `INTROUVABLE` et
 * `SESSION_ABSENTE`.
 */
export async function changerStatut(
  formulaire: FormData,
): Promise<ResultatTransition> {
  const identite = await exigerRole(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  const commandeId = formulaire.get("commandeId");
  const nouveauStatut = formulaire.get("nouveauStatut");

  if (typeof commandeId !== "string" || !estStatutConnu(nouveauStatut)) {
    return { statut: "INVALIDE" };
  }

  try {
    const issue = await changerStatutCommande({
      commandeId,
      nouveauStatut,
      acteurId: identite.utilisateurId,
    });

    if (issue.statut === "SUCCES") {
      revalidatePath(CHEMIN_COMMANDES);
      revalidatePath(`${CHEMIN_COMMANDES}/${commandeId}`);
    }

    return issue;
  } catch (erreur) {
    /*
     * UNE ENTREE INVALIDE N'EST PAS UNE PANNE, et la distinction compte :
     * rendre `INDISPONIBLE` par defaut ferait accuser la base pour un
     * identifiant difforme. La cause va au journal, jamais a l'ecran,
     * invariant 9.
     */
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE" };
    }

    journaliserErreur(
      "Changement de statut de commande impossible",
      erreur,
      {},
    );

    return { statut: "INDISPONIBLE" };
  }
}

/** Ce que la regeneration d'un document rend a l'interface. */
export type ResultatRegeneration =
  | { statut: "SUCCES" }
  /** Le document existait deja, aucun rendu n'a ete refait. */
  | { statut: "DEJA_PRESENT" }
  | { statut: "INTROUVABLE" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INVALIDE" }
  /** Le rendu a echoue : `cheminPdf` reste nul et une alerte a ete levee. */
  | { statut: "ECHEC" };

/**
 * Relance le rendu du PDF d'une facture, LS-129 critere 4.
 *
 * ELLE NE REATTRIBUE AUCUN NUMERO, critere 5, et rien ici ne le pourrait : le
 * service ne connait qu'un identifiant de facture et n'a aucun acces au
 * compteur, ADR-031. La seule colonne ecrite est `cheminPdf`.
 *
 * `factureId` VIENT DU FORMULAIRE, ET C'EST SANS DANGER ICI : le role est exige
 * avant toute lecture, et l'administratrice a acces a toutes les factures. Ce
 * n'est PAS le cas de l'acces client, LS-57 et LS-132, ou un identifiant d'URL
 * n'autorise rien par lui-meme, invariant 2.
 */
export async function regenererDocument(
  formulaire: FormData,
): Promise<ResultatRegeneration> {
  const identite = await exigerRole(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  const factureId = formulaire.get("factureId");
  const commandeId = formulaire.get("commandeId");

  if (typeof factureId !== "string" || typeof commandeId !== "string") {
    return { statut: "INVALIDE" };
  }

  const issue = await rendreFacture(factureId);

  if (issue.statut === "RENDU") {
    revalidatePath(`${CHEMIN_COMMANDES}/${commandeId}`);

    return { statut: "SUCCES" };
  }

  if (issue.statut === "DEJA_RENDU") {
    return { statut: "DEJA_PRESENT" };
  }

  if (issue.statut === "INTROUVABLE") {
    return { statut: "INTROUVABLE" };
  }

  /*
   * L'ECHEC EST UNE VALEUR, PAS UNE EXCEPTION. `rendreFacture` ne leve jamais :
   * il a deja journalise la cause et leve l'`AlerteCritique`. L'ecran annonce
   * que la generation a echoue, sans exposer la cause technique, invariant 9.
   */
  return { statut: "ECHEC" };
}

/** Ce que la demande de remboursement rend a l'interface. */
export type ResultatRemboursement =
  | { statut: "SUCCES"; numeroAvoir: string; montantCentimes: number }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Session valide, mais l'identite n'a pas ete prouvee depuis quinze minutes. */
  | { statut: "REAUTHENTIFICATION_REQUISE" }
  /** Entree refusee : identifiant difforme, montant illisible, motif vide. */
  | { statut: "INVALIDE"; message: string }
  | { statut: "AUCUN_PAIEMENT" }
  | { statut: "FACTURE_ABSENTE" }
  | { statut: "MONTANT_TROP_ELEVE"; restantCentimes: number }
  /** Refus definitif du prestataire : relancer a l'identique ne servira a rien. */
  | { statut: "REFUSE_PRESTATAIRE" }
  /** Le prestataire ne repond pas. Rien n'a change, reessayer a du sens. */
  | { statut: "PRESTATAIRE_INDISPONIBLE" }
  /** Cette demande est deja partie : le double clic sort ici. */
  | { statut: "DEJA_DEMANDE" }
  /** Panne technique, deja journalisee. */
  | { statut: "INDISPONIBLE" };

/**
 * Longueur maximale du motif d'avoir.
 *
 * IL FINIT DANS L'INSTANTANE LEGAL de l'avoir, document opposable : une chaine
 * demesuree y entrerait telle quelle et deborderait le rendu PDF. La borne est
 * appliquee ici, sur l'entree non fiable, invariant 7.
 */
const LONGUEUR_MAXIMALE_MOTIF = 200;

/**
 * Rembourse tout ou partie d'une commande, sur geste de l'exploitante. LS-160.
 *
 * LA GARDE DE ROLE EST ICI *ET* DANS LE SERVICE, et ce n'est pas une
 * redondance inutile. Elle repond a deux questions differentes selon l'endroit :
 * ici elle ferme le point d'entree HTTP, une Server Action etant invocable
 * directement sans passer par le rendu de l'ecran ; dans le service elle
 * accompagne la garde de fraicheur, qu'un futur appelant ne doit pas pouvoir
 * contourner en appelant le service sans passer par cette action.
 *
 * LA GARDE DE FRAICHEUR RESTE DANS LE SERVICE, elle, avec la marque qui la
 * declare : le controle la cherche dans le corps de la fonction marquee, jamais
 * dans son appelant.
 *
 * LA REFERENCE DE DEMANDE VIENT DU FORMULAIRE, engendree UNE FOIS au rendu
 * serveur de la page. C'est elle qui ferme le double clic : deux envois
 * successifs portent la meme reference, donc la meme cle d'idempotence, donc le
 * second sort en `DEJA_DEMANDE` sans jamais appeler le prestataire.
 *
 * ELLE N'AUTORISE RIEN, invariant 2. Une reference forgee ne donne acces a
 * aucune commande : elle ne fait qu'identifier un geste, et le role est exige
 * avant toute lecture. Au pire une reference inventee ouvre une intention
 * neuve, ce que le montant borne par le restant remboursable encadre deja.
 */
export async function rembourser(
  formulaire: FormData,
): Promise<ResultatRemboursement> {
  /*
   * LA GARDE EST LA PREMIERE INSTRUCTION, avant toute lecture de l'entree, meme
   * motif que `changerStatut` : la verifier apres laisserait un appelant sans
   * role sonder l'existence d'une commande par la difference entre deux refus.
   */
  const identite = await exigerRole(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  const commandeId = formulaire.get("commandeId");
  const montantSaisi = formulaire.get("montant");
  const motif = formulaire.get("motif");
  const referenceDemande = formulaire.get("referenceDemande");

  if (
    typeof commandeId !== "string" ||
    typeof montantSaisi !== "string" ||
    typeof motif !== "string" ||
    typeof referenceDemande !== "string"
  ) {
    return { statut: "INVALIDE", message: "Demande non valide." };
  }

  /*
   * LA REFERENCE EST VALIDEE COMME UN IDENTIFIANT, pas seulement « non vide ».
   *
   * ELLE PART TELLE QUELLE AU PRESTATAIRE, concatenee dans la cle
   * d'idempotence, en-tete `Idempotency-Key` que Stripe borne a 255 caracteres.
   * Une reference de 100 000 caracteres traversait toute la chaine : mesure par
   * la revue critique le 1er septembre 2026. Le pire cas n'est pas le rejet mais
   * la TRONCATURE, deux demandes distinctes partageant alors le meme prefixe et
   * l'idempotence cessant de distinguer ce qu'elle existe pour distinguer.
   *
   * `schemaIdentifiant` BORNE LA LONGUEUR ET L'ALPHABET EN UNE LIGNE, et c'est
   * exactement la forme que la page engendre, `randomUUID()`. Une Server Action
   * est un point d'entree HTTP invocable directement : rien n'oblige a passer
   * par l'ecran, donc rien ne garantit la forme sans cette validation.
   */
  const reference = schemaIdentifiant.safeParse(referenceDemande);

  /*
   * `commandeId` EST VALIDE DE LA MEME FACON, et pour une raison distincte : il
   * atteint `revalidatePath` en interpolation de chemin. Le chemin est sain
   * aujourd'hui, cette ligne n'etant atteinte qu'apres un remboursement REUSSI,
   * donc sur une commande dont le paiement a ete lu en base. La validation vaut
   * pour la cohérence avec le reste de ce fichier et pour que la question ne se
   * repose pas au prochain changement d'ordre des instructions.
   */
  const commande = schemaIdentifiant.safeParse(commandeId);

  if (!reference.success || !commande.success) {
    return { statut: "INVALIDE", message: "Demande non valide." };
  }

  /*
   * LA SAISIE EST EN EUROS, LE SERVICE ATTEND DES CENTIMES, invariant 1. La
   * conversion passe par `centimesDepuisEuros`, qui decoupe la chaine et refuse
   * tout ce qui n'est pas un decimal a deux chiffres au plus : ni notation
   * scientifique, ni negatif, ni arrondi silencieux d'un troisieme chiffre.
   */
  const montantCentimes = centimesDepuisEuros(montantSaisi);

  if (montantCentimes === null) {
    return {
      statut: "INVALIDE",
      message: "Montant illisible. Deux décimales au plus, sans signe.",
    };
  }

  if (montantCentimes === 0) {
    /*
     * ZERO EST UN MONTANT VALIDE POUR `schemaMontantCentimes`, un avoir partiel
     * pouvant solder a zero, mais il n'est pas une DEMANDE valide : rembourser
     * zero euro ferait partir un appel au prestataire et naitre un avoir sans
     * qu'aucun argent ne bouge.
     */
    return {
      statut: "INVALIDE",
      message: "Un remboursement de zéro euro n'a pas d'objet.",
    };
  }

  const motifNettoye = motif.trim();

  if (motifNettoye === "" || motifNettoye.length > LONGUEUR_MAXIMALE_MOTIF) {
    return {
      statut: "INVALIDE",
      message: `Le motif est obligatoire, ${LONGUEUR_MAXIMALE_MOTIF} caractères au plus.`,
    };
  }

  try {
    const issue = await demanderRemboursement(await headers(), {
      commandeId: commande.data,
      montantCentimes,
      motif: motifNettoye,
      fournisseur: fournisseurStripe,
      referenceDemande: reference.data,
    });

    if (issue.statut === "REMBOURSE") {
      revalidatePath(`${CHEMIN_COMMANDES}/${commande.data}`);

      return {
        statut: "SUCCES",
        numeroAvoir: issue.numeroAvoir,
        montantCentimes: issue.montantCentimes,
      };
    }

    if (issue.statut === "REFUSE_PRESTATAIRE") {
      /*
       * LE CODE DU PRESTATAIRE NE SORT PAS A L'ECRAN. Il est deja journalise
       * par le service : l'afficher exposerait un detail d'integration sans
       * aider l'exploitante, qui ne peut de toute facon rien en faire.
       */
      return { statut: "REFUSE_PRESTATAIRE" };
    }

    return issue;
  } catch (erreur) {
    /*
     * `PrestatairePaiementIndisponibleError` NE REMONTE PAS JUSQU'ICI, et le
     * rattraper serait une branche morte. Le service l'intercepte deja, y
     * compris le cas « aucune cle Stripe configuree » : `clientStripe()` est
     * appele DANS `fournisseur.rembourser`, donc dans le `try` du service, qui
     * rend `PRESTATAIRE_INDISPONIBLE` et libere l'intention.
     *
     * CE QUI SORT ICI EST UNE VRAIE PANNE, base injoignable en tete. Elle est
     * journalisee et l'ecran dit « indisponible », sans exposer la cause,
     * invariant 9.
     */
    journaliserErreur("Remboursement impossible", erreur, {});

    return { statut: "INDISPONIBLE" };
  }
}
