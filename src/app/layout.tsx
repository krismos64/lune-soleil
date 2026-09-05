import type { Metadata } from "next";
import "@/styles/tokens.css";
import { imagePartageDecrite, NOM_BOUTIQUE, urlDuSite } from "@/lib/seo";
import "./globals.css";

/*
 * Aucune police n'est choisie ici. La typographie de la boutique appartient à la
 * phase 2, avec l'identité visuelle. Le rendu se fait d'ici là sur la pile
 * système, ce qui évite de figer un choix par défaut du générateur.
 */

/**
 * LS-137. `metadataBase` EST POSÉE ICI ET NULLE PART AILLEURS.
 *
 * Elle est ce qui permet aux pages d'écrire un canonical RELATIF, `/catalogue`,
 * que Next.js résout ensuite en absolu. Sans elle, un canonical relatif est
 * émis tel quel : les moteurs le résolvent alors contre l'hôte de la requête,
 * donc juste par accident tant qu'aucun autre nom de domaine ne sert le site.
 *
 * SANS ELLE AUSSI, Next.js avertit au build sur toute image Open Graph relative
 * et retombe sur `localhost`. Vérifié via Context7 sur la documentation Next.js.
 *
 * ELLE EST LUE UNE FOIS PAR PROCESSUS, ET NON À CHAQUE RENDU. `export const
 * metadata` est un objet de niveau module : `new URL(urlDuSite())` s'évalue au
 * chargement du module, une seule fois. Au démarrage du serveur quand il sert,
 * à la collecte des données de page pendant `next build`.
 *
 * C'est exactement pourquoi `urlDuSite()` porte une exception de construction :
 * sans elle, un build sans `NEXT_PUBLIC_SITE_URL` échoue sur « Failed to
 * collect page data », mesuré. Le serveur qui sert refuse toujours de démarrer
 * sans la variable, et c'est le seul comportement qui compte pour l'index.
 *
 * La première version de ce commentaire affirmait l'inverse, une lecture à
 * chaque rendu, ce qui aurait fait conclure à tort que la question ne se pose
 * pas. Relevé en revue critique.
 */
export const metadata: Metadata = {
  metadataBase: new URL(urlDuSite()),
  title: {
    default: "Lune & Soleil, bijoux artisanaux faits main",
    /*
     * LE GABARIT ÉVITE DE RÉPÉTER LE NOM DE LA BOUTIQUE dans chaque page.
     * Les titres des pages qui le portaient déjà ont été raccourcis en
     * conséquence : « Le catalogue, Lune & Soleil » redoublait la marque.
     */
    template: `%s, ${NOM_BOUTIQUE}`,
  },
  description:
    "Bijoux artisanaux faits main, créés à l'unité. Boutique en cours de construction.",
  /**
   * IL NE SERT QUE LES PAGES QUI NE DECLARENT PAS LE LEUR.
   *
   * `openGraph` N'EST PAS FUSIONNE ENTRE SEGMENTS, il est REMPLACE : dès qu'une
   * page déclare la clé, la valeur du parent est intégralement écrasée, images
   * comprises. Vérifié via Context7 sur `mergeMetadata`, qui appelle
   * `resolveOpenGraph` sur la valeur de l'enfant et l'affecte par-dessus celle
   * du parent.
   *
   * Ce bloc a donc été écrit comme un socle hérité, ce qu'il n'est pas : chaque
   * page effaçait `siteName` et `locale`. Les pages passent depuis par
   * `openGraphDePage`, qui les repose à chaque fois. Le défaut est invisible à
   * l'écran et aux types, seul le HTML servi le montre, et c'est
   * `tests/e2e/referencement.spec.ts` qui l'a trouvé.
   */
  /*
   * L'IMAGE EST POSEE ICI POUR LES PAGES QUI NE PASSENT PAS PAR
   * `openGraphDePage`, LS-147 : panier, tunnel, espace client, pages d'erreur.
   * Elles ne declarent pas d'`openGraph`, donc elles heritent de ce bloc entier.
   * Celles qui en declarent un l'ecrasent et reposent l'image par la fonction,
   * qui porte le detail du piege.
   */
  openGraph: {
    siteName: NOM_BOUTIQUE,
    locale: "fr_FR",
    type: "website",
    images: [imagePartageDecrite()],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
