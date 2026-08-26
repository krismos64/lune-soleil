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
  PrestatairePaiementIndisponibleError,
  type DemandeSessionPaiement,
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
};
