/**
 * Telechargement de ses propres donnees personnelles. LS-62, criteres 1 et 2.
 * RGPD articles 15 et 20. Adaptateur d'entree.
 *
 * QUI L'APPELLE : le client connecte, depuis son espace. Ce qui protege cette
 * route n'est pas son chemin, c'est la SESSION recoupee cote serveur, invariant
 * 2, PLUS une preuve d'identite recente, `DONNEES_CLIENTS` d'ADR-027.
 *
 * AUCUN IDENTIFIANT DANS L'URL, et c'est deliberé. La route de facture en porte
 * un, l'identifiant de commande, parce qu'elle designe un document parmi
 * plusieurs ; ici il n'y a qu'un seul dossier possible, celui de la session.
 * Accepter un parametre ouvrirait l'export du dossier d'autrui a qui devine un
 * identifiant, ce qui serait la fuite la plus grave que ce projet puisse
 * produire.
 *
 * UNE ROUTE ET NON UNE SERVER ACTION, ET LA RAISON EST CONCRETE : le navigateur
 * doit ENREGISTRER un fichier. Une Server Action rend une valeur au composant,
 * qui devrait alors fabriquer un `Blob` et un lien de telechargement dans le
 * DOM. Une reponse HTTP avec `content-disposition: attachment` fait cela nativement,
 * fonctionne sans JavaScript et laisse le navigateur nommer le fichier.
 *
 * `GET` ET NON `POST`, alors que l'action est sensible. C'est une LECTURE, elle
 * ne modifie rien : la garde de fraicheur ne change pas la nature du verbe. Le
 * risque d'un `GET` serait le declenchement par un prechargement de lien, sans
 * effet ici puisque rien n'est ecrit, et `dynamic` interdit toute mise en cache.
 */
import { headers } from "next/headers";

import { engendrerCorrelationId, journaliserErreur } from "@/lib/journal";
import { ReauthentificationRequiseError } from "@/services/reauthentification";
import { exporterMesDonnees } from "@/services/suppression-compte";

/**
 * JAMAIS DE CACHE. Une reponse mise en cache servirait le dossier complet d'une
 * personne apres expiration de sa session, donc sans que la garde soit rejouee,
 * et pire, potentiellement a quelqu'un d'autre.
 */
export const dynamic = "force-dynamic";

/**
 * Refus, avec un statut qui DIT ce qu'il faut faire.
 *
 * ICI LES STATUTS SE DISTINGUENT, contrairement a la route de facture qui rend
 * 404 pour tous les motifs. La raison de cette difference : la route de facture
 * porte un identifiant de commande, et distinguer « n'existe pas » de « pas a
 * vous » revelerait l'existence de la commande d'un tiers. Cette route-ci ne
 * porte aucun identifiant, il n'y a rien a reveler sur autrui, et le client a
 * besoin de savoir s'il doit se reconnecter ou confirmer son identite.
 */
function refus(statut: number, message: string): Response {
  return new Response(message, {
    status: statut,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
    },
  });
}

export async function GET(): Promise<Response> {
  const correlation = { correlationId: engendrerCorrelationId() };

  try {
    const resultat = await exporterMesDonnees(await headers());

    if (resultat.etat === "SESSION_ABSENTE") {
      // PAS DE REDIRECTION : c'est un fichier, pas une page. Une redirection
      // produirait un JSON corrompu, ou la page de connexion enregistree sous
      // le nom du fichier attendu.
      return refus(401, "Connectez-vous pour obtenir vos données.");
    }

    if (resultat.etat === "COMPTE_INTROUVABLE") {
      return refus(404, "Aucune donnée pour ce compte.");
    }

    /*
     * DEUX ESPACES D'INDENTATION, ET CE N'EST PAS COSMETIQUE : l'article 20
     * exige un format « lisible par machine » ET la personne doit pouvoir le
     * lire elle-meme. Un JSON compact remplit la premiere condition et rate la
     * seconde, ce qui viderait le droit d'acces de sa portee pratique.
     */
    const corps = JSON.stringify(resultat.donnees, null, 2);

    /*
     * LE NOM DU FICHIER NE PORTE AUCUNE DONNEE PERSONNELLE, ni adresse email ni
     * nom : il atterrit dans un dossier de telechargements, parfois synchronise,
     * parfois partage. La date suffit a distinguer deux exports.
     */
    const jour = resultat.donnees.genereLe.slice(0, 10);

    return new Response(corps, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="mes-donnees-${jour}.json"`,
        // `private` INTERDIT AUX INTERMEDIAIRES de mettre en cache : sans lui,
        // un cache partage servirait le dossier d'une personne a une autre.
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (erreur) {
    /*
     * `ReauthentificationRequiseError` EST UN REFUS ATTENDU, pas une panne : la
     * garde a fait son travail. Le confondre avec une erreur ferait afficher
     * « indisponible » a quelqu'un dont il suffit qu'il confirme son identite.
     *
     * 403 ET NON 401 : la session est valide, c'est la preuve qui manque. Le
     * message dit ou aller, l'ecran portant par ailleurs le lien.
     */
    if (erreur instanceof ReauthentificationRequiseError) {
      return refus(
        403,
        "Confirmez votre identité avant de télécharger vos données.",
      );
    }

    journaliserErreur(
      "Export des donnees personnelles indisponible",
      erreur,
      {},
      correlation,
    );

    return refus(
      500,
      "L'export est momentanément indisponible. Réessayez dans un instant.",
    );
  }
}
