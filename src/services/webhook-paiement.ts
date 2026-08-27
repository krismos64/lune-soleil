/**
 * Confirmation d'un paiement par evenement signe, LS-119. Etape 7 du parcours 1.
 *
 * LA SIGNATURE SE VERIFIE AVANT TOUT EFFET METIER, regle 1 de `payments.md` et
 * critere 1 : elle est verifiee AVANT la premiere ligne ecrite en base, y
 * compris avant de persister l'evenement. Persister un evenement non signe
 * donnerait a un tiers le moyen de faire refuser plus tard le VRAI evenement
 * portant le meme identifiant, par la contrainte `UNIQUE`.
 *
 * L'IDEMPOTENCE EST ANCREE SUR L'EFFET, PAS SUR L'IDENTIFIANT, et c'est la
 * raison d'etre de cette story. L'unicite de `identifiant_fournisseur` ferme le
 * rejeu du MEME evenement ; elle ne ferme pas le CROISEMENT de deux chemins vers
 * le meme effet, le webhook et la reconciliation. Un evenement tardif porte un
 * identifiant jamais vu : rien ne le rejette, et il recree tout. Sur une
 * variante a plusieurs exemplaires aucune erreur ne se declenche et le stock est
 * faux EN SILENCE, demonstration de LS-12. Ce sont les quatre cles par effet de
 * `database.md` qui l'arretent, et le service traduit leur refus en « rien a
 * faire » plutot qu'en erreur.
 *
 * TOUT TIENT DANS UNE SEULE TRANSACTION, critere 2 : identifiant d'evenement et
 * effets metier. Persister l'evenement a part laisserait, sur panne entre les
 * deux ecritures, soit un evenement marque traite sans aucun effet, soit des
 * effets dont plus rien ne porte la cause.
 *
 * AUCUN APPEL RESEAU DANS LA TRANSACTION, ADR-024 : ce service n'en fait aucun.
 * La verification de signature est un calcul local, et le remboursement est
 * MANUEL, ADR-032.
 */
import { Prisma } from "@/generated/prisma/client";
import type { OrigineEcriture, StatutPaiement } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { journaliser, journaliserErreur } from "@/lib/journal";
import {
  SignatureInvalideError,
  ChargeEvenementInvalideError,
  type EvenementPaiement,
  type VerificateurSignature,
} from "@/integrations/stripe/evenements";
import { estInterblocage, TENTATIVES_MAXIMUM } from "@/services/reservation";
import {
  consommerReservationEtSortirStock,
  ecrireMouvementVenteWeb,
  historiserTransition,
  leverAlerteCritique,
  supprimerReservations,
} from "@/repositories/confirmation";

/** Ce que le traitement d'un evenement peut rendre. L'adaptateur choisit le code. */
export type IssueEvenementPaiement =
  /** Les effets ont eu lieu, ou le remboursement a ete enregistre. */
  | { statut: "TRAITE" }
  /** Cet evenement a deja ete traite, ou son effet existe deja. */
  | { statut: "DEJA_TRAITE" }
  /** Evenement signe mais sans effet a produire ici. */
  | { statut: "SANS_EFFET" }
  /** Un second encaissement a ete detecte, ADR-032. Alerte levee. */
  | { statut: "DOUBLE_ENCAISSEMENT" }
  /** Signature refusee : aucun effet, aucune trace en base. */
  | { statut: "SIGNATURE_INVALIDE" }
  /**
   * Signature VALIDE, mais charge inexploitable : type non traite, session sans
   * commande rattachee, paiement non abouti.
   *
   * DISTINCTE DE `SIGNATURE_INVALIDE`, et la distinction se paie cher quand on
   * la neglige. « Signature invalide » fait chercher une attaque : l'exploitation
   * revoque le secret et casse le webhook legitime, pendant que la vraie cause
   * est une evolution d'API ou un type d'evenement nouveau. Defaut releve par
   * `ls-critical-reviewer` le 27 aout 2026.
   */
  | { statut: "CHARGE_INEXPLOITABLE" };

/**
 * Codes Prisma verifies via Context7 sur la documentation Prisma 7 : `P2002`
 * est la violation de contrainte d'unicite, y compris sur un index PARTIEL.
 */
function estViolationUnicite(erreur: unknown): boolean {
  return (
    erreur instanceof Prisma.PrismaClientKnownRequestError &&
    erreur.code === "P2002"
  );
}

/**
 * Traite un evenement de paiement signe.
 *
 * `origine` DISTINGUE LES DEUX CHEMINS D'ENTREE, decision D : `SYSTEME` pour le
 * webhook, `RECONCILIATION` pour la tache de LS-120 qui appellera ce meme
 * service. Les deux produisent les memes effets et se refusent mutuellement par
 * les cles d'unicite ; seule la trace differe, et c'est elle qui permettra plus
 * tard de distinguer un email envoye par l'un ou par l'autre, regle E6.
 */
export async function traiterEvenementPaiement({
  corpsBrut,
  signature,
  verificateur,
  origine = "SYSTEME",
  client = prisma,
}: {
  corpsBrut: string;
  signature: string;
  verificateur: VerificateurSignature;
  origine?: OrigineEcriture;
  client?: typeof prisma;
}): Promise<IssueEvenementPaiement> {
  let evenement: EvenementPaiement;

  /*
   * PREMIERE INSTRUCTION DU SERVICE, ET AUCUNE ECRITURE AVANT ELLE, critere 1.
   * La mutation qui retire cette verification doit faire rougir le test negatif :
   * si elle passe, un corps quelconque produit une commande confirmee.
   */
  try {
    evenement = await verificateur.verifier(corpsBrut, signature);
  } catch (cause) {
    if (cause instanceof SignatureInvalideError) {
      /*
       * LA CAUSE VA AU JOURNAL TECHNIQUE, JAMAIS A LA REPONSE, invariant 9 : le
       * message du prestataire cite le corps recu et l'en-tete de signature, et
       * le depot est public.
       */
      journaliserErreur("evenement de paiement refuse, signature", cause, {});

      return { statut: "SIGNATURE_INVALIDE" };
    }

    if (cause instanceof ChargeEvenementInvalideError) {
      /*
       * `warn` ET NON `error` : l'evenement vient bien du prestataire, sa
       * signature etant valide. Un type non traite est le cas ordinaire, Stripe
       * envoyant tout ce que l'abonnement declare. Le NOM DE CLASSE seulement,
       * le message citant la charge.
       */
      journaliserErreur("evenement de paiement inexploitable", cause, {});

      return { statut: "CHARGE_INEXPLOITABLE" };
    }

    throw cause;
  }

  /*
   * REJEU BORNE SUR INTERBLOCAGE, meme mecanique que la reservation de LS-71 et
   * meme borne, `database.md`. Ajoute le 27 aout 2026 sur recommandation de
   * `ls-critical-reviewer`.
   *
   * POURQUOI IL FAUT UN FILET ICI. Cette transaction touche `variante` puis
   * `reservation`, et tout chemin qui prendrait ces deux verrous dans l'ordre
   * inverse l'interbloquerait. L'ordre de la tache de liberation est aligne,
   * LS-120, mais un chemin tiers futur ne le sera pas forcement : sans rejeu,
   * l'evenement serait perdu au premier croisement, et une commande PAYEE
   * resterait sans confirmation.
   *
   * LE REJEU EST SUR, l'operation etant idempotente par effet : une tentative
   * annulee n'a rien laisse, et une tentative qui aurait deja ecrit serait
   * arretee par les cles d'unicite.
   */
  let derniereErreur: unknown;

  for (let tentative = 1; tentative <= TENTATIVES_MAXIMUM; tentative += 1) {
    try {
      return await traiterSousTransaction(client, evenement, origine);
    } catch (cause) {
      if (!estInterblocage(cause)) {
        journaliserErreur(
          "traitement d'evenement de paiement en echec",
          cause,
          {
            evenement: evenement.identifiant,
          },
        );

        throw cause;
      }

      // La transaction est deja annulee par PostgreSQL : la tentative suivante
      // repart d'un etat propre.
      derniereErreur = cause;
    }
  }

  journaliserErreur(
    "traitement d'evenement de paiement, interblocage persistant",
    derniereErreur,
    { evenement: evenement.identifiant },
  );

  throw derniereErreur;
}

/**
 * Le corps transactionnel du traitement, une tentative.
 *
 * SEPARE POUR QUE LE REJEU LE RELANCE ENTIER : rejouer une partie seulement
 * laisserait l'evenement persiste sans ses effets.
 */
async function traiterSousTransaction(
  client: typeof prisma,
  evenement: EvenementPaiement,
  origine: OrigineEcriture,
): Promise<IssueEvenementPaiement> {
  {
    return await client.$transaction(async (transaction) => {
      /*
       * L'IDENTIFIANT D'EVENEMENT EST PERSISTE DANS CETTE TRANSACTION, critere 2,
       * et sa contrainte `UNIQUE` ferme le rejeu du MEME evenement. Le refus se
       * traduit en `DEJA_TRAITE` : le prestataire rejoue apres un 500 ou un
       * delai depasse, ce n'est pas une anomalie.
       */
      try {
        await transaction.evenementFournisseur.create({
          data: {
            identifiantFournisseur: evenement.identifiant,
            type: evenement.type,
            charge: evenement.charge as Prisma.InputJsonValue,
            statutTraitement: "RECU",
          },
        });
      } catch (cause) {
        if (estViolationUnicite(cause)) {
          return { statut: "DEJA_TRAITE" } as const;
        }

        throw cause;
      }

      const issue =
        evenement.type === "PAIEMENT_REUSSI"
          ? await confirmerPaiement(transaction, evenement, origine)
          : await enregistrerRemboursement(transaction, evenement);

      /*
       * L'EVENEMENT EST MARQUE MEME QUAND IL N'A PRODUIT AUCUN EFFET, et les
       * quatre issues de `StatutTraitementEvenement` existent pour cela, LS-45 :
       * `IGNORE` vaut pour un evenement recu sans erreur mais sans effet a
       * produire, `ECHOUE` pour un traitement qui a plante. Les confondre ferait
       * rejouer indefiniment le premier, ou abandonner en silence le second.
       */
      await transaction.evenementFournisseur.update({
        where: { identifiantFournisseur: evenement.identifiant },
        data: {
          statutTraitement: issue.statut === "TRAITE" ? "TRAITE" : "IGNORE",
          traiteA: new Date(),
          ...(issue.paiementId === null
            ? {}
            : { paiementId: issue.paiementId }),
        },
      });

      return issue.resultat;
    });
  }
}

/** Ce qu'un traitement rend au tronc commun : l'issue, et le paiement touche. */
type ResultatTraitement = {
  resultat: IssueEvenementPaiement;
  statut: IssueEvenementPaiement["statut"];
  paiementId: string | null;
};

/**
 * Confirme un paiement : encaissement, statut de commande, mouvement de stock.
 *
 * L'ORDRE DES ECRITURES EST INDIFFERENT A LA GARANTIE, et c'est precisement la
 * vertu des cles par effet : chacune refuse independamment, sans dependre de
 * celle qui a ete tentee en premier.
 */
async function confirmerPaiement(
  transaction: Prisma.TransactionClient,
  evenement: EvenementPaiement,
  origine: OrigineEcriture,
): Promise<ResultatTraitement> {
  const commande = await transaction.commande.findUnique({
    where: { id: evenement.commandeId },
    select: {
      id: true,
      statut: true,
      totalCentimes: true,
      lignes: {
        select: { varianteId: true, quantite: true },
      },
    },
  });

  if (commande === null) {
    /*
     * UNE COMMANDE INTROUVABLE N'EST PAS UNE ERREUR A REJOUER : l'evenement est
     * signe, donc il vient bien du prestataire, mais il ne concerne aucune
     * commande de ce site. Le rejouer indefiniment n'y changerait rien.
     */
    journaliser("warn", "Evenement de paiement sans commande connue", {
      evenement: evenement.identifiant,
    });

    return {
      resultat: { statut: "SANS_EFFET" },
      statut: "SANS_EFFET",
      paiementId: null,
    };
  }

  /*
   * PREMIERE CLE D'EFFET, `paiement_reussi_unique` : la tentative de paiement
   * passe en `REUSSI`, et la base refuse un SECOND encaissement sur la meme
   * commande. Son predicat porte les TROIS etats d'encaissement, LS-45 : un
   * remboursement ne rend pas la commande impayee.
   */
  const encaissement = await encaisserTentative(transaction, evenement);

  if (encaissement.issue === "DOUBLE_ENCAISSEMENT") {
    /*
     * ADR-032, DETECTION. Le refus ne se journalise PAS silencieusement : le
     * client a paye deux fois, et sans alerte personne ne le saurait jamais.
     * L'alerte porte l'identifiant du paiement en trop et son montant, pour que
     * l'exploitante rembourse depuis le tableau de bord du prestataire.
     *
     * AUCUN REMBOURSEMENT AUTOMATIQUE ICI, et l'interdiction est explicite : le
     * chemin qui decide « ce paiement est en trop » est celui qui, s'il se
     * trompe, rend l'argent d'une commande valide.
     */
    await leverAlerteCritique(transaction, {
      type: "DOUBLE_ENCAISSEMENT",
      message:
        `Second encaissement refuse sur la commande ${commande.id}, ` +
        `montant ${evenement.montantCentimes} centimes, ` +
        `session ${evenement.identifiantSession}. Remboursement MANUEL requis.`,
      typeCible: "Paiement",
      idCible: encaissement.paiementId,
    });

    return {
      resultat: { statut: "DOUBLE_ENCAISSEMENT" },
      statut: "DOUBLE_ENCAISSEMENT",
      paiementId: encaissement.paiementId,
    };
  }

  /*
   * LE MONTANT ENCAISSE SE CONFRONTE AU TOTAL FIGE DE LA COMMANDE, defaut releve
   * par `ls-critical-reviewer` le 27 aout 2026. Sans cette garde, un montant
   * different est ecrit tel quel et la comptabilite est fausse EN SILENCE : la
   * divergence ne se verrait qu'au rapprochement bancaire, et la facture de la
   * phase 4 serait emise sur un paiement qui ne couvre pas le total.
   *
   * CE N'EST PAS UNE FAILLE D'AUTHENTIFICATION, l'evenement etant signe : c'est
   * un ecart de coherence, dont les causes reelles sont une session creee par un
   * autre chemin, un essai depuis le tableau de bord ou un defaut de
   * construction des lignes.
   *
   * LA CONFIRMATION N'EST PAS BLOQUEE, meme arbitrage que le stock epuise :
   * l'argent est encaisse, refuser laisserait de l'argent sans commande.
   */
  if (
    encaissement.issue === "ENCAISSE" &&
    evenement.montantCentimes !== commande.totalCentimes
  ) {
    await leverAlerteCritique(transaction, {
      type: "MONTANT_DIVERGENT",
      message:
        `Commande ${commande.id} encaissee pour ` +
        `${evenement.montantCentimes} centimes alors que son total fige vaut ` +
        `${commande.totalCentimes}. Verifier avant facturation.`,
      typeCible: "Paiement",
      idCible: encaissement.paiementId,
    });
  }

  if (encaissement.issue === "DEJA_ENCAISSE") {
    /*
     * LE MEME PAIEMENT, DEJA ENCAISSE PAR L'AUTRE CHEMIN. C'est le cas de
     * l'evenement tardif apres regularisation, critere 4 : la reconciliation a
     * deja tout ecrit, et la meme session est concernee. Rien a refaire.
     */
    return {
      resultat: { statut: "DEJA_TRAITE" },
      statut: "DEJA_TRAITE",
      paiementId: encaissement.paiementId,
    };
  }

  /*
   * DEUXIEME CLE D'EFFET, `mouvement_vente_web_unique` sur (commande, variante).
   * Elle porte la variante et pas seulement la commande : un panier a deux
   * articles decremente deux variantes, donc produit deux mouvements.
   */
  for (const ligne of commande.lignes) {
    if (ligne.varianteId === null) {
      continue;
    }

    /*
     * LA LECTURE PRECEDE L'ECRITURE, ET CE N'EST PAS UN CHOIX DE STYLE. Une
     * violation d'unicite dans une transaction PostgreSQL AVORTE LA TRANSACTION
     * ENTIERE, code `25P02` : toute instruction suivante echoue par
     * « current transaction is aborted », y compris celles qui n'ont rien a voir.
     * Rattraper `P2002` puis continuer, comme le fait `catalogue.ts` hors
     * transaction, ne marche donc PAS ici. Mesure le 27 aout 2026 : la
     * suppression des reservations echouait juste apres.
     *
     * LA CONTRAINTE RESTE LA SECONDE LIGNE DE DEFENSE, et elle n'est pas
     * redondante : entre cette lecture et l'ecriture, un autre chemin peut
     * ecrire le meme mouvement. La lecture porte le cas nominal du croisement,
     * la contrainte porte la concurrence, et l'echec de la transaction est alors
     * le bon comportement puisque le prestataire rejouera.
     */
    const dejaSortie = await transaction.mouvementStock.findFirst({
      where: {
        commandeId: commande.id,
        varianteId: ligne.varianteId,
        type: "VENTE_WEB",
      },
      select: { id: true },
    });

    if (dejaSortie !== null) {
      // L'autre chemin a deja sorti cette variante. Ne pas la sortir deux fois.
      continue;
    }

    await ecrireMouvementVenteWeb(transaction, {
      commandeId: commande.id,
      varianteId: ligne.varianteId,
      quantite: ligne.quantite,
      origine,
    });

    const { sortiePhysique } = await consommerReservationEtSortirStock(
      transaction,
      {
        commandeId: commande.id,
        varianteId: ligne.varianteId,
        quantite: ligne.quantite,
      },
    );

    /*
     * ARBITRAGE DU 27 AOUT 2026 : CONFIRMER ET ALERTER. Le stock n'a pas pu
     * sortir en entier, donc la reservation avait expire et la piece est
     * repartie au catalogue, peut-etre revendue. Refuser laisserait de l'argent
     * encaisse sans commande confirmee, ce qui est pire pour le client comme
     * pour l'exploitante. La commande est donc confirmee et l'alerte appelle a
     * rembourser ou reapprovisionner a la main.
     */
    if (sortiePhysique < ligne.quantite) {
      await leverAlerteCritique(transaction, {
        type: "STOCK_INSUFFISANT_A_LA_CONFIRMATION",
        message:
          `Commande ${commande.id} payee alors que le stock etait epuise : ` +
          `${ligne.quantite} attendu, ${sortiePhysique} sorti. ` +
          `La piece est peut-etre revendue, verifier avant expedition.`,
        typeCible: "Variante",
        idCible: ligne.varianteId,
      });
    }
  }

  /*
   * LES RESERVATIONS SONT SUPPRIMEES APRES CONSOMMATION : sans cela la tache de
   * liberation de LS-120 rendrait `quantite_reservee` une seconde fois, et la
   * piece repartirait au catalogue alors qu'elle est vendue et payee.
   */
  await supprimerReservations(transaction, commande.id);

  /*
   * STATUT DE COMMANDE ET STATUT DE PAIEMENT SONT DEUX AXES DISTINCTS,
   * critere 7. La commande n'avance que depuis `EN_ATTENTE_PAIEMENT` : si elle
   * a deja avance, la remettre a `CONFIRMEE` la ferait RECULER dans sa vie
   * logistique, ce que `payments.md` interdit.
   */
  if (commande.statut === "EN_ATTENTE_PAIEMENT") {
    await transaction.commande.update({
      where: { id: commande.id },
      data: { statut: "CONFIRMEE" },
    });

    await historiserTransition(transaction, {
      commandeId: commande.id,
      statutPrecedent: commande.statut,
      statutNouveau: "CONFIRMEE",
      origine,
    });
  }

  return {
    resultat: { statut: "TRAITE" },
    statut: "TRAITE",
    paiementId: encaissement.paiementId,
  };
}

/**
 * Fait passer une tentative de paiement en `REUSSI`, ou dit pourquoi non.
 *
 * TROIS ISSUES ET NON DEUX, et la distinction porte tout le sujet d'ADR-032 :
 * un refus d'unicite peut signifier « le meme paiement est deja encaisse »,
 * cas benin du chemin croise, ou « une AUTRE session a ete payee », double
 * encaissement reel. Les confondre ferait taire l'alerte dans le second cas, ou
 * alerter a tort sur chaque evenement tardif.
 */
async function encaisserTentative(
  transaction: Prisma.TransactionClient,
  evenement: EvenementPaiement,
): Promise<{
  issue: "ENCAISSE" | "DEJA_ENCAISSE" | "DOUBLE_ENCAISSEMENT";
  paiementId: string;
}> {
  const encaisseExistant = await transaction.paiement.findFirst({
    where: {
      commandeId: evenement.commandeId,
      statut: { in: ETATS_ENCAISSEMENT },
    },
    select: { id: true, identifiantFournisseur: true },
  });

  if (encaisseExistant !== null) {
    /*
     * MEME SESSION : l'autre chemin a deja encaisse CE paiement. Cas nominal du
     * croisement webhook/reconciliation, aucun argent en trop.
     */
    if (
      encaisseExistant.identifiantFournisseur === evenement.identifiantSession
    ) {
      return { issue: "DEJA_ENCAISSE", paiementId: encaisseExistant.id };
    }

    /*
     * SESSION DIFFERENTE : deux sessions de la meme commande ont ete payees.
     * Le paiement en trop est enregistre en `ECHOUE` avec son motif, pour que
     * l'exploitante retrouve la session a rembourser. Il n'entre PAS dans les
     * etats d'encaissement, donc `paiement_reussi_unique` reste satisfaite.
     */
    const enTrop = await transaction.paiement.upsert({
      where: { id: await identifiantTentative(transaction, evenement) },
      create: {
        commandeId: evenement.commandeId,
        statut: "ECHOUE",
        montantCentimes: evenement.montantCentimes,
        identifiantFournisseur: evenement.identifiantSession,
        motifEchec: "Double encaissement detecte, remboursement manuel requis",
      },
      update: {
        statut: "ECHOUE",
        motifEchec: "Double encaissement detecte, remboursement manuel requis",
      },
      select: { id: true },
    });

    return { issue: "DOUBLE_ENCAISSEMENT", paiementId: enTrop.id };
  }

  /*
   * LA TENTATIVE RESERVEE PAR LS-118 EST RETROUVEE PAR SA SESSION. Absente, le
   * paiement est cree : la reconciliation de LS-120 regularise des commandes
   * dont la tentative a pu ne jamais etre ecrite, panne entre creation et
   * rattachement.
   */
  const tentative = await transaction.paiement.findFirst({
    where: {
      commandeId: evenement.commandeId,
      identifiantFournisseur: evenement.identifiantSession,
    },
    select: { id: true },
  });

  /*
   * `confirmeA` EST ECRIT ICI ET UNE SEULE FOIS, LS-76 : c'est la date de
   * rattachement comptable des ventes en ligne. Un second passage ne la
   * reecrit pas, sinon la vente se deplacerait dans le temps et pourrait
   * changer de mois d'imputation.
   */
  const donnees = {
    statut: "REUSSI" as const,
    montantCentimes: evenement.montantCentimes,
    identifiantFournisseur: evenement.identifiantSession,
    confirmeA: new Date(),
  };

  if (tentative === null) {
    const cree = await transaction.paiement.create({
      data: { commandeId: evenement.commandeId, ...donnees },
      select: { id: true },
    });

    return { issue: "ENCAISSE", paiementId: cree.id };
  }

  await transaction.paiement.update({
    where: { id: tentative.id },
    data: donnees,
  });

  return { issue: "ENCAISSE", paiementId: tentative.id };
}

/**
 * Identifiant de la tentative portant cette session, ou un identifiant neuf.
 *
 * L'`upsert` du double encaissement en a besoin pour etre idempotent : un rejeu
 * du meme evenement en trop ne doit pas creer une seconde ligne `ECHOUE`.
 */
async function identifiantTentative(
  transaction: Prisma.TransactionClient,
  evenement: EvenementPaiement,
): Promise<string> {
  const existante = await transaction.paiement.findFirst({
    where: {
      commandeId: evenement.commandeId,
      identifiantFournisseur: evenement.identifiantSession,
    },
    select: { id: true },
  });

  return existante?.id ?? crypto.randomUUID();
}

/**
 * Enregistre un remboursement, partiel ou total.
 *
 * LE STATUT LOGISTIQUE N'EST JAMAIS TOUCHE, critere 9 et `payments.md` : un
 * colis parti reste `EXPEDIEE`, quel que soit l'argent rendu. Forcer `ANNULEE`
 * ferait mentir la logistique sur un colis qui circule.
 *
 * L'AVOIR N'EST PAS EMIS ICI. Une facture est immuable et une correction produit
 * un avoir, mais ni l'un ni l'autre n'existe encore : la facturation est en
 * phase 4. Ce service enregistre l'etat du paiement, rien de plus.
 */
async function enregistrerRemboursement(
  transaction: Prisma.TransactionClient,
  evenement: EvenementPaiement,
): Promise<ResultatTraitement> {
  const paiement = await transaction.paiement.findFirst({
    where: {
      commandeId: evenement.commandeId,
      statut: { in: ETATS_ENCAISSEMENT },
    },
    select: { id: true, montantCentimes: true },
  });

  if (paiement === null) {
    /*
     * ORDRE D'ARRIVEE INATTENDU, cas exige par `payments.md` : un remboursement
     * sur une commande sans encaissement n'a rien a rembourser. Trace et ignore,
     * jamais rejoue.
     */
    journaliser("warn", "Remboursement sans paiement encaisse", {
      evenement: evenement.identifiant,
    });

    return {
      resultat: { statut: "SANS_EFFET" },
      statut: "SANS_EFFET",
      paiementId: null,
    };
  }

  /*
   * LE MONTANT DU PRESTATAIRE EST UN CUMUL, jamais un increment : il porte le
   * total rembourse a ce jour sur la charge. L'additionner au montant deja
   * enregistre compterait deux fois le premier remboursement.
   *
   * LE STATUT SE DEDUIT DU MONTANT, et le seuil est l'egalite au montant
   * encaisse : en dessous `PARTIELLEMENT_REMBOURSE`, a partir de la `REMBOURSE`.
   * Les deux restent dans les trois etats d'encaissement, LS-45.
   */
  const statut: StatutPaiement =
    evenement.montantRembourseCentimes >= paiement.montantCentimes
      ? "REMBOURSE"
      : "PARTIELLEMENT_REMBOURSE";

  await transaction.paiement.update({
    where: { id: paiement.id },
    data: {
      statut,
      montantRembourseCentimes: evenement.montantRembourseCentimes,
    },
  });

  return {
    resultat: { statut: "TRAITE" },
    statut: "TRAITE",
    paiementId: paiement.id,
  };
}

/**
 * Les trois etats d'encaissement, LS-45, MEME PREDICAT que
 * `paiement_reussi_unique` et que `paiementEncaisseExiste`.
 *
 * NE JAMAIS RACCOURCIR CETTE LISTE, y compris si un etat est ajoute a l'enum :
 * un etat d'encaissement de plus doit y entrer. Filtrer sur `REUSSI` seul
 * laissait un paiement sortir du filtre en passant a `PARTIELLEMENT_REMBOURSE`,
 * et un second `REUSSI` redevenait inserable. Mesure sur PostgreSQL 18.4.
 */
const ETATS_ENCAISSEMENT: StatutPaiement[] = [
  "REUSSI",
  "PARTIELLEMENT_REMBOURSE",
  "REMBOURSE",
];
