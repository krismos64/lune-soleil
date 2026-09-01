/**
 * Telechargement d'une facture par lien signe. LS-132. Adaptateur d'entree.
 *
 * QUI L'APPELLE : le client, depuis le lien recu par email, sans session.
 * Ce qui protege cette route n'est ni son chemin ni l'identifiant qu'elle
 * porte, c'est la SIGNATURE du jeton, verifiee cote serveur, invariant 2.
 *
 * CE QU'ELLE NE DECIDE PAS : aucune regle n'est ecrite ici. Elle lit le jeton,
 * delegue a `services/acces-document.ts` et traduit l'issue en reponse. Regle
 * des adaptateurs d'entree, `CLAUDE.md`.
 *
 * LE FICHIER N'EST PAS SERVI PAR NGINX, et c'est la raison d'etre de cette
 * route. `DOCUMENTS_RACINE` est un volume DISTINCT de celui des medias,
 * precisement pour qu'aucune URL statique ne puisse atteindre une facture :
 * l'acces passe par ce controle ou ne passe pas.
 */
import { readFile } from "node:fs/promises";

import { engendrerCorrelationId, journaliserErreur } from "@/lib/journal";
import { cheminAbsoluDocument } from "@/integrations/pdf/rendu-document";
import { autoriserAccesDocument } from "@/services/acces-document";

/**
 * JAMAIS DE CACHE. Une reponse mise en cache servirait le document apres
 * revocation ou expiration du jeton, ce qui viderait les regles L9 et L10 de
 * leur effet : le controle ne serait plus rejoue.
 */
export const dynamic = "force-dynamic";

/**
 * Reponse de refus, IDENTIQUE POUR TOUS LES MOTIFS.
 *
 * 404 ET NON 403, et la nuance porte tout l'invariant 2. Un 403 signifierait
 * « ce document existe mais vous n'y avez pas droit », ce qui revele l'existence
 * d'une commande. Un 404 uniforme ne distingue pas un jeton forge d'un jeton
 * expire ni d'une commande inexistante.
 *
 * AUCUN CORPS DETAILLE ET AUCUN EN-TETE VARIABLE : deux refus doivent etre
 * indiscernables jusque dans leur taille.
 */
function refus(): Response {
  return new Response("Document introuvable", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ jeton: string }> },
): Promise<Response> {
  const correlation = { correlationId: engendrerCorrelationId() };
  const { jeton } = await contexte.params;

  const acces = await autoriserAccesDocument(jeton, correlation);

  if (acces.statut !== "AUTORISE") {
    return refus();
  }

  try {
    /*
     * LE CHEMIN EST REVALIDE AVANT LECTURE, meme s'il vient de la base.
     * `cheminPdf` est une colonne texte libre : `cheminAbsoluDocument` refuse
     * l'absolu et la remontee de repertoire, garde ecrite en LS-129 et
     * corrigee depuis, une premiere version ne gardant rien.
     */
    const absolu = cheminAbsoluDocument(acces.cheminPdf);
    const octets = await readFile(absolu);

    return new Response(new Uint8Array(octets), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        /*
         * `attachment` ET NON `inline` : un PDF ouvert dans l'onglet laisse
         * l'URL signee dans l'historique et la barre d'adresse, d'ou elle se
         * recopie. Le nom propose est le numero de document, jamais un chemin.
         */
        "content-disposition": `attachment; filename="${acces.numero}.pdf"`,
        /*
         * INTERDICTION DE CACHE JUSQU'AUX INTERMEDIAIRES. Sans `private`, un
         * cache partage pourrait servir la facture d'un client a un autre.
         */
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (erreur) {
    /*
     * UN FICHIER ABSENT DU VOLUME REND LE MEME REFUS, invariant 2. La base dit
     * que le document existe, le disque dit le contraire : c'est une anomalie
     * d'exploitation, journalisee ici, mais le client ne doit pas apprendre par
     * un 500 que sa commande existe.
     */
    journaliserErreur(
      "Lecture du document impossible",
      erreur,
      { factureId: acces.factureId },
      correlation,
    );

    return refus();
  }
}
