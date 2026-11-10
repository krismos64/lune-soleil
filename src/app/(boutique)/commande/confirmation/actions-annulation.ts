"use server";

/**
 * Annulation d'une commande en attente par le client, LS-315, ADR-050.
 *
 * ADAPTATEUR, PAS DE LA COUCHE METIER : il lit le cookie signe, delegue a
 * `services/annulation-commande.ts`, reconstruit le panier, traduit l'issue.
 *
 * AUCUN ARGUMENT, invariant 2, meme garantie que `reessayerPaiementAction`. Une
 * Server Action est un point d'entree HTTP : un `commandeId` lu dans le corps
 * de la requete permettrait d'annuler la commande d'autrui et de lui voler la
 * piece qu'il est en train de payer. Seul le cookie signe `ls_commande`
 * designe la commande, et il ne designe que celle de ce navigateur.
 */
import { cookies } from "next/headers";

import {
  NOM_COOKIE_COMMANDE,
  decoderCommandeEnCours,
} from "@/lib/commande-cookie";
import {
  DUREE_COOKIE_SECONDES,
  NOM_COOKIE_PANIER,
  decoderPanier,
  encoderPanier,
  fusionnerPanier,
} from "@/lib/panier-cookie";
import { fournisseurStripe } from "@/integrations/stripe";
import {
  annulerCommandeEnAttente,
  type IssueAnnulation,
} from "@/services/annulation-commande";

/** Ce que l'ecran recoit, jamais une exception. */
export type ResultatAnnulation =
  { statut: "ANNULEE" } | { statut: "IMPOSSIBLE"; message: string };

/**
 * Les mots de chaque refus, sans jargon technique ni detail du prestataire.
 *
 * `PAIEMENT_EN_COURS` N'EST PAS UN ECHEC pour le client : il a paye, la
 * confirmation arrive. Le lui dire evite qu'il croie sa piece perdue.
 */
const MESSAGES: Record<
  Exclude<IssueAnnulation["statut"], "ANNULEE">,
  string
> = {
  PAIEMENT_EN_COURS:
    "Votre paiement vient d'être effectué : la commande ne peut plus être annulée. Sa confirmation arrive dans quelques instants.",
  NON_ANNULABLE:
    "Cette commande ne peut plus être annulée : elle est déjà annulée ou confirmée.",
  REESSAYER:
    "Un paiement a été relancé pour cette commande au même moment. Patientez quelques secondes, puis réessayez.",
  PANNE:
    "L'annulation est momentanément indisponible. Votre commande est conservée, réessayez dans quelques instants.",
};

export async function annulerCommandeAction(): Promise<ResultatAnnulation> {
  const magasin = await cookies();
  const commande = decoderCommandeEnCours(
    magasin.get(NOM_COOKIE_COMMANDE)?.value,
  );

  /*
   * SANS COOKIE VALIDE, RIEN N'EST DESIGNABLE : absent, forge ou perime, la
   * reponse est la meme, et surtout sans se rabattre sur un identifiant fourni
   * par le navigateur.
   */
  if (commande === null) {
    return {
      statut: "IMPOSSIBLE",
      message:
        "Cette commande n'est plus accessible depuis ce navigateur. Elle sera annulée d'elle-même si elle n'est pas payée.",
    };
  }

  const issue = await annulerCommandeEnAttente({
    commandeId: commande.commandeId,
    fournisseur: fournisseurStripe,
  });

  if (issue.statut !== "ANNULEE") {
    return { statut: "IMPOSSIBLE", message: MESSAGES[issue.statut] };
  }

  /*
   * APRES LE COMMIT SEULEMENT : le panier rendu decrit une annulation qui a eu
   * lieu. Memes attributs que `ecrirePanier`, `actions-panier.ts`.
   */
  const panier = fusionnerPanier(
    decoderPanier(magasin.get(NOM_COOKIE_PANIER)?.value),
    issue.lignes,
  );

  if (panier.length > 0) {
    magasin.set(NOM_COOKIE_PANIER, encoderPanier(panier), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DUREE_COOKIE_SECONDES,
    });
  }

  // LA COMMANDE EST CLOSE, son cookie ne designe plus rien d'utile.
  magasin.delete(NOM_COOKIE_COMMANDE);

  return { statut: "ANNULEE" };
}
