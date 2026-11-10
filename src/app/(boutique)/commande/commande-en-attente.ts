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

export async function commandeEnAttenteDuNavigateur(): Promise<CommandeEnAttente | null> {
  const magasin = await cookies();
  const commande = decoderCommandeEnCours(
    magasin.get(NOM_COOKIE_COMMANDE)?.value,
  );

  return commande === null ? null : lireCommandeEnAttente(commande.commandeId);
}
