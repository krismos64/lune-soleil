/**
 * Telechargement d'une piece comptable par l'exploitante. LS-184, critere 3.
 * Adaptateur d'entree.
 *
 * QUI L'APPELLE : l'exploitante, depuis la liste des factures et avoirs. Ce qui
 * protege cette route n'est ni son chemin ni l'identifiant qu'elle porte, c'est
 * le ROLE recoupe cote serveur, invariant 2.
 *
 * ELLE NE REMPLACE AUCUNE DES DEUX ROUTES CLIENTES, et ne doit pas les
 * absorber. `compte/commandes/[id]/facture` sert le client CONNECTE par sa
 * session, `facture/[jeton]` le client SANS COMPTE par un jeton signe, et
 * celle-ci sert l'EXPLOITANTE par son role. Trois preuves distinctes pour trois
 * populations, chacune portant la sienne : l'en-tete de la route d'avoir dit
 * deja pourquoi elles ne fusionnent pas, « une route generique parametree par
 * un type de document aurait un seul point de garde pour deux chaines
 * differentes, et c'est exactement la ou une condition se perd ».
 *
 * ELLE SERT LES DEUX NATURES DE PIECE, facture et avoir, la ou le client en a
 * deux routes. La difference n'est pas une incoherence : cote client, la chaine
 * d'autorisation DIFFERE entre les deux, l'avoir remontant par sa facture puis
 * sa commande jusqu'au proprietaire. Ici la garde est la meme dans les deux
 * cas, le role, donc il n'y a qu'un chemin a relire.
 *
 * UNE PIECE DISSOCIEE RESTE SERVIE, ET C'EST L'INVERSE DU COTE CLIENT. Un
 * compte supprime ne recoit plus ses documents, LS-57 ; l'exploitante doit
 * pouvoir presenter les siens a l'administration fiscale, article L123-22 du
 * code de commerce, dix ans. L'article 17 paragraphe 3 point b du RGPD ecarte
 * l'effacement quand la loi impose la conservation.
 *
 * LE FICHIER N'EST PAS SERVI PAR NGINX, et c'est la raison d'etre de cette
 * route. `DOCUMENTS_RACINE` est un volume DISTINCT de celui des medias,
 * precisement pour qu'aucune URL statique ne puisse atteindre une facture.
 */
import { readFile } from "node:fs/promises";

import { headers } from "next/headers";

import { cheminAbsoluDocument } from "@/integrations/pdf/rendu-document";
import { engendrerCorrelationId, journaliserErreur } from "@/lib/journal";
import { lirePieceAServir } from "@/services/administration-comptabilite";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";

/**
 * JAMAIS DE CACHE. Une reponse mise en cache servirait le document apres
 * expiration de la session, donc sans que le controle de role soit rejoue.
 */
export const dynamic = "force-dynamic";

/**
 * Reponse de refus, IDENTIQUE POUR TOUS LES MOTIFS.
 *
 * 404 ET NON 403, meme raison que les deux routes clientes. Ici l'enjeu de
 * divulgation est moindre, l'exploitante etant seule a atteindre cette route,
 * mais la reponse uniforme garde sa vertu : c'est ce qui rend la garde de role
 * INDISTINGUABLE d'une piece absente pour qui tenterait de sonder l'URL sans
 * session. Un 403 confirmerait que la piece existe.
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

  /*
   * LA GARDE DE ROLE PRECEDE TOUTE LECTURE, et l'ordre compte : lire la piece
   * d'abord ferait travailler la base pour un appelant qu'on va refuser.
   *
   * SEULE `AutorisationRefuseeError` EST RATTRAPEE, jamais un `catch` nu. Un
   * `.catch(() => null)` avalerait aussi une base injoignable et rendrait 404
   * sur une panne : l'exploitante lirait « Document introuvable » devant une
   * facture qui existe, et chercherait le defaut du mauvais cote. Toute autre
   * erreur remonte et rend 500, ce qui est la reponse juste a une panne.
   *
   * PAS DE `redirect` VERS LA CONNEXION, contrairement aux pages : ce n'est pas
   * un ecran, c'est un fichier. Une redirection produirait un PDF corrompu, le
   * navigateur enregistrant la page de connexion sous le nom du document.
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

  try {
    const piece = await lirePieceAServir(id);

    if (!piece) {
      return refus();
    }

    /*
     * LE CHEMIN EST REVALIDE MEME VENANT DE LA BASE. `cheminPdf` est une
     * colonne texte libre : rien dans le schema n'empeche d'y ecrire un chemin
     * absolu ou une remontee de repertoire, et la garde refuse les deux. Meme
     * precaution que les deux routes clientes.
     */
    const absolu = cheminAbsoluDocument(piece.cheminPdf);
    const octets = await readFile(absolu);

    return new Response(new Uint8Array(octets), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        /*
         * `attachment` ET NON `inline`, et le nom vient du SERVEUR. Un document
         * comptable ouvert dans l'onglet laisserait son URL dans l'historique,
         * et un nom choisi ailleurs qu'ici pourrait ne pas correspondre a la
         * piece servie.
         */
        "content-disposition": `attachment; filename="${piece.numero}.pdf"`,
        /*
         * `private` INTERDIT AUX INTERMEDIAIRES DE METTRE EN CACHE. Sans lui,
         * un cache partage servirait une facture a qui n'y a pas droit.
         */
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (erreur) {
    /*
     * LE FICHIER MANQUANT REND LE MEME REFUS QUE LA PIECE ABSENTE, et c'est
     * voulu : une anomalie d'exploitation ne doit pas produire une page
     * d'erreur serveur sur un clic de telechargement. L'ecran, lui, distingue
     * les deux : `cheminPdf` nul y affiche « PDF indisponible », LS-129.
     *
     * L'ERREUR EST JOURNALISEE AVEC SON NUMERO DE CORRELATION, sans le chemin
     * absolu : `journaliserErreur` reduit l'erreur au nom de sa classe, et la
     * divulgation d'une arborescence serveur n'apporterait rien au diagnostic
     * que l'identifiant ne donne deja.
     */
    journaliserErreur(
      "Lecture d'une piece comptable impossible",
      erreur,
      { piece: id },
      correlation,
    );

    return refus();
  }
}
