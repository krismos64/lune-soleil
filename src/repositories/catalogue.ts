/**
 * Acces aux donnees du catalogue, LS-99.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client, transactionnel quand l'operation l'exige.
 *
 * POURQUOI DU SQL BRUT POUR LE SEUL REORDONNANCEMENT. `categorie.ordre` porte
 * une contrainte UNIQUE DEFERRABLE INITIALLY DEFERRED, C24, que l'API typee de
 * Prisma ne connait pas : elle n'a pas de moyen d'exprimer une ecriture dont la
 * coherence n'est vraie qu'au COMMIT. Le reste passe par l'API typee.
 */
import { Prisma } from "@/generated/prisma/client";
import type { StatutProduit } from "@/generated/prisma/enums";

/**
 * Client utilisable par ces fonctions : le client principal ou le client
 * transactionnel remis par `$transaction`.
 */
export type ClientBase = Prisma.TransactionClient;

/** Une categorie et le nombre de produits qu'elle porte. */
export type CategorieAvecCompte = {
  id: string;
  nom: string;
  slug: string;
  ordre: number;
  nombreProduits: number;
};

/**
 * Categories dans l'ordre de la boutique, avec leur compte de produits.
 *
 * `orderBy: ordre` ET RIEN D'AUTRE. Trier par nom contredirait LS-49, qui a
 * tranche que l'ordre est choisi par l'exploitante ; l'absence de tri explicite
 * laisserait PostgreSQL rendre les lignes dans l'ordre du plan d'execution, qui
 * change avec le volume.
 *
 * LE COMPTE N'EST PAS FILTRE. Un produit archive occupe toujours sa categorie
 * du point de vue de la cle etrangere : l'exclure ferait annoncer « categorie
 * vide » sur une categorie que la base refuse de supprimer, C26.
 */
export async function listerCategories(
  client: ClientBase,
): Promise<CategorieAvecCompte[]> {
  const lignes = await client.categorie.findMany({
    orderBy: { ordre: "asc" },
    include: { _count: { select: { produits: true } } },
  });

  return lignes.map((ligne) => ({
    id: ligne.id,
    nom: ligne.nom,
    slug: ligne.slug,
    ordre: ligne.ordre,
    nombreProduits: ligne._count.produits,
  }));
}

/**
 * Rang le plus eleve actuellement attribue, ou 0 si aucune categorie.
 *
 * LE MAXIMUM ET NON LE NOMBRE. Les deux divergent des qu'une categorie du
 * milieu est supprimee : trois categories aux rangs 1, 2, 3, la deuxieme
 * supprimee, un comptage rendrait 2 et le rang suivant calcule vaudrait 3, deja
 * pris. La contrainte C24 rejetterait l'ecriture.
 *
 * ZERO SUR UNE BASE VIDE, ce qui donne 1 au premier rang attribue et satisfait
 * `chk_categorie_ordre_positif`.
 */
export async function rangMaximal(client: ClientBase): Promise<number> {
  const resultat = await client.categorie.aggregate({ _max: { ordre: true } });
  return resultat._max.ordre ?? 0;
}

export async function creerCategorie(
  client: ClientBase,
  donnees: { nom: string; slug: string; ordre: number },
) {
  return client.categorie.create({ data: donnees });
}

export async function lireCategorie(client: ClientBase, id: string) {
  return client.categorie.findUnique({ where: { id } });
}

export async function renommerCategorie(
  client: ClientBase,
  id: string,
  nom: string,
) {
  return client.categorie.update({ where: { id }, data: { nom } });
}

export async function supprimerCategorie(client: ClientBase, id: string) {
  return client.categorie.delete({ where: { id } });
}

export async function compterProduits(
  client: ClientBase,
  categorieId: string,
): Promise<number> {
  // AUCUN FILTRE SUR LE STATUT, meme raison que dans `listerCategories` : la
  // cle etrangere ne fait pas de difference entre un produit archive et un
  // autre, et ce compte sert a expliquer un refus C26.
  return client.produit.count({ where: { categorieId } });
}

/**
 * Ecrit le rang d'une categorie, en SQL brut.
 *
 * POURQUOI `$executeRaw` ICI. Cette instruction s'execute au milieu d'une
 * permutation, dans un etat ou deux categories partagent momentanement un rang.
 * C'est legitime, la contrainte etant DIFFERABLE INITIALLY DEFERRED donc
 * verifiee au COMMIT. L'API typee de Prisma passerait aussi, mais le SQL rend
 * visible ce que cette ecriture a de particulier, et le commentaire tient avec.
 *
 * NE JAMAIS TRANSFORMER CET APPEL EN UPSERT. Aucun `ON CONFLICT` ne peut
 * arbitrer sur une contrainte differable, PostgreSQL le refuse explicitement.
 */
export async function ecrireRang(
  client: ClientBase,
  id: string,
  ordre: number,
): Promise<void> {
  await client.$executeRaw`UPDATE categorie SET ordre = ${ordre} WHERE id = ${id}`;
}

export async function creerProduit(
  client: ClientBase,
  donnees: { nom: string; slug: string; categorieId: string },
) {
  // `statut` N'EST PAS ECRIT : la valeur par defaut du schema, BROUILLON,
  // s'applique. L'ecrire ici ouvrirait la porte a ce qu'un appelant le choisisse
  // un jour en passant par ce parametre.
  return client.produit.create({ data: donnees });
}

/** Un produit et ses informations generales, pour l'ecran d'edition. */
export async function lireProduit(client: ClientBase, id: string) {
  return client.produit.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      slug: true,
      categorieId: true,
      descriptionCourte: true,
      statut: true,
    },
  });
}

/**
 * Ecrit les informations generales d'un produit, LS-100.
 *
 * NI `slug`, NI `statut`, NI `categorieId` dans la signature, et c'est
 * deliberement redit ici : le slug porte l'adresse publique, le statut a ses
 * propres conditions de transition, LS-103. C'est le genre de completude qu'une
 * relecture ajoute de bonne foi.
 *
 * AUCUNE SECTION N'EST TOUCHEE, ADR-026 decision 5. Une initialisation des
 * quatre sections placee ici ferait revenir vide celle que l'administratrice
 * vient de supprimer, a chaque enregistrement.
 */
export async function ecrireInformationsProduit(
  client: ClientBase,
  id: string,
  donnees: { nom: string; descriptionCourte: string | null },
) {
  return client.produit.update({ where: { id }, data: donnees });
}

/**
 * Etat de publication d'un produit, LS-103.
 *
 * `publieA` EST RENDU AVEC LE STATUT parce que la publication doit savoir s'il
 * existe deja : un produit archive puis republie GARDE sa date d'origine, le
 * schema le dit explicitement. La lire au moment d'ecrire evite une seconde
 * requete et rend la condition visible dans le service.
 */
export async function lireEtatPublication(client: ClientBase, id: string) {
  return client.produit.findUnique({
    where: { id },
    select: { id: true, statut: true, publieA: true, archiveA: true },
  });
}

/**
 * Ce qui manque a un produit pour etre publiable. C1, C7 et C8.
 *
 * UNE SEULE REQUETE POUR LES QUATRE CONDITIONS, et surtout des COMPTES plutot
 * que des listes : l'ecran nomme ce qui manque, il n'a pas besoin de savoir
 * QUEL media n'a pas de texte alternatif. Ramener les lignes entieres ferait
 * transiter des chemins de fichiers pour afficher un nombre.
 *
 * LES MEDIAS EN ECHEC SONT COMPTES A PART DE CEUX SANS TEXTE, C8 et C7 etant
 * deux regles distinctes : un media en echec ne se corrige qu'en le supprimant
 * et en le reteleversant, un texte alternatif manquant se saisit sur place. Les
 * fondre en un seul compte donnerait un message qui ne dit pas quoi faire.
 */
export async function compterConditionsPublication(
  client: ClientBase,
  produitId: string,
): Promise<{
  variantesVivantes: number;
  mediasTraites: number;
  mediasNonTraites: number;
  mediasSansTexte: number;
  aMediaPrincipal: boolean;
}> {
  const [
    variantesVivantes,
    mediasTraites,
    mediasNonTraites,
    mediasSansTexte,
    principal,
  ] = await Promise.all([
    client.variante.count({ where: { produitId, archiveeA: null } }),
    client.media.count({ where: { produitId, statutTraitement: "TRAITE" } }),
    client.media.count({
      where: { produitId, statutTraitement: { not: "TRAITE" } },
    }),
    // LE TEXTE VIDE COMPTE COMME MANQUANT au meme titre que `null` : le
    // schema Zod de LS-102 transforme deja une saisie vide en `null`, mais
    // une ligne ecrite autrement ne passe pas par lui.
    client.media.count({
      where: {
        produitId,
        OR: [{ texteAlternatif: null }, { texteAlternatif: "" }],
      },
    }),
    client.media.findFirst({
      where: { produitId, ordre: 1 },
      select: { id: true },
    }),
  ]);

  return {
    variantesVivantes,
    mediasTraites,
    mediasNonTraites,
    mediasSansTexte,
    aMediaPrincipal: principal !== null,
  };
}

/**
 * Ecrit le statut d'un produit et les horodatages qui l'accompagnent.
 *
 * `publieA` N'EST PASSE QUE S'IL DOIT CHANGER. Le schema est explicite : un
 * produit depublie puis republie GARDE sa date d'origine, comme `Avis.publieA`,
 * parce qu'elle porte l'anteriorite affichee et le tri des nouveautes. La
 * reecrire ferait remonter en tete des nouveautes un produit ancien.
 */
export async function ecrireStatutProduit(
  client: ClientBase,
  id: string,
  donnees: {
    statut: StatutProduit;
    publieA?: Date;
    archiveA?: Date | null;
  },
) {
  return client.produit.update({ where: { id }, data: donnees });
}

/**
 * Nombre de variantes non archivees d'un produit, C19.
 *
 * DISTINCT DE `compterConditionsPublication`, qui compte cinq choses en une
 * requete pour l'ecran. Celle-ci sert la transaction d'archivage de variante,
 * ou compter le reste serait du travail inutile.
 */
export async function compterVariantesVivantes(
  client: ClientBase,
  produitId: string,
): Promise<number> {
  return client.variante.count({ where: { produitId, archiveeA: null } });
}
