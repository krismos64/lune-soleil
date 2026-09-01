/**
 * Ecritures et lectures du document comptable, LS-126, etape 8 du parcours 1.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client transactionnel, et c'est lui qui juge si le document doit
 * etre emis.
 *
 * IL N'Y A AUCUNE SUPPRESSION DANS CE FICHIER, ET UNE SEULE MODIFICATION.
 * L'invariant 4 est absolu : une facture n'est jamais modifiee ni supprimee,
 * une correction produit un avoir.
 *
 * L'UNIQUE `update` PORTE SUR `cheminPdf`, LS-129, et il ne contredit pas cet
 * invariant : ce champ ne fait PAS partie de l'instantane legal, il dit ou se
 * trouve le fichier. Le document reste immuable, sa representation sur disque
 * est renseignee apres coup, regle F8. Aucune autre colonne n'est modifiable
 * ici, le `select` de l'ecriture le montrant. Le jour ou
 * `montantAvoirCentimes` devra bouger, ce sera par la transaction qui cree
 * l'avoir, LS-128, et sous le `CHECK` qui le borne.
 */
import type { Prisma } from "@/generated/prisma/client";
import { schemaInstantaneLegal, type InstantaneLegal } from "@/lib/validation";
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

/** Ce qu'il faut pour rendre le document, et rien de plus. */
export type FactureARendre = {
  id: string;
  numero: string;
  emiseA: Date;
  instantaneLegal: InstantaneLegal;
  /** Nul tant qu'aucun rendu n'a abouti, regle F8 : l'etat « PDF en echec ». */
  cheminPdf: string | null;
};

/**
 * Relit une facture pour son rendu, LS-129.
 *
 * ELLE REND L'INSTANTANE ET NON LA COMMANDE, invariant 3. Le gabarit ne doit
 * avoir aucun moyen de relire le catalogue : lui passer un `commandeId` suffirait
 * a ce qu'un jour quelqu'un remonte au produit courant, et la facture emise
 * changerait avec lui.
 *
 * `cheminPdf` EST RENDU AVEC LE RESTE, dans la MEME lecture. Le lire a part
 * demanderait deux requetes dont la seconde pourrait voir un etat plus recent
 * que la premiere : le service deciderait alors de rendre sur un etat, et
 * ecrirait sur un autre.
 *
 * IL NE VAUT PAS GARANTIE D'EXCLUSION pour autant. Entre cette lecture et
 * l'ecriture du fichier, un autre chemin peut rendre le meme document : c'est
 * l'ecriture atomique du stockage qui rend ce croisement inoffensif, les deux
 * rendus produisant le meme contenu au meme endroit.
 */
export async function lireFactureARendre(
  client: ClientBase,
  factureId: string,
): Promise<FactureARendre | null> {
  const facture = await client.facture.findUnique({
    where: { id: factureId },
    select: {
      id: true,
      numero: true,
      emiseA: true,
      instantaneLegal: true,
      cheminPdf: true,
    },
  });

  if (facture === null) {
    return null;
  }

  return {
    id: facture.id,
    numero: facture.numero,
    emiseA: facture.emiseA,
    cheminPdf: facture.cheminPdf,
    /*
     * LE CONTENU EST REVALIDE A LA RELECTURE, et ce n'est pas de la defiance
     * envers l'ecriture. La colonne est un `Json` libre : une migration future,
     * une reprise de donnees ou une version d'instantane plus ancienne y
     * mettraient une forme que le gabarit ne sait pas rendre. Echouer ICI laisse
     * `cheminPdf` nul et leve une alerte, ce qui est le comportement voulu ;
     * echouer dans le gabarit produirait la meme chose par accident, sans dire
     * pourquoi.
     */
    instantaneLegal: schemaInstantaneLegal.parse(facture.instantaneLegal),
  };
}

/**
 * Pose le chemin du PDF rendu, LS-129.
 *
 * SEULE ECRITURE DE MODIFICATION DE CE FICHIER, et elle ne contredit pas
 * l'invariant 4 : `cheminPdf` ne fait PAS partie de l'instantane legal. Le
 * document reste immuable, seule sa representation sur disque est renseignee.
 *
 * LE NUMERO N'EST JAMAIS TOUCHE, critere 5 de LS-129. Une regeneration repasse
 * ici et ne modifie que ce champ : la clause `select` ne porte que `cheminPdf`,
 * et il n'existe aucun chemin de code capable de reattribuer un rang.
 */
export async function poserCheminPdfFacture(
  client: ClientBase,
  factureId: string,
  cheminRelatif: string,
): Promise<void> {
  await client.facture.update({
    where: { id: factureId },
    data: { cheminPdf: cheminRelatif },
    select: { cheminPdf: true },
  });
}
