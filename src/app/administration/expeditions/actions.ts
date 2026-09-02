"use server";

/**
 * Adaptateur d'entree de l'expedition, LS-130. Etape 11 du parcours 1.
 *
 * CE FICHIER NE DECIDE RIEN : il lit les en-tetes, exige le role, delegue au
 * service et traduit le resultat. La validation de la saisie, la transition de
 * statut et l'historisation vivent dans `services/expedition.ts`.
 *
 * L'ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE. Une
 * Server Action est invocable DIRECTEMENT, sans passer par le rendu de
 * l'ecran : proteger la page seule laisserait ce chemin ouvert. Defaut trouve
 * en relecture de LS-89, retrouve en LS-106.
 *
 * L'ACTEUR VIENT DE LA SESSION, jamais d'un `FormData`, invariant 2. Aucune
 * signature ici n'accepte d'identifiant d'utilisateur : un `acteurId` recu de
 * l'interface permettrait d'attribuer une expedition a n'importe qui, S9.
 *
 * AUCUN CHAMP DE DATE N'EST LU DE CE FORMULAIRE, et c'est deliberé. Ni
 * `expedieA`, horodate par le serveur, ni surtout `livreA`, qui vient du suivi
 * automatique de LS-131 : accepter une date de livraison saisie ferait courir
 * le delai de retractation depuis une date inventee.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliserErreur } from "@/lib/journal";
import type { StatutCommande } from "@/generated/prisma/enums";
import { EntreeInvalideError, schemaIdentifiant } from "@/lib/validation";
import { exigerRole } from "@/services/autorisation";
import { declarerExpedition } from "@/services/expedition";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * LES REFUS SONT DES VALEURS, pas des pannes : « elle est deja expediee » est
 * une situation prevue, qui se presente avec l'etat reel plutot qu'avec un
 * message d'echec technique.
 */
export type ResultatExpedition =
  | { statut: "SUCCES" }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, le message dit lequel des champs. */
  | { statut: "INVALIDE"; message: string }
  /** Aucune commande sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /**
   * La commande n'est pas dans un etat d'ou l'on expedie.
   *
   * `StatutCommande` ET NON `string`, correction du 2 septembre 2026. Elargir
   * ce type privait l'ecran d'indexer `LIBELLES_STATUT` sans transtypage, donc
   * d'afficher l'etat REEL : le message se contentait alors de « elle n'est
   * plus en preparation », quand la commande peut avoir ete annulee. Un type
   * trop large ne casse rien a la compilation, il ferme une possibilite en
   * silence.
   */
  | { statut: "STATUT_INCOMPATIBLE"; statutActuel: StatutCommande }
  /** Cette commande porte deja une expedition. */
  | { statut: "DEJA_EXPEDIEE" }
  /** Panne technique, deja journalisee. */
  | { statut: "INDISPONIBLE" };

/** Chemin de la file de preparation, revalide apres chaque ecriture. */
const CHEMIN_EXPEDITIONS = "/administration/expeditions";

/** Chemin du detail de commande, qui affiche aussi le statut. */
const CHEMIN_COMMANDES = "/administration/commandes";

/**
 * Declare qu'un colis est parti, sur geste de l'exploitante.
 *
 * LA GARDE EST LA PREMIERE INSTRUCTION, avant toute lecture de l'entree : la
 * verifier apres reviendrait a laisser un appelant non autorise sonder
 * l'existence d'une commande par la difference entre `INTROUVABLE` et
 * `SESSION_ABSENTE`.
 *
 * LA SAISIE N'EST PAS VALIDEE ICI MAIS DANS LE SERVICE, contrairement au
 * remboursement dont le montant demande une conversion euros vers centimes.
 * Ce fichier n'a que des chaines a transmettre : les valider deux fois ferait
 * diverger deux bornes, et `VALIDATION.md` place la forme de l'entree au point
 * d'entree du cas d'usage.
 */
export async function expedier(
  formulaire: FormData,
): Promise<ResultatExpedition> {
  const identite = await exigerRole(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  const commandeId = formulaire.get("commandeId");
  const transporteur = formulaire.get("transporteur");
  const mode = formulaire.get("mode");
  const numeroSuivi = formulaire.get("numeroSuivi");
  const pointRelaisId = formulaire.get("pointRelaisId");

  if (
    typeof commandeId !== "string" ||
    typeof transporteur !== "string" ||
    typeof mode !== "string" ||
    typeof numeroSuivi !== "string" ||
    typeof pointRelaisId !== "string"
  ) {
    return { statut: "INVALIDE", message: "Demande non valide." };
  }

  /*
   * `commandeId` EST VALIDE ICI PARCE QU'IL ATTEINT `revalidatePath` en
   * interpolation de chemin. Le service le valide aussi, pour son propre
   * compte : il est appelable sans passer par cette action.
   */
  const commande = schemaIdentifiant.safeParse(commandeId);

  if (!commande.success) {
    return { statut: "INVALIDE", message: "Demande non valide." };
  }

  try {
    const issue = await declarerExpedition({
      commandeId: commande.data,
      saisie: {
        transporteur,
        mode,
        /*
         * LES CHAMPS VIDES DEVIENNENT NULS, jamais des chaines vides. Un
         * `FormData` ne porte pas de `null` : un champ non rempli arrive en
         * `""`, et le transmettre tel quel ferait echouer la validation du
         * point de retrait sur une livraison a domicile, qui n'en a pas.
         */
        numeroSuivi: numeroSuivi.trim() === "" ? null : numeroSuivi,
        pointRelaisId: pointRelaisId.trim() === "" ? null : pointRelaisId,
      },
      acteurId: identite.utilisateurId,
    });

    if (issue.statut === "EXPEDIEE") {
      revalidatePath(CHEMIN_EXPEDITIONS);
      revalidatePath(`${CHEMIN_COMMANDES}/${commande.data}`);

      return { statut: "SUCCES" };
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
      return { statut: "INVALIDE", message: "Demande non valide." };
    }

    journaliserErreur("Déclaration d'expédition impossible", erreur, {});

    return { statut: "INDISPONIBLE" };
  }
}
