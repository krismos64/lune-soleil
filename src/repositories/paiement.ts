/**
 * Acces aux donnees des paiements, LS-118.
 *
 * IL N'OUVRE AUCUNE TRANSACTION, garde de `repositories/` : chaque fonction
 * recoit son client. La creation de session, elle, vit HORS de toute
 * transaction, ADR-024 : ces ecritures sont des instructions isolees, et c'est
 * voulu.
 */
import type { ClientBase } from "@/repositories/stock";

/**
 * Vrai si la commande porte deja un paiement encaisse.
 *
 * LES TROIS ETATS D'ENCAISSEMENT ET NON LE SEUL `REUSSI`, meme predicat que
 * `paiement_reussi_unique`, LS-45 : un remboursement ne rend pas la commande
 * impayee, et filtrer sur `REUSSI` seul laisserait creer une session de
 * paiement sur une commande remboursee.
 */
export async function paiementEncaisseExiste(
  client: ClientBase,
  commandeId: string,
): Promise<boolean> {
  const encaisse = await client.paiement.findFirst({
    where: {
      commandeId,
      statut: { in: ["REUSSI", "PARTIELLEMENT_REMBOURSE", "REMBOURSE"] },
    },
    select: { id: true },
  });

  return encaisse !== null;
}

/**
 * Identifiant de session de la derniere tentative encore en attente, ou `null`.
 *
 * LA DERNIERE SEULEMENT, et c'est suffisant : chaque creation de session expire
 * la precedente, ADR-032, donc au plus une session par commande peut etre
 * ouverte, la plus recente. Les tentatives anterieures sont deja expirees, chez
 * le prestataire comme ici.
 *
 * ELLE IGNORE LES TENTATIVES SANS IDENTIFIANT : une tentative reservee dont la
 * creation a echoue ne designe aucune session chez le prestataire, il n'y a donc
 * rien a expirer.
 */
export async function derniereSessionEnAttente(
  client: ClientBase,
  commandeId: string,
): Promise<string | null> {
  const tentative = await client.paiement.findFirst({
    where: {
      commandeId,
      statut: "EN_ATTENTE",
      identifiantFournisseur: { not: null },
    },
    orderBy: { creeA: "desc" },
    select: { identifiantFournisseur: true },
  });

  return tentative?.identifiantFournisseur ?? null;
}

/**
 * Reserve une tentative de paiement AVANT l'appel au prestataire.
 *
 * L'ORDRE EST INVERSE PAR RAPPORT A LA PREMIERE VERSION, et c'est une
 * correction de securite, relevee par `ls-critical-reviewer` le 26 aout 2026.
 * Ecrire apres l'appel laissait deux trous : une ecriture perdue apres une
 * creation reussie rendait la session ORPHELINE, donc jamais expiree par la
 * prevention, et la fenetre entre la lecture et l'ecriture laissait deux appels
 * concurrents creer deux sessions payables.
 *
 * `identifiantFournisseur` RESTE NUL a ce stade, et le schema l'autorise. Une
 * tentative sans identifiant dit « une creation a ete engagee », ce qui est
 * exactement la trace qui manquait : elle n'est plus rattachee a une session
 * chez le prestataire, et n'en designe donc aucune a expirer.
 */
export async function reserverTentativePaiement(
  client: ClientBase,
  tentative: {
    id: string;
    commandeId: string;
    montantCentimes: number;
  },
): Promise<void> {
  await client.paiement.create({
    data: {
      id: tentative.id,
      commandeId: tentative.commandeId,
      statut: "EN_ATTENTE",
      montantCentimes: tentative.montantCentimes,
    },
  });
}

/**
 * Rattache la session creee a sa tentative deja reservee, critere 6 de LS-118.
 *
 * SI CETTE ECRITURE ECHOUE, la tentative reste sans identifiant et la session
 * existe chez le prestataire : l'appelant l'expire alors explicitement plutot
 * que de la laisser payable trente minutes sans trace.
 */
export async function rattacherSessionPaiement(
  client: ClientBase,
  parametres: { tentativeId: string; identifiantFournisseur: string },
): Promise<void> {
  await client.paiement.update({
    where: { id: parametres.tentativeId },
    data: { identifiantFournisseur: parametres.identifiantFournisseur },
  });
}

/**
 * Supprime une tentative dont la creation de session a echoue.
 *
 * LE CAS D'ERREUR DU PARCOURS 1 EXIGE QU'AUCUN IDENTIFIANT NE SOIT RATTACHE, et
 * la trace d'une tentative qui n'a jamais atteint le prestataire n'apporte rien
 * a la decision B, qui vise les tentatives REFUSEES par lui. La laisser
 * fausserait le compte des essais et la lecture du support.
 *
 * ELLE NE PORTE QUE SUR UNE TENTATIVE SANS IDENTIFIANT, garde en base et non
 * confiance a l'appelant : jamais une tentative rattachee a une session reelle,
 * qui est une trace opposable.
 */
export async function supprimerTentativeSansSession(
  client: ClientBase,
  tentativeId: string,
): Promise<void> {
  await client.paiement.deleteMany({
    where: { id: tentativeId, identifiantFournisseur: null },
  });
}
