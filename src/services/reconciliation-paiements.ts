/**
 * Reconciliation des commandes en attente, LS-120. Tache planifiee, 15 minutes.
 *
 * POURQUOI ELLE EXISTE. Un evenement peut ne JAMAIS arriver : panne reseau,
 * incident chez le prestataire, application indisponible au mauvais moment.
 * Sans elle, une commande payee resterait `EN_ATTENTE_PAIEMENT` pour toujours,
 * le client aurait paye sans commande confirmee, et le stock resterait bloque.
 *
 * ELLE EST LE SECOND CHEMIN VERS LES MEMES EFFETS, decision D, et c'est
 * exactement ce que l'idempotence par effet de LS-119 protege. Elle appelle
 * `traiterEvenementPaiement`, le MEME service que le webhook, avec l'origine
 * `RECONCILIATION` : reecrire la confirmation ici produirait deux mecaniques a
 * garder d'accord, et c'est ainsi qu'un stock devient faux en silence.
 *
 * LE PRESTATAIRE EST LA SEULE SOURCE DE VERITE sur ce qui a ete paye. La base
 * ne sait rien d'un paiement dont l'evenement s'est perdu : annuler sans
 * demander annulerait des commandes payees et rendrait au catalogue des pieces
 * deja vendues.
 *
 * NE PAS SAVOIR N'AUTORISE AUCUNE DECISION. Si le prestataire ne repond pas, la
 * commande est SAUTEE et le cycle suivant reessaiera. C'est la difference avec
 * l'expiration de session d'ADR-032, ou un refus est une information utile.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { journaliser, journaliserErreur } from "@/lib/journal";
import {
  PrestatairePaiementIndisponibleError,
  type FournisseurPaiement,
} from "@/integrations/stripe/fournisseur";
import type { EvenementPaiement } from "@/integrations/stripe/evenements";
import { historiserTransition } from "@/repositories/confirmation";
import { traiterEvenementPaiement } from "@/services/webhook-paiement";

/**
 * Age minimal d'une commande avant d'etre reconciliee, 60 minutes.
 *
 * VALEUR DE `payments.md`, et elle n'est pas cosmetique : la session dure 30
 * minutes, ADR-032, et le prestataire rejoue ses evenements un moment apres.
 * Regulariser plus tot croiserait un webhook encore en vol, pour un travail que
 * l'idempotence rendrait de toute facon sans effet, au prix d'un appel externe
 * par commande et par cycle.
 */
export const AGE_MINIMAL_RECONCILIATION_MINUTES = 60;

/** Ce qu'un passage de la tache rend, pour le journal d'exploitation. */
export type BilanReconciliation = {
  examinees: number;
  regularisees: number;
  annulees: number;
};

/**
 * Examine les commandes en attente depuis plus d'une heure et les regularise.
 *
 * `fournisseur` EST INJECTE, meme motif que le reste du domaine : le compte
 * Stripe attend LS-18, et toute la logique se prouve avec un double, panne
 * comprise.
 */
export async function reconcilierPaiements({
  fournisseur,
  client = prisma,
}: {
  fournisseur: FournisseurPaiement;
  client?: typeof prisma;
}): Promise<BilanReconciliation> {
  /*
   * SEULES LES COMMANDES ENCORE `EN_ATTENTE_PAIEMENT` SONT EXAMINEES. Une
   * commande que le webhook a deja confirmee n'a rien a reconcilier, et
   * l'interroger a chaque cycle couterait un appel externe par commande reglee.
   */
  const enAttente = await client.commande.findMany({
    where: {
      statut: "EN_ATTENTE_PAIEMENT",
      creeA: {
        lt: new Date(
          Date.now() - AGE_MINIMAL_RECONCILIATION_MINUTES * 60 * 1000,
        ),
      },
    },
    select: {
      id: true,
      paiements: {
        where: { identifiantFournisseur: { not: null } },
        orderBy: { creeA: "desc" },
        take: 1,
        select: { identifiantFournisseur: true },
      },
    },
  });

  let regularisees = 0;
  let annulees = 0;
  const echouees: string[] = [];

  for (const commande of enAttente) {
    try {
      const bilan = await traiterUneCommande(client, fournisseur, commande);

      regularisees += bilan.regularisee ? 1 : 0;
      annulees += bilan.annulee ? 1 : 0;
    } catch (cause) {
      /*
       * L'ECHEC EST PORTE COMMANDE PAR COMMANDE, jamais en sortant de la
       * boucle, meme motif que `purgerJournaux` de LS-94. Ajoute le 27 aout
       * 2026 sur recommandation de `ls-critical-reviewer`.
       *
       * Sortir a la premiere erreur laisserait les commandes SUIVANTES jamais
       * examinees, et le cycle d'apres rebuterait sur la meme : quarante
       * commandes payees resteraient en attente indefiniment a cause d'une
       * seule. Le journal nomme la commande fautive, pas la cause complete,
       * invariant 9.
       */
      journaliserErreur("Reconciliation d'une commande en echec", cause, {
        commandeId: commande.id,
      });

      echouees.push(commande.id);
    }
  }

  journaliser("info", "Reconciliation des paiements terminee", {
    examinees: enAttente.length,
    regularisees,
    annulees,
    enEchec: echouees.length,
  });

  /*
   * LA TACHE EST DECLAREE EN ECHEC SI UNE SEULE COMMANDE A ECHOUE, en levant
   * apres la boucle : les autres ont ete traitees, mais l'exploitation doit voir
   * un echec plutot qu'un 200 rassurant. Meme forme que `purge-journaux`.
   */
  if (echouees.length > 0) {
    throw new Error(
      `Reconciliation en echec sur ${echouees.length} commande(s)`,
    );
  }

  return { examinees: enAttente.length, regularisees, annulees };
}

/** Ce qu'une commande a produit, pour que la boucle tienne ses comptes. */
type IssueUneCommande = { regularisee: boolean; annulee: boolean };

/**
 * Reconcilie UNE commande. Elle leve, et la boucle appelante porte l'echec.
 */
async function traiterUneCommande(
  client: typeof prisma,
  fournisseur: FournisseurPaiement,
  commande: {
    id: string;
    paiements: { identifiantFournisseur: string | null }[];
  },
): Promise<IssueUneCommande> {
  {
    const session = commande.paiements[0]?.identifiantFournisseur ?? null;

    /*
     * AUCUNE SESSION N'A JAMAIS ETE CREEE : la creation a echoue ou le
     * prestataire etait indisponible, cas d'erreur du parcours 1. Rien n'a pu
     * etre paye, donc rien a demander : la commande s'annule sans appel externe.
     */
    if (session === null) {
      await annulerCommande(client, commande.id);

      return { regularisee: false, annulee: true };
    }

    let etat;

    try {
      etat = await fournisseur.lireSession(session);
    } catch (cause) {
      if (!(cause instanceof PrestatairePaiementIndisponibleError)) {
        throw cause;
      }

      /*
       * SAUTEE, JAMAIS ANNULEE. Le cycle suivant reessaiera. La cause va au
       * journal technique, reduite a son nom de classe, invariant 9.
       */
      journaliserErreur("Etat de session illisible, commande sautee", cause, {
        commandeId: commande.id,
      });

      return { regularisee: false, annulee: false };
    }

    if (etat.etat === "OUVERTE") {
      /*
       * ENCORE PAYABLE : elle appartient au client. L'annuler lui retirerait sa
       * commande sous les yeux, et rendrait au catalogue une piece qu'il paie.
       */
      return { regularisee: false, annulee: false };
    }

    if (etat.etat === "EXPIREE") {
      await annulerCommande(client, commande.id);

      return { regularisee: false, annulee: true };
    }

    /*
     * PAYEE MAIS JAMAIS CONFIRMEE. La regularisation passe par le service du
     * webhook, avec un evenement construit depuis l'etat lu et un identifiant
     * PROPRE A CE CHEMIN : le prefixe evite de heurter l'unicite si le vrai
     * evenement arrive plus tard, auquel cas les cles par EFFET l'arreteront,
     * ce qui est precisement le croisement de la decision D.
     */
    const evenement: EvenementPaiement = {
      identifiant: `reconciliation-${etat.identifiantSession}`,
      type: "PAIEMENT_REUSSI",
      commandeId: commande.id,
      identifiantSession: etat.identifiantSession,
      montantCentimes: etat.montantCentimes,
      montantRembourseCentimes: 0,
      charge: etat.charge,
    };

    const issue = await traiterEvenementPaiement({
      corpsBrut: "",
      signature: "",
      /*
       * LE VERIFICATEUR REND L'EVENEMENT DEJA CONSTRUIT, et ce n'est pas
       * contourner la signature : la source n'est pas une requete entrante mais
       * un appel SORTANT vers le prestataire, deja authentifie par la cle
       * secrete. Il n'y a aucun corps a verifier, et rien de non fiable ici.
       */
      verificateur: {
        async verifier() {
          return evenement;
        },
      },
      origine: "RECONCILIATION",
      client,
    });

    return { regularisee: issue.statut === "TRAITE", annulee: false };
  }
}

/**
 * Annule une commande restee sans paiement, et historise la transition.
 *
 * ELLE NE TOUCHE PAS AU STOCK, et c'est voulu : la tache de liberation rend les
 * reservations echues, et elle seule. Decrementer ici aussi rendrait la piece
 * DEUX FOIS des que les deux taches se croiseraient, faisant apparaitre du
 * stock qu'aucun achat n'explique.
 *
 * LA GARDE SUR LE STATUT EST DANS LE `WHERE`, pas dans une lecture prealable :
 * entre l'examen et cette ecriture, un webhook a pu confirmer la commande, et
 * l'annuler alors effacerait une commande payee.
 */
async function annulerCommande(
  client: typeof prisma,
  commandeId: string,
): Promise<void> {
  await client.$transaction(async (transaction: Prisma.TransactionClient) => {
    const { count } = await transaction.commande.updateMany({
      where: { id: commandeId, statut: "EN_ATTENTE_PAIEMENT" },
      data: { statut: "ANNULEE" },
    });

    if (count === 0) {
      // Le statut a change entre-temps. Ne rien historiser : aucune transition
      // n'a eu lieu, et en inventer une salirait le journal.
      return;
    }

    await historiserTransition(transaction, {
      commandeId,
      statutPrecedent: "EN_ATTENTE_PAIEMENT",
      statutNouveau: "ANNULEE",
      origine: "RECONCILIATION",
    });
  });
}
