"use server";

/**
 * Adaptateur d'entree de la rubrique Messages, LS-97.
 *
 * CE FICHIER NE DECIDE RIEN : il lit le `FormData`, exige le role et delegue.
 * L'horodatage conditionnel de `luA` vit dans `services/message-contact.ts`.
 *
 * L'ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE. Une
 * Server Action est invocable DIRECTEMENT, sans passer par le rendu de
 * l'ecran : proteger la page seule laisserait ce chemin ouvert. Defaut trouve
 * en relecture de LS-89, retrouve en LS-106.
 *
 * L'ASYMETRIE AVEC LE FORMULAIRE PUBLIC EST VOULUE. Deposer un message ne
 * demande aucune identite, c'est le principe d'un formulaire de contact ; LIRE
 * les messages en exige une, ils portent le nom, l'adresse et les mots de
 * personnes qui ecrivaient a la boutique et non au monde.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { StatutMessage } from "@/generated/prisma/enums";
import { journaliserErreur } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import { exigerRole } from "@/services/autorisation";
import { changerStatutMessage } from "@/services/message-contact";

/** Ce que l'interface recoit, jamais une exception. */
export type ResultatStatutMessage =
  | { statut: "SUCCES"; nouveauStatut: StatutMessage }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, identifiant difforme ou statut inconnu. */
  | { statut: "INVALIDE" }
  /** Aucun message sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /** Panne technique, deja journalisee. */
  | { statut: "INDISPONIBLE" };

/** Chemin de la rubrique, revalide apres chaque ecriture. */
const CHEMIN_MESSAGES = "/administration/messages";

/**
 * Les valeurs de statut qu'une entree d'interface peut porter.
 *
 * LA LISTE EST FERMEE ET VERIFIEE ICI, invariant 7 : le statut arrive d'un
 * `FormData`, donc il n'est pas fiable. Le passer tel quel au service ferait
 * dependre la correction du typage TypeScript, qui n'existe plus a l'execution.
 *
 * ECRITE EN DUR PLUTOT QUE DERIVEE DE L'ENUM PRISMA, meme motif que
 * `schemaModeLivraison` : une valeur ajoutee a l'enum ouvrirait sinon EN
 * SILENCE la saisie a un statut dont aucun ecran ne sait quoi faire.
 */
const STATUTS_CONNUS = ["NOUVEAU", "LU", "TRAITE"] as const;

function estStatutConnu(valeur: unknown): valeur is StatutMessage {
  return (
    typeof valeur === "string" &&
    (STATUTS_CONNUS as readonly string[]).includes(valeur)
  );
}

/**
 * Fait avancer le statut d'un message, sur geste de l'exploitante.
 *
 * LA GARDE EST LA PREMIERE INSTRUCTION, avant toute lecture de l'entree : la
 * verifier apres laisserait un appelant sans role sonder l'existence d'un
 * message par la difference entre `INTROUVABLE` et `SESSION_ABSENTE`.
 */
export async function changerStatut(
  formulaire: FormData,
): Promise<ResultatStatutMessage> {
  const identite = await exigerRole(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  const messageId = formulaire.get("messageId");
  const nouveauStatut = formulaire.get("nouveauStatut");

  if (typeof messageId !== "string" || !estStatutConnu(nouveauStatut)) {
    return { statut: "INVALIDE" };
  }

  try {
    const issue = await changerStatutMessage({
      messageId,
      statut: nouveauStatut,
    });

    if (issue.statut === "SUCCES") {
      /*
       * ------------------------------------------------------------------
       * `"layout"` ET NON LE DEFAUT, LS-201, ET C'EST UN DEFAUT PRODUIT.
       *
       * `revalidatePath(chemin)` invalide la PAGE seule, verifie via Context7 :
       * l'option `"layout"` invalide en plus le layout et tout ce qui vit
       * dessous.
       *
       * LA PASTILLE DES MESSAGES EST CALCULEE PAR LE LAYOUT,
       * `administration/layout.tsx` appelant `lireComptages`, alors que la
       * liste est rendue par la page, qui porte `export const dynamic =
       * "force-dynamic"`. Sans cette option, classer un message rafraichissait
       * la liste en laissant la pastille sur son ancienne valeur.
       *
       * CE QUE L'EXPLOITANTE VOYAIT : elle classe son dernier message non lu,
       * la liste se vide, et la barre de navigation continue d'annoncer « 1 ».
       * Elle rouvre alors l'ecran pour n'y rien trouver.
       *
       * MESURE DU 7 SEPTEMBRE 2026, par le test de bout en bout qui compare les
       * deux : « Pastille "1" pour 0 affiches. Sujets non lus : [] ». Il
       * n'echouait que sous charge, le layout etant souvent recalcule pour
       * d'autres raisons, ce qui masquait le defaut la plupart du temps.
       *
       * LA PORTEE RESTE CELLE DE L'ADMINISTRATION : `CHEMIN_MESSAGES` designe
       * `/administration/messages`, donc son layout parent et les ecrans qui le
       * partagent. Ce n'est pas `revalidatePath("/", "layout")`, qui purgerait
       * le cache client entier pour un simple classement.
       * ------------------------------------------------------------------
       */
      revalidatePath(CHEMIN_MESSAGES, "layout");

      return { statut: "SUCCES", nouveauStatut };
    }

    return { statut: "INTROUVABLE" };
  } catch (erreur) {
    /*
     * UNE ENTREE INVALIDE N'EST PAS UNE PANNE : rendre `INDISPONIBLE` par
     * defaut ferait accuser la base pour un identifiant difforme. La cause va
     * au journal, jamais a l'ecran, invariant 9.
     */
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE" };
    }

    journaliserErreur("changement de statut de message impossible", erreur, {});

    return { statut: "INDISPONIBLE" };
  }
}
