"use server";

/**
 * Adaptateur d'entree de la reservation de panier, LS-71.
 *
 * CE FICHIER EST UN ADAPTATEUR, PAS DE LA COUCHE METIER. Il fait trois choses
 * et rien d'autre : lire une entree non fiable, la valider, deleguer au
 * service. Aucun `CHECK`, aucune transaction, aucune regle de gestion ici.
 *
 * IL EXISTE POUR ETRE LE PREMIER USAGE REEL DU SOCLE, critere d'acceptation de
 * LS-71 : des schemas partages que personne n'appelle ne prouvent pas que la
 * convention tient a la frontiere.
 *
 * IL RECOIT `commandeId`, IL NE LE PRODUIT PAS. ADR-024 impose que la commande
 * et ses reservations s'ecrivent dans la MEME transaction : creer la commande
 * ici, avant l'appel au service, la laisserait exister sans stock si la
 * reservation echouait. La commande nait donc du service qui la porte.
 */

import {
  EntreeInvalideError,
  schemaIdentifiant,
  schemaPanier,
  valider,
} from "@/lib/validation";
import {
  InterblocagePersistantError,
  reserverPanier,
} from "@/services/reservation";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * POURQUOI UN RESULTAT ET NON UNE ERREUR QUI REMONTE : une Server Action dont
 * l'exception traverse produit la page d'erreur generique de Next.js, qui perd
 * le panier et ne dit rien d'utile. Les trois issues previsibles sont donc des
 * VALEURS.
 *
 * `INDISPONIBLE` porte la variante refusee, de quoi nommer la piece. `INVALIDE`
 * porte le champ fautif, jamais la valeur recue.
 */
export type ResultatReservation =
  | { statut: "SERVI" }
  | { statut: "INDISPONIBLE"; varianteRefusee: string }
  | { statut: "INVALIDE"; message: string }
  | { statut: "REESSAYER"; message: string };

/**
 * Reserve le panier soumis.
 *
 * `entree` EST DE TYPE `unknown`, deliberement. Typer ce parametre donnerait
 * l'illusion d'une garantie : une Server Action est un point d'entree HTTP, son
 * argument est deserialise depuis le reseau et le type TypeScript ne survit pas
 * au passage. Seul `valider` etablit la forme.
 */
export async function reserverPanierAction(
  entree: unknown,
  commandeIdBrut: unknown,
): Promise<ResultatReservation> {
  let lignes;
  let commandeId;

  try {
    lignes = valider(schemaPanier, entree);
    commandeId = valider(schemaIdentifiant, commandeIdBrut);
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      // `details` nomme le champ et la nature du probleme, sans reproduire la
      // valeur : invariant 9, ce message peut finir dans un journal.
      return { statut: "INVALIDE", message: erreur.details };
    }
    throw erreur;
  }

  // L'IDENTIFIANT DE COMMANDE VALIDE N'AUTORISE RIEN, invariant 2. Sa forme est
  // etablie, pas le droit de reserver dessus. Le rattachement de la commande a
  // son proprietaire est porte par le service de commande, qui la cree depuis
  // la session ; ce point sera recoupe quand le tunnel d'achat existera.

  try {
    const issue = await reserverPanier(lignes, commandeId);

    if (issue.statut === "REFUSE") {
      return {
        statut: "INDISPONIBLE",
        varianteRefusee: issue.varianteRefusee,
      };
    }

    return { statut: "SERVI" };
  } catch (erreur) {
    if (erreur instanceof InterblocagePersistantError) {
      // La contention n'est pas un refus : le stock etait peut-etre la. Inviter
      // a reessayer, sans exposer le detail technique de l'interblocage.
      return {
        statut: "REESSAYER",
        message:
          "La reservation n'a pas pu aboutir, plusieurs achats simultanes. Merci de reessayer.",
      };
    }

    // Toute autre erreur est une panne : la laisser remonter plutot que de la
    // traduire en refus. Un defaut masque en « indisponible » ferait croire a
    // une rupture de stock inexistante.
    throw erreur;
  }
}
