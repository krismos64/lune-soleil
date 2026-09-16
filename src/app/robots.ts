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
import { lireCataloguePublic } from "@/services/catalogue";

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

export default async function robots(): Promise<MetadataRoute.Robots> {
  /*
   * -------------------------------------------------------------------------
   * UNE BOUTIQUE SANS PIECE NE S'INDEXE PAS, LS-234.
   *
   * Mesure du 16 septembre 2026 sur `lune-soleil.fr` : le site rendait
   * `Allow: /` avec un catalogue VIDE, servant « Le catalogue s'etoffe, les
   * premieres pieces arrivent bientot » a tout moteur qui passait.
   *
   * LS-153 pose cette regle en critere 4, mais elle est la story du JOUR de
   * l'ouverture : sa fermeture arriverait apres des semaines d'indexation de
   * cette page d'attente. Ce qui coute n'est pas la page, qui est propre, c'est
   * sa PERSISTANCE dans un index longtemps apres que le catalogue s'est rempli.
   *
   * L'ETAT SE DEDUIT DU CATALOGUE, IL NE SE REGLE PAS, arbitrage de Christophe
   * du 16 septembre 2026. Un booleen en base ou une variable d'environnement
   * auraient marche, au prix d'un geste a poser le jour J : un geste a poser est
   * un geste qu'on oublie, et le site serait alors reste ferme APRES l'ouverture
   * reelle, defaut silencieux et plus couteux que celui-ci.
   *
   * CE QUE CE CHOIX COUTE, et il faut le dire : LS-153 veut une ouverture
   * « volontaire et verifiee, avec la date consignee ». Elle devient ici
   * IMPLICITE, declenchee par la premiere piece publiee. LS-153 garde son
   * critere 6 : elle verifie et consigne, elle ne declenche plus.
   *
   * LA MEME LECTURE QUE `sitemap.ts`, qui appelle deja `lireCataloguePublic()`
   * pour la meme donnee. Un second chemin de lecture pourrait diverger du
   * premier, et deux fichiers de referencement se contrediraient.
   * -------------------------------------------------------------------------
   */
  const { produits } = await lireCataloguePublic();

  if (produits.length === 0) {
    return {
      /*
       * AUCUN `sitemap` ICI, ET C'EST DELIBERE. L'annoncer reviendrait a
       * pointer cinq URL statiques vers un site qu'on vient d'interdire en
       * entier : un moteur lit les deux signaux et le second contredit le
       * premier. Le sitemap redevient annonce des que le catalogue porte une
       * piece, en meme temps que l'autorisation.
       */
      rules: { userAgent: "*", disallow: "/" },
    };
  }

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
