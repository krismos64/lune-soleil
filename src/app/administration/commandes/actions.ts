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
import { EntreeInvalideError } from "@/lib/validation";
import type { StatutCommande } from "@/generated/prisma/enums";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import type { IdentiteAppelant } from "@/services/autorisation";
import { changerStatutCommande } from "@/services/administration-commandes";
import { rendreFacture } from "@/services/document-comptable";

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
 * Exige le role et rend l'IDENTITE, pas seulement un booleen.
 *
 * L'acteur est necessaire a l'historisation : le rendre ici evite qu'une action
 * le relise, ou pire, l'accepte en parametre.
 *
 * Session absente et role insuffisant rendent la MEME valeur, comme
 * `AutorisationRefuseeError` les confond : les separer renseignerait sur
 * l'existence du compte d'administration.
 */
async function exigerRole(): Promise<IdentiteAppelant | null> {
  const enTetes = await headers();

  try {
    return await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return null;
    }
    throw erreur;
  }
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
  const identite = await exigerRole();

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
  const identite = await exigerRole();

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
