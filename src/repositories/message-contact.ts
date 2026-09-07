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

/**
 * Ce que la liste d'administration affiche d'un message, CORPS COMPRIS.
 *
 * LE CORPS EST DANS LA LISTE ET NON RELU PAR MESSAGE, choix delibere contre une
 * requete par carte : la liste est bornee a cent, l'ecran est reserve a
 * l'administratrice, et un aller-retour par message pour un texte de quelques
 * lignes couterait plus qu'il ne protege.
 *
 * CE N'EST PAS UNE FUITE : cette projection ne quitte jamais un ecran garde par
 * `exigerAdministratrice`. La question se poserait autrement sur une liste
 * publique, ou le corps n'aurait rien a faire.
 */
export type MessageEnListe = {
  id: string;
  nom: string;
  email: string;
  sujet: string;
  corps: string;
  statut: StatutMessage;
  creeA: Date;
};

/** Le detail, avec les horodatages de classement. */
export type MessageDetaille = MessageEnListe & {
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
  /**
   * Le statut a montrer, LS-163. Omis, la liste porte tous les messages.
   *
   * IL PORTE L'ATTEIGNABILITE, critere 2 : sans pagination, filtrer sur
   * `NOUVEAU` retire de la liste les messages deja traites, donc fait remonter
   * ceux que le plafond de cent cachait.
   */
  statut?: StatutMessage,
): Promise<MessageEnListe[]> {
  return client.message.findMany({
    ...(statut === undefined ? {} : { where: { statut } }),
    orderBy: { creeA: "desc" },
    take: limite,
    select: {
      id: true,
      nom: true,
      email: true,
      sujet: true,
      corps: true,
      statut: true,
      creeA: true,
    },
  });
}

/**
 * Compte les messages, en tout et par statut, LS-163.
 *
 * ------------------------------------------------------------------
 * IL EST DISTINCT DU LISTAGE, ET C'EST TOUT L'OBJET DE LA STORY.
 *
 * L'ecran affichait « N messages, dont M non lus » en comptant la TRANCHE
 * rendue par `listerMessagesEnBase`, plafonnee a cent. Une fois le seuil
 * franchi, il aurait annonce « 100 messages » de facon permanente, et un
 * message `NOUVEAU` plus ancien que les cent derniers serait devenu invisible
 * ET non compte : personne n'aurait su qu'il existe.
 *
 * C'est le motif « un compte recopie n'est pas une mesure » sous sa forme la
 * plus discrete : le compte etait bien CALCULE, mais sur un ensemble qui n'est
 * pas celui qu'il pretend decrire.
 * ------------------------------------------------------------------
 *
 * DEUX AGREGATS EN UNE REQUETE, `groupBy` plutot que deux `count` : les deux
 * nombres viennent alors du meme instant, et un message classe entre les deux
 * lectures ne peut pas rendre le total inferieur au nombre de non-lus.
 */
export async function compterMessagesEnBase(client: ClientBase): Promise<{
  total: number;
  nouveaux: number;
}> {
  const parStatut = await client.message.groupBy({
    by: ["statut"],
    _count: { _all: true },
  });

  return {
    total: parStatut.reduce((somme, ligne) => somme + ligne._count._all, 0),
    nouveaux:
      parStatut.find((ligne) => ligne.statut === "NOUVEAU")?._count._all ?? 0,
  };
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
