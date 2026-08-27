/**
 * Demarrage du paiement d'une commande, LS-118. Etape 5 du parcours 1.
 *
 * LA SESSION SE CREE APRES LE COMMIT, JAMAIS DEDANS, ADR-024 : ce service
 * s'appelle une fois `passerCommande` terminee, et n'ouvre AUCUNE transaction.
 * Un appel reseau dans la transaction de commande tiendrait le verrou de ligne
 * de la variante pendant tout l'aller-retour, et son echec effacerait la
 * commande par rollback. Ici, une panne du prestataire laisse la commande
 * `EN_ATTENTE_PAIEMENT` avec ses reservations, cas d'erreur prevu du parcours 1.
 *
 * TROIS CONTRAINTES D'ADR-032 :
 *
 * 1. la session precedente encore en attente est EXPIREE avant d'en creer une
 *    nouvelle, pour qu'une commande ne porte jamais deux sessions payables ;
 * 2. `expires_at` vaut 30 minutes, borne basse du prestataire, ALIGNE sur la
 *    reservation d'ADR-006 ;
 * 3. la clef d'idempotence porte la commande ET la tentative, jamais la seule
 *    commande, les clefs du prestataire rendant une erreur si les parametres
 *    changent.
 *
 * COMPLEMENT DU 26 AOUT 2026 : au reessai, une nouvelle session dure encore 30
 * minutes alors que la reservation peut etre presque echue. Les reservations
 * actives sont donc PROLONGEES jusqu'a l'`expires_at` de chaque session creee,
 * et une reservation deja expiree est un refus metier, sans appel au
 * prestataire.
 *
 * LA PREVENTION EST SERIALISEE PAR UN VERROU DE LIGNE sur la commande, et la
 * tentative est reservee AVANT l'appel reseau. Ces deux choix corrigent trois
 * defauts releves par `ls-critical-reviewer` le 26 aout 2026, tous du meme
 * genre : la prevention d'ADR-032 lisait un etat qu'elle ne tenait pas, donc
 * deux sessions payables pouvaient coexister malgre elle. Le detail vit sur les
 * fonctions concernees de `repositories/paiement.ts`.
 */
import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import type { StatutCommande } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { journaliserErreur } from "@/lib/journal";
import { schemaIdentifiant, valider } from "@/lib/validation";
import {
  PrestatairePaiementIndisponibleError,
  type FournisseurPaiement,
  type LigneSessionPaiement,
} from "@/integrations/stripe/fournisseur";
import {
  lireCommandeAPayer,
  type CommandeAPayer,
} from "@/repositories/commande";
import {
  derniereSessionEnAttente,
  paiementEncaisseExiste,
  rattacherSessionPaiement,
  reserverTentativePaiement,
  supprimerTentativeSansSession,
} from "@/repositories/paiement";
import { prolongerReservationsActives } from "@/repositories/stock";
import { passerCommande, type IssueCommande } from "@/services/commande";

/**
 * Duree de vie d'une session de paiement, 30 minutes.
 *
 * C'EST LA BORNE BASSE DU PRESTATAIRE, ADR-032, et elle coincide avec la duree
 * de reservation d'ADR-006. Ne pas l'allonger : une session qui survivrait a sa
 * reservation permettrait de payer une piece que la tache de liberation vient
 * de rendre au catalogue.
 */
export const DUREE_SESSION_PAIEMENT_MINUTES = 30;

/** Ce que le demarrage d'un paiement peut rendre. L'ecran choisit les mots. */
export type IssueDemarragePaiement =
  /** La session existe, le client part chez le prestataire. */
  | { statut: "REDIRECTION"; url: string }
  /** Un paiement est deja encaisse, ou la commande a depasse ce stade. */
  | { statut: "DEJA_PAYEE" }
  /** La reservation est echue : la piece a pu repartir au catalogue. */
  | { statut: "RESERVATION_EXPIREE" }
  /** Aucune commande sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /** Le prestataire ne repond pas : la commande reste intacte, reessayer. */
  | { statut: "PANNE" };

/**
 * Cree la session de paiement d'une commande et rattache son identifiant.
 *
 * `fournisseur` EST INJECTE, meme motif que `chercherPointsRetrait` : le compte
 * Stripe attend LS-18, toute la logique se prouve avec un double, et la panne
 * simulee du critere 4 n'est possible que par ce point d'injection.
 */
export async function demarrerPaiement({
  commandeId,
  fournisseur,
  urlBase = lireUrlBase(),
  client = prisma,
}: {
  commandeId: string;
  fournisseur: FournisseurPaiement;
  urlBase?: string;
  client?: typeof prisma;
}): Promise<IssueDemarragePaiement> {
  // VALIDATION AU POINT D'ENTREE DU CAS D'USAGE, invariant 7 : l'identifiant
  // vient d'un cookie signe, mais ce service reste appelable par un autre
  // chemin. Un identifiant difforme s'arrete ici, pas dans une requete SQL.
  const identifiant = valider(schemaIdentifiant, commandeId);

  /*
   * TOUT CE QUI PRECEDE L'APPEL RESEAU TIENT DANS UNE TRANSACTION, et elle ne
   * contient AUCUN appel externe : ADR-024 interdit l'inverse, pas celle-ci.
   * Elle lit l'etat, prolonge les reservations et reserve la tentative. Deux
   * defauts fermes ici, releves par `ls-critical-reviewer` le 26 aout 2026 :
   *
   * - LA PROLONGATION EST LA GARDE, son compte de lignes etant compare au
   *   nombre de lignes de commande : une lecture existentielle laissait payer un
   *   panier dont une seule piece etait encore reservee. Elle prend son propre
   *   verrou de ligne, `UPDATE` conditionnel d'ADR-006, donc aucun verrou
   *   explicite n'est utile ici.
   * - LA TENTATIVE EST RESERVEE AVANT L'APPEL, ce qui rend toute session creee
   *   tracable. Ecrite apres, une ecriture perdue laissait une session orpheline
   *   payable trente minutes que rien n'expirerait jamais.
   *
   * LE TROISIEME DEFAUT, deux sessions payables sous concurrence, ne se ferme
   * PAS ici : un verrou pris dans cette transaction serait relache avant l'appel
   * reseau, donc avant que la session existe. Il a ete essaye, et retire parce
   * qu'aucun test ne le voyait, a juste titre. C'est le rattrapage APRES
   * creation qui porte la garantie.
   */
  const prepare = await client.$transaction(async (transaction) => {
    const commande = await lireCommandeAPayer(transaction, identifiant);

    if (commande === null) {
      return { refus: { statut: "INTROUVABLE" } as const };
    }

    /*
     * LE PAIEMENT ENCAISSE SE VERIFIE EN PLUS DU STATUT DE COMMANDE, axes
     * distincts, regle de `payments.md` : entre l'evenement signe et la mise a
     * jour du statut, une fenetre existe ou la commande est encore
     * `EN_ATTENTE_PAIEMENT` avec un paiement `REUSSI`. Creer une session dans
     * cette fenetre, c'est offrir le double encaissement qu'ADR-032 previent.
     */
    if (await paiementEncaisseExiste(transaction, identifiant)) {
      return { refus: { statut: "DEJA_PAYEE" } as const };
    }

    if (commande.statut !== "EN_ATTENTE_PAIEMENT") {
      /*
       * `ANNULEE` SANS ENCAISSEMENT : la reconciliation a ferme la commande, la
       * piece est repartie au catalogue. Le message de reservation expiree dit
       * au client la seule chose utile, repasser commande. Tout autre statut
       * sans encaissement releve du meme refus : plus rien n'est payable ici.
       */
      return {
        refus:
          commande.statut === "ANNULEE"
            ? ({ statut: "RESERVATION_EXPIREE" } as const)
            : ({ statut: "DEJA_PAYEE" } as const),
      };
    }

    /*
     * UN SEUL INSTANT POUR LES DEUX EXPIRATIONS. La reservation est prolongee
     * au meme `expireA` que la session : l'alignement d'ADR-032 est une
     * identite, pas une coincidence de durees.
     */
    const expireA = new Date(
      Date.now() + DUREE_SESSION_PAIEMENT_MINUTES * 60 * 1000,
    );

    const prolongees = await prolongerReservationsActives(transaction, {
      commandeId: identifiant,
      expireA,
    });

    /*
     * CHAQUE LIGNE DE COMMANDE DOIT PORTER SA RESERVATION, pas une seule
     * d'entre elles : la garde est universelle. Un panier a deux pieces dont une
     * est repartie au catalogue se refuse entierement, sans appel au
     * prestataire, plutot que de faire payer une piece peut-etre revendue.
     */
    if (prolongees < commande.lignes.length) {
      return { refus: { statut: "RESERVATION_EXPIREE" } as const };
    }

    /*
     * LA CLEF PORTE LA COMMANDE ET LA TENTATIVE, ADR-032. L'identifiant de
     * tentative est engendre ICI et sert de cle primaire au `Paiement` : le
     * rejeu reseau du MEME appel reutilise la meme clef, un nouvel essai
     * legitime en prend une neuve.
     */
    const tentativeId = randomUUID();

    /*
     * LA SESSION A EXPIRER SE LIT SOUS LE VERROU ET AVANT DE RESERVER LA
     * NOUVELLE TENTATIVE : `derniereSessionEnAttente` prend la plus recente
     * tentative PORTANT un identifiant, donc jamais celle que l'on reserve.
     *
     * CE QU'ELLE NE PEUT PAS VOIR, ET POURQUOI CE N'EST PAS UN TROU : une
     * tentative concurrente en vol, reservee mais dont la session n'est pas
     * encore rattachee. Le verrou ne s'etend pas jusque-la, ADR-024 interdisant
     * de tenir une transaction pendant un appel reseau. C'est
     * `sessionsAExpirer` ci-dessous, appelee APRES la creation, qui rattrape ce
     * cas : elle relit sous le meme verrou et expire tout ce qui traine.
     */
    const sessionPrecedente = await derniereSessionEnAttente(
      transaction,
      identifiant,
    );

    await reserverTentativePaiement(transaction, {
      id: tentativeId,
      commandeId: identifiant,
      montantCentimes: commande.totalCentimes,
    });

    return { commande, expireA, tentativeId, sessionPrecedente };
  });

  if ("refus" in prepare) {
    return prepare.refus;
  }

  const { commande, expireA, tentativeId, sessionPrecedente } = prepare;

  /*
   * PREVENTION D'ADR-032, HORS TRANSACTION : expirer la session precedente
   * avant d'en creer une. `DEJA_FERMEE` n'est pas une panne, c'est
   * l'information que la prevention n'avait rien a faire. Une INDISPONIBILITE,
   * elle, arrete tout : creer une session sans savoir si la precedente est
   * encore payable rouvrirait exactement le double encaissement que cette
   * prevention ferme.
   */
  if (sessionPrecedente !== null) {
    try {
      await fournisseur.expirerSession(sessionPrecedente);
    } catch (cause) {
      if (!(cause instanceof PrestatairePaiementIndisponibleError)) {
        throw cause;
      }

      journaliserErreur("expiration de session de paiement impossible", cause, {
        commandeId: identifiant,
      });

      await supprimerTentativeSansSession(client, tentativeId);

      return { statut: "PANNE" };
    }
  }

  let session;

  try {
    session = await fournisseur.creerSession({
      commandeId: identifiant,
      numeroCommande: commande.numero,
      emailClient: commande.emailNormalise,
      lignes: construireLignes(commande),
      expireA,
      cleIdempotence: `paiement-${identifiant}-${tentativeId}`,
      urlRetour: `${urlBase}/commande/confirmation?retour=paiement`,
      urlAbandon: `${urlBase}/commande/confirmation?retour=abandon`,
    });
  } catch (cause) {
    if (!(cause instanceof PrestatairePaiementIndisponibleError)) {
      throw cause;
    }

    /*
     * LA COMMANDE RESTE INTACTE, cas d'erreur du parcours 1 : la tentative
     * reservee est retiree, aucun identifiant n'est rattache. La cause va au
     * journal technique, reduite a son nom de classe, jamais a l'ecran.
     */
    journaliserErreur("creation de session de paiement impossible", cause, {
      commandeId: identifiant,
    });

    await supprimerTentativeSansSession(client, tentativeId);

    return { statut: "PANNE" };
  }

  /*
   * RATTACHEMENT ET RATTRAPAGE DANS LA MEME TRANSACTION, ET C'EST CE QUI FERME
   * LA CONCURRENCE, troisieme defaut de la revue du 26 aout 2026.
   *
   * POURQUOI UN VERROU N'Y SUFFIT PAS : il ne peut pas couvrir l'appel reseau,
   * ADR-024 interdisant de tenir une transaction pendant un aller-retour. Deux
   * demarrages simultanes lisent donc tous deux « aucune session precedente »,
   * puisqu'aucun des deux n'a encore rattache la sienne au moment de lire. Un
   * verrou a bien ete pose ici, puis RETIRE : aucune mutation ne le faisait
   * rougir, il affirmait une protection qu'il n'apportait pas.
   *
   * La parade est de regarder APRES : une fois sa session rattachee, on relit
   * toutes les tentatives de la commande portant une session et on expire
   * celles qui ne sont pas la notre. Le dernier a rattacher expire les
   * precedentes, et l'invariant d'ADR-032 tient, une seule session payable par
   * commande, quel que soit l'entrelacement.
   *
   * Mesure le 26 aout 2026 : sans ce rattrapage, le test de concurrence
   * n'observe AUCUNE expiration alors que deux sessions sont creees.
   */
  let aExpirer: string[] = [];

  try {
    aExpirer = await client.$transaction(async (transaction) => {
      /*
       * LE VERROU DE LIGNE SUR LA COMMANDE SERIALISE LES RATTACHEMENTS, et il
       * est indispensable ICI alors qu'il etait inutile avant l'appel reseau.
       *
       * MESURE LE 27 AOUT 2026, SIX ECHECS SUR SIX : sans lui, les deux
       * transactions de rattachement s'executent en parallele et, en
       * `READ COMMITTED`, aucune ne voit la ligne que l'autre n'a pas encore
       * validee. Les deux relisent « aucune autre session », `expirations` reste
       * VIDE, et deux sessions payables coexistent, exactement le trou
       * qu'ADR-032 ferme. Le defaut se cachait derriere un test qui nommait la
       * session attendue et passait dans la suite complete.
       *
       * POURQUOI IL EST LEGITIME, quand celui d'avant l'appel ne l'etait pas :
       * il ne couvre AUCUN appel reseau, ADR-024. La session existe deja, les
       * expirations partent APRES le commit, et la section critique se reduit a
       * deux instructions locales.
       */
      await transaction.$executeRaw`
        SELECT id FROM commande WHERE id = ${identifiant} FOR UPDATE
      `;

      await rattacherSessionPaiement(transaction, {
        tentativeId,
        identifiantFournisseur: session.identifiant,
      });

      const autres = await sessionsAExpirer(
        transaction,
        identifiant,
        tentativeId,
      );

      /*
       * CELLE QUE LA PREVENTION A DEJA EXPIREE EST RETIREE. L'expirer une
       * seconde fois n'aurait aucun effet chez le prestataire, qui refuserait
       * une session non `open`, mais produirait un appel reseau par demarrage
       * et un `DEJA_FERMEE` indistinguable d'un vrai rattrapage.
       */
      return autres.filter((ancienne) => ancienne !== sessionPrecedente);
    });
  } catch (cause) {
    /*
     * LA SESSION EXISTE MAIS NE PEUT PAS ETRE TRACEE : la laisser ouverte la
     * rendrait payable trente minutes sans qu'aucune prevention ne puisse
     * l'expirer, exactement le trou que la reservation prealable ferme. On
     * l'expire donc tout de suite, au mieux de ce qui reste possible.
     */
    journaliserErreur("session creee mais non rattachee", cause, {
      commandeId: identifiant,
    });

    await fournisseur.expirerSession(session.identifiant).catch(() => {
      journaliserErreur("session non rattachee et non expiree", cause, {
        commandeId: identifiant,
      });
    });

    return { statut: "PANNE" };
  }

  /*
   * LES SESSIONS CONCURRENTES SONT EXPIREES APRES LE COMMIT, jamais dedans :
   * ce sont des appels reseau, ADR-024. Leur echec n'est PAS une panne du
   * demarrage en cours, dont la session est creee et payable : le client part
   * payer, et la trace du refus reste au journal pour la detection de LS-119.
   */
  for (const ancienne of aExpirer) {
    await fournisseur.expirerSession(ancienne).catch((cause: unknown) => {
      journaliserErreur("session concurrente non expiree", cause, {
        commandeId: identifiant,
      });
    });
  }

  return { statut: "REDIRECTION", url: session.url };
}

/**
 * Les sessions de la commande autres que celle de la tentative en cours.
 *
 * A APPELER SOUS LE VERROU DE LA COMMANDE, apres avoir rattache la sienne :
 * c'est ce qui rend le rattrapage exact, la lecture voyant alors toutes les
 * tentatives que des demarrages concurrents ont rattachees.
 *
 * ELLES SONT TOUTES `EN_ATTENTE` : une tentative encaissee ne se touche pas, et
 * `paiementEncaisseExiste` a deja refuse le demarrage dans ce cas.
 */
async function sessionsAExpirer(
  transaction: Prisma.TransactionClient,
  commandeId: string,
  tentativeEnCours: string,
): Promise<string[]> {
  const autres = await transaction.paiement.findMany({
    where: {
      commandeId,
      statut: "EN_ATTENTE",
      identifiantFournisseur: { not: null },
      id: { not: tentativeEnCours },
    },
    select: { identifiantFournisseur: true },
  });

  return autres.flatMap((tentative) =>
    tentative.identifiantFournisseur === null
      ? []
      : [tentative.identifiantFournisseur],
  );
}

/**
 * Le chemin de production complet de l'etape 4 a l'etape 5 : la commande,
 * PUIS la session de paiement, dans cet ordre et jamais autrement.
 *
 * CETTE FONCTION EXISTE POUR PORTER LA FRONTIERE D'ADR-024 : `passerCommande`
 * valide sa transaction et rend la main, la creation de session vient APRES.
 * C'est elle que l'adaptateur du tunnel appelle, et c'est elle que le test de
 * panne exerce : la mutation du critere 9 de LS-118 deplace l'appel au
 * prestataire dans la transaction, et la commande cesse de survivre a la panne.
 *
 * ELLE PROPAGE LES REFUS DE COMMANDE, `CommandeRefuseeError` et interblocage :
 * l'adaptateur les traduit deja. Un echec du PAIEMENT, lui, ne remonte pas en
 * exception : la commande existe, le resultat le dit.
 */
export async function passerCommandeEtDemarrerPaiement({
  lignesCookie,
  saisie,
  fournisseur,
  configuration,
  urlBase,
  client = prisma,
}: {
  lignesCookie: Parameters<typeof passerCommande>[0]["lignesCookie"];
  saisie: Parameters<typeof passerCommande>[0]["saisie"];
  fournisseur: FournisseurPaiement;
  configuration?: Parameters<typeof passerCommande>[0]["configuration"];
  urlBase?: string;
  client?: typeof prisma;
}): Promise<{ commande: IssueCommande; paiement: IssueDemarragePaiement }> {
  const commande = await passerCommande({
    lignesCookie,
    saisie,
    ...(configuration === undefined ? {} : { configuration }),
    client,
  });

  const paiement = await demarrerPaiement({
    commandeId: commande.commandeId,
    fournisseur,
    ...(urlBase === undefined ? {} : { urlBase }),
    client,
  });

  return { commande, paiement };
}

/** Ce que la page de confirmation affiche d'une commande en cours. */
export type EtatCommandeEnCours = {
  numero: string;
  statut: StatutCommande;
  /** Vrai des qu'un paiement est encaisse, meme si le statut n'a pas suivi. */
  encaissee: boolean;
};

/**
 * Lit l'etat reel d'une commande pour la page de confirmation, LS-118.
 *
 * C'EST LA BASE QUI PARLE, JAMAIS LE RETOUR NAVIGATEUR, invariant 5 : tant que
 * l'evenement signe de LS-119 n'a pas confirme, `encaissee` reste faux et la
 * page n'affirme rien. L'appelant a etabli le droit de lecture par le cookie
 * signe ; l'identifiant seul n'aurait rien autorise, invariant 2.
 */
export async function lireEtatCommande(
  commandeId: string,
  client: typeof prisma = prisma,
): Promise<EtatCommandeEnCours | null> {
  const identifiant = valider(schemaIdentifiant, commandeId);
  const commande = await lireCommandeAPayer(client, identifiant);

  if (commande === null) {
    return null;
  }

  return {
    numero: commande.numero,
    statut: commande.statut,
    encaissee: await paiementEncaisseExiste(client, identifiant),
  };
}

/**
 * Traduit la commande en lignes de paiement.
 *
 * LA SOMME DES LIGNES VAUT LE TOTAL DE LA COMMANDE par construction : lignes
 * figees plus frais de port, et C28 garantit en base que ce total n'est rien
 * d'autre, la taxe valant zero en franchise. Aucun montant n'est recalcule.
 */
function construireLignes(commande: CommandeAPayer): LigneSessionPaiement[] {
  const lignes: LigneSessionPaiement[] = commande.lignes.map((ligne) => ({
    libelle: `${ligne.libelleProduitFige}, ${ligne.libelleVarianteFige}`,
    quantite: ligne.quantite,
    prixUnitaireCentimes: ligne.prixFigeCentimes,
  }));

  if (commande.fraisPortCentimes > 0) {
    lignes.push({
      libelle: "Livraison",
      quantite: 1,
      prixUnitaireCentimes: commande.fraisPortCentimes,
    });
  }

  return lignes;
}

/**
 * Base des URL de retour navigateur.
 *
 * `NEXT_PUBLIC_SITE_URL` est deja l'adresse publique du site, `.env.example`.
 * Le repli sur localhost ne sert qu'au developpement : ces URL ne prouvent
 * rien, invariant 5, une valeur fausse casse le retour, jamais la securite.
 */
function lireUrlBase(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;

  return base === undefined || base === "" ? "http://localhost:3000" : base;
}
