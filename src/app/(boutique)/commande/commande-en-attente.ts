/**
 * La commande en attente de CE navigateur, LS-315, volet 1.
 *
 * ADAPTATEUR : il lit le cookie signe `ls_commande` et delegue au service. Le
 * cookie seul designe la commande, invariant 2 : sans lui, ou forge, rien.
 */
import { cookies } from "next/headers";

import {
  NOM_COOKIE_COMMANDE,
  decoderCommandeEnCours,
} from "@/lib/commande-cookie";
import {
  lireCommandeEnAttente,
  type CommandeEnAttente,
} from "@/services/annulation-commande";
import { lireEtatCommande } from "@/services/paiement";

export async function commandeEnAttenteDuNavigateur(): Promise<CommandeEnAttente | null> {
  const magasin = await cookies();
  const commande = decoderCommandeEnCours(
    magasin.get(NOM_COOKIE_COMMANDE)?.value,
  );

  return commande === null ? null : lireCommandeEnAttente(commande.commandeId);
}

/**
 * Le numero de la commande de ce navigateur si la BASE la dit annulee, ou
 * `null`. LS-315, annonce apres l'annulation.
 *
 * LE PARAMETRE D'URL NE PROUVE RIEN, et c'est pourquoi cette lecture existe :
 * `?annulation=1` dit seulement « une annulation vient peut-etre d'avoir
 * lieu ». L'annonce ne s'affiche que si la commande que designe le cookie
 * signe est reellement `ANNULEE`, meme principe que `?retour=` sur la page de
 * confirmation.
 */
export async function commandeAnnuleeDuNavigateur(): Promise<string | null> {
  const magasin = await cookies();
  const commande = decoderCommandeEnCours(
    magasin.get(NOM_COOKIE_COMMANDE)?.value,
  );

  if (commande === null) {
    return null;
  }

  const etat = await lireEtatCommande(commande.commandeId);

  return etat !== null && etat.statut === "ANNULEE" && !etat.encaissee
    ? etat.numero
    : null;
}
