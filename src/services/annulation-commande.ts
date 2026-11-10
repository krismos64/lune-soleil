/**
 * Annulation d'une commande en attente par le client. LS-315, ADR-050.
 *
 * LE DEFAUT QUE CE SERVICE FERME, mesure en production le 10 novembre 2026 :
 * un client sorti de la page de paiement autrement que par son bouton de
 * retour trouvait un panier vide et sa piece unique affichee epuisee,
 * reservee par sa propre commande, jusqu'a trente minutes.
 *
 * L'ORDRE DES ETAPES EST LA DECISION D'ADR-050, chacune fermant un croisement :
 *
 * 1. sous le verrou de la commande, relever ses sessions de paiement ;
 * 2. HORS transaction, les expirer chez le prestataire, ADR-024. Une session
 *    expiree ne se paie plus : c'est le prestataire qui arbitre entre
 *    l'annulation et un paiement en cours ;
 * 3. une transaction, variantes puis commande puis reservations, l'ordre du
 *    webhook et de la liberation.
 *
 * AUCUNE ALERTE, arbitrage du 10 novembre 2026 : renoncer n'est pas une
 * anomalie, contrairement a une commande morte faute de paiement.
 */
import { journaliserErreur } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant, valider } from "@/lib/validation";
import {
  type FournisseurPaiement,
  PrestatairePaiementIndisponibleError,
} from "@/integrations/stripe/fournisseur";
import {
  annulerSiEnAttente,
  lignesPourPanier,
  verrouillerCommande,
} from "@/repositories/commande";
import { historiserTransition } from "@/repositories/confirmation";
import { sessionsEnAttente } from "@/repositories/paiement";
import {
  rendreReservationsDeCommande,
  verrouillerVariantesDeCommande,
} from "@/repositories/stock";
import { estInterblocage } from "@/services/reservation";

/** Ce que l'annulation peut rendre. L'ecran choisit les mots. */
export type IssueAnnulation =
  /** Annulee, pieces rendues : `lignes` reconstruit le panier. */
  | {
      statut: "ANNULEE";
      lignes: { varianteId: string; quantite: number }[];
    }
  /** Une session est payee, l'evenement n'est pas encore arrive. */
  | { statut: "PAIEMENT_EN_COURS" }
  /** Introuvable, deja annulee ou deja confirmee. */
  | { statut: "NON_ANNULABLE" }
  /** Un reessai de paiement a croise l'annulation : recommencer. */
  | { statut: "REESSAYER" }
  /** Le prestataire ne repond pas : rien n'a change. */
  | { statut: "PANNE" };

const TENTATIVES_MAXIMUM = 3;

/**
 * Refus decouvert DANS la transaction. Il leve pour l'annuler : `$transaction`
 * valide sur un `return`, et les reservations deja rendues seraient
 * committees, `database.md`.
 */
class AnnulationInterrompue extends Error {
  constructor(readonly issue: IssueAnnulation) {
    super(`Annulation interrompue : ${issue.statut}`);
    this.name = "AnnulationInterrompue";
  }
}

/**
 * Annule la commande en attente designee par le cookie signe du client.
 *
 * `commandeId` NE DOIT VENIR QUE DU COOKIE SIGNE `ls_commande`, invariant 2 :
 * ce service ne verifie aucune propriete, c'est la signature qui la porte. Il
 * reste valide par Zod, invariant 7, etant appelable par un autre chemin.
 */
export async function annulerCommandeEnAttente({
  commandeId,
  fournisseur,
  client = prisma,
}: {
  commandeId: string;
  fournisseur: FournisseurPaiement;
  client?: typeof prisma;
}): Promise<IssueAnnulation> {
  const identifiant = valider(schemaIdentifiant, commandeId);

  // ETAPE 1. Le verrou serialise cette lecture avec un rattachement concurrent.
  const releve = await client.$transaction(async (transaction) => {
    const statut = await verrouillerCommande(transaction, identifiant);

    if (statut !== "EN_ATTENTE_PAIEMENT") {
      return null;
    }

    return sessionsEnAttente(transaction, identifiant);
  });

  if (releve === null) {
    return { statut: "NON_ANNULABLE" };
  }

  // ETAPE 2. Hors transaction : un appel reseau ne tient jamais un verrou.
  const arbitrage = await rendreSessionsImpayables(
    fournisseur,
    identifiant,
    releve,
  );

  if (arbitrage !== null) {
    return arbitrage;
  }

  // ETAPE 3, rejouee sur interblocage, jamais sur un refus metier.
  let derniereErreur: unknown;

  for (let tentative = 1; tentative <= TENTATIVES_MAXIMUM; tentative += 1) {
    try {
      return await annulerEtRendre(client, identifiant, releve);
    } catch (erreur) {
      if (erreur instanceof AnnulationInterrompue) {
        return erreur.issue;
      }

      if (!estInterblocage(erreur)) {
        throw erreur;
      }

      derniereErreur = erreur;
    }
  }

  journaliserErreur("annulation par le client interbloquee", derniereErreur, {
    commandeId: identifiant,
  });

  return { statut: "REESSAYER" };
}

/**
 * Expire chaque session chez le prestataire. `null` si toutes sont impayables.
 *
 * `DEJA_FERMEE` NE DIT PAS POURQUOI, ADR-032 : payee ou expiree. La lecture de
 * la session tranche. Une session encore OUVERTE apres un refus d'expiration
 * n'a pas d'explication sure : on ne conclut pas, le client recommence.
 *
 * UNE PANNE ARRETE TOUT. Sans reponse, la session est peut-etre encore
 * payable, et annuler ouvrirait le paiement sur commande annulee.
 */
async function rendreSessionsImpayables(
  fournisseur: FournisseurPaiement,
  commandeId: string,
  sessions: readonly string[],
): Promise<IssueAnnulation | null> {
  for (const session of sessions) {
    try {
      const expiration = await fournisseur.expirerSession(session);

      if (expiration === "EXPIREE") {
        continue;
      }

      const etat = await fournisseur.lireSession(session);

      if (etat.etat === "PAYEE") {
        return { statut: "PAIEMENT_EN_COURS" };
      }

      if (etat.etat === "OUVERTE") {
        return { statut: "REESSAYER" };
      }
    } catch (cause) {
      if (!(cause instanceof PrestatairePaiementIndisponibleError)) {
        throw cause;
      }

      journaliserErreur("annulation, prestataire indisponible", cause, {
        commandeId,
      });

      return { statut: "PANNE" };
    }
  }

  return null;
}

/** Etape 3, une transaction. L'ordre des verrous est celui d'ADR-050. */
async function annulerEtRendre(
  client: typeof prisma,
  commandeId: string,
  sessionsExpirees: readonly string[],
): Promise<IssueAnnulation> {
  return client.$transaction(async (transaction) => {
    await verrouillerVariantesDeCommande(transaction, commandeId);

    if (!(await annulerSiEnAttente(transaction, commandeId))) {
      throw new AnnulationInterrompue({ statut: "NON_ANNULABLE" });
    }

    /*
     * LA RELECTURE VIENT APRES LA PRISE DU VERROU DE COMMANDE par l'`UPDATE`
     * ci-dessus. Un rattachement concurrent prend le meme verrou : soit il est
     * deja committe et sa session apparait ici, soit il attend et verra la
     * commande annulee, et expirera alors sa session lui-meme.
     */
    const expirees = new Set(sessionsExpirees);
    const sessions = await sessionsEnAttente(transaction, commandeId);

    if (sessions.some((session) => !expirees.has(session))) {
      throw new AnnulationInterrompue({ statut: "REESSAYER" });
    }

    await rendreReservationsDeCommande(transaction, commandeId);

    await historiserTransition(transaction, {
      commandeId,
      statutPrecedent: "EN_ATTENTE_PAIEMENT",
      statutNouveau: "ANNULEE",
      origine: "CLIENT",
    });

    return {
      statut: "ANNULEE",
      lignes: await lignesPourPanier(transaction, commandeId),
    } as const;
  });
}
