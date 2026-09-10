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
import type { ModeLivraison, StatutCommande } from "@/generated/prisma/enums";
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
  /**
   * L'etat de la commande, qui decide de SA COLONNE, LS-181.
   *
   * IL EST LU ET NON DEDUIT. Les trois colonnes du tableau correspondent a
   * trois statuts, et laisser l'ecran les recalculer depuis une autre donnee
   * ouvrirait un second endroit ou la verite se dit.
   */
  statut: StatutCommande;
};

/**
 * Les commandes du tableau d'expedition, la plus ancienne d'abord.
 *
 * TROIS STATUTS DEPUIS LS-181, contre le seul `EN_PREPARATION` d'avant. Le
 * prototype montre un tableau a trois colonnes, et cette liste n'en portait
 * qu'une : l'exploitante ne voyait ni ce qui arrive, ni ce qui est parti.
 *
 * CE N'EST PAS QU'UN CHANGEMENT D'AFFICHAGE, c'est un elargissement de ce que
 * l'ecran montre, arbitre par Christophe le 4 septembre 2026. Les gestes, eux,
 * restent bornes aux commandes `EN_PREPARATION` : `declarerExpedition` porte sa
 * propre garde, et lire une commande ne donne pas le droit d'agir dessus.
 *
 * L'ORDRE EST INVERSE DE CELUI DE LA LISTE DES COMMANDES, et c'est deliberé :
 * une file de preparation se traite par anciennete, la commande qui attend
 * depuis le plus longtemps etant la plus urgente. La liste generale, elle,
 * repond a « que s'est-il passe recemment ».
 *
 * LA LIMITE PORTE SUR LE TOTAL DES TROIS COLONNES. Une limite par colonne
 * demanderait trois requetes, et le plafond existe pour borner le rendu, pas
 * pour equilibrer les colonnes : `LIMITE_LISTE` reste le meme.
 */
export async function listerAExpedier(
  client: ClientBase,
  limite: number,
): Promise<CommandeAExpedier[]> {
  return client.commande.findMany({
    where: { statut: { in: ["CONFIRMEE", "EN_PREPARATION", "EXPEDIEE"] } },
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
      statut: true,
    },
  });
}

/**
 * Les expeditions dont le suivi reste a lire, LS-131.
 *
 * CE QUI EST EXCLU, ET POURQUOI. Une expedition sans numero n'a rien a
 * interroger, et une expedition dont `livreA` est renseigne n'a plus rien a
 * apprendre : la date d'une reception ne change pas. Ce filtre est donc AUSSI
 * ce qui empeche `livreA` d'etre reecrit a chaque cycle, ce qui repousserait la
 * fin du delai de retractation indefiniment.
 *
 * BORNEE PAR `limite` : chaque ligne coute un appel reseau, et la tache tient
 * son verrou pendant ce temps.
 */
export async function listerASuivre(
  client: ClientBase,
  limite: number,
): Promise<{ id: string; numeroSuivi: string | null }[]> {
  return client.expedition.findMany({
    where: { livreA: null, numeroSuivi: { not: null } },
    select: { id: true, numeroSuivi: true },
    orderBy: { creeA: "asc" },
    take: limite,
  });
}

/**
 * Enregistre le resultat d'une lecture de suivi, LS-131.
 *
 * `livreA` N'EST ECRIT QUE S'IL EST DEMANDE, et la requete de `listerASuivre`
 * garantit qu'il etait nul : c'est une date legale, point de depart du delai de
 * retractation, article L221-18.
 *
 * `synchroniseA` EST TOUJOURS RENSEIGNE ICI, et jamais depuis un chemin
 * d'echec : le renseigner malgre une panne ferait passer un suivi jamais lu
 * pour un suivi a jour.
 */
export async function enregistrerSuivi(
  client: ClientBase,
  parametres: {
    expeditionId: string;
    statutTransporteur: string;
    livreA?: Date;
  },
): Promise<void> {
  await client.expedition.update({
    where: { id: parametres.expeditionId },
    data: {
      statutTransporteur: parametres.statutTransporteur,
      synchroniseA: new Date(),
      ...(parametres.livreA === undefined ? {} : { livreA: parametres.livreA }),
    },
  });
}
