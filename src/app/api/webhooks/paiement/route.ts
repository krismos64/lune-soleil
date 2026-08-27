/**
 * Evenements de paiement du prestataire. LS-119. Adaptateur d'entree.
 *
 * QUI L'APPELLE : le prestataire de paiement, jamais un navigateur. Ce qui
 * protege cette route n'est ni son chemin ni un secret d'en-tete, c'est la
 * SIGNATURE de la charge, verifiee cote serveur, invariant 2. Un appel qui se
 * presente comme le prestataire n'est pas le prestataire.
 *
 * CE QU'ELLE NE DECIDE PAS : aucune logique metier n'est ecrite ici. Elle lit la
 * requete, delegue a `services/webhook-paiement.ts` et traduit l'issue en code
 * de reponse. C'est la regle des adaptateurs d'entree, `CLAUDE.md`.
 */
import { engendrerCorrelationId, journaliser } from "@/lib/journal";
import { verificateurStripe } from "@/integrations/stripe";
import { traiterEvenementPaiement } from "@/services/webhook-paiement";

/**
 * JAMAIS DE CACHE. Une reponse mise en cache ferait croire l'evenement traite
 * sans qu'aucune ecriture n'ait eu lieu, et le defaut ne se verrait qu'au moment
 * ou la commande devrait etre confirmee. Meme motif que la route des taches.
 */
export const dynamic = "force-dynamic";

/**
 * `POST` uniquement : Next.js rend 405 sur les autres verbes sans que rien ne
 * soit a ecrire ici.
 */
export async function POST(requete: Request): Promise<Response> {
  const correlation = { correlationId: engendrerCorrelationId() };

  /*
   * LE CORPS EST LU EN TEXTE BRUT, ET C'EST UNE CONTRAINTE DE LA SIGNATURE :
   * elle porte sur les octets exacts recus. Passer par `requete.json()` puis
   * re-serialiser changerait l'espacement et invaliderait toute signature
   * legitime, ce qui se manifesterait par un refus systematique en production.
   */
  const corpsBrut = await requete.text();
  const signature = requete.headers.get("stripe-signature");

  if (signature === null) {
    /*
     * SANS EN-TETE DE SIGNATURE, RIEN N'EST VERIFIABLE. 400 et non 404 : a la
     * difference d'une route interne, l'existence de celle-ci n'est pas un
     * secret, le prestataire doit la connaitre pour l'appeler.
     */
    journaliser(
      "warn",
      "Evenement de paiement sans signature",
      {},
      correlation,
    );

    return new Response(null, { status: 400 });
  }

  let issue;

  try {
    issue = await traiterEvenementPaiement({
      corpsBrut,
      signature,
      verificateur: verificateurStripe,
    });
  } catch (cause) {
    /*
     * 500 ET NON 200 SUR UN ECHEC, et c'est ce qui rend la reprise possible : le
     * prestataire rejoue les evenements auxquels il n'a pas recu de 2xx. Repondre
     * 200 sur une panne de base ferait perdre la confirmation pour de bon, et la
     * commande resterait en attente jusqu'a la reconciliation de LS-120.
     *
     * LA CAUSE VA AU JOURNAL, JAMAIS AU CORPS DE LA REPONSE, invariant 9 : le
     * depot est public et le message d'erreur peut citer des identifiants.
     */
    journaliser(
      "error",
      "Traitement d'evenement de paiement en echec",
      { erreur: cause instanceof Error ? cause.name : "inconnue" },
      correlation,
    );

    return new Response(null, { status: 500 });
  }

  /*
   * 200 SUR TOUTES LES ISSUES METIER, Y COMPRIS LE REFUS DE SIGNATURE. Le
   * prestataire n'a rien a reessayer : un evenement mal signe ne deviendra pas
   * valide au rejeu, et un evenement deja traite non plus. Repondre 400 ferait
   * rejouer indefiniment, et l'evenement finirait par etre marque en echec chez
   * le prestataire, noyant les alertes qui comptent.
   *
   * UN DOUBLE ENCAISSEMENT REPOND 200 LUI AUSSI : l'AlerteCritique est levee, et
   * c'est elle qui appelle l'exploitante, ADR-032. Le rejeu ne rembourserait
   * rien, le traitement etant MANUEL.
   */
  journaliser(
    issue.statut === "SIGNATURE_INVALIDE" ? "warn" : "info",
    "Evenement de paiement traite",
    { issue: issue.statut },
    correlation,
  );

  return Response.json({ issue: issue.statut }, { status: 200 });
}
