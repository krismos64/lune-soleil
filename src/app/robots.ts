/**
 * robots.txt, LS-137, critere 4.
 *
 * CE FICHIER N'EST PAS UN CONTROLE D'ACCES, et l'ecrire ici evite le
 * contresens. Il demande aux robots polis de ne pas explorer ; il n'empeche
 * personne d'atteindre une adresse. L'autorisation reelle des zones privees
 * vient de la session, invariant 2, et elle est verifiee par
 * `verifier-gardes-administration.sh`.
 *
 * IL RENSEIGNE UN FICHIER PUBLIC, DONC IL NE REVELE RIEN. Les quatre chemins
 * interdits ci-dessous sont deja visibles dans la navigation du site : les
 * lister ne divulgue aucune adresse cachee. Ne JAMAIS y mettre un chemin dont
 * le secret compte, un robots.txt etant lu par n'importe qui.
 *
 * Verifie via Context7 sur la documentation Next.js : `MetadataRoute.Robots`,
 * `sitemap` acceptant une chaine ou un tableau.
 */
import type { MetadataRoute } from "next";

import { CHEMIN_ACCES_DOCUMENT, CHEMIN_RETRACTATION } from "@/lib/jeton-acces";
import { absolutise } from "@/lib/seo";

/**
 * LE FICHIER EST ENGENDRE A CHAQUE REQUETE.
 *
 * `urlDuSite()` lit `NEXT_PUBLIC_SITE_URL` a l'execution. Sans `force-dynamic`,
 * Next.js evaluerait cette route au build, ou la variable de production n'est
 * pas celle du serveur : le sitemap annonce pointerait vers l'adresse de
 * construction. Motif « construire n'est pas servir », deja en fiche sur ce
 * depot.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /*
       * LES QUATRE ZONES DU CRITERE 4, plus la route de rétractation par jeton.
       *
       * `/administration` et `/compte` portent des donnees personnelles.
       * `/panier` et `/commande` sont propres a un visiteur et vides pour un
       * robot.
       *
       * `/facture/` ET `/retractation/` PORTENT UN JETON SIGNE DANS LEUR
       * CHEMIN, et vont ensemble. Les deux servent un client SANS session, sur
       * la seule verification de signature, `lib/jeton-acces.ts`. Un lien recu
       * par email atteint un explorateur par mille chemins ordinaires : une
       * barre d'adresse qui remonte les URL visitees, un lien colle dans une
       * conversation.
       *
       * `/facture/` MANQUAIT, releve en revue critique, et c'etait la plus
       * exposee des deux : elle sert un PDF portant nom, adresse de facturation
       * et montants, quand `/retractation/` n'affiche qu'un formulaire. Surtout,
       * c'est la MOINS defendue : `/retractation/` est une `page.tsx` qui porte
       * deja `robots: { index: false }`, la ou un gestionnaire `route.ts` ne
       * peut porter aucune metadonnee. Son second filet est donc un en-tete
       * `X-Robots-Tag`, pose dans la route elle-meme.
       *
       * LES DEUX SE LISENT DANS LEURS CONSTANTES plutot que d'etre recopies :
       * un renommage de route qui oublierait ce fichier laisserait une liste
       * d'interdiction pointant des chemins morts, defaut silencieux.
       *
       * LE PREFIXE SUFFIT, ET C'EST LA CONVENTION DU FORMAT : `/compte`
       * couvre `/compte/commandes` et tout ce qui suit, aucune enumeration
       * n'est necessaire.
       *
       * `/espace-client` N'EST PAS LISTE, contrairement a ce que la description
       * du ticket annonce : cette route n'existe pas sur ce depot, l'espace
       * client vivant sous `/compte` depuis LS-54. Interdire un chemin
       * inexistant donnerait un fichier qui se perime sans que rien ne le
       * signale.
       */
      disallow: [
        "/administration",
        "/compte",
        "/panier",
        "/commande",
        /*
         * LA BARRE OBLIQUE FINALE EST AJOUTEE ICI : les constantes portent le
         * segment nu, `/facture`, et l'interdiction s'etendrait sinon a une
         * hypothetique page `/factures`. Le suffixe la borne aux chemins a
         * jeton, les seuls vises.
         */
        `${CHEMIN_ACCES_DOCUMENT}/`,
        `${CHEMIN_RETRACTATION}/`,
      ],
    },
    sitemap: absolutise("/sitemap.xml"),
  };
}
