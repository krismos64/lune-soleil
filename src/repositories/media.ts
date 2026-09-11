/**
 * Acces aux donnees des medias, LS-102.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client.
 *
 * POURQUOI DU SQL BRUT POUR LE SEUL REORDONNANCEMENT, et pour une raison
 * DIFFERENTE de celle des sections. `media_principal_unique` est un INDEX
 * partiel filtre sur `ordre = 1`, pas une contrainte : il n'est donc PAS
 * differable, et il est verifie ligne a ligne. Le SQL rend visible ce que ces
 * ecritures ont de particulier, et le commentaire tient avec.
 */
import { Prisma } from "@/generated/prisma/client";
import { StatutTraitementMedia } from "@/generated/prisma/enums";

/**
 * Client utilisable par ces fonctions : le client principal ou le client
 * transactionnel remis par `$transaction`.
 */
export type ClientBase = Prisma.TransactionClient;

export type Media = {
  id: string;
  produitId: string;
  chemin: string;
  texteAlternatif: string | null;
  ordre: number;
  statutTraitement: StatutTraitementMedia;
};

const CHAMPS = {
  id: true,
  produitId: true,
  chemin: true,
  texteAlternatif: true,
  ordre: true,
  statutTraitement: true,
} as const;

/**
 * Medias d'un produit, dans l'ordre d'affichage.
 *
 * LES MEDIAS EN ECHEC SONT RENDUS AVEC LES AUTRES. Cette lecture sert
 * l'administration, qui doit les voir pour comprendre pourquoi la publication
 * est refusee. C'est le catalogue public de LS-104 qui filtre, et il filtrera
 * d'abord par le DOSSIER : un media non traite n'a aucun fichier sous `public/`.
 */
export async function listerMedias(
  client: ClientBase,
  produitId: string,
): Promise<Media[]> {
  return client.media.findMany({
    where: { produitId },
    orderBy: { ordre: "asc" },
    select: CHAMPS,
  });
}

export async function lireMedia(
  client: ClientBase,
  id: string,
): Promise<Media | null> {
  return client.media.findUnique({ where: { id }, select: CHAMPS });
}

/**
 * Rang le plus eleve porte par les medias d'un produit, 0 si aucun.
 *
 * LE MAXIMUM ET NON LE NOMBRE, meme raison qu'en LS-99 et LS-100 : les deux
 * divergent des qu'un media du milieu est supprime, et un comptage rendrait un
 * rang deja pris.
 */
export async function rangMaximal(
  client: ClientBase,
  produitId: string,
): Promise<number> {
  const resultat = await client.media.aggregate({
    where: { produitId },
    _max: { ordre: true },
  });
  return resultat._max.ordre ?? 0;
}

export async function creerMedia(
  client: ClientBase,
  donnees: {
    produitId: string;
    chemin: string;
    ordre: number;
    statutTraitement: StatutTraitementMedia;
  },
): Promise<Media> {
  return client.media.create({ data: donnees, select: CHAMPS });
}

export async function ecrireStatut(
  client: ClientBase,
  id: string,
  statutTraitement: StatutTraitementMedia,
  chemin?: string,
): Promise<void> {
  await client.media.update({
    where: { id },
    data:
      chemin === undefined
        ? { statutTraitement }
        : { statutTraitement, chemin },
  });
}

export async function ecrireTexteAlternatif(
  client: ClientBase,
  id: string,
  texteAlternatif: string | null,
): Promise<void> {
  await client.media.update({ where: { id }, data: { texteAlternatif } });
}

export async function supprimerMedia(
  client: ClientBase,
  id: string,
): Promise<void> {
  await client.media.delete({ where: { id } });
}

/**
 * Ecrit le rang d'un media, en SQL brut.
 *
 * NE JAMAIS TRANSFORMER CET APPEL EN UPSERT. Aucun `ON CONFLICT` ne peut
 * arbitrer sur `media_principal_unique`, qui est un index partiel.
 *
 * L'APPELANT DOIT ORDONNER SES APPELS, voir `services/media.ts` : cet index est
 * verifie LIGNE A LIGNE, donc poser le rang 1 avant de l'avoir libere leve une
 * violation d'unicite, y compris dans une transaction.
 */
export async function ecrireRang(
  client: ClientBase,
  id: string,
  ordre: number,
): Promise<void> {
  await client.$executeRaw`UPDATE media SET ordre = ${ordre} WHERE id = ${id}`;
}

/** Nombre de medias d'un produit, tous statuts confondus. */
export async function compterMedias(
  client: ClientBase,
  produitId: string,
): Promise<number> {
  return client.media.count({ where: { produitId } });
}

/**
 * Medias TRAITES d'un produit, pour la galerie de la fiche publique, LS-105.
 *
 * SEPAREE DE `listerMedias`, qui sert l'administration et rend tout. Le filtre
 * sur `TRAITE` est la raison d'etre de cette fonction : un media en attente ou
 * en echec n'a AUCUN fichier sous `public/`, donc ses balises `source`
 * pointeraient vers des URL qui repondent 404. La galerie afficherait un cadre
 * casse sur une page publique.
 *
 * LE FILTRE EST DANS LA REQUETE et non chez l'appelant, pour la meme raison
 * qu'ailleurs : un oubli cote composant exposerait le cadre casse, et aucun
 * chemin ne contourne une condition posee ici.
 */
export async function listerMediasPublies(
  client: ClientBase,
  produitId: string,
): Promise<Media[]> {
  return client.media.findMany({
    where: { produitId, statutTraitement: "TRAITE" },
    orderBy: { ordre: "asc" },
    select: CHAMPS,
  });
}

/**
 * Fait expirer vers `ECHOUE` les medias restes `EN_ATTENTE` trop longtemps.
 *
 * LE CAS QU'ELLE FERME, LS-109 : le traitement d'une photographie est SYNCHRONE
 * dans la Server Action, environ deux secondes. Si l'onglet est ferme ou le
 * processus redemarre pendant ce laps, la ligne reste `EN_ATTENTE`
 * INDEFINIMENT : le `catch` qui ecrit `ECHOUE` ne s'execute jamais, et aucune
 * tache ne balaie ces lignes.
 *
 * L'ECRAN AGGRAVAIT LA SITUATION. Le message d'`EN_ATTENTE` disait « rechargez
 * la page dans quelques instants », donc l'exploitante rechargeait en boucle une
 * photo que rien ne traiterait jamais.
 *
 * LA CLAUSE PORTE LES DEUX CONDITIONS ENSEMBLE, et `updateMany` plutot
 * qu'`update` : plusieurs lignes peuvent expirer au meme cycle, et aucune ne
 * doit lever si une autre a change d'etat entre-temps.
 *
 * ELLE NE TOUCHE AUCUN FICHIER. La purge de quarantaine s'occupe des originaux,
 * et un media `EN_ATTENTE` n'a par construction AUCUN fichier sous `public/`,
 * propriete physique d'ADR-007 : faire expirer son statut ne publie ni ne
 * supprime rien.
 */
export async function expirerMediasEnAttente(
  client: ClientBase,
  avant: Date,
): Promise<number> {
  const { count } = await client.media.updateMany({
    where: {
      statutTraitement: StatutTraitementMedia.EN_ATTENTE,
      creeA: { lt: avant },
    },
    data: { statutTraitement: StatutTraitementMedia.ECHOUE },
  });

  return count;
}
