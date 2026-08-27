/**
 * Prestataire de paiement Stripe, implementation reelle. LS-118.
 *
 * CE MODULE TRADUIT, IL NE DECIDE RIEN : quelle session creer, quand expirer la
 * precedente et quoi faire d'une panne appartiennent a `services/paiement.ts`.
 * Ici vivent l'appel reseau, la conversion des centimes vers le format du
 * prestataire, et la traduction de ses erreurs en erreurs du domaine.
 *
 * VERIFIE VIA CONTEXT7 LE 26 AOUT 2026 (stripe-node et reference API) :
 * `checkout.sessions.create(params, { idempotencyKey })`,
 * `checkout.sessions.expire(id)` qui n'agit que sur une session `open` et rend
 * une erreur sinon, `expires_at` en secondes Unix borne a 30 minutes minimum.
 *
 * LA VERIFICATION DE BOUT EN BOUT CONTRE L'API REELLE ATTEND LE COMPTE STRIPE,
 * LS-18 : ce code est ecrit sur la documentation verifiee, les tests du projet
 * passent par le double de `fournisseur.ts`.
 *
 * AUCUN SECRET N'EST JOURNALISE NI EXPOSE, invariant 9, le depot etant public :
 * la cle est lue a l'appel, jamais au chargement du module, et aucune erreur du
 * prestataire n'est recopiee vers l'ecran.
 */
import Stripe from "stripe";

import { journaliser } from "@/lib/journal";
import {
  ChargeEvenementInvalideError,
  SignatureInvalideError,
  type EvenementPaiement,
  type VerificateurSignature,
} from "@/integrations/stripe/evenements";
import {
  PrestatairePaiementIndisponibleError,
  type DemandeSessionPaiement,
  type EtatSessionPaiement,
  type FournisseurPaiement,
  type IssueExpirationSession,
  type SessionPaiementCreee,
} from "@/integrations/stripe/fournisseur";

/**
 * Delai au-dela duquel le prestataire est tenu pour indisponible, et une seule
 * relance reseau : la clef d'idempotence rend la relance sure, ADR-032, et le
 * client attend devant un bouton, pas devant un traitement de fond.
 */
const DELAI_MAXIMUM_MS = 10_000;
const RELANCES_RESEAU = 1;

/**
 * Cle secrete serveur, lue A CHAQUE APPEL et jamais a l'import : la figer
 * casserait les tests qui la changent, et `next build` evalue les modules sans
 * elle, regle « construire n'est pas servir » de `securite.md`.
 *
 * SANS CLE, LE PAIEMENT EST INDISPONIBLE, pas en panne serveur, et c'est
 * l'etat REEL du projet tant que LS-18 n'a pas ouvert le compte : le site se
 * deploie, la commande s'enregistre, l'ecran dit « paiement momentanement
 * indisponible » et la reservation expire proprement. Meme motif que
 * l'implementation d'attente de `integrations/email`. Le journal nomme la
 * variable absente, le NOM seulement, invariant 9 : sans cette ligne, une cle
 * oubliee apres LS-18 serait indistinguable d'une panne du prestataire.
 */
function clientStripe(): Stripe {
  const cle = process.env.STRIPE_SECRET_KEY;

  if (cle === undefined || cle === "") {
    journaliser("error", "STRIPE_SECRET_KEY absente, paiement indisponible");

    throw new PrestatairePaiementIndisponibleError(
      new Error("cle du prestataire non configuree"),
    );
  }

  return new Stripe(cle, {
    timeout: DELAI_MAXIMUM_MS,
    maxNetworkRetries: RELANCES_RESEAU,
  });
}

/** Le prestataire reel, unique implementation de `FournisseurPaiement`. */
export const fournisseurStripe: FournisseurPaiement = {
  async creerSession(
    demande: DemandeSessionPaiement,
  ): Promise<SessionPaiementCreee> {
    const stripe = clientStripe();

    let session: Stripe.Checkout.Session;

    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          /*
           * LA COMMANDE EST PORTEE PAR LA SESSION, deux fois et c'est voulu :
           * `client_reference_id` pour le tableau de bord de l'exploitante,
           * `metadata` pour le webhook de LS-119 et la reconciliation de
           * LS-120, qui retrouveront la commande meme si la tentative en base
           * manquait, panne entre la creation et l'ecriture.
           */
          client_reference_id: demande.commandeId,
          metadata: {
            commandeId: demande.commandeId,
            numeroCommande: demande.numeroCommande,
          },
          /*
           * LES METADONNEES SONT POSEES UNE SECONDE FOIS SUR LE PAYMENT INTENT,
           * ET CE N'EST PAS UNE REDONDANCE. Stripe ne recopie PAS les
           * metadonnees de la session vers le PaymentIntent ni vers la Charge :
           * l'evenement `charge.refunded` porterait donc `metadata: {}`, et
           * TOUT remboursement serait refuse faute de commande rattachee, en
           * silence, l'evenement n'etant pas rejoue apres un 200.
           *
           * Defaut releve par `ls-critical-reviewer` le 27 aout 2026 : la
           * logique de remboursement, prouvee avec un double qui fabrique
           * l'evenement du domaine, n'etait jamais atteinte par le chemin reel.
           */
          payment_intent_data: {
            metadata: {
              commandeId: demande.commandeId,
              numeroCommande: demande.numeroCommande,
            },
          },
          customer_email: demande.emailClient,
          locale: "fr",
          /*
           * LES CENTIMES PASSENT TELS QUELS : `unit_amount` est en plus petite
           * unite de la devise, l'euro en centimes. C'est LA conversion isolee
           * qu'exige `payments.md`, et elle est identite, aucun flottant.
           */
          line_items: demande.lignes.map((ligne) => ({
            quantity: ligne.quantite,
            price_data: {
              currency: "eur",
              unit_amount: ligne.prixUnitaireCentimes,
              product_data: { name: ligne.libelle },
            },
          })),
          /*
           * `expires_at` EN SECONDES UNIX, l'instant aligne par le service sur
           * la reservation, ADR-032. Il se transmet, il ne se recalcule pas.
           */
          expires_at: Math.floor(demande.expireA.getTime() / 1000),
          success_url: demande.urlRetour,
          cancel_url: demande.urlAbandon,
        },
        { idempotencyKey: demande.cleIdempotence },
      );
    } catch (cause) {
      throw new PrestatairePaiementIndisponibleError(cause);
    }

    /*
     * UNE SESSION SANS URL EST UNE ANOMALIE DE PROTOCOLE : l'API n'en rend pas
     * pour les modes integres, que ce projet n'emploie pas. La traiter en
     * indisponibilite plutot qu'en `null` a propager : l'appelant saurait quoi
     * en faire encore moins que nous.
     */
    if (session.url === null) {
      throw new PrestatairePaiementIndisponibleError(
        new Error("session sans URL de redirection"),
      );
    }

    return { identifiant: session.id, url: session.url };
  },

  async expirerSession(identifiant: string): Promise<IssueExpirationSession> {
    const stripe = clientStripe();

    try {
      await stripe.checkout.sessions.expire(identifiant);

      return "EXPIREE";
    } catch (cause) {
      /*
       * UNE REQUETE REFUSEE N'EST PAS UNE PANNE, ADR-032 : l'expiration ne
       * porte que sur une session `open`, et le refus (deja payee, deja
       * expiree, identifiant inconnu) est l'information que la prevention
       * n'avait rien a faire. Seule une erreur de transport ou de serveur du
       * prestataire est une indisponibilite.
       */
      if (cause instanceof Stripe.errors.StripeInvalidRequestError) {
        return "DEJA_FERMEE";
      }

      throw new PrestatairePaiementIndisponibleError(cause);
    }
  },

  async lireSession(identifiant: string): Promise<EtatSessionPaiement> {
    const stripe = clientStripe();

    let session: Stripe.Checkout.Session;

    try {
      session = await stripe.checkout.sessions.retrieve(identifiant);
    } catch (cause) {
      /*
       * TOUTE ERREUR EST UNE INDISPONIBILITE ICI, y compris un identifiant
       * inconnu, et la nuance compte : a la difference de l'expiration, ou un
       * refus est l'information utile, ne pas savoir si une session est payee
       * n'autorise AUCUNE decision. La reconciliation saute la commande et
       * reessaiera au cycle suivant plutot que d'annuler a l'aveugle.
       */
      throw new PrestatairePaiementIndisponibleError(cause);
    }

    /*
     * `payment_status` ET NON `status`, ET C'EST LE POINT. Une session peut
     * porter `status: "complete"` avec `payment_status: "unpaid"` sur un mode
     * differe : lire le statut de session ferait passer pour payee une commande
     * qui ne l'est pas. C'est le paiement qui decide, jamais l'avancement du
     * tunnel.
     */
    if (session.payment_status === "paid") {
      return {
        etat: "PAYEE",
        identifiantSession: session.id,
        montantCentimes: session.amount_total ?? 0,
        charge: session,
      };
    }

    /*
     * `EXPIREE` NE VAUT QUE POUR UNE SESSION REELLEMENT EXPIREE, et non pour
     * tout ce qui n'est pas paye. Correction du 27 aout 2026, relevee par
     * `ls-critical-reviewer` : classer `complete` sans paiement en `EXPIREE`
     * ferait ANNULER une commande dont le reglement est en cours de traitement,
     * ce qu'un moyen differe rendrait courant.
     *
     * Le cas n'est pas atteignable aujourd'hui, ce projet n'employant que le
     * paiement immediat, et c'est precisement pourquoi il se ferme maintenant :
     * ajouter un virement SEPA le rendrait actif du jour au lendemain, et le
     * symptome serait l'annulation de commandes en cours de reglement.
     *
     * NE PAS SAVOIR N'AUTORISE AUCUNE DECISION, meme principe que la panne du
     * prestataire : tout ce qui n'est ni paye ni expire se laisse vivre.
     */
    return session.status === "expired"
      ? { etat: "EXPIREE" }
      : { etat: "OUVERTE" };
  },
};

/**
 * Secret de signature des evenements, lu A CHAQUE APPEL et jamais a l'import,
 * meme motif que la cle secrete : `next build` evalue les modules sans lui.
 *
 * SON ABSENCE FERME LA ROUTE PLUTOT QUE DE L'OUVRIR, defaut FERME : sans secret
 * aucune signature ne peut etre verifiee, donc aucun evenement ne doit produire
 * d'effet. Traiter l'absence comme « pas de verification a faire » livrerait la
 * confirmation de commande a qui sait construire un POST. Le journal nomme la
 * variable absente, son NOM seulement, invariant 9.
 */
function secretWebhook(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (secret === undefined || secret === "") {
    journaliser(
      "error",
      "STRIPE_WEBHOOK_SECRET absente, aucun evenement ne peut etre verifie",
    );

    throw new SignatureInvalideError(
      new Error("secret de signature non configure"),
    );
  }

  return secret;
}

/**
 * Verificateur reel des evenements du prestataire.
 *
 * VERIFIE VIA CONTEXT7 LE 27 AOUT 2026 (stripe-node) : `constructEventAsync` et
 * non `constructEvent`. La forme synchrone leve `CryptoProviderOnlySupportsAsync`
 * des que le fournisseur de chiffrement est celui de Web Crypto, ce que
 * l'execution Next.js peut employer. La forme asynchrone fonctionne dans les
 * deux cas, elle est donc la seule sure.
 *
 * LE CORPS DOIT ETRE LE CORPS BRUT, jamais un objet deja decode : la signature
 * porte sur les octets exacts recus, et un aller-retour par `JSON.parse` puis
 * `JSON.stringify` changerait l'espacement, donc invaliderait toute signature.
 */
export const verificateurStripe: VerificateurSignature = {
  async verifier(
    corpsBrut: string,
    signature: string,
  ): Promise<EvenementPaiement> {
    const secret = secretWebhook();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "cle_absente", {
      timeout: DELAI_MAXIMUM_MS,
    });

    let evenement: Stripe.Event;

    try {
      evenement = await stripe.webhooks.constructEventAsync(
        corpsBrut,
        signature,
        secret,
      );
    } catch (cause) {
      /*
       * TOUTE ERREUR DE VERIFICATION EST UN REFUS, y compris l'horodatage hors
       * tolerance : un evenement capture puis rejoue des heures plus tard par un
       * tiers est refuse au meme titre qu'un corps falsifie.
       */
      throw new SignatureInvalideError(cause);
    }

    return traduireEvenement(evenement);
  },
};

/**
 * Traduit un evenement du prestataire vers la forme du domaine.
 *
 * DEUX TYPES SEULEMENT SONT TRADUITS, et tout le reste est refuse explicitement
 * plutot qu'ignore en silence : un type inconnu qui passerait pour un paiement
 * reussi confirmerait une commande sur un evenement quelconque.
 */
function traduireEvenement(evenement: Stripe.Event): EvenementPaiement {
  if (evenement.type === "checkout.session.completed") {
    const session = evenement.data.object;

    /*
     * `payment_status` EST VERIFIE ET NON SUPPOSE. Une session peut se terminer
     * sans paiement immediat, `unpaid` sur un mode differé : la traiter comme un
     * encaissement confirmerait une commande jamais payee.
     */
    if (session.payment_status !== "paid") {
      throw new ChargeEvenementInvalideError(
        `session terminee sans paiement, etat ${session.payment_status}`,
      );
    }

    const commandeId = session.metadata?.commandeId;

    if (commandeId === undefined || commandeId === "") {
      throw new ChargeEvenementInvalideError("session sans commande rattachee");
    }

    return {
      identifiant: evenement.id,
      type: "PAIEMENT_REUSSI",
      commandeId,
      identifiantSession: session.id,
      /*
       * `amount_total` EST DEJA EN CENTIMES, plus petite unite de l'euro : la
       * conversion est une identite, aucun flottant, invariant 1.
       */
      montantCentimes: session.amount_total ?? 0,
      montantRembourseCentimes: 0,
      charge: evenement.data.object,
    };
  }

  if (evenement.type === "charge.refunded") {
    const charge = evenement.data.object;
    const commandeId = charge.metadata?.commandeId;

    if (commandeId === undefined || commandeId === "") {
      throw new ChargeEvenementInvalideError("charge sans commande rattachee");
    }

    return {
      identifiant: evenement.id,
      type: "PAIEMENT_REMBOURSE",
      commandeId,
      identifiantSession: charge.payment_intent?.toString() ?? charge.id,
      montantCentimes: charge.amount,
      /*
       * `amount_refunded` EST UN CUMUL, jamais un increment : il porte le total
       * rembourse a ce jour sur la charge. L'additionner au montant deja
       * enregistre compterait deux fois le premier remboursement.
       */
      montantRembourseCentimes: charge.amount_refunded,
      charge: evenement.data.object,
    };
  }

  throw new ChargeEvenementInvalideError(`type non traite, ${evenement.type}`);
}
