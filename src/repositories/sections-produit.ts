/**
 * Acces aux donnees des sections de fiche produit, LS-100.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client, transactionnel quand l'operation l'exige.
 *
 * POURQUOI DU SQL BRUT POUR LE SEUL REORDONNANCEMENT. `section_produit` porte
 * une contrainte UNIQUE (produit_id, ordre) DEFERRABLE INITIALLY DEFERRED, C22,
 * que l'API typee de Prisma ne connait pas : elle n'a pas de moyen d'exprimer
 * une ecriture dont la coherence n'est vraie qu'au COMMIT. Le reste passe par
 * l'API typee.
 */
import { Prisma } from "@/generated/prisma/client";

/**
 * Client utilisable par ces fonctions : le client principal ou le client
 * transactionnel remis par `$transaction`.
 */
export type ClientBase = Prisma.TransactionClient;

export type Section = {
  id: string;
  produitId: string;
  cle: string;
  titre: string;
  contenu: string;
  ordre: number;
  visible: boolean;
};

/**
 * Sections d'un produit, dans l'ordre d'affichage.
 *
 * `orderBy: ordre` ET RIEN D'AUTRE. L'ordre est choisi par l'administratrice,
 * ADR-026 ; trier par titre ou par cle contredirait la decision, et l'absence
 * de tri explicite laisserait PostgreSQL rendre les lignes dans l'ordre du plan
 * d'execution, qui change avec le volume.
 *
 * AUCUN FILTRE SUR `visible` : cette lecture sert l'administration, qui doit
 * voir les sections masquees pour pouvoir les reafficher. C'est le rendu public
 * de LS-105 qui filtre.
 */
export async function listerSections(
  client: ClientBase,
  produitId: string,
): Promise<Section[]> {
  return client.sectionProduit.findMany({
    where: { produitId },
    orderBy: { ordre: "asc" },
    select: {
      id: true,
      produitId: true,
      cle: true,
      titre: true,
      contenu: true,
      ordre: true,
      visible: true,
    },
  });
}

export async function lireSection(
  client: ClientBase,
  id: string,
): Promise<Section | null> {
  return client.sectionProduit.findUnique({
    where: { id },
    select: {
      id: true,
      produitId: true,
      cle: true,
      titre: true,
      contenu: true,
      ordre: true,
      visible: true,
    },
  });
}

/**
 * Cles deja portees par les sections d'un produit.
 *
 * Sert a rendre unique la cle derivee d'un titre avant l'ecriture, plutot que
 * de laisser `section_produit_cle_unique` lever une erreur que l'ecran ne
 * saurait pas traduire.
 */
export async function clesExistantes(
  client: ClientBase,
  produitId: string,
): Promise<Set<string>> {
  const lignes = await client.sectionProduit.findMany({
    where: { produitId },
    select: { cle: true },
  });
  return new Set(lignes.map((l) => l.cle));
}

/**
 * Rang le plus eleve porte par les sections d'un produit, 0 si aucune.
 *
 * LE MAXIMUM ET NON LE NOMBRE, meme raison qu'en LS-99 pour les categories :
 * les deux divergent des qu'une section du milieu est supprimee, et un comptage
 * rendrait un rang deja pris que `section_produit_ordre_unique` rejetterait.
 *
 * ZERO SUR UN PRODUIT SANS SECTION, ce qui donne 1 au premier rang attribue et
 * satisfait `chk_section_ordre_positif`.
 */
export async function rangMaximal(
  client: ClientBase,
  produitId: string,
): Promise<number> {
  const resultat = await client.sectionProduit.aggregate({
    where: { produitId },
    _max: { ordre: true },
  });
  return resultat._max.ordre ?? 0;
}

export async function creerSections(
  client: ClientBase,
  lignes: {
    produitId: string;
    cle: string;
    titre: string;
    contenu: string;
    ordre: number;
  }[],
): Promise<void> {
  await client.sectionProduit.createMany({ data: lignes });
}

export async function creerSection(
  client: ClientBase,
  donnees: {
    produitId: string;
    cle: string;
    titre: string;
    contenu: string;
    ordre: number;
  },
): Promise<Section> {
  return client.sectionProduit.create({
    data: donnees,
    select: {
      id: true,
      produitId: true,
      cle: true,
      titre: true,
      contenu: true,
      ordre: true,
      visible: true,
    },
  });
}

/**
 * Ecrit titre et contenu. LA CLE N'EST PAS TOUCHEE, C20.
 *
 * Elle n'est pas dans la signature, et c'est deliberement redit ici : c'est le
 * genre de « completude » qu'une relecture ajoute de bonne foi, alors qu'elle
 * ferait perdre le lien avec l'origine de la section a chaque renommage.
 */
export async function ecrireTitreEtContenu(
  client: ClientBase,
  id: string,
  titre: string,
  contenu: string,
): Promise<void> {
  await client.sectionProduit.update({
    where: { id },
    data: { titre, contenu },
  });
}

/** Masque ou reaffiche. LE CONTENU N'EST PAS TOUCHE, C22. */
export async function ecrireVisibilite(
  client: ClientBase,
  id: string,
  visible: boolean,
): Promise<void> {
  await client.sectionProduit.update({ where: { id }, data: { visible } });
}

/** Efface la ligne, contenu compris, ADR-026 decision 5. */
export async function supprimerSection(
  client: ClientBase,
  id: string,
): Promise<void> {
  await client.sectionProduit.delete({ where: { id } });
}

/**
 * Ecrit le rang d'une section, en SQL brut.
 *
 * POURQUOI `$executeRaw` ICI. Cette instruction s'execute au milieu d'une
 * permutation, dans un etat ou deux sections du meme produit partagent
 * momentanement un rang. C'est legitime, la contrainte etant DEFERRABLE
 * INITIALLY DEFERRED donc verifiee au COMMIT seulement. L'API typee passerait
 * aussi, mais le SQL rend visible ce que cette ecriture a de particulier, et le
 * commentaire tient avec.
 *
 * NE JAMAIS TRANSFORMER CET APPEL EN UPSERT. Aucun `ON CONFLICT` ne peut
 * arbitrer sur une contrainte differable, PostgreSQL le refuse explicitement.
 */
export async function ecrireRang(
  client: ClientBase,
  id: string,
  ordre: number,
): Promise<void> {
  await client.$executeRaw`UPDATE section_produit SET ordre = ${ordre} WHERE id = ${id}`;
}
