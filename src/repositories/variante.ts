/**
 * Acces aux donnees des variantes, LS-101.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client.
 *
 * AUCUNE FONCTION DE SUPPRESSION N'EXISTE ICI, et c'est delibere : une variante
 * ne se supprime JAMAIS, regle C13. Elle s'archive. En ajouter une ouvrirait le
 * chemin que le modele ferme, et la reference liberee pourrait etre reattribuee,
 * faisant remonter les avis et les statistiques de l'ancienne piece sur la
 * nouvelle.
 *
 * `quantiteReservee` N'EST ECRITE PAR AUCUNE FONCTION DE CE FICHIER. Elle
 * appartient au chemin de reservation, `repositories/stock.ts`, sous ADR-006.
 */
import { Prisma } from "@/generated/prisma/client";

/**
 * Client utilisable par ces fonctions : le client principal ou le client
 * transactionnel remis par `$transaction`.
 */
export type ClientBase = Prisma.TransactionClient;

export type Variante = {
  id: string;
  produitId: string;
  reference: string;
  libelle: string;
  dimensions: string | null;
  prixCentimes: number;
  quantitePhysique: number;
  quantiteReservee: number;
  venteWebActivee: boolean;
  archiveeA: Date | null;
};

const CHAMPS = {
  id: true,
  produitId: true,
  reference: true,
  libelle: true,
  dimensions: true,
  prixCentimes: true,
  quantitePhysique: true,
  quantiteReservee: true,
  venteWebActivee: true,
  archiveeA: true,
} as const;

/**
 * Variantes d'un produit, dans l'ordre de creation.
 *
 * LES ARCHIVEES SONT RENDUES AVEC LES AUTRES. Cette lecture sert
 * l'administration, qui doit les voir : elles occupent toujours leur reference,
 * C14, et sans elles l'exploitante ne comprendrait pas pourquoi une reference
 * qu'aucune variante active ne porte lui est refusee. C'est le catalogue public
 * de LS-104 qui filtre.
 *
 * `orderBy: creeA` ET NON le prix ou le libelle : l'ordre de saisie est le seul
 * que l'exploitante reconnaisse, et l'absence de tri explicite laisserait
 * PostgreSQL rendre les lignes dans l'ordre du plan d'execution.
 */
export async function listerVariantes(
  client: ClientBase,
  produitId: string,
): Promise<Variante[]> {
  return client.variante.findMany({
    where: { produitId },
    orderBy: { creeA: "asc" },
    select: CHAMPS,
  });
}

export async function lireVariante(
  client: ClientBase,
  id: string,
): Promise<Variante | null> {
  return client.variante.findUnique({ where: { id }, select: CHAMPS });
}

/**
 * Le produit qui porte une reference, pour le message de refus du parcours 3.
 *
 * REND LE NOM ET NON L'IDENTIFIANT : ce nom part directement dans le message
 * affiche, « la reference REF-01 est deja portee par Collier Aurore ». Une
 * lecture qui rendrait l'identifiant obligerait l'ecran a une seconde requete
 * pour dire quelque chose d'utile.
 *
 * LA VARIANTE ARCHIVEE EST TROUVEE ELLE AUSSI, C14 : c'est precisement le cas
 * ou l'exploitante ne comprend pas d'ou vient le refus.
 */
export async function produitPortantLaReference(
  client: ClientBase,
  reference: string,
): Promise<string | null> {
  const variante = await client.variante.findUnique({
    where: { reference },
    select: { produit: { select: { nom: true } } },
  });
  return variante?.produit.nom ?? null;
}

export async function creerVariante(
  client: ClientBase,
  donnees: {
    produitId: string;
    reference: string;
    libelle: string;
    dimensions: string | null;
    prixCentimes: number;
    quantitePhysique: number;
  },
): Promise<Variante> {
  // `quantiteReservee`, `venteWebActivee` ET `archiveeA` NE SONT PAS ECRITS :
  // les valeurs par defaut du schema s'appliquent, zero, vrai et nul. Les
  // ecrire ici ouvrirait la porte a ce qu'un appelant les choisisse un jour en
  // passant par ces parametres.
  return client.variante.create({ data: donnees, select: CHAMPS });
}

export async function ecrireVariante(
  client: ClientBase,
  id: string,
  donnees: {
    reference: string;
    libelle: string;
    dimensions: string | null;
    prixCentimes: number;
    quantitePhysique: number;
  },
): Promise<Variante> {
  // NI `produitId`, NI `quantiteReservee`, NI `archiveeA` dans la signature, et
  // c'est deliberement redit ici : deplacer une variante d'un produit a l'autre
  // changerait la fiche ou apparaissent ses commandes passees, et l'archivage
  // est une operation distincte. C'est le genre de completude qu'une relecture
  // ajoute de bonne foi.
  return client.variante.update({
    where: { id },
    data: donnees,
    select: CHAMPS,
  });
}

/**
 * Archive une variante, C13.
 *
 * `quantitePhysique` N'EST PAS TOUCHEE, arbitrage du 14 aout 2026. La piece
 * existe toujours et reste vendable en main propre : la remettre a zero serait
 * un mouvement de stock deguise, ce qu'interdit l'invariant 6, et ferait
 * disparaitre du stock sans qu'aucune vente ne l'explique.
 */
export async function archiverVariante(
  client: ClientBase,
  id: string,
  archiveeA: Date,
): Promise<void> {
  await client.variante.update({ where: { id }, data: { archiveeA } });
}

/**
 * Nombre de lignes de commande citant cette variante.
 *
 * SERT L'AVERTISSEMENT D'ADR-029 : l'ecran dit « cette reference apparait dans 2
 * commandes » avant de laisser modifier la reference. Sans ce compte, il ne
 * pourrait qu'avertir dans le vide, y compris sur une variante jamais vendue.
 */
export async function compterLignesDeCommande(
  client: ClientBase,
  varianteId: string,
): Promise<number> {
  return client.ligneCommande.count({ where: { varianteId } });
}

/**
 * Nombre de reservations ACTIVES sur cette variante.
 *
 * `expire_a > now()` EST LE COEUR DE CETTE LECTURE, et non un raffinement. Une
 * reservation expiree ne tient plus la piece : la compter rendrait la variante
 * inarchivable pendant les cinq minutes qui separent l'expiration du passage de
 * la tache de liberation, pour une reservation que plus rien ne protege.
 *
 * `now()` EST L'HORLOGE DE POSTGRESQL, jamais celle de Node. Deux conteneurs
 * dont les horloges derivent compareraient des instants incomparables, meme
 * regle que pour le verrou de tache planifiee.
 */
export async function compterReservationsActives(
  client: ClientBase,
  varianteId: string,
): Promise<number> {
  const lignes = await client.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n
      FROM reservation
     WHERE variante_id = ${varianteId}
       AND expire_a > now()
  `;
  return Number(lignes[0]?.n ?? 0);
}
