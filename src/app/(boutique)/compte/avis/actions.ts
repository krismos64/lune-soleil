"use server";

/**
 * Adaptateur d'entree de la modification d'un avis, LS-225, parcours 7.
 *
 * CE FICHIER NE DECIDE RIEN. Il lit la session, valide la forme de l'entree,
 * delegue au service et traduit l'issue en valeurs que l'interface affiche. Les
 * gardes vivent dans `services/avis.ts` et dans le filtre du repository, ou
 * elles sont exerçables par un test.
 *
 * IL LIT LA SESSION, A LA DIFFERENCE DU DEPOT. Le depot d'avis s'autorise par
 * un jeton signe, seul titre d'un acheteur sans compte ; la modification vit
 * dans l'espace client, donc l'identite vient de la session et de rien d'autre,
 * invariant 2 et regle R13.
 *
 * `avisId` ARRIVE DU FORMULAIRE ET N'AUTORISE RIEN, invariant 2. Le valider ici
 * prouve sa FORME ; le droit d'ecrire dessus vient du recoupement avec
 * l'identifiant de session, que `modifierAvisDeLAuteur` porte dans son filtre.
 * C'est la meme regle que `ligneCommandeId` au depot.
 */
import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { journaliserErreur } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import { exigerSession } from "@/services/autorisation";
import { modifierMonAvis, retirerMonAvis } from "@/services/avis";

import { PARAMETRE_RETRAIT } from "./parametres";

/** Ce que l'interface recoit, jamais une exception. */
export type ResultatModificationAvis =
  | { statut: "FAIT" }
  | { statut: "REFUSE_SAISIE"; message: string }
  /**
   * L'avis n'est pas modifiable, ou n'appartient pas au demandeur.
   *
   * UN SEUL STATUT POUR LES DEUX, comme le service : distinguer « il existe
   * mais il n'est pas a vous » de « il n'existe pas » repondrait a un sondage
   * d'identifiants. Le message affiche dit la REGLE, pas le cas rencontre.
   */
  | { statut: "REFUSE_NON_MODIFIABLE" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INDISPONIBLE" };

/**
 * Modifie un avis de l'espace client.
 *
 * ELLE REVALIDE `/compte/avis`, contrairement au depot par jeton. La raison de
 * cet ecart : ici l'ecran RESTE affiche apres l'action et doit montrer le
 * nouveau texte et le nouvel etat, quand le depot rend un accuse de succes que
 * la revalidation ecraserait.
 *
 * AUCUNE REVALIDATION DE LA FICHE PRODUIT N'EST FAITE ICI, et c'est
 * deliberement laisse au chemin de moderation. L'avis quitte bien la fiche, mais
 * il n'y reviendra qu'apres relecture : c'est `modererAvis` qui sait quelle
 * variante republier, l'espace client ne connaissant pas ce chemin.
 */
export async function modifierAvis(
  _precedent: ResultatModificationAvis | null,
  donnees: FormData,
): Promise<ResultatModificationAvis> {
  const identite = await exigerSession(await headers());

  if (!identite) {
    return { statut: "SESSION_ABSENTE" };
  }

  const avisId = donnees.get("avisId");
  const noteBrute = donnees.get("note");
  const commentaireBrut = donnees.get("commentaire");

  if (typeof avisId !== "string") {
    return { statut: "REFUSE_SAISIE", message: "Demande non valide." };
  }

  /*
   * LA NOTE EST CONVERTIE SANS COERCITION, meme motif que le seuil de stock des
   * parametres : un champ vide donne `NaN`, que Zod refuse avec son message,
   * plutot que zero qu'une coercition rendrait et qu'un `min(1)` refuserait
   * ensuite avec un message parlant de note.
   */
  const note = typeof noteBrute === "string" ? Number(noteBrute) : Number.NaN;

  /*
   * UNE CHAINE VIDE DEVIENT `null`, ce qui distingue « aucun commentaire » de
   * « commentaire vide » a la lecture. La note seule est un avis valide, regle
   * deja portee par `normaliserCommentaire` au depot.
   */
  const commentaire =
    typeof commentaireBrut === "string" && commentaireBrut.trim() !== ""
      ? commentaireBrut
      : null;

  try {
    const issue = await modifierMonAvis({
      avisId,
      utilisateurId: identite.utilisateurId,
      note,
      commentaire,
    });

    if (issue.statut === "MODIFIE") {
      revalidatePath("/compte/avis");

      return { statut: "FAIT" };
    }

    return { statut: "REFUSE_NON_MODIFIABLE" };
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      /*
       * LE MESSAGE DE ZOD N'EST PAS PROPAGE TEL QUEL. `formaterProblemes`
       * prefixe par le CHEMIN DU CHAMP et les messages du socle sont ecrits
       * sans accents : le client lirait « avisId : Un identifiant valide est
       * attendue ». Defaut releve sur l'ecran des parametres le 11 septembre
       * 2026, et la meme parade s'applique.
       */
      return {
        statut: "REFUSE_SAISIE",
        message:
          "La note doit aller de 1 à 5, et le commentaire ne peut pas dépasser 2000 caractères.",
      };
    }

    /*
     * UNE PANNE NE FAIT PAS PERDRE LE TEXTE SANS LE DIRE. L'interface invite a
     * reessayer plutot que de laisser croire que la modification est passee.
     */
    journaliserErreur("Modification d'avis indisponible", erreur);

    return { statut: "INDISPONIBLE" };
  }
}

/** Ce que l'interface du retrait recoit quand il n'a pas abouti, LS-305. */
export type ResultatRetraitAvis =
  | { statut: "REFUSE_INTROUVABLE" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INDISPONIBLE" };

/**
 * Retire un avis de l'espace client, LS-305, regle R19.
 *
 * LE SUCCES REDIRIGE, IL NE REND PAS DE VALEUR. La carte de l'avis disparait
 * de la liste, donc le composant qui afficherait un message de succes
 * disparait avec elle, et son bouton aussi : un message pose dedans ne serait
 * jamais lu. La page annonce le retrait elle-meme, hors de la liste.
 *
 * `avisId` N'AUTORISE RIEN, invariant 2 : le service recoupe avec la session.
 */
export async function retirerAvis(
  _precedent: ResultatRetraitAvis | null,
  donnees: FormData,
): Promise<ResultatRetraitAvis> {
  const identite = await exigerSession(await headers());

  if (!identite) {
    return { statut: "SESSION_ABSENTE" };
  }

  const avisId = donnees.get("avisId");

  if (typeof avisId !== "string") {
    return { statut: "REFUSE_INTROUVABLE" };
  }

  let issue;

  try {
    issue = await retirerMonAvis({
      avisId,
      utilisateurId: identite.utilisateurId,
    });
  } catch (erreur) {
    /*
     * UN IDENTIFIANT MAL FORME VAUT « INTROUVABLE », jamais un message de
     * validation : seul un formulaire falsifie le produit.
     */
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "REFUSE_INTROUVABLE" };
    }

    journaliserErreur("Retrait d'avis indisponible", erreur);

    return { statut: "INDISPONIBLE" };
  }

  if (issue.statut === "REFUSE_INTROUVABLE") {
    return issue;
  }

  /*
   * `redirect` HORS DU `try` : il leve une exception de controle que le
   * `catch` prendrait pour une panne.
   */
  revalidatePath("/compte/avis");
  redirect(`/compte/avis?${PARAMETRE_RETRAIT}=${randomUUID()}`);
}
