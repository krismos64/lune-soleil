/**
 * Telechargement d'un avoir par le proprietaire de sa commande. LS-57,
 * critere 3. Adaptateur d'entree.
 *
 * MEME MOTIF QUE LA ROUTE DE FACTURE VOISINE, et les deux ne fusionnent pas :
 * un avoir porte son propre identifiant et sa propre chaine de propriete,
 * avoir -> facture -> commande -> utilisateur. Une route generique parametree
 * par un « type de document » aurait un seul point de garde pour deux chaines
 * differentes, et c'est exactement la ou une condition se perd.
 *
 * `[id]` DE LA COMMANDE EST DANS L'URL SANS ETRE UTILISE POUR LA GARDE, et ce
 * n'est pas un oubli : il donne son sens au chemin, l'avoir se consultant
 * depuis le detail de sa commande. La garde, elle, part de `avoirId` et
 * remonte la chaine jusqu'a l'utilisateur de la SESSION. Se fier au `[id]` de
 * l'URL pour autoriser serait precisement ce que l'invariant 2 interdit.
 */
import { readFile } from "node:fs/promises";

import { headers } from "next/headers";

import { cheminAbsoluDocument } from "@/integrations/pdf/rendu-document";
import { engendrerCorrelationId, journaliserErreur } from "@/lib/journal";
import { exigerSession } from "@/services/autorisation";
import { autoriserMonAvoir } from "@/services/espace-client-commandes";

export const dynamic = "force-dynamic";

/** 404 uniforme, meme raison que la route de facture. */
function refus(): Response {
  return new Response("Document introuvable", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ id: string; avoirId: string }> },
): Promise<Response> {
  const correlation = { correlationId: engendrerCorrelationId() };

  const identite = await exigerSession(await headers());

  if (!identite) {
    return refus();
  }

  const { avoirId } = await contexte.params;

  const acces = await autoriserMonAvoir(avoirId, identite.utilisateurId);

  if (acces.statut !== "AUTORISE") {
    return refus();
  }

  try {
    const absolu = cheminAbsoluDocument(acces.cheminPdf);
    const octets = await readFile(absolu);

    return new Response(new Uint8Array(octets), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${acces.numero}.pdf"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (erreur) {
    journaliserErreur(
      "Lecture du document impossible",
      erreur,
      { document: acces.numero },
      correlation,
    );

    return refus();
  }
}
