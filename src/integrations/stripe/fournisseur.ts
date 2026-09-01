/**
 * Sessions de paiement, contrat du prestataire. LS-118, etape 5 du parcours 1.
 *
 * L'INTERFACE EST PENSEE POUR LE PROJET ET NON POUR LE FOURNISSEUR, regle du
 * README de `integrations/`. Le reste du code ne connait ni le nom du
 * prestataire, ni la forme de son API : `services/paiement.ts` parle de
 * commandes et de centimes, ce module traduit.
 *
 * CE FICHIER NE PORTE AUCUN APPEL RESEAU, seulement le contrat et ses erreurs,
 * pour que les tests et les services l'importent sans tirer le SDK ni exiger
 * `STRIPE_SECRET_KEY`. L'implementation reelle vit dans `index.ts`, meme
 * decoupage que `integrations/mondial-relay`.
 */

/**
 * Une ligne presentee au client sur la page de paiement.
 *
 * LES LIBELLES SONT LES COPIES FIGEES de la commande, jamais le catalogue
 * courant, invariant 3 : la page de paiement affiche ce que la commande a fige.
 */
export type LigneSessionPaiement = {
  libelle: string;
  quantite: number;
  prixUnitaireCentimes: number;
};

/**
 * Ce que la creation d'une session exige.
 *
 * `cleIdempotence` PORTE LA COMMANDE ET LA TENTATIVE, ADR-032 : les clefs du
 * prestataire sont purgees apres au moins 24 heures, et une clef reutilisee
 * avec des parametres differents rend une erreur. Derivee du seul identifiant
 * de commande, elle casserait le nouvel essai legitime apres un refus.
 *
 * `expireA` EST UNE DATE ET NON UNE DUREE : c'est l'instant que le service a
 * aligne sur la reservation de stock, ADR-006 et ADR-032. Le fournisseur le
 * transmet tel quel, il ne recalcule rien.
 */
export type DemandeSessionPaiement = {
  commandeId: string;
  numeroCommande: string;
  emailClient: string;
  lignes: readonly LigneSessionPaiement[];
  expireA: Date;
  cleIdempotence: string;
  /** Retour navigateur apres paiement. Il ne prouve RIEN, invariant 5. */
  urlRetour: string;
  /** Retour navigateur sur abandon, sans paiement. */
  urlAbandon: string;
};

/** Ce que la creation rend : l'identifiant a rattacher, l'URL de redirection. */
export type SessionPaiementCreee = {
  identifiant: string;
  url: string;
};

/**
 * Issue d'une demande d'expiration.
 *
 * `DEJA_FERMEE` N'EST PAS UNE PANNE, ADR-032 : le prestataire n'expire qu'une
 * session encore ouverte, et son refus parce qu'elle est deja payee ou expiree
 * est l'information que la prevention n'avait rien a faire. La distinction est
 * portee par le type pour que l'appelant ne puisse pas la confondre avec une
 * indisponibilite, qui elle LEVE.
 */
export type IssueExpirationSession = "EXPIREE" | "DEJA_FERMEE";

/**
 * Ce que le prestataire de paiement sait faire, vu du projet.
 */
export interface FournisseurPaiement {
  creerSession(demande: DemandeSessionPaiement): Promise<SessionPaiementCreee>;
  expirerSession(identifiant: string): Promise<IssueExpirationSession>;
  /**
   * Etat REEL d'une session chez le prestataire, LS-120.
   *
   * C'EST LA SEULE SOURCE DE VERITE DE LA RECONCILIATION. Une commande restee
   * en attente depuis plus d'une heure peut avoir ete payee sans que
   * l'evenement soit jamais arrive : la base ne le sait pas, seul le
   * prestataire le sait. L'annuler sans demander reviendrait a annuler une
   * commande payee, et a rendre au catalogue une piece deja vendue.
   */
  lireSession(identifiant: string): Promise<EtatSessionPaiement>;
  /**
   * Demande un remboursement, LS-128, etape 4 du parcours 4.
   *
   * LE MONTANT EST UN INCREMENT, pas un cumul, contrairement a celui que le
   * prestataire REND sur une charge. Deux remboursements partiels de 1000 se
   * demandent en deux appels de 1000, et la charge portera 2000 rembourses.
   * Confondre les deux sens rembourserait deux fois le premier montant.
   *
   * LA CLE D'IDEMPOTENCE EST OBLIGATOIRE et vient de l'appelant, ADR-032 : une
   * relance reseau ne doit jamais rembourser deux fois. C'est le seul appel
   * sortant du projet dont un doublon COUTE DE L'ARGENT.
   */
  rembourser(demande: DemandeRemboursement): Promise<IssueRemboursement>;
}

/** Ce qu'il faut pour demander un remboursement au prestataire. */
export type DemandeRemboursement = {
  /** Session de paiement d'origine, qui porte la charge a rembourser. */
  identifiantSession: string;
  /** Montant a rendre, en centimes, INCREMENT et non cumul, invariant 1. */
  montantCentimes: number;
  /**
   * Cle d'idempotence, stable pour une meme intention de remboursement.
   *
   * ELLE NE DOIT PAS ETRE ENGENDREE A L'APPEL : une valeur neuve a chaque
   * tentative rendrait la relance non idempotente, c'est-a-dire exactement ce
   * que la cle existe pour empecher.
   */
  cleIdempotence: string;
};

/**
 * Ce que le prestataire repond a une demande de remboursement.
 *
 * LE REFUS N'EST PAS UNE PANNE, meme distinction que `IssueExpirationSession`.
 * Un refus est une reponse du prestataire, definitive, qui ne se rejoue pas :
 * charge deja entierement remboursee, montant superieur au restant, litige en
 * cours. Une indisponibilite LEVE, elle, et se retente.
 *
 * LE MONTANT REMBOURSE EST RENDU PAR LE PRESTATAIRE et non repris de la
 * demande : lui seul sait ce qu'il a effectivement rendu, et l'ecart doit
 * apparaitre plutot que d'etre suppose.
 */
export type IssueRemboursement =
  | {
      issue: "REMBOURSE";
      /** Identifiant du remboursement chez le prestataire, pour l'audit. */
      identifiantRemboursement: string;
      /** Ce qui a REELLEMENT ete rendu, en centimes. */
      montantCentimes: number;
    }
  /** Refus definitif du prestataire, avec son code. Aucun avoir ne doit naitre. */
  | { issue: "REFUSE"; code: string };

/**
 * Ce que le prestataire repond sur une session, reduit a ce qui decide.
 *
 * TROIS ETATS ET NON UN BOOLEEN `payee`. « Ouverte » et « expiree sans
 * paiement » appellent des suites differentes : la premiere se laisse vivre, la
 * seconde autorise l'annulation. Les confondre annulerait des commandes encore
 * payables, un client parti dejeuner devant sa page de paiement.
 */
export type EtatSessionPaiement =
  /** Payee. Le montant est celui encaisse, en centimes, invariant 1. */
  | {
      etat: "PAYEE";
      identifiantSession: string;
      montantCentimes: number;
      /** Charge brute, pour l'audit. Jamais interpretee. */
      charge: unknown;
    }
  /** Encore payable : ne rien faire, le client peut revenir. */
  | { etat: "OUVERTE" }
  /** Fermee sans paiement : la commande peut etre annulee. */
  | { etat: "EXPIREE" };

/**
 * Le prestataire ne repond pas, ou repond une erreur qui n'est pas un refus.
 *
 * DISTINCTE D'UNE ERREUR DE PROGRAMMATION, meme motif que
 * `TransporteurIndisponibleError` : elle dit « reessayer plus tard a du sens ».
 * La cause va au journal technique, jamais a l'ecran, invariant 9.
 */
export class PrestatairePaiementIndisponibleError extends Error {
  constructor(cause?: unknown) {
    super("Prestataire de paiement indisponible");
    this.name = "PrestatairePaiementIndisponibleError";
    this.cause = cause;
  }
}
