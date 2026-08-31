/**
 * Ecritures et lectures du document comptable, LS-126, etape 8 du parcours 1.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client transactionnel, et c'est lui qui juge si le document doit
 * etre emis.
 *
 * IL N'Y A NI MODIFICATION NI SUPPRESSION DANS CE FICHIER, ET C'EST VOLONTAIRE.
 * L'invariant 4 est absolu : une facture n'est jamais modifiee ni supprimee,
 * une correction produit un avoir. La seule ecriture exposee ici est la
 * creation. Le jour ou `montantAvoirCentimes` devra bouger, ce sera par la
 * transaction qui cree l'avoir, LS-128, et sous le `CHECK` qui le borne.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { InstantaneLegal } from "@/lib/validation";
import type { ClientBase } from "@/repositories/stock";

/** Ce qu'une facture expose une fois lue, sans son instantane. */
export type FactureEmise = {
  id: string;
  numero: string;
  montantTotalCentimes: number;
};

/**
 * Retrouve la facture d'une commande, s'il y en a une.
 *
 * LA LECTURE PRECEDE L'ECRITURE, ET CE N'EST PAS UN CHOIX DE STYLE. Une
 * violation d'unicite dans une transaction PostgreSQL AVORTE LA TRANSACTION
 * ENTIERE, code `25P02` : toute instruction suivante echoue par « current
 * transaction is aborted », y compris celles qui n'ont rien a voir. Rattraper
 * `P2002` puis continuer ne marche donc pas ici. Le motif est deja ecrit dans
 * `repositories/confirmation.ts` pour le mouvement de stock, mesure le 27 aout
 * 2026 : la suppression des reservations echouait juste apres.
 *
 * LA CONTRAINTE `facture_commande_id_key` RESTE LA SECONDE LIGNE DE DEFENSE, et
 * elle n'est pas redondante : entre cette lecture et l'ecriture, un autre chemin
 * peut inserer la meme facture. La lecture porte le cas nominal du croisement,
 * la contrainte porte la concurrence reelle, et l'echec de la transaction est
 * alors le bon comportement puisque le prestataire rejouera.
 */
export async function lireFactureDeCommande(
  client: ClientBase,
  commandeId: string,
): Promise<FactureEmise | null> {
  return client.facture.findUnique({
    where: { commandeId },
    select: { id: true, numero: true, montantTotalCentimes: true },
  });
}

/**
 * Ecrit la facture, document immuable.
 *
 * `montantAvoirCentimes` N'EST PAS RENSEIGNE ICI, son defaut valant zero en
 * base : une facture nait sans avoir. Le poser explicitement a zero
 * dupliquerait la valeur par defaut du schema, qui resterait alors a
 * synchroniser a la main.
 *
 * `cheminPdf` RESTE NUL, ET C'EST UN ETAT ATTENDU, regle F8. La facture existe
 * en base avant son rendu : l'invariant 4 porte sur l'instantane, pas sur le
 * fichier. Le rendu et sa reprise sont le sujet de LS-129, et un champ nul y
 * declenche une `AlerteCritique` plutot que d'invalider le document.
 */
export async function ecrireFacture(
  client: ClientBase,
  parametres: {
    commandeId: string;
    numero: string;
    montantTotalCentimes: number;
    instantaneLegal: InstantaneLegal;
  },
): Promise<FactureEmise> {
  return client.facture.create({
    data: {
      commandeId: parametres.commandeId,
      numero: parametres.numero,
      montantTotalCentimes: parametres.montantTotalCentimes,
      /*
       * LE CAST EST CELUI DE PRISMA POUR UNE COLONNE `Json`, et il ne masque
       * aucune incertitude : la valeur a ete validee par `schemaInstantaneLegal`
       * dans le service AVANT d'arriver ici. Le typage de Prisma pour `Json`
       * n'admet pas un type d'objet nomme, ce qui n'enleve rien a la garantie.
       */
      instantaneLegal:
        parametres.instantaneLegal as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, numero: true, montantTotalCentimes: true },
  });
}
