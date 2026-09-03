/**
 * Acces aux demandes de retractation. LS-134, regles L1 et L4.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : il traduit une
 * intention de lecture ou d'ecriture en requete. C'est `services/retractation.ts`
 * qui juge si une demande peut etre deposee.
 *
 * AUCUNE MISE A JOUR NI SUPPRESSION ICI. La demande nait `DEPOSEE` et ses
 * transitions appartiennent a LS-135 : `deposeeA` est conservee telle quelle,
 * regle L1, c'est une preuve legale du moment ou le client a exerce son droit.
 */
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
