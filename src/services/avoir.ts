/**
 * Remboursement et emission de l'avoir. LS-128, etapes 4 a 6 du parcours 4.
 *
 * L'ORDRE EST LE COEUR DE CE SERVICE : le prestataire D'ABORD, la base ENSUITE.
 * Un avoir ne nait que si l'argent est REELLEMENT parti, cas d'erreur du
 * parcours 4. L'ordre inverse produirait un document comptable opposable pour
 * un remboursement refuse, et seul un second avoir pourrait le corriger,
 * invariant 4.
 *
 * L'APPEL RESEAU EST DONC HORS TRANSACTION, et ce n'est pas negociable. Le
 * tenir dedans garderait un verrou de ligne pendant tout l'aller-retour, et son
 * echec effacerait par annulation des ecritures deja faites. Meme regle que la
 * session de paiement, `database.md`.
 *
 * AUCUN REMBOURSEMENT AUTOMATIQUE, ADR-032. Ce service s'appelle depuis
 * l'administration, sur un geste de l'exploitante, jamais depuis un webhook ni
 * une tache planifiee : le chemin qui decide « cet argent doit repartir » est
 * celui qui, s'il se trompe, rend l'argent d'une commande valide.
 *
 * LA REINTEGRATION DE STOCK N'EST PAS ICI, ADR-030 et etape 7 du parcours 4 :
 * elle depend du RETOUR REEL de la piece, jamais du remboursement seul. Un
 * client rembourse qui garde le bijou ne fait pas revenir la piece en stock.
 */
import { prisma } from "@/lib/prisma";
import { journaliser, journaliserErreur } from "@/lib/journal";
import type { Correlation } from "@/lib/journal";
import {
  PrestatairePaiementIndisponibleError,
  type FournisseurPaiement,
} from "@/integrations/stripe/fournisseur";
import { reserverNumero } from "@/repositories/commande";
import { ecrireAvoir, lireFacturePourAvoir } from "@/repositories/avoir";
import { leverAlerteCritique } from "@/repositories/confirmation";
import {
  lirePaiementEncaisse,
  marquerRembourse,
} from "@/repositories/paiement";
import { VERSION_INSTANTANE_LEGAL } from "@/lib/validation";
import type { InstantaneLegal } from "@/lib/validation";

/**
 * Ce qu'une demande de remboursement produit.
 *
 * LES REFUS SONT DISTINGUES, contrairement a l'acces aux documents de LS-132.
 * La difference tient a qui lit : ici l'appelant est l'exploitante, dans son
 * administration, et elle doit savoir POURQUOI le remboursement n'a pas eu
 * lieu. Un refus indistinct la laisserait relancer indefiniment un
 * remboursement que le prestataire ne fera jamais.
 */
export type IssueRemboursementCommande =
  /** L'argent est parti et l'avoir existe. */
  | {
      statut: "REMBOURSE";
      avoirId: string;
      numeroAvoir: string;
      montantCentimes: number;
    }
  /** Aucun paiement encaisse sur cette commande, rien a rembourser. */
  | { statut: "AUCUN_PAIEMENT" }
  /** Aucune facture : le document a rembourser n'existe pas encore. */
  | { statut: "FACTURE_ABSENTE" }
  /** Le montant demande depasse ce qui reste remboursable, regle F9. */
  | { statut: "MONTANT_TROP_ELEVE"; restantCentimes: number }
  /** Refus definitif du prestataire. Aucun avoir, aucun changement d'etat. */
  | { statut: "REFUSE_PRESTATAIRE"; code: string }
  /** Le prestataire ne repond pas. Rien n'a change, reessayer a du sens. */
  | { statut: "PRESTATAIRE_INDISPONIBLE" };

/**
 * Rembourse tout ou partie d'une commande et emet l'avoir correspondant.
 *
 * LA CLE D'IDEMPOTENCE EST DERIVEE, JAMAIS ENGENDREE, ADR-032. Elle vaut
 * `commandeId:cumulDejaRembourse:montantDemande` : deux clics sur le meme
 * bouton produisent la MEME cle, donc le prestataire rend le meme
 * remboursement au lieu d'en creer un second. Un `randomUUID()` ici rendrait la
 * relance non idempotente, c'est-a-dire exactement ce que la cle existe pour
 * empecher, et le defaut couterait de l'argent reel.
 *
 * LE CUMUL ENTRE DANS LA CLE, et ce n'est pas cosmetique : sans lui, deux
 * remboursements partiels successifs de 1000 centimes porteraient la meme cle,
 * et le second serait avale par l'idempotence du prestataire. L'exploitante
 * verrait « rembourse » sans qu'un centime ne parte la seconde fois.
 */
export async function rembourserCommande(
  parametres: {
    commandeId: string;
    montantCentimes: number;
    motif: string;
    fournisseur: FournisseurPaiement;
  },
  correlation?: Correlation,
): Promise<IssueRemboursementCommande> {
  const { commandeId, montantCentimes, motif, fournisseur } = parametres;

  const paiement = await lirePaiementEncaisse(prisma, commandeId);

  if (paiement === null) {
    return { statut: "AUCUN_PAIEMENT" };
  }

  const facture = await lireFacturePourAvoir(prisma, commandeId);

  if (facture === null) {
    /*
     * PAS DE FACTURE, PAS D'AVOIR. Un avoir reference une facture, colonne
     * `factureId` non nullable : rembourser sans document a corriger laisserait
     * la comptabilite sans trace de la sortie d'argent.
     */
    return { statut: "FACTURE_ABSENTE" };
  }

  /*
   * LA BORNE EST APPLICATIVE ET SE DOUBLE D'UN `CHECK`, regle F9. Celle-ci
   * permet de RENDRE un refus lisible a l'exploitante ; le `CHECK` en base
   * rattrape la concurrence, deux remboursements simultanes pouvant franchir
   * cette garde ensemble.
   */
  const restantCentimes =
    facture.montantTotalCentimes - facture.montantAvoirCentimes;

  if (montantCentimes > restantCentimes) {
    return { statut: "MONTANT_TROP_ELEVE", restantCentimes };
  }

  const cleIdempotence = `remboursement:${commandeId}:${facture.montantAvoirCentimes}:${montantCentimes}`;

  let issue: Awaited<ReturnType<FournisseurPaiement["rembourser"]>>;

  try {
    /*
     * L'APPEL SORTANT EST ICI, HORS DE TOUTE TRANSACTION. Tout ce qui precede
     * est en lecture seule : si le prestataire refuse ou ne repond pas, la base
     * n'a pas bouge d'un octet.
     */
    issue = await fournisseur.rembourser({
      identifiantSession: paiement.identifiantSession,
      montantCentimes,
      cleIdempotence,
    });
  } catch (erreur) {
    if (erreur instanceof PrestatairePaiementIndisponibleError) {
      /*
       * INDISPONIBILITE : RIEN N'A CHANGE, ET LE REESSAI EST SUR. La cle
       * d'idempotence etant derivee et non engendree, une seconde tentative
       * porte la meme valeur : si le premier appel etait en fait parti, le
       * prestataire rendra le meme remboursement au lieu d'un second.
       */
      journaliserErreur(
        "Remboursement impossible, prestataire indisponible",
        erreur,
        { commande: commandeId, montantCentimes },
        correlation,
      );

      return { statut: "PRESTATAIRE_INDISPONIBLE" };
    }

    throw erreur;
  }

  if (issue.issue === "REFUSE") {
    /*
     * REFUS DEFINITIF : AUCUN AVOIR, AUCUN CHANGEMENT D'ETAT DE PAIEMENT, et la
     * tentative est journalisee, critere 3 du ticket. Ecrire un avoir ici
     * produirait un document comptable pour un argent jamais parti.
     */
    journaliser(
      "warn",
      "Remboursement refuse par le prestataire",
      { commande: commandeId, montantCentimes, code: issue.code },
      correlation,
    );

    return { statut: "REFUSE_PRESTATAIRE", code: issue.code };
  }

  /*
   * LE MONTANT ECRIT EST CELUI QUE LE PRESTATAIRE A RENDU, jamais celui
   * demande. Un ecart entre les deux doit apparaitre dans le document plutot
   * que d'etre suppose : c'est l'argent reellement sorti qui fait foi.
   */
  const montantRendu = issue.montantCentimes;

  return emettreAvoirApresRemboursement({
    commandeId,
    facture,
    paiementId: paiement.id,
    montantEncaisseCentimes: paiement.montantCentimes,
    montantRenduCentimes: montantRendu,
    cumulAvantCentimes: facture.montantAvoirCentimes,
    motif,
    identifiantRemboursement: issue.identifiantRemboursement,
    correlation,
  });
}

/**
 * Ecrit l'avoir et met a jour le paiement, dans UNE transaction.
 *
 * TOUT CE QUI SUIT LE DEPART DE L'ARGENT EST INDISSOCIABLE : le numero, le
 * document, le cumul de la facture et le statut du paiement. Une moitie ecrite
 * laisserait une comptabilite fausse alors que l'argent est deja parti, et rien
 * ne le signalerait.
 *
 * LE NUMERO EST ATTRIBUE DANS CETTE TRANSACTION, invariant 4 et regle F4, sur
 * la sequence `AVOIR` distincte de `FACTURE` : `A-2026-0001` et non
 * `F-2026-0001`. Une transaction annulee rend son numero, le compteur etant
 * verrouille par ligne, ADR-031.
 *
 * UN ECHEC ICI EST UNE ALERTE CRITIQUE, pas une exception avalee : l'argent est
 * parti sans document. C'est le seul etat de ce service qui exige une
 * intervention humaine.
 */
async function emettreAvoirApresRemboursement(parametres: {
  commandeId: string;
  facture: NonNullable<Awaited<ReturnType<typeof lireFacturePourAvoir>>>;
  paiementId: string;
  montantEncaisseCentimes: number;
  montantRenduCentimes: number;
  cumulAvantCentimes: number;
  motif: string;
  identifiantRemboursement: string;
  correlation?: Correlation | undefined;
}): Promise<IssueRemboursementCommande> {
  const {
    commandeId,
    facture,
    paiementId,
    montantEncaisseCentimes,
    montantRenduCentimes,
    cumulAvantCentimes,
    motif,
    identifiantRemboursement,
    correlation,
  } = parametres;

  try {
    return await prisma.$transaction(async (transaction) => {
      const { annee, rang } = await reserverNumero(transaction, "AVOIR");
      const numero = `A-${annee}-${String(rang).padStart(4, "0")}`;

      const avoir = await ecrireAvoir(transaction, {
        factureId: facture.id,
        numero,
        montantCentimes: montantRenduCentimes,
        motif,
        instantaneLegal: construireInstantaneAvoir({
          instantaneFacture: facture.instantaneLegal,
          numeroFacture: facture.numero,
          montantRenduCentimes,
          motif,
        }),
      });

      /*
       * LE CUMUL SERT A DECIDER DU STATUT, et il se calcule sur ce qui vient
       * d'etre ecrit : cumul precedent plus montant rendu. Le seuil est
       * l'egalite au montant ENCAISSE, meme regle que le webhook de LS-119.
       */
      const cumulApres = cumulAvantCentimes + montantRenduCentimes;

      await marquerRembourse(transaction, {
        paiementId,
        montantRembourseCentimes: cumulApres,
        statut:
          cumulApres >= montantEncaisseCentimes
            ? "REMBOURSE"
            : "PARTIELLEMENT_REMBOURSE",
      });

      journaliser(
        "info",
        "Avoir emis apres remboursement",
        {
          commande: commandeId,
          avoir: avoir.id,
          montantCentimes: montantRenduCentimes,
          remboursement: identifiantRemboursement,
        },
        correlation,
      );

      return {
        statut: "REMBOURSE" as const,
        avoirId: avoir.id,
        numeroAvoir: avoir.numero,
        montantCentimes: avoir.montantCentimes,
      };
    });
  } catch (erreur) {
    /*
     * L'ARGENT EST PARTI ET LE DOCUMENT MANQUE. C'est le pire etat de ce
     * service, et il ne se rejoue pas tout seul : rappeler le prestataire
     * rendrait le meme remboursement, la cle etant idempotente, mais l'avoir
     * resterait a ecrire a la main. L'alerte porte l'identifiant du
     * remboursement, seul lien avec l'argent sorti.
     */
    journaliserErreur(
      "Avoir non emis alors que le remboursement a eu lieu",
      erreur,
      { commande: commandeId, remboursement: identifiantRemboursement },
      correlation,
    );

    await leverAlerteCritique(prisma, {
      type: "AVOIR_NON_EMIS",
      message:
        `Remboursement ${identifiantRemboursement} effectue sur la commande ` +
        `${commandeId}, montant ${montantRenduCentimes} centimes, mais AUCUN ` +
        "avoir n'a pu etre emis. Document comptable a etablir manuellement.",
      typeCible: "Commande",
      idCible: commandeId,
    });

    throw erreur;
  }
}

/**
 * Construit l'instantane legal de l'avoir, invariant 3.
 *
 * IL DERIVE DE CELUI DE LA FACTURE, jamais du catalogue. Les libelles et les
 * prix sont ceux figes a l'achat : relire les variantes ici ferait dependre un
 * avoir emis du prix actuel, exactement ce que l'invariant 3 interdit.
 *
 * LES TOTAUX RESTENT CEUX DE LA FACTURE. L'avoir ne redit pas la vente, il la
 * corrige : le montant rendu vit dans `montantCentimes` de l'avoir et dans sa
 * mention, pas dans un total recalcule qui laisserait croire a une seconde
 * vente d'un montant different.
 */
function construireInstantaneAvoir(parametres: {
  instantaneFacture: InstantaneLegal;
  numeroFacture: string;
  montantRenduCentimes: number;
  motif: string;
}): InstantaneLegal {
  const { instantaneFacture, numeroFacture, montantRenduCentimes, motif } =
    parametres;

  return {
    ...instantaneFacture,
    version: VERSION_INSTANTANE_LEGAL,
    /*
     * LES MENTIONS PORTENT LE LIEN VERS LA FACTURE CORRIGEE. Un avoir qui ne
     * nomme pas son document d'origine est inexploitable a la lecture, et le
     * rapprochement se ferait a la main sur la date.
     */
    mentions: [
      ...instantaneFacture.mentions,
      `Avoir sur la facture ${numeroFacture}`,
      `Montant rembourse : ${montantRenduCentimes} centimes`,
      `Motif : ${motif}`,
    ],
  };
}
