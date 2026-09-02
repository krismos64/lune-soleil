/**
 * Telechargement d'une facture par son proprietaire connecte. LS-57, critere 3.
 * Adaptateur d'entree.
 *
 * QUI L'APPELLE : le client, depuis son espace, avec une session. Ce qui
 * protege cette route n'est ni son chemin ni l'identifiant qu'elle porte, c'est
 * la SESSION recoupee cote serveur, invariant 2.
 *
 * ELLE DOUBLE `facture/[jeton]/route.ts` SANS LA REMPLACER, et les deux doivent
 * coexister : celle-la sert le client SANS COMPTE par un jeton signe, LS-132,
 * celle-ci le client CONNECTE par sa session. Les deux menent au meme fichier
 * et portent chacune leur propre preuve. Faire dependre l'une de l'autre
 * reviendrait a supposer qu'un client connecte possede aussi un jeton, ce qui
 * est faux.
 *
 * LE FICHIER N'EST PAS SERVI PAR NGINX, et c'est la raison d'etre de cette
 * route. `DOCUMENTS_RACINE` est un volume DISTINCT de celui des medias,
 * precisement pour qu'aucune URL statique ne puisse atteindre une facture.
 */
import { readFile } from "node:fs/promises";

import { headers } from "next/headers";

import { cheminAbsoluDocument } from "@/integrations/pdf/rendu-document";
import { engendrerCorrelationId, journaliserErreur } from "@/lib/journal";
import { exigerSession } from "@/services/autorisation";
import { autoriserMaFacture } from "@/services/espace-client-commandes";

/**
 * JAMAIS DE CACHE. Une reponse mise en cache servirait le document apres
 * expiration de la session, donc sans que le controle soit rejoue.
 */
export const dynamic = "force-dynamic";

/**
 * Reponse de refus, IDENTIQUE POUR TOUS LES MOTIFS.
 *
 * 404 ET NON 403, meme raison que la route signee : un 403 signifierait « ce
 * document existe mais vous n'y avez pas droit », ce qui revele l'existence de
 * la commande d'un tiers. Session absente, commande d'autrui, commande
 * dissociee et PDF jamais rendu sont indiscernables.
 */
function refus(): Response {
  return new Response("Document introuvable", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const correlation = { correlationId: engendrerCorrelationId() };

  const identite = await exigerSession(await headers());

  if (!identite) {
    // PAS DE REDIRECTION VERS LA CONNEXION : ce n'est pas une page, c'est un
    // fichier. Une redirection produirait un PDF corrompu cote navigateur.
    return refus();
  }

  const { id } = await contexte.params;

  const acces = await autoriserMaFacture(id, identite.utilisateurId);

  if (acces.statut !== "AUTORISE") {
    return refus();
  }

  try {
    /*
     * LE CHEMIN EST REVALIDE AVANT LECTURE, meme s'il vient de la base.
     * `cheminPdf` est une colonne texte libre : `cheminAbsoluDocument` refuse
     * l'absolu et la remontee de repertoire.
     */
    const absolu = cheminAbsoluDocument(acces.cheminPdf);
    const octets = await readFile(absolu);

    return new Response(new Uint8Array(octets), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        // `attachment` ET NON `inline`, meme motif que la route signee.
        "content-disposition": `attachment; filename="${acces.numero}.pdf"`,
        // `private` INTERDIT AUX INTERMEDIAIRES de mettre en cache : sans lui,
        // un cache partage servirait la facture d'un client a un autre.
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (erreur) {
    /*
     * UN FICHIER ABSENT DU VOLUME REND LE MEME REFUS. La base dit que le
     * document existe, le disque dit le contraire : anomalie d'exploitation,
     * journalisee, mais le client ne doit pas apprendre par un 500 que quelque
     * chose ne va pas cote serveur.
     */
    journaliserErreur(
      "Lecture du document impossible",
      erreur,
      { document: acces.numero },
      correlation,
    );

    return refus();
  }
}
