"use server";

/**
 * Adaptateur d'entree du depot de retractation. LS-134, parcours 5.
 *
 * CE FICHIER NE DECIDE RIEN. Il lit les en-tetes, delegue au service et traduit
 * le resultat en valeurs que l'interface sait afficher. Les gardes vivent dans
 * `services/retractation.ts`, ou elles sont exerçables par un test : une garde
 * posee ici dependrait de `next/headers`, indisponible hors requete, donc ne
 * serait jamais mesuree.
 *
 * AUCUNE ACTION NE PREND `utilisateurId` EN PARAMETRE, invariant 2 : il vient
 * de la session, et la signature elle-meme ferme le chemin qu'un identifiant
 * poste ouvrirait. L'identifiant de commande, lui, est bien recu du formulaire
 * et n'autorise RIEN par lui-meme, regle L4 : c'est la lecture restreinte au
 * proprietaire qui autorise.
 */
import { headers } from "next/headers";

import { journaliserErreur } from "@/lib/journal";
import { exigerSession } from "@/services/autorisation";
import {
  deposerRetractation,
  MOTIF_LONGUEUR_MAX,
} from "@/services/retractation";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * `REFUSE_ACCES` NE DISTINGUE PAS « n'existe pas » DE « pas la votre », meme
 * motif que l'acces aux documents : les separer dirait a qui essaie un
 * identifiant au hasard qu'il a trouve une commande existante.
 */
export type ResultatRetractation =
  | { statut: "FAIT"; jourLimite: string | null }
  | { statut: "REFUSE_ACCES" }
  | { statut: "REFUSE_HORS_DELAI"; jourLimite: string }
  | { statut: "REFUSE_DEJA_DEPOSEE" }
  | { statut: "REFUSE_ETAT_COMMANDE" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INDISPONIBLE" };

/**
 * Depose une demande depuis l'espace client.
 *
 * LE MOTIF EST FACULTATIF, article L221-18 : un champ vide est une saisie
 * valide, et le service la range en `null`. Ne jamais ajouter de garde de
 * presence ici, elle conditionnerait un droit inconditionnel.
 */
export async function deposerMaRetractation(
  _precedent: ResultatRetractation | null,
  donnees: FormData,
): Promise<ResultatRetractation> {
  const identite = await exigerSession(await headers());

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  const commandeId = donnees.get("commandeId");
  const motifBrut = donnees.get("motif");

  if (typeof commandeId !== "string" || commandeId.length === 0) {
    return { statut: "REFUSE_ACCES" };
  }

  /*
   * LE MOTIF EST BORNE AVANT D'ATTEINDRE LE SERVICE, invariant 7 : un champ
   * libre est une entree non fiable. La borne est large et le service tronque
   * de son cote, une saisie trop longue ne devant jamais refuser la demande.
   */
  const motif =
    typeof motifBrut === "string"
      ? motifBrut.slice(0, MOTIF_LONGUEUR_MAX)
      : null;

  try {
    const issue = await deposerRetractation(
      {
        voie: "SESSION",
        utilisateurId: identite.utilisateurId,
        commandeId,
      },
      { motif },
    );

    if (issue.statut === "DEPOSEE") {
      /*
       * AUCUNE REVALIDATION ICI, ET C'EST UN DEFAUT REEL TROUVE PAR LE TEST DE
       * BOUT EN BOUT, invisible a tous les tests d'integration.
       *
       * Une Server Action qui appelle `revalidatePath` fait RE-RENDRE LA ROUTE
       * COURANTE dans la meme reponse, documentation Next.js 16 verifiee via
       * Context7 : « ce re-rendu est inclus quand l'action appelle updateTag,
       * revalidatePath, refresh, modifie les cookies, ou appelle redirect ».
       * Le second argument `"page"` n'y change rien, il borne la PORTEE de
       * l'invalidation, pas le re-rendu de la route courante.
       *
       * Consequence mesuree : la page se re-rendait cote serveur, voyait la
       * demande desormais creee, et affichait « une demande existe deja ». LE
       * CLIENT VENAIT DE POSER UN ACTE JURIDIQUE ET NE VOYAIT AUCUNE
       * CONFIRMATION, seulement un message donnant l'impression d'un doublon.
       *
       * Le detail de commande n'a pas besoin d'etre revalide : il est
       * `force-dynamic`, donc relu a chaque visite, et le retour s'y fait par
       * une navigation.
       */
      return { statut: "FAIT", jourLimite: issue.jourLimite };
    }

    return issue;
  } catch (erreur) {
    /*
     * UNE PANNE NE FAIT PAS PERDRE LA DECLARATION SANS LE DIRE. L'interface
     * affiche un message d'indisponibilite invitant a reessayer, plutot qu'un
     * ecran blanc qui laisserait croire que la demande est partie.
     */
    journaliserErreur("Depot de retractation indisponible", erreur);

    return { statut: "INDISPONIBLE" };
  }
}
