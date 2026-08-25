/**
 * Acces aux donnees des commandes, LS-117.
 *
 * IL N'OUVRE AUCUNE TRANSACTION, garde de `repositories/` : le service appelant
 * lui passe le client transactionnel, toutes ces ecritures devant partager la
 * transaction unique d'ADR-024.
 */
import { Prisma } from "@/generated/prisma/client";
import type { ModeLivraison } from "@/generated/prisma/enums";
import type { ClientBase } from "@/repositories/stock";

/** Un document numerote par annee, ADR-031. Trois types prevus, un employe. */
export type TypeDocument = "COMMANDE" | "FACTURE" | "AVOIR";

/**
 * Reserve le prochain numero de sequence pour un type et une annee.
 *
 * LE VERROU DE LIGNE EST LE MECANISME, ADR-031. `UPDATE ... RETURNING` prend un
 * verrou tenu jusqu'au `COMMIT` : deux transactions concurrentes s'ordonnent au
 * lieu de lire la meme valeur, et une transaction annulee rend son numero. Une
 * `SEQUENCE` PostgreSQL, non transactionnelle, laisserait un trou a chaque refus
 * de stock, cas frequent sur un catalogue de pieces uniques.
 *
 * `ON CONFLICT` CREE LA LIGNE DE L'ANNEE au premier document plutot que
 * d'exiger un amorcage manuel, dont l'oubli bloquerait toute vente le
 * 1er janvier.
 *
 * A APPELER AVANT DE RESERVER LES VARIANTES, jamais entre deux reservations.
 * L'ordre global est compteur puis variantes triees : l'inverser dans un seul
 * chemin suffirait a creer un cycle d'interblocage avec les autres.
 */
export async function reserverNumero(
  client: ClientBase,
  type: TypeDocument,
  annee: number,
): Promise<number> {
  const lignes = await client.$queryRaw<{ dernier: number }[]>`
    INSERT INTO compteur_numero (type, annee, dernier)
    VALUES (${type}, ${annee}, 1)
    ON CONFLICT (type, annee)
      DO UPDATE SET dernier = compteur_numero.dernier + 1
    RETURNING dernier
  `;

  const rang = lignes[0]?.dernier;

  /*
   * L'INSTRUCTION REND TOUJOURS UNE LIGNE, l'`INSERT ... ON CONFLICT DO UPDATE`
   * ecrivant dans les deux branches. Un vide signalerait une base incoherente,
   * pas un cas metier : le refus explicite vaut mieux qu'un `!` qui ferait
   * surgir l'erreur plus loin, sur un numero `undefined` ecrit en base.
   */
  if (rang === undefined) {
    throw new Error(
      `Aucun numero rendu par le compteur ${type} de l'annee ${annee}.`,
    );
  }

  return rang;
}

/**
 * Ce qu'une ligne de commande fige, lu dans la transaction.
 *
 * LU DANS LA TRANSACTION ET NON REPRIS DU PANIER REVALIDE, et la nuance
 * compte : la revalidation de l'etape 3 a pu avoir lieu plusieurs minutes plus
 * tot. Ce qui est fige doit etre l'etat au moment de l'ecriture, sous le meme
 * verrou que la reservation.
 */
export type DonneesFigees = {
  varianteId: string;
  reference: string;
  libelleVariante: string;
  libelleProduit: string;
  prixCentimes: number;
};

/**
 * Lit les donnees a figer pour un ensemble de variantes.
 *
 * AUCUN FILTRE DE VENDABILITE ICI. C'est l'`UPDATE` conditionnel de la
 * reservation qui decide si la piece est disponible, ADR-006 : dupliquer la
 * regle ici en ferait deux, dont l'une pourrait diverger.
 */
export async function lireDonneesAFiger(
  client: ClientBase,
  varianteIds: readonly string[],
): Promise<DonneesFigees[]> {
  return client.$queryRaw<DonneesFigees[]>`
    SELECT v.id            AS "varianteId",
           v.reference,
           v.libelle       AS "libelleVariante",
           p.nom           AS "libelleProduit",
           v.prix_centimes AS "prixCentimes"
      FROM variante v
      JOIN produit p ON p.id = v.produit_id
     WHERE v.id IN (${Prisma.join([...varianteIds])})
  `;
}

/** Une adresse figee sur la commande, copie et non reference. */
export type AdresseFigee = {
  nom: string;
  ligne1: string;
  ligne2?: string;
  codePostal: string;
  ville: string;
  pays: string;
};

/** Ce que la commande porte a sa creation. */
export type CommandeAEcrire = {
  id: string;
  numero: string;
  emailNormalise: string;
  nomClient: string;
  telephone: string | null;
  adresseLivraison: AdresseFigee;
  adresseFacturation: AdresseFigee;
  sousTotalCentimes: number;
  modeLivraison: ModeLivraison;
  pointRelaisId: string | null;
  pointRelaisAdresse: Prisma.InputJsonValue | null;
  fraisPortCentimes: number;
  totalCentimes: number;
  cgvAccepteesA: Date;
  cgvVersion: string;
};

/**
 * Ecrit la commande.
 *
 * `montantTaxeCentimes` RESTE A ZERO, franchise en base de TVA, article 293 B
 * du CGI. Il n'existe ni taux ni booleen d'inclusion, `database.md` l'interdit
 * explicitement : un franchissement futur du seuil sera un parametrage.
 */
export async function ecrireCommande(
  client: ClientBase,
  commande: CommandeAEcrire,
): Promise<void> {
  await client.commande.create({
    data: {
      id: commande.id,
      numero: commande.numero,
      statut: "EN_ATTENTE_PAIEMENT",
      emailNormalise: commande.emailNormalise,
      nomClient: commande.nomClient,
      telephone: commande.telephone,
      adresseLivraison: commande.adresseLivraison,
      adresseFacturation: commande.adresseFacturation,
      sousTotalCentimes: commande.sousTotalCentimes,
      modeLivraison: commande.modeLivraison,
      pointRelaisId: commande.pointRelaisId,
      ...(commande.pointRelaisAdresse === null
        ? {}
        : { pointRelaisAdresse: commande.pointRelaisAdresse }),
      fraisPortCentimes: commande.fraisPortCentimes,
      totalCentimes: commande.totalCentimes,
      montantTaxeCentimes: 0,
      cgvAccepteesA: commande.cgvAccepteesA,
      cgvVersion: commande.cgvVersion,
    },
  });
}

/** Une ligne de commande, deja figee par le service. */
export type LigneAEcrire = {
  commandeId: string;
  varianteId: string;
  referenceFigee: string;
  libelleProduitFige: string;
  libelleVarianteFige: string;
  prixFigeCentimes: number;
  quantite: number;
};

/**
 * Ecrit les lignes de la commande.
 *
 * `createMany` ET NON UNE BOUCLE : une seule instruction, donc un seul
 * aller-retour a l'interieur d'une transaction qui tient deja des verrous de
 * ligne sur les variantes. Chaque milliseconde passee dans la transaction est
 * une milliseconde d'attente pour l'acheteur concurrent.
 */
export async function ecrireLignes(
  client: ClientBase,
  lignes: readonly LigneAEcrire[],
): Promise<void> {
  await client.ligneCommande.createMany({ data: [...lignes] });
}
