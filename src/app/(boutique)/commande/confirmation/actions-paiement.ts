"use server";

/**
 * Reessai de paiement depuis la page de confirmation, LS-118. Cas d'erreur
 * « echec de creation de la session de paiement » du parcours 1.
 *
 * ADAPTATEUR, PAS DE LA COUCHE METIER : il lit le cookie signe, delegue a
 * `services/paiement.ts`, traduit l'issue en message. Aucun identifiant ne
 * vient d'un argument : une Server Action est un point d'entree HTTP, et un
 * `commandeId` recu du corps de la requete permettrait de creer une session de
 * paiement sur la commande d'autrui, invariant 2. AUCUN ARGUMENT, meme garantie
 * que `passerCommandeAction`.
 */
import { cookies } from "next/headers";

import {
  NOM_COOKIE_COMMANDE,
  decoderCommandeEnCours,
} from "@/lib/commande-cookie";
import {
  demarrerPaiement,
  type IssueDemarragePaiement,
} from "@/services/paiement";
import { fournisseurStripe } from "@/integrations/stripe";

/** Ce que l'ecran recoit, jamais une exception. */
export type ResultatReessaiPaiement =
  | { statut: "REDIRECTION"; url: string }
  | { statut: "IMPOSSIBLE"; message: string };

/**
 * Les mots de chaque refus, sans jargon technique ni detail du prestataire.
 *
 * `DEJA_PAYEE` N'EST PAS UN ECHEC pour le client : son paiement est enregistre,
 * le lui dire vaut mieux qu'un bouton qui semble ne rien faire. Le cas se
 * produit quand l'evenement signe arrive entre l'affichage et le clic.
 */
const MESSAGES: Record<
  Exclude<IssueDemarragePaiement["statut"], "REDIRECTION">,
  string
> = {
  DEJA_PAYEE: "Votre paiement est déjà enregistré pour cette commande.",
  RESERVATION_EXPIREE:
    "La réservation de vos pièces a expiré. Repassez commande depuis le catalogue : votre paiement n'a pas été prélevé.",
  INTROUVABLE:
    "Cette commande est introuvable. Repassez commande depuis le catalogue.",
  PANNE:
    "Le paiement est momentanément indisponible. Votre commande est conservée, réessayez dans quelques instants.",
};

export async function reessayerPaiementAction(): Promise<ResultatReessaiPaiement> {
  const magasin = await cookies();
  const commande = decoderCommandeEnCours(
    magasin.get(NOM_COOKIE_COMMANDE)?.value,
  );

  /*
   * SANS COOKIE VALIDE, RIEN N'EST DESIGNABLE : cookie absent, forge ou perime,
   * la reponse est la meme, sans preciser laquelle, et surtout sans se rabattre
   * sur un identifiant fourni par le navigateur.
   */
  if (commande === null) {
    return {
      statut: "IMPOSSIBLE",
      message:
        "Cette commande n'est plus accessible depuis ce navigateur. Repassez commande depuis le catalogue.",
    };
  }

  const issue = await demarrerPaiement({
    commandeId: commande.commandeId,
    fournisseur: fournisseurStripe,
  });

  if (issue.statut === "REDIRECTION") {
    return { statut: "REDIRECTION", url: issue.url };
  }

  return { statut: "IMPOSSIBLE", message: MESSAGES[issue.statut] };
}
