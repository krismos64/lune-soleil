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
}

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
