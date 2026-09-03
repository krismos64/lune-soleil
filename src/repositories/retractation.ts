/**
 * Acces aux demandes de retractation. LS-134, regles L1 et L4.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : il traduit une
 * intention de lecture ou d'ecriture en requete. C'est `services/retractation.ts`
 * qui juge si une demande peut etre deposee.
 *
 * AUCUNE SUPPRESSION ICI, ET AUCUNE REECRITURE D'HORODATAGE. La demande nait
 * `DEPOSEE` ; ses transitions sont arrivees avec LS-135 et sont toutes
 * CONDITIONNELLES A L'ETAT LU, jamais un `update` sur l'identifiant seul.
 *
 * `deposeeA` N'EST REECRITE PAR AUCUNE D'ELLES, regle L1 : c'est une preuve
 * legale du moment ou le client a exerce son droit, et la conserver telle
 * quelle est ce qui la rend opposable.
 */
import type { StatutRetractation } from "@/generated/prisma/enums";
import type { ClientBase } from "@/repositories/stock";

/** Ce qu'une commande doit dire pour juger d'une retractation. */
export type CommandePourRetractation = {
  id: string;
  numero: string;
  statut: string;
  email: string;
  /** Date de remise au destinataire, nulle tant que LS-131 n'existe pas. */
  livreA: Date | null;
};

/**
 * Lit une commande, en restreignant a son proprietaire quand il est fourni.
 *
 * L'AUTORISATION EST DANS LA REQUETE, jamais dans un `if` apres coup, comme
 * `lireMaCommande` de LS-57 : passer `utilisateurId` rend `null` aussi bien
 * pour une commande inexistante que pour celle d'un tiers, et l'appelant ne
 * peut donc pas les distinguer ni construire un oracle, invariant 2.
 *
 * SANS `utilisateurId`, ELLE N'AUTORISE RIEN et ne doit etre appelee qu'apres
 * une autorisation etablie autrement, jeton signe ou session deja verifiee.
 *
 * `livreA` VIENT DE L'EXPEDITION, jamais de la commande : c'est la remise au
 * destinataire qui fait courir le delai, article L221-18, et non l'expedition.
 * ADR-025 distingue les deux, `Expedition.mode` etant ce que le transporteur a
 * execute quand `Commande.modeLivraison` est ce que le client a paye.
 */
export async function lireCommandePourRetractation(
  client: ClientBase,
  criteres: { commandeId: string; utilisateurId?: string },
): Promise<CommandePourRetractation | null> {
  const commande = await client.commande.findFirst({
    where: {
      id: criteres.commandeId,
      ...(criteres.utilisateurId === undefined
        ? {}
        : { utilisateurId: criteres.utilisateurId }),
    },
    select: {
      id: true,
      numero: true,
      statut: true,
      emailNormalise: true,
      expedition: { select: { livreA: true } },
    },
  });

  if (commande === null) {
    return null;
  }

  return {
    id: commande.id,
    numero: commande.numero,
    statut: commande.statut,
    email: commande.emailNormalise,
    livreA: commande.expedition?.livreA ?? null,
  };
}

/**
 * La demande d'une commande, s'il en existe une.
 *
 * `commande_id` ETANT UNIQUE, il y en a au plus une : la lecture sert a rendre
 * un refus lisible avant l'ecriture, la contrainte restant la seconde ligne de
 * defense contre deux envois simultanes.
 */
export async function lireDemandeParCommande(
  client: ClientBase,
  commandeId: string,
): Promise<{ id: string; statut: string; deposeeA: Date } | null> {
  return client.demandeRetractation.findUnique({
    where: { commandeId },
    select: { id: true, statut: true, deposeeA: true },
  });
}

/**
 * Cree la demande, etape 4 du parcours 5.
 *
 * `deposeeA` N'EST PAS POSEE ICI : son defaut en base est `now()`, et c'est la
 * base qui doit horodater une preuve legale, regle L1. La passer depuis le code
 * la rendrait dependante de l'horloge du conteneur applicatif, et permettrait a
 * un appelant de la choisir.
 *
 * `statut` NON PLUS : son defaut est `DEPOSEE`. Le poser dupliquerait le defaut
 * du schema, qui resterait alors a synchroniser a la main.
 */
export async function creerDemandeRetractation(
  client: ClientBase,
  parametres: { commandeId: string; motifClient: string | null },
): Promise<{ id: string }> {
  return client.demandeRetractation.create({
    data: {
      commandeId: parametres.commandeId,
      motifClient: parametres.motifClient,
    },
    select: { id: true },
  });
}

/**
 * Ce qu'une demande dit d'elle-meme pour etre traitee, LS-135.
 *
 * `montantRembourseCentimes` EST PORTE ICI parce qu'il verrouille la reduction :
 * le modele conceptuel n'autorise une reduction pour piece abimee QU'AVANT
 * versement, et une demande deja remboursee doit donc refuser toute reecriture.
 */
export type DemandePourTraitement = {
  id: string;
  commandeId: string;
  statut: string;
  recueA: Date | null;
  preuveExpeditionA: Date | null;
  montantRembourseCentimes: number | null;
};

/**
 * Lit une demande par son identifiant, pour l'administration.
 *
 * AUCUN `utilisateurId` ICI, contrairement a `lireCommandePourRetractation` :
 * l'appelant est l'exploitante, dont le role est justement de voir les demandes
 * d'autrui. L'autorisation vit dans le service, qui exige `ADMINISTRATRICE`
 * AVANT d'appeler cette fonction, et jamais dans cette requete.
 */
export async function lireDemandePourTraitement(
  client: ClientBase,
  demandeId: string,
): Promise<DemandePourTraitement | null> {
  return client.demandeRetractation.findUnique({
    where: { id: demandeId },
    select: {
      id: true,
      commandeId: true,
      statut: true,
      recueA: true,
      preuveExpeditionA: true,
      montantRembourseCentimes: true,
    },
  });
}

/**
 * Applique une transition de statut, CONDITIONNEE A L'ETAT LU.
 *
 * `updateMany` ET NON `update`, ET C'EST LA PROPRIETE CENTRALE. Le `where`
 * porte les statuts de depart admis : deux applications concurrentes de la meme
 * transition ne peuvent pas reussir toutes les deux, la seconde ne trouvant
 * plus aucune ligne. Un `update` sur l'identifiant seul reecrirait l'horodatage
 * d'une demande deja transitee, donc effacerait une preuve legale, regle L8.
 *
 * LE COMPTE RENDU DIT SI LA TRANSITION A EU LIEU, il ne leve pas : c'est le
 * service qui traduit zero ligne en refus lisible.
 */
export async function appliquerTransition(
  client: ClientBase,
  parametres: {
    demandeId: string;
    statutsAdmis: readonly StatutRetractation[];
    statutCible: StatutRetractation;
    champs?: Record<string, Date | string | number | null>;
  },
): Promise<{ appliquee: boolean }> {
  const { count } = await client.demandeRetractation.updateMany({
    where: {
      id: parametres.demandeId,
      statut: { in: [...parametres.statutsAdmis] },
    },
    data: {
      statut: parametres.statutCible,
      ...(parametres.champs ?? {}),
    },
  });

  return { appliquee: count > 0 };
}

/**
 * Horodate la reception du colis, ETAPE 7b, SANS TOUCHER AU STATUT.
 *
 * SON ABSENCE DE `statut` EST LA REGLE L12 ELLE-MEME, et non un oubli. La
 * reception est un FAIT INDEPENDANT du cycle : elle survient avant le
 * remboursement, pendant, ou trois semaines apres. Poser un statut ici ferait
 * regresser une demande deja `REMBOURSEE`, qui disparaitrait alors de toute
 * liste filtree sur le statut.
 *
 * NE JAMAIS AJOUTER `statut` A CE `data`. C'est le piege que LS-41 a ferme en
 * supprimant le statut `RECUE`.
 *
 * `recueA` NE SE REECRIT PAS, le `where` l'exigeant nul : un colis se recoit
 * une fois, et une seconde saisie deplacerait la date qui declenche le
 * mouvement de stock, regle S8.
 */
export async function horodaterReception(
  client: ClientBase,
  parametres: { demandeId: string; recueA: Date },
): Promise<{ appliquee: boolean }> {
  const { count } = await client.demandeRetractation.updateMany({
    where: { id: parametres.demandeId, recueA: null },
    data: { recueA: parametres.recueA },
  });

  return { appliquee: count > 0 };
}

/**
 * Les demandes remboursees dont le colis n'est jamais revenu, regle L13.
 *
 * LE CRITERE EST `recueA` NUL, JAMAIS LE STATUT : une piece sortie du stock et
 * jamais rentree se lit sur la reception, et le statut `REMBOURSEE` ne dit rien
 * de l'endroit ou est le bijou.
 *
 * LE SEUIL SE COMPTE DEPUIS `retourAttenduA`, regle L8, et les demandes dont ce
 * champ est nul sont ECARTEES : sans point de depart, aucune anciennete n'est
 * calculable, et prendre `deposeeA` a la place compterait le delai de retour du
 * client comme un retard du transporteur.
 */
export async function listerRetoursJamaisRecus(
  client: ClientBase,
  parametres: { avant: Date },
): Promise<{ id: string; commandeId: string; retourAttenduA: Date }[]> {
  const demandes = await client.demandeRetractation.findMany({
    where: {
      statut: "REMBOURSEE",
      recueA: null,
      retourAttenduA: { not: null, lt: parametres.avant },
    },
    select: { id: true, commandeId: true, retourAttenduA: true },
  });

  return demandes.map((demande) => ({
    id: demande.id,
    commandeId: demande.commandeId,
    // `retourAttenduA` EST NON NUL PAR LE `where`, que le type ne sait pas lire.
    retourAttenduA: demande.retourAttenduA as Date,
  }));
}

/**
 * Le montant remboursable d'une commande, sous-total ET frais de port.
 *
 * LES FRAIS DE PORT ENTRENT EN ENTIER, article L221-24 et `legal.md` : la
 * faculte de l'alinea 4 de plafonner au mode standard N'EST PAS RETENUE. Lire
 * `fraisPortCentimes` de la commande rend le tarif REELLEMENT PAYE, 410 ou 499
 * selon le mode, et non un tarif recalcule depuis la configuration courante.
 *
 * NE PAS INTRODUIRE DE PLAFONNEMENT ICI. C'est la faute que la regle nomme.
 */
export async function lireMontantRemboursable(
  client: ClientBase,
  commandeId: string,
): Promise<{
  sousTotalCentimes: number;
  fraisPortCentimes: number;
  totalCentimes: number;
} | null> {
  return client.commande.findUnique({
    where: { id: commandeId },
    select: {
      sousTotalCentimes: true,
      fraisPortCentimes: true,
      totalCentimes: true,
    },
  });
}

/** Une demande telle que la liste d'administration l'affiche, LS-135. */
export type DemandeEnListe = {
  id: string;
  /*
   * `StatutRetractation` ET NON `string`, meme motif que `ResultatExpedition`
   * de LS-130 : un type large ne casse rien a la compilation, il FERME une
   * possibilite en silence. Ici il priverait l'ecran d'indexer sa table de
   * libelles sans repli, donc l'obligerait a afficher une valeur brute d'enum.
   */
  statut: StatutRetractation;
  deposeeA: Date;
  recueA: Date | null;
  preuveExpeditionA: Date | null;
  preuveExpeditionRetour: string | null;
  motifClient: string | null;
  motifDecision: string | null;
  montantRembourseCentimes: number | null;
  commandeId: string;
  numeroCommande: string;
  nomClient: string;
  totalCentimes: number;
};

/**
 * Les demandes pour l'administration, LA PLUS ANCIENNE D'ABORD.
 *
 * L'ORDRE EST INVERSE DE CELUI DES MESSAGES, ET C'EST DELIBERE. Une demande de
 * retractation porte un DELAI LEGAL : le remboursement est du dans les
 * quatorze jours du fait declencheur, article L221-24. La plus ancienne est
 * donc la plus urgente, quand un message recent est le plus interessant.
 *
 * `limite + 1` EST LU POUR SAVOIR S'IL EN RESTE, motif de LS-163 : une liste
 * qui plafonne sans le dire fait afficher un compte FAUX, et l'exploitante
 * croit avoir tout traite. Le service tronque et signale le depassement.
 */
export async function listerDemandes(
  client: ClientBase,
  limite: number,
): Promise<DemandeEnListe[]> {
  const demandes = await client.demandeRetractation.findMany({
    orderBy: { deposeeA: "asc" },
    take: limite + 1,
    select: {
      id: true,
      statut: true,
      deposeeA: true,
      recueA: true,
      preuveExpeditionA: true,
      preuveExpeditionRetour: true,
      motifClient: true,
      motifDecision: true,
      montantRembourseCentimes: true,
      commandeId: true,
      commande: {
        select: { numero: true, nomClient: true, totalCentimes: true },
      },
    },
  });

  return demandes.map((demande) => ({
    id: demande.id,
    statut: demande.statut,
    deposeeA: demande.deposeeA,
    recueA: demande.recueA,
    preuveExpeditionA: demande.preuveExpeditionA,
    preuveExpeditionRetour: demande.preuveExpeditionRetour,
    motifClient: demande.motifClient,
    motifDecision: demande.motifDecision,
    montantRembourseCentimes: demande.montantRembourseCentimes,
    commandeId: demande.commandeId,
    numeroCommande: demande.commande.numero,
    nomClient: demande.commande.nomClient,
    totalCentimes: demande.commande.totalCentimes,
  }));
}
