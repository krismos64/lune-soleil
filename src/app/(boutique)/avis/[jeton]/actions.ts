"use server";

/**
 * Adaptateur d'entree du depot d'avis, LS-61, parcours 7.
 *
 * CE FICHIER NE DECIDE RIEN. Il valide la forme de l'entree, delegue au service
 * et traduit l'issue en valeurs que l'interface sait afficher. Les gardes
 * vivent dans `services/avis.ts`, ou elles sont exerçables par un test.
 *
 * IL NE LIT AUCUNE SESSION, et c'est tout son objet : l'autorisation vient du
 * jeton signe, seul titre d'acces d'un acheteur sans compte. Le jeton arrive du
 * formulaire, et il n'autorise pas parce qu'il est transmis mais parce que sa
 * signature est verifiee cote serveur, invariant 2.
 *
 * `ligneCommandeId` ARRIVE AUSSI DU FORMULAIRE ET N'AUTORISE RIEN DAVANTAGE :
 * le service le recoupe avec les invitations de la commande que le jeton
 * designe. Le valider ici prouve sa FORME, jamais le droit d'ecrire dessus.
 *
 * AUCUNE REVALIDATION, meme motif que la retractation par jeton : une Server
 * Action qui appelle `revalidatePath` fait re-rendre la route courante dans la
 * meme reponse, ce qui ecraserait l'accuse de succes par l'ecran « avis deja
 * depose ».
 */
import { journaliserErreur } from "@/lib/journal";
import { schemaDepotAvis } from "@/lib/validation";
import { deposerAvis } from "@/services/avis";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * `REFUSE_ACCES` NE DISTINGUE AUCUN MOTIF de jeton invalide, expire ou inconnu.
 * `DEJA_DEPOSE` et `LIEN_REMPLACE` sont rendus a part, et c'est assume : ils
 * correspondent a un client LEGITIME, et les fondre dans un refus generique le
 * laisserait sans recours. Il faut deja detenir une valeur signee valide pour
 * les atteindre, donc la fuite d'information est nulle.
 */
export type ResultatDepotAvis =
  | { statut: "FAIT"; nombre: number }
  | { statut: "REFUSE_SAISIE"; message: string }
  | { statut: "REFUSE_DEJA_DEPOSE" }
  | { statut: "REFUSE_LIEN_REMPLACE" }
  | { statut: "REFUSE_PIECE_INCONNUE" }
  | { statut: "REFUSE_SANS_LIVRAISON" }
  | { statut: "REFUSE_ACCES" }
  | { statut: "INDISPONIBLE" };

/**
 * Depose un ou plusieurs avis depuis un lien signe.
 *
 * LES SAISIES ARRIVENT EN JSON DANS UN CHAMP UNIQUE plutot qu'en champs
 * indexes. Le formulaire porte un nombre variable de pieces, et reconstituer
 * `pieces[0][note]` a la main multiplierait les analyses de chaine, chacune
 * etant une occasion de se tromper sur une entree non fiable. Le JSON est
 * valide par Zod juste apres, invariant 7.
 */
export async function deposerAvisParJeton(
  _precedent: ResultatDepotAvis | null,
  donnees: FormData,
): Promise<ResultatDepotAvis> {
  const jeton = donnees.get("jeton");
  const saisiesBrutes = donnees.get("saisies");

  if (typeof jeton !== "string" || jeton.length === 0) {
    return { statut: "REFUSE_ACCES" };
  }

  if (typeof saisiesBrutes !== "string") {
    return {
      statut: "REFUSE_SAISIE",
      message: "Aucune note n'a été reçue. Réessayez.",
    };
  }

  let analyse: unknown;

  try {
    analyse = JSON.parse(saisiesBrutes);
  } catch {
    /*
     * UN JSON MALFORME EST UNE ENTREE NON FIABLE, PAS UNE PANNE. Laisser
     * l'exception remonter produirait un 500 la ou l'ecran doit rendre un
     * message, et le message ne recopie pas la valeur refusee, invariant 9.
     */
    return {
      statut: "REFUSE_SAISIE",
      message: "Les notes n'ont pas pu être lues. Réessayez.",
    };
  }

  const valide = schemaDepotAvis.safeParse(analyse);

  if (!valide.success) {
    /*
     * LE PREMIER MESSAGE SUFFIT ET NE PORTE NI LA VALEUR NI LA CLE REFUSEE.
     * Zod ne fuit pas les valeurs mais bien les NOMS DE CLES par
     * `unrecognized_keys` : les recopier tels quels afficherait a l'ecran des
     * noms choisis par l'appelant.
     */
    return {
      statut: "REFUSE_SAISIE",
      message:
        valide.error.issues[0]?.message ??
        "Les notes saisies ne sont pas valides.",
    };
  }

  try {
    const issue = await deposerAvis(jeton, valide.data);

    switch (issue.statut) {
      case "DEPOSE":
        return { statut: "FAIT", nombre: issue.nombre };
      case "DEJA_DEPOSE":
        return { statut: "REFUSE_DEJA_DEPOSE" };
      case "LIEN_REMPLACE":
        return { statut: "REFUSE_LIEN_REMPLACE" };
      case "REFUSE_PIECE_INCONNUE":
        return { statut: "REFUSE_PIECE_INCONNUE" };
      case "REFUSE_SANS_LIVRAISON":
        return { statut: "REFUSE_SANS_LIVRAISON" };
      default:
        return { statut: "REFUSE_ACCES" };
    }
  } catch (erreur) {
    /*
     * UNE PANNE NE FAIT PAS PERDRE L'AVIS SANS LE DIRE. L'interface invite a
     * reessayer plutot que d'afficher un ecran blanc qui laisserait croire que
     * l'avis est parti.
     */
    journaliserErreur("Depot d'avis indisponible", erreur);

    return { statut: "INDISPONIBLE" };
  }
}
