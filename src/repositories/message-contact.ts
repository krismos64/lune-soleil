/**
 * Acces aux donnees du message de contact, LS-97.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client transactionnel, et c'est lui qui juge si un message doit
 * naitre.
 *
 * LE CONTENU EST IMMUABLE. Aucune fonction ici ne reecrit `nom`, `email`,
 * `sujet` ni `corps` : l'exploitante classe un message, elle ne reecrit pas ce
 * qu'on lui a ecrit. Seul `statut` et ses horodatages changent.
 */
import type { StatutMessage } from "@/generated/prisma/enums";
import type { ClientBase } from "@/repositories/stock";

/** Ce que le formulaire public a saisi, deja valide par le service. */
export type SaisieMessage = {
  nom: string;
  email: string;
  sujet: string;
  corps: string;
};

/** Ce que la liste d'administration affiche d'un message. */
export type MessageEnListe = {
  id: string;
  nom: string;
  email: string;
  sujet: string;
  statut: StatutMessage;
  creeA: Date;
};

/** Le detail, corps compris. */
export type MessageDetaille = MessageEnListe & {
  corps: string;
  luA: Date | null;
  traiteA: Date | null;
};

/** Ecrit le message. Rend son identifiant, que la notification ne porte pas. */
export async function creerMessage(
  client: ClientBase,
  saisie: SaisieMessage,
): Promise<string> {
  const { id } = await client.message.create({
    data: saisie,
    select: { id: true },
  });

  return id;
}

/**
 * Les messages, les plus recents d'abord.
 *
 * L'ORDRE EST L'INVERSE DE LA FILE D'EXPEDITION, et c'est voulu : une demande
 * client se lit par actualite, la plus recente etant celle qui attend une
 * reponse. Une file de preparation, elle, se traite par anciennete.
 */
export async function listerMessagesEnBase(
  client: ClientBase,
  limite: number,
): Promise<MessageEnListe[]> {
  return client.message.findMany({
    orderBy: { creeA: "desc" },
    take: limite,
    select: {
      id: true,
      nom: true,
      email: true,
      sujet: true,
      statut: true,
      creeA: true,
    },
  });
}

/** Le detail d'un message, `null` s'il n'existe pas. */
export async function lireMessageEnBase(
  client: ClientBase,
  messageId: string,
): Promise<MessageDetaille | null> {
  return client.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      nom: true,
      email: true,
      sujet: true,
      corps: true,
      statut: true,
      luA: true,
      traiteA: true,
      creeA: true,
    },
  });
}

/**
 * Fait avancer le statut d'un message.
 *
 * `luA` NE S'ECRIT QUE S'IL EST NUL, et cette condition est le point de cette
 * fonction. Reecrire la date a chaque affichage ferait croire qu'une demande de
 * la semaine derniere vient d'etre vue : l'anciennete reelle, seule information
 * qui dise combien de temps quelqu'un a attendu, disparaitrait. C'est
 * l'appelant qui lit l'etat courant et passe `luADejaPose`.
 *
 * LES DEUX HORODATAGES SUIVENT C30, qui est une EQUIVALENCE : un message
 * `TRAITE` porte les deux dates, un `LU` porte la premiere seule, un `NOUVEAU`
 * n'en porte aucune. La contrainte refuse toute autre combinaison, et c'est la
 * derniere ligne de defense si ce calcul se trompe.
 */
export async function changerStatutEnBase(
  client: ClientBase,
  parametres: {
    messageId: string;
    statut: StatutMessage;
    luADejaPose: Date | null;
    maintenant: Date;
  },
): Promise<void> {
  const { statut, luADejaPose, maintenant } = parametres;

  await client.message.update({
    where: { id: parametres.messageId },
    data: {
      statut,
      // `NOUVEAU` efface les deux dates, sans quoi C30 refuserait l'ecriture.
      luA: statut === "NOUVEAU" ? null : (luADejaPose ?? maintenant),
      traiteA: statut === "TRAITE" ? maintenant : null,
    },
  });
}
