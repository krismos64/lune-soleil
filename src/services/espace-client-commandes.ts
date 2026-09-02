/**
 * Historique des commandes et acces aux documents, cote client. LS-57.
 *
 * Zone critique : ce module decide qui lit une commande, une facture et un
 * avoir. Un defaut ici expose le nom, l'adresse et les montants d'un tiers.
 *
 * L'AUTORISATION VIENT DE LA SESSION, JAMAIS DE L'URL, invariant 2. Aucune
 * fonction de ce module ne se contente d'un identifiant de commande : chacune
 * exige AUSSI l'`utilisateurId` de l'appelant, et ce couple entre dans le
 * `where` plutot que dans une comparaison faite apres coup. Une lecture suivie
 * d'un `if (commande.utilisateurId !== moi)` laisserait un chemin ou le `if`
 * est oublie ; ici il n'y a rien a oublier, la requete ne trouve pas la ligne.
 *
 * CE MODULE EST LE PENDANT DE `acces-document.ts`, ET LES DEUX NE SE
 * RECOUVRENT PAS. Celui-la sert le client SANS COMPTE, par un jeton signe,
 * LS-132. Celui-ci sert le client CONNECTE, par sa session. Les deux chemins
 * menent au meme fichier et portent chacun leur propre preuve : fusionner leurs
 * gardes ferait dependre l'un de l'hypothese de l'autre.
 *
 * LE REFUS EST UNIFORME ET SANS MOTIF, meme raison que la route signee : un
 * refus qui distinguerait « cette commande n'existe pas » de « elle n'est pas a
 * vous » revelerait l'existence de la commande d'autrui. L'appelant rend 404
 * dans les deux cas.
 */
import { prisma } from "@/lib/prisma";
import {
  lireCommandeDuClient,
  listerCommandesDuClient,
  type CommandeDuClient,
  type DetailCommandeDuClient,
} from "@/repositories/commande";

export type { CommandeDuClient, DetailCommandeDuClient };

/**
 * Les commandes du compte, les plus recentes d'abord. Critere 1.
 *
 * `utilisateurId` VIENT DE LA SESSION. Cette signature n'accepte ni email ni
 * identifiant de commande : il n'existe aucun moyen de demander l'historique
 * d'autrui, meme en connaissant son identifiant.
 */
export async function listerMesCommandes(
  utilisateurId: string,
): Promise<CommandeDuClient[]> {
  return listerCommandesDuClient(prisma, utilisateurId);
}

/**
 * Le detail d'une commande, si elle appartient a l'appelant. Critere 2.
 *
 * REND `null` DANS LES DEUX CAS, commande inexistante et commande d'autrui.
 * L'appelant ne peut donc pas les distinguer, et ne peut pas construire un
 * oracle par inadvertance : le type lui-meme le lui interdit.
 */
export async function lireMaCommande(
  commandeId: string,
  utilisateurId: string,
): Promise<DetailCommandeDuClient | null> {
  return lireCommandeDuClient(prisma, commandeId, utilisateurId);
}

/**
 * Ce qu'une demande de document produit.
 *
 * UN SEUL CAS DE REFUS, sans motif, exactement comme `AccesDocument` de
 * `acces-document.ts` : une enumeration de motifs finirait affichee et
 * reconstituerait l'oracle que le refus uniforme ferme.
 */
export type AccesDocumentClient =
  | { statut: "AUTORISE"; numero: string; cheminPdf: string }
  | { statut: "REFUSE" };

/**
 * Autorise le telechargement d'une FACTURE par son proprietaire. Critere 3.
 *
 * LA REQUETE PART DE LA COMMANDE, jamais de la facture, et ce sens n'est pas
 * indifferent : `Facture` ne porte pas d'`utilisateurId`, elle ne le connait
 * que par sa commande. Partir de la facture obligerait a remonter le lien puis
 * a comparer, donc a ecrire la garde a la main. Partir de la commande met
 * l'appartenance dans le `where`.
 *
 * `cheminPdf` NUL EST UN REFUS ICI, alors que c'est un etat AFFICHABLE sur
 * l'ecran de detail, regle F8. Les deux sont coherents : la facture existe et
 * l'ecran doit le dire, mais il n'y a aucun fichier a servir. Distinguer les
 * deux dans le type de retour serait inutile, l'appelant rendant 404.
 */
export async function autoriserMaFacture(
  commandeId: string,
  utilisateurId: string,
): Promise<AccesDocumentClient> {
  const commande = await prisma.commande.findFirst({
    where: { id: commandeId, utilisateurId, dissocieA: null },
    select: { facture: { select: { numero: true, cheminPdf: true } } },
  });

  const facture = commande?.facture;

  if (!facture?.cheminPdf) {
    return { statut: "REFUSE" };
  }

  return {
    statut: "AUTORISE",
    numero: facture.numero,
    cheminPdf: facture.cheminPdf,
  };
}

/**
 * Autorise le telechargement d'un AVOIR par le proprietaire de sa commande.
 * Critere 3.
 *
 * LA CHAINE DE PROPRIETE EST AVOIR -> FACTURE -> COMMANDE -> UTILISATEUR, et
 * elle est parcourue en UNE requete depuis l'avoir, avec la condition sur
 * l'utilisateur au bout. Un avoir n'appartient a personne directement : c'est
 * la commande de sa facture qui decide, et sauter un maillon en supposant que
 * l'avoir suit sa facture ferait dependre la garde d'une hypothese non ecrite.
 */
export async function autoriserMonAvoir(
  avoirId: string,
  utilisateurId: string,
): Promise<AccesDocumentClient> {
  const avoir = await prisma.avoir.findFirst({
    where: {
      id: avoirId,
      facture: {
        commande: { utilisateurId, dissocieA: null },
      },
    },
    select: { numero: true, cheminPdf: true },
  });

  if (!avoir?.cheminPdf) {
    return { statut: "REFUSE" };
  }

  return {
    statut: "AUTORISE",
    numero: avoir.numero,
    cheminPdf: avoir.cheminPdf,
  };
}
