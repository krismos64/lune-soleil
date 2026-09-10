"use server";

/**
 * Adaptateur d'entree de la rubrique Avis, LS-61.
 *
 * CE FICHIER NE DECIDE RIEN : il lit le `FormData`, exige le role, valide la
 * forme et delegue. L'exigence de motif sur un refus, regle R5, et l'ecriture
 * conjointe de `statut` et `decideA`, regle R9, vivent dans `services/avis.ts`.
 *
 * L'ACTION EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE. Une
 * Server Action est invocable DIRECTEMENT, sans passer par le rendu de
 * l'ecran : proteger la page seule laisserait ce chemin ouvert. Defaut trouve
 * en relecture de LS-89, retrouve en LS-106.
 *
 * MODERER N'EST PAS UNE ACTION SENSIBLE au sens d'ADR-027. Aucune des quatre
 * familles ne la couvre : ce n'est ni un identifiant, ni un remboursement, ni un
 * parametre de boutique, et ce n'est pas un export de donnees clients. Publier
 * ou retirer un avis se corrige par le geste inverse, et `motifDecision` garde
 * la trace de chaque decision.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliserErreur } from "@/lib/journal";
import { schemaClotureSignalement, schemaDecisionAvis } from "@/lib/validation";
import { exigerAdministratrice } from "@/services/autorisation";
import { cloturerSignalementAvis, modererAvis } from "@/services/avis";

/** Ce que l'interface recoit, jamais une exception. */
export type ResultatModeration =
  | { statut: "SUCCES" }
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Entree refusee, identifiant difforme ou decision inconnue. */
  | { statut: "INVALIDE" }
  /** Regle R5, un refus ou un retrait sans motif est refuse. */
  | { statut: "MOTIF_MANQUANT" }
  /** Aucun avis sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /** Panne technique, deja journalisee. */
  | { statut: "INDISPONIBLE" };

/** Chemin de la rubrique, revalide apres chaque ecriture. */
const CHEMIN_AVIS = "/administration/avis";

/**
 * Applique une decision de moderation.
 *
 * LA REVALIDATION PORTE `"layout"`, regle C37. La barre affiche le compte des
 * avis a moderer : sans cette option, l'ecran se rafraichit pendant que la
 * pastille garde son ancien nombre, et l'exploitante rouvre un ecran vide pour
 * comprendre pourquoi elle voit encore « 1 ».
 */
export async function appliquerModeration(
  _precedent: ResultatModeration | null,
  donnees: FormData,
): Promise<ResultatModeration> {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch {
    /*
     * LE MOTIF DU REFUS N'EST PAS DISTINGUE, invariant 2 : session absente,
     * expiree ou sans le role rendent la meme chose. Distinguer apprendrait a
     * un appelant si un compte existe.
     */
    return { statut: "SESSION_ABSENTE" };
  }

  const valide = schemaDecisionAvis.safeParse({
    avisId: donnees.get("avisId"),
    statut: donnees.get("decision"),
    /*
     * UN CHAMP ABSENT DU `FormData` REND `null` ET NON `undefined` ICI. Le
     * schema declare `motifDecision` NULLABLE et non optionnel : passer
     * `undefined` ferait echouer la validation sur un formulaire de publication,
     * qui n'a legitimement aucun motif a porter.
     */
    motifDecision: donnees.get("motif") ?? null,
  });

  if (!valide.success) {
    return { statut: "INVALIDE" };
  }

  try {
    const issue = await modererAvis(valide.data);

    if (issue.statut === "REFUSE_MOTIF_MANQUANT") {
      return { statut: "MOTIF_MANQUANT" };
    }

    if (issue.statut === "REFUSE_INTROUVABLE") {
      return { statut: "INTROUVABLE" };
    }

    revalidatePath(CHEMIN_AVIS, "layout");

    return { statut: "SUCCES" };
  } catch (erreur) {
    journaliserErreur("Moderation d'avis indisponible", erreur);

    return { statut: "INDISPONIBLE" };
  }
}

/** Ce qu'une cloture de signalement rend a l'interface. */
export type ResultatCloture =
  | { statut: "SUCCES" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INVALIDE" }
  | { statut: "INTROUVABLE" }
  | { statut: "INDISPONIBLE" };

/**
 * Clot un signalement d'avis apres examen, LS-77.
 *
 * ELLE NE TOUCHE PAS A L'AVIS, deliberement. Retenir un signalement ne retire
 * pas l'avis : c'est `appliquerModeration` qui le fait, avec son propre motif,
 * et les deux gestes restent distincts pour que la decision de moderation porte
 * toujours sa justification propre, regle R5.
 *
 * LA REVALIDATION NE PORTE PAS `"layout"`, a la difference de la moderation.
 * La barre affiche `avisAModerer`, qui compte les AVIS au statut `DEPOSE` :
 * clore un signalement n'en change aucun. Ajouter `"layout"` par symetrie ferait
 * recalculer neuf agregats pour rien, ce que la regle C37 demande d'eviter en
 * raisonnant sur la donnee et jamais sur le dossier.
 */
export async function cloturerSignalement(
  _precedent: ResultatCloture | null,
  donnees: FormData,
): Promise<ResultatCloture> {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch {
    return { statut: "SESSION_ABSENTE" };
  }

  const valide = schemaClotureSignalement.safeParse({
    signalementId: donnees.get("signalementId"),
    statut: donnees.get("decision"),
    suiteDonnee: donnees.get("suite") ?? null,
  });

  if (!valide.success) {
    return { statut: "INVALIDE" };
  }

  try {
    const issue = await cloturerSignalementAvis(valide.data);

    if (issue.statut === "REFUSE_INTROUVABLE") {
      return { statut: "INTROUVABLE" };
    }

    revalidatePath(CHEMIN_AVIS);

    return { statut: "SUCCES" };
  } catch (erreur) {
    journaliserErreur("Cloture de signalement indisponible", erreur);

    return { statut: "INDISPONIBLE" };
  }
}
