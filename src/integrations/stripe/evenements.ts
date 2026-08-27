/**
 * Evenements de paiement, contrat du prestataire. LS-119, etape 7 du parcours 1.
 *
 * L'INTERFACE EST PENSEE POUR LE PROJET ET NON POUR LE FOURNISSEUR, regle du
 * README de `integrations/`, meme decoupage que `fournisseur.ts` : le service ne
 * connait ni `checkout.session.completed`, ni `charge.refunded`, ni la forme des
 * objets Stripe. Il parle de commandes, de centimes et de deux types d'effet.
 *
 * CE FICHIER NE PORTE AUCUN APPEL RESEAU NI AUCUNE VERIFICATION CRYPTOGRAPHIQUE,
 * seulement le contrat et ses erreurs, pour que les tests et les services
 * l'importent sans tirer le SDK ni exiger `STRIPE_WEBHOOK_SECRET`.
 * L'implementation reelle vit dans `index.ts`.
 */

/** Les deux effets metier qu'un evenement de paiement peut porter. */
export type TypeEvenementPaiement = "PAIEMENT_REUSSI" | "PAIEMENT_REMBOURSE";

/**
 * Un evenement de paiement, reduit a ce dont le domaine a besoin.
 *
 * `commandeId` VIENT DES METADONNEES DE LA SESSION, donc d'un contenu SIGNE par
 * le prestataire, et c'est ce qui autorise a l'utiliser : invariant 2, un
 * identifiant recu d'une source non authentifiee n'autorise jamais rien. Ici la
 * signature EST l'authentification, verifiee avant que cette valeur existe.
 *
 * `montantRembourseCentimes` EST UN CUMUL ET NON UN INCREMENT : le prestataire
 * rend le total rembourse a ce jour sur la charge. Deux remboursements partiels
 * successifs de 10 EUR sur 49 donnent 1000 puis 2000, jamais 1000 puis 1000.
 * L'additionner serait un double comptage.
 */
export type EvenementPaiement = {
  /** Identifiant du prestataire, porte l'unicite qui ferme le rejeu. */
  identifiant: string;
  type: TypeEvenementPaiement;
  commandeId: string;
  /** Session ayant produit cet evenement, cle de rapprochement d'ADR-032. */
  identifiantSession: string;
  montantCentimes: number;
  montantRembourseCentimes: number;
  /** Charge brute, persistee telle quelle pour l'audit. Jamais interpretee. */
  charge: unknown;
};

/**
 * Ce qui sait transformer un corps brut signe en evenement du domaine.
 *
 * `verifier` LEVE PLUTOT QUE DE RENDRE UN DRAPEAU, et c'est deliberé : un
 * booleen `signatureValide` se teste avec un `if` qu'un refactor peut oublier,
 * et l'oubli laisserait passer un evenement non signe SANS AUCUN SYMPTOME
 * visible. Une exception ne s'ignore pas par omission.
 *
 * IL EST INJECTE dans le service, meme motif que `FournisseurPaiement` : la
 * verification de bout en bout contre le vrai secret attend LS-18, et toute la
 * logique se prouve avec un double.
 */
export interface VerificateurSignature {
  verifier(corpsBrut: string, signature: string): Promise<EvenementPaiement>;
}

/**
 * La signature ne correspond pas, ou l'en-tete manque.
 *
 * ELLE COUVRE AUSSI L'HORODATAGE HORS TOLERANCE, que le prestataire traite
 * comme un echec de signature : un evenement capture puis rejoue des heures
 * plus tard par un tiers est refuse au meme titre qu'un corps falsifie.
 *
 * LA CAUSE VA AU JOURNAL TECHNIQUE, JAMAIS A LA REPONSE, invariant 9 : le
 * message du prestataire cite le corps recu et l'en-tete, et le depot est
 * public.
 */
export class SignatureInvalideError extends Error {
  constructor(cause?: unknown) {
    super("Signature d'evenement invalide");
    this.name = "SignatureInvalideError";
    this.cause = cause;
  }
}

/**
 * L'evenement est signe mais ne porte pas ce que le domaine attend.
 *
 * DISTINCTE DE LA SIGNATURE INVALIDE, et la distinction est utile en
 * exploitation : une signature refusee dit « quelqu'un frappe a la porte sans
 * la clef », une charge inexploitable dit « le prestataire a change sa forme,
 * ou l'evenement ne vient pas de ce site ». Confondre les deux ferait chercher
 * une attaque la ou il y a une evolution d'API.
 */
export class ChargeEvenementInvalideError extends Error {
  constructor(raison: string) {
    super(`Charge d'evenement inexploitable : ${raison}`);
    this.name = "ChargeEvenementInvalideError";
  }
}
