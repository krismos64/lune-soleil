/**
 * Administration des commandes, LS-121. Etapes 10 a 12 du parcours 1.
 *
 * CE QUE CE SERVICE PORTE : la lecture des commandes pour l'exploitante et les
 * transitions de statut qu'elle decide. Les transitions faites par le SYSTEME,
 * confirmation de paiement et annulation par reconciliation, vivent ailleurs et
 * n'ont pas leur place ici.
 *
 * LES DEUX STATUTS SONT DEUX AXES, `payments.md` : ce service ne touche QUE le
 * statut de commande. Un remboursement ne force aucun statut logistique, et
 * inversement expedier une commande ne change rien au paiement.
 *
 * `LIVREE` N'EST PAS ATTEIGNABLE ICI, et c'est une regle et non un oubli. Le
 * statut ne se suppose jamais sans source fiable, `payments.md` : comment le
 * site apprend qu'un colis est livre est la decision de LS-33, non prise. Une
 * case a cocher a la main serait precisement la supposition que la regle
 * interdit, et elle ferait courir le delai de retractation depuis une date
 * inventee.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { StatutCommande, StatutPaiement } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant, valider } from "@/lib/validation";
import { historiserTransition } from "@/repositories/confirmation";
import {
  listerAvoirsDeFacture,
  lireFacturePourAvoir,
  type AvoirEmis,
} from "@/repositories/avoir";

/**
 * Les transitions que l'EXPLOITANTE peut decider, par statut de depart.
 *
 * UNE TABLE ET NON UNE SUITE DE `if`. Elle se lit d'un coup d'oeil, se teste
 * exhaustivement, et l'ecran s'en sert pour n'afficher que des boutons
 * legitimes : la meme source decide de ce qui s'affiche et de ce qui est
 * accepte, donc les deux ne peuvent pas diverger.
 *
 * CE QUI N'Y FIGURE PAS, ET POURQUOI :
 *
 * - `EN_ATTENTE_PAIEMENT` n'a AUCUNE transition manuelle. Confirmer a la main
 *   une commande non payee ferait expedier une piece sans encaissement ;
 *   l'annuler a la main doublonnerait la reconciliation qui le fait deja, avec
 *   son propre historique. Les deux chemins automatiques suffisent.
 * - `LIVREE` n'est la cible d'aucune transition, voir l'en-tete du fichier.
 * - Aucun retour en arriere : une commande expediee ne redevient pas en
 *   preparation, le colis etant parti. Une erreur se corrige par une note, pas
 *   en reecrivant l'histoire, meme principe que l'avoir pour une facture.
 */
export const TRANSITIONS_ADMINISTRATRICE = {
  EN_ATTENTE_PAIEMENT: [],
  CONFIRMEE: ["EN_PREPARATION", "ANNULEE"],
  EN_PREPARATION: ["EXPEDIEE", "ANNULEE"],
  EXPEDIEE: [],
  LIVREE: [],
  ANNULEE: [],
} as const satisfies Record<StatutCommande, readonly StatutCommande[]>;

/** Ce qu'une tentative de transition rend. L'ecran choisit les mots. */
export type IssueTransition =
  | { statut: "SUCCES"; nouveauStatut: StatutCommande }
  /** Aucune commande sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /**
   * La transition n'est pas permise depuis l'etat courant.
   *
   * ELLE PORTE L'ETAT REEL, pour que l'ecran puisse dire « elle est deja
   * expediee » plutot qu'un refus opaque : entre l'affichage et le clic, un
   * autre onglet ou une tache a pu faire avancer la commande.
   */
  | { statut: "TRANSITION_REFUSEE"; statutActuel: StatutCommande };

/** Ce que la liste d'administration affiche d'une commande. */
export type CommandeEnListe = {
  id: string;
  numero: string;
  statut: StatutCommande;
  nomClient: string;
  totalCentimes: number;
  creeA: Date;
  /** Vrai des qu'un paiement est encaisse, axe distinct du statut. */
  encaissee: boolean;
};

/**
 * Liste les commandes pour l'administration, la plus recente d'abord.
 *
 * LES COMMANDES `EN_ATTENTE_PAIEMENT` SONT VISIBLES, et c'est demande : elles
 * disent a l'exploitante ce qui se passe en ce moment, et une accumulation
 * soudaine est le signe d'une panne de paiement.
 */
export async function listerCommandes({
  statut,
  limite = 100,
  client = prisma,
}: {
  statut?: StatutCommande;
  limite?: number;
  client?: typeof prisma;
} = {}): Promise<CommandeEnListe[]> {
  const commandes = await client.commande.findMany({
    ...(statut === undefined ? {} : { where: { statut } }),
    orderBy: { creeA: "desc" },
    take: limite,
    select: {
      id: true,
      numero: true,
      statut: true,
      nomClient: true,
      totalCentimes: true,
      creeA: true,
      paiements: {
        where: { statut: { in: ETATS_ENCAISSEMENT } },
        take: 1,
        select: { id: true },
      },
    },
  });

  return commandes.map((commande) => ({
    id: commande.id,
    numero: commande.numero,
    statut: commande.statut,
    nomClient: commande.nomClient,
    totalCentimes: commande.totalCentimes,
    creeA: commande.creeA,
    encaissee: commande.paiements.length > 0,
  }));
}

/** Le detail complet d'une commande, tel que l'ecran l'affiche. */
export type DetailCommande = {
  id: string;
  numero: string;
  statut: StatutCommande;
  nomClient: string;
  emailNormalise: string;
  telephone: string | null;
  adresseLivraison: unknown;
  modeLivraison: string;
  pointRelaisAdresse: unknown;
  sousTotalCentimes: number;
  fraisPortCentimes: number;
  totalCentimes: number;
  creeA: Date;
  lignes: {
    libelleProduitFige: string;
    libelleVarianteFige: string;
    referenceFigee: string;
    prixFigeCentimes: number;
    quantite: number;
  }[];
  paiements: {
    statut: string;
    montantCentimes: number;
    montantRembourseCentimes: number;
    confirmeA: Date | null;
  }[];
  historiques: {
    statutPrecedent: string | null;
    statutNouveau: string;
    origine: string;
    creeA: Date;
  }[];
  /** Les transitions que l'exploitante peut declencher depuis cet etat. */
  transitionsPossibles: readonly StatutCommande[];
  /**
   * La facture, quand la commande en porte une, LS-129.
   *
   * `cheminPdf` NUL EST UN ETAT AFFICHABLE ET NON UNE ABSENCE, regle F8 : la
   * facture existe, son document est en echec de rendu. L'ecran doit distinguer
   * les deux, « aucune facture » et « facture sans PDF » n'appelant pas le meme
   * geste.
   */
  facture: {
    id: string;
    numero: string;
    cheminPdf: string | null;
    emiseA: Date;
  } | null;
};

/**
 * Lit le detail d'une commande.
 *
 * LES LIGNES VIENNENT DE `LigneCommande`, JAMAIS DU CATALOGUE, invariant 3 : ce
 * sont les copies figees au moment de la commande. Recomposer l'affichage
 * depuis la variante actuelle montrerait le prix d'aujourd'hui sur une commande
 * d'hier, et un libelle qui a change depuis.
 */
export async function lireDetailCommande(
  commandeId: string,
  client: typeof prisma = prisma,
): Promise<DetailCommande | null> {
  const identifiant = valider(schemaIdentifiant, commandeId);

  const commande = await client.commande.findUnique({
    where: { id: identifiant },
    select: {
      id: true,
      numero: true,
      statut: true,
      nomClient: true,
      emailNormalise: true,
      telephone: true,
      adresseLivraison: true,
      modeLivraison: true,
      pointRelaisAdresse: true,
      sousTotalCentimes: true,
      fraisPortCentimes: true,
      totalCentimes: true,
      creeA: true,
      lignes: {
        orderBy: { creeA: "asc" },
        select: {
          libelleProduitFige: true,
          libelleVarianteFige: true,
          referenceFigee: true,
          prixFigeCentimes: true,
          quantite: true,
        },
      },
      paiements: {
        orderBy: { creeA: "asc" },
        select: {
          statut: true,
          montantCentimes: true,
          montantRembourseCentimes: true,
          confirmeA: true,
        },
      },
      historiques: {
        orderBy: { creeA: "asc" },
        select: {
          statutPrecedent: true,
          statutNouveau: true,
          origine: true,
          creeA: true,
        },
      },
      facture: {
        select: {
          id: true,
          numero: true,
          cheminPdf: true,
          emiseA: true,
        },
      },
    },
  });

  if (commande === null) {
    return null;
  }

  return {
    ...commande,
    transitionsPossibles: TRANSITIONS_ADMINISTRATRICE[commande.statut],
  };
}

/**
 * Ce que l'ecran de remboursement doit savoir, LS-160.
 *
 * LE RESTANT EST CALCULE COTE SERVEUR, jamais dans le navigateur : c'est un
 * montant, donc il suit la frontiere metier de `frontend-design.md`. Le composant
 * l'affiche et ne le recalcule pas.
 *
 * IL VAUT `montantTotalCentimes - montantAvoirCentimes`, la MEME expression que
 * la borne du service, et ce n'est pas une duplication gratuite : afficher un
 * restant qui differe de celui que le service applique ferait saisir un montant
 * refuse sans que la cause soit lisible.
 */
export type RemboursementPossible = {
  factureId: string;
  restantCentimes: number;
  avoirs: AvoirEmis[];
};

/**
 * Relit de quoi rendre l'ecran de remboursement d'une commande.
 *
 * ELLE REND `null` QUAND AUCUNE FACTURE N'EXISTE, etat distinct d'un restant
 * nul : « pas de document a corriger » et « tout est deja rembourse » appellent
 * deux gestes differents, emettre la facture ou ne rien faire.
 */
export async function lireRemboursementPossible(
  commandeId: string,
  client: typeof prisma = prisma,
): Promise<RemboursementPossible | null> {
  const identifiant = valider(schemaIdentifiant, commandeId);

  const facture = await lireFacturePourAvoir(client, identifiant);

  if (facture === null) {
    return null;
  }

  return {
    factureId: facture.id,
    restantCentimes:
      facture.montantTotalCentimes - facture.montantAvoirCentimes,
    avoirs: await listerAvoirsDeFacture(client, facture.id),
  };
}

/**
 * Fait avancer une commande, sur decision de l'exploitante.
 *
 * `acteurId` VIENT DE LA SESSION, jamais d'un parametre d'interface,
 * invariant 2 : l'appelant a deja etabli l'identite par `exigerAdministratrice`.
 *
 * LA TRANSITION EST VALIDEE CONTRE L'ETAT LU DANS LA TRANSACTION, et l'ecriture
 * porte le statut de depart dans son `WHERE` : entre la lecture et l'ecriture,
 * un webhook ou une tache peut faire avancer la commande, et appliquer alors une
 * transition calculee sur un etat perime la ferait reculer.
 */
export async function changerStatutCommande({
  commandeId,
  nouveauStatut,
  acteurId,
  client = prisma,
}: {
  commandeId: string;
  nouveauStatut: StatutCommande;
  acteurId: string;
  client?: typeof prisma;
}): Promise<IssueTransition> {
  const identifiant = valider(schemaIdentifiant, commandeId);

  return client.$transaction(async (transaction: Prisma.TransactionClient) => {
    const commande = await transaction.commande.findUnique({
      where: { id: identifiant },
      select: { statut: true },
    });

    if (commande === null) {
      return { statut: "INTROUVABLE" as const };
    }

    const permises: readonly StatutCommande[] =
      TRANSITIONS_ADMINISTRATRICE[commande.statut];

    if (!permises.includes(nouveauStatut)) {
      return {
        statut: "TRANSITION_REFUSEE" as const,
        statutActuel: commande.statut,
      };
    }

    const { count } = await transaction.commande.updateMany({
      where: { id: identifiant, statut: commande.statut },
      data: { statut: nouveauStatut },
    });

    if (count === 0) {
      /*
       * LA COMMANDE A BOUGE ENTRE LA LECTURE ET L'ECRITURE. Rien n'est ecrit,
       * et surtout aucun historique : inventer une transition qui n'a pas eu
       * lieu salirait le journal, seul recours pour reconstituer un parcours.
       */
      return {
        statut: "TRANSITION_REFUSEE" as const,
        statutActuel: commande.statut,
      };
    }

    /*
     * L'HISTORISATION EST DANS LA MEME TRANSACTION que le changement, critere 5.
     * Ecrite a part, une panne entre les deux laisserait un statut sans trace de
     * qui l'a decide, ce qui est exactement ce que l'historique existe pour
     * empecher.
     *
     * `origine: ADMIN` ET UN ACTEUR NOMME, la ou les deux chemins automatiques
     * ecrivent `SYSTEME` ou `RECONCILIATION` avec un acteur nul, regle S9. C'est
     * cette distinction qui permet de savoir, six mois plus tard, si une
     * commande a ete annulee par une personne ou par une tache.
     */
    await historiserTransition(transaction, {
      commandeId: identifiant,
      statutPrecedent: commande.statut,
      statutNouveau: nouveauStatut,
      origine: "ADMIN",
      acteurId,
    });

    return { statut: "SUCCES" as const, nouveauStatut };
  });
}

/**
 * Les trois etats d'encaissement, LS-45, MEME PREDICAT que
 * `paiement_reussi_unique`. Ne jamais raccourcir cette liste.
 */
const ETATS_ENCAISSEMENT: StatutPaiement[] = [
  "REUSSI",
  "PARTIELLEMENT_REMBOURSE",
  "REMBOURSE",
];
