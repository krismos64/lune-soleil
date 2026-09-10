/**
 * Telechargement de l'etiquette d'un colis par l'exploitante. LS-218, critere 3.
 * Adaptateur d'entree.
 *
 * QUI L'APPELLE : l'exploitante, depuis la file de preparation, apres avoir
 * cree l'etiquette. Ce qui protege cette route n'est ni son chemin ni
 * l'identifiant qu'elle porte, c'est le ROLE recoupe cote serveur, invariant 2.
 *
 * L'ETIQUETTE N'EST PAS STOCKEE, ET C'EST UN CHOIX, tranche le 10 septembre
 * 2026. Elle est relue chez Sendcloud a chaque demande plutot que rangee dans
 * le volume des documents. Trois raisons :
 *
 *   - elle appartient au TRANSPORTEUR et non a la comptabilite : aucune
 *     obligation de conservation ne s'y attache, contrairement aux factures que
 *     l'article L123-22 du code de commerce impose de garder dix ans
 *   - la relire ne coute RIEN, seule la creation du colis est facturee. Le
 *     stockage n'economiserait donc aucun euro, il ajouterait un volume a
 *     sauvegarder
 *   - un fichier stocke se perime en silence : si le transporteur reedite une
 *     etiquette, la copie locale devient fausse sans que rien ne le signale
 *
 * ELLE NE REND PAS 404 SUR UNE PANNE DU TRANSPORTEUR, a la difference de la
 * route des pieces comptables. Un fichier absent du disque est une anomalie
 * d'exploitation ; un transporteur muet est un incident passager, et dire
 * « introuvable » ferait chercher l'exploitante du mauvais cote.
 */
import { headers } from "next/headers";

import { creerClientExpeditionSendcloud } from "@/integrations/sendcloud/expedition";
import { TransporteurIndisponibleError } from "@/integrations/sendcloud/index";
import { engendrerCorrelationId, journaliserErreur } from "@/lib/journal";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";

/**
 * JAMAIS DE CACHE. Une reponse mise en cache servirait l'etiquette apres
 * expiration de la session, donc sans que le controle de role soit rejoue.
 */
export const dynamic = "force-dynamic";

/**
 * Reponse de refus, IDENTIQUE POUR TOUS LES MOTIFS.
 *
 * 404 ET NON 403, meme raison que les routes de documents : la reponse
 * uniforme rend la garde de role INDISTINGUABLE d'un colis absent pour qui
 * tenterait de sonder l'URL sans session.
 */
function refus(): Response {
  return new Response("Étiquette introuvable", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** Le transporteur ne repond pas : incident passager, jamais un 404. */
function indisponible(): Response {
  return new Response(
    "Le transporteur ne répond pas. Réessayez dans un moment.",
    {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    },
  );
}

export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const correlation = { correlationId: engendrerCorrelationId() };

  /*
   * LA GARDE DE ROLE PRECEDE TOUT, et l'ordre compte ici plus qu'ailleurs :
   * appeler le transporteur avant de garder ferait travailler un tiers pour un
   * appelant qu'on va refuser.
   *
   * PAS DE `redirect` VERS LA CONNEXION : ce n'est pas un ecran, c'est un
   * fichier. Une redirection produirait un PDF corrompu, le navigateur
   * enregistrant la page de connexion sous le nom de l'etiquette.
   */
  try {
    await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return refus();
    }

    throw erreur;
  }

  const { id } = await contexte.params;

  /*
   * L'IDENTIFIANT DE COLIS EST UN ENTIER CHEZ SENDCLOUD, jamais un UUID : il
   * vient de la reponse de creation. Le valider ici evite de construire une URL
   * avec un segment arbitraire venu du chemin, invariant 7.
   */
  const identifiantColis = Number(id);

  if (!Number.isInteger(identifiantColis) || identifiantColis <= 0) {
    return refus();
  }

  const clePublique = process.env.SENDCLOUD_PUBLIC_KEY;
  const cleSecrete = process.env.SENDCLOUD_SECRET_KEY;

  if (!clePublique || !cleSecrete) {
    journaliserErreur(
      "lecture d'étiquette impossible, configuration Sendcloud incomplète",
      new Error("SENDCLOUD_PUBLIC_KEY ou SENDCLOUD_SECRET_KEY absente"),
      {},
      correlation,
    );

    return indisponible();
  }

  try {
    const client = creerClientExpeditionSendcloud({ clePublique, cleSecrete });
    const pdf = await client.lireEtiquette(identifiantColis);

    return new Response(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        /*
         * `attachment` ET NON `inline`, et le nom vient du SERVEUR. Une
         * etiquette s'imprime : la forcer au telechargement evite qu'elle reste
         * ouverte dans un onglet dont l'URL entrerait dans l'historique.
         */
        "content-disposition": `attachment; filename="etiquette-${identifiantColis}.pdf"`,
        /*
         * `private` INTERDIT AUX INTERMEDIAIRES DE METTRE EN CACHE. Une
         * etiquette porte le nom et l'adresse du client.
         */
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (erreur) {
    /*
     * LE TRANSPORTEUR MUET REND 503 ET NON 404. Les deux se ressemblent a
     * l'usage et se distinguent au diagnostic : « introuvable » ferait douter
     * du colis, quand c'est le fournisseur qui ne repond pas.
     */
    if (erreur instanceof TransporteurIndisponibleError) {
      journaliserErreur(
        "Lecture d'étiquette impossible",
        erreur,
        { colis: identifiantColis },
        correlation,
      );

      return indisponible();
    }

    throw erreur;
  }
}
