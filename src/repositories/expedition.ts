/**
 * Acces aux donnees de l'expedition, LS-130, etape 11 du parcours 1.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client transactionnel, et c'est lui qui juge si une commande
 * peut partir.
 *
 * `livreA` N'EST ECRIT PAR AUCUNE FONCTION DE CE FICHIER, et c'est une regle et
 * non un oubli. Cette colonne date la remise au destinataire, fait declencheur
 * du delai de retractation : elle vient du suivi automatique de LS-131, jamais
 * d'une saisie. Aucun `data` ci-dessous ne la mentionne, ce qui rend le critere
 * 3 vrai par construction plutot que par vigilance.
 *
 * `statutTransporteur` ET `synchroniseA` SONT LAISSES NULS pour la meme raison :
 * ils appartiennent au suivi automatique, et les remplir a la declaration
 * ferait croire a une synchronisation qui n'a pas eu lieu.
 */
import type { ModeLivraison } from "@/generated/prisma/enums";
import type { ClientBase } from "@/repositories/stock";

/** Ce que l'exploitante declare quand un colis part. */
export type SaisieExpedition = {
  transporteur: string;
  /** Le mode REELLEMENT execute, distinct de celui de la commande, ADR-025. */
  mode: ModeLivraison;
  numeroSuivi: string | null;
  pointRelaisId: string | null;
};

/** Une expedition telle que l'ecran la relit. */
export type ExpeditionDeclaree = {
  transporteur: string;
  mode: ModeLivraison;
  numeroSuivi: string | null;
  pointRelaisId: string | null;
  statutTransporteur: string | null;
  expedieA: Date | null;
  livreA: Date | null;
};

/**
 * Ecrit l'expedition d'une commande.
 *
 * ELLE LEVE `P2002` SI LA COMMANDE EN PORTE DEJA UNE, et c'est voulu :
 * `commande_id` est unique, donc la base refuse le doublon meme quand deux
 * appels concurrents ont tous deux lu « aucune expedition ». Le service
 * traduit cette levee en refus metier, hors de la transaction.
 *
 * `expedieA` EST HORODATE ICI, PAR LE SERVEUR. Une date venue de l'interface
 * serait une date choisie, alors que le fait a dater est l'instant de la
 * declaration.
 */
export async function creerExpedition(
  client: ClientBase,
  parametres: { commandeId: string; saisie: SaisieExpedition },
): Promise<void> {
  await client.expedition.create({
    data: {
      commandeId: parametres.commandeId,
      transporteur: parametres.saisie.transporteur,
      mode: parametres.saisie.mode,
      numeroSuivi: parametres.saisie.numeroSuivi,
      pointRelaisId: parametres.saisie.pointRelaisId,
      expedieA: new Date(),
    },
  });
}

/** Relit l'expedition d'une commande, `null` tant qu'aucune n'existe. */
export async function lireExpeditionDeCommande(
  client: ClientBase,
  commandeId: string,
): Promise<ExpeditionDeclaree | null> {
  return client.expedition.findUnique({
    where: { commandeId },
    select: {
      transporteur: true,
      mode: true,
      numeroSuivi: true,
      pointRelaisId: true,
      statutTransporteur: true,
      expedieA: true,
      livreA: true,
    },
  });
}

/** Ce que la liste des colis a preparer affiche d'une commande. */
export type CommandeAExpedier = {
  id: string;
  numero: string;
  nomClient: string;
  /** Le mode CHOISI et paye par le client, ce qui dit comment preparer. */
  modeLivraison: ModeLivraison;
  adresseLivraison: unknown;
  pointRelaisAdresse: unknown;
  creeA: Date;
};

/**
 * Les commandes en attente de depart, la plus ancienne d'abord.
 *
 * L'ORDRE EST INVERSE DE CELUI DE LA LISTE DES COMMANDES, et c'est deliberé :
 * une file de preparation se traite par anciennete, la commande qui attend
 * depuis le plus longtemps etant la plus urgente. La liste generale, elle,
 * repond a « que s'est-il passe recemment ».
 */
export async function listerAExpedier(
  client: ClientBase,
  limite: number,
): Promise<CommandeAExpedier[]> {
  return client.commande.findMany({
    where: { statut: "EN_PREPARATION" },
    orderBy: { creeA: "asc" },
    take: limite,
    select: {
      id: true,
      numero: true,
      nomClient: true,
      modeLivraison: true,
      adresseLivraison: true,
      pointRelaisAdresse: true,
      creeA: true,
    },
  });
}
