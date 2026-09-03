"use server";

/**
 * Adaptateur d'entree du depot de retractation SANS COMPTE. LS-134.
 *
 * CE FICHIER NE DECIDE RIEN. Il delegue au service et traduit le resultat en
 * valeurs que l'interface sait afficher. Les gardes vivent dans
 * `services/retractation.ts`, ou elles sont exerçables par un test.
 *
 * IL NE LIT AUCUNE SESSION, et c'est tout son objet : l'autorisation vient du
 * jeton signe, seul moyen pour un acheteur sans compte d'exercer son droit,
 * article L221-21. Le jeton arrive du formulaire, et il n'autorise pas parce
 * qu'il est transmis mais parce que sa signature est verifiee cote serveur.
 *
 * AUCUNE REVALIDATION, meme motif que le chemin avec session : une Server
 * Action qui appelle `revalidatePath` fait re-rendre la route courante dans la
 * meme reponse, ce qui ecrasait l'accuse de succes par l'ecran « demande deja
 * deposee ». Documentation Next.js 16 verifiee via Context7.
 */
import { journaliserErreur } from "@/lib/journal";
import {
  deposerRetractation,
  MOTIF_LONGUEUR_MAX,
} from "@/services/retractation";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * `REFUSE_ACCES` NE DISTINGUE AUCUN MOTIF : un jeton expire, consomme, revoque,
 * mal signe ou inconnu rendent la meme chose, sans quoi la page devient un
 * oracle revelant qu'une commande existe.
 */
export type ResultatRetractationJeton =
  | { statut: "FAIT"; jourLimite: string | null }
  | { statut: "REFUSE_ACCES" }
  | { statut: "REFUSE_HORS_DELAI"; jourLimite: string }
  | { statut: "REFUSE_DEJA_DEPOSEE" }
  | { statut: "REFUSE_ETAT_COMMANDE" }
  | { statut: "INDISPONIBLE" };

/**
 * Depose une demande depuis un lien signe.
 *
 * LE MOTIF EST FACULTATIF, article L221-18 : un champ vide est une saisie
 * valide, et le service la range en `null`. Ne jamais ajouter de garde de
 * presence ici, elle conditionnerait un droit inconditionnel.
 */
export async function deposerRetractationParJeton(
  _precedent: ResultatRetractationJeton | null,
  donnees: FormData,
): Promise<ResultatRetractationJeton> {
  const jeton = donnees.get("jeton");
  const motifBrut = donnees.get("motif");

  if (typeof jeton !== "string" || jeton.length === 0) {
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
      { voie: "JETON", valeurJeton: jeton },
      { motif },
    );

    if (issue.statut === "DEPOSEE") {
      return { statut: "FAIT", jourLimite: issue.jourLimite };
    }

    return issue;
  } catch (erreur) {
    /*
     * UNE PANNE NE FAIT PAS PERDRE LA DECLARATION SANS LE DIRE. L'interface
     * invite a reessayer plutot que d'afficher un ecran blanc qui laisserait
     * croire que la demande est partie.
     */
    journaliserErreur("Depot de retractation par jeton indisponible", erreur);

    return { statut: "INDISPONIBLE" };
  }
}
