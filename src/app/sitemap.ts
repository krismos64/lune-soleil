/**
 * sitemap.xml, LS-137, critere 3.
 *
 * IL EST ENGENDRE DEPUIS LE CATALOGUE REEL, jamais depuis une liste ecrite a la
 * main. Un sitemap fige se perime au premier produit publie, et personne ne le
 * voit : le fichier reste valide, il ment simplement par omission.
 *
 * CE QUI GARANTIT LE CRITERE 3. Le sitemap n'ecrit AUCUN filtre de statut : il
 * appelle `lireCataloguePublic`, exactement le service qui sert le catalogue au
 * visiteur. Un brouillon ou un produit archive n'en sort pas, parce que
 * `WHERE p.statut = 'ACTIF'` vit dans le depot, au plus pres de la base, et
 * qu'aucun chemin ne la contourne.
 *
 * C'EST UN CHOIX DE CONCEPTION ET NON UNE COMMODITE. Reecrire ici une requete
 * « les produits publies » donnerait DEUX definitions du publie, et rien ne les
 * garderait d'accord : le jour ou l'une change, le sitemap continuerait a
 * declarer des URL que le site rend en 404. Motif « deux definitions d'une meme
 * regle », que ce depot a deja paye ailleurs.
 *
 * Verifie via Context7 sur la documentation Next.js : `MetadataRoute.Sitemap`,
 * et la mise en cache par defaut des sitemaps.
 */
import type { MetadataRoute } from "next";

import { absolutise } from "@/lib/seo";
import { lireCataloguePublic } from "@/services/catalogue";

/**
 * LE SITEMAP EST RECALCULE A CHAQUE REQUETE.
 *
 * Next.js met les sitemaps EN CACHE PAR DEFAUT, verifie via Context7. Sur un
 * catalogue de pieces uniques, un sitemap fige au build annoncerait pendant des
 * jours des bijoux vendus et ignorerait les nouveautes. Le volume, 10 a 40
 * references, rend le recalcul negligeable.
 *
 * C'est le meme arbitrage que le catalogue et la fiche, tous deux en
 * `force-dynamic` pour la meme raison : la disponibilite est la donnee la plus
 * volatile du site.
 */
export const dynamic = "force-dynamic";

/**
 * Les pages fixes du site, celles qui n'ont pas de source en base.
 *
 * LES ZONES PRIVEES N'Y SONT PAS, et n'ont pas a y etre : un sitemap declare ce
 * qu'on souhaite voir indexe. `/panier`, `/commande` et `/compte` portent en
 * plus un `noindex`, et `robots.txt` les interdit. Trois gardes, chacune pour un
 * comportement de robot different.
 *
 * `priority` ET `changeFrequency` SONT DES INDICATIONS, que Google declare
 * ignorer depuis 2023. Elles sont posees parce que d'autres moteurs les lisent
 * encore, et parce qu'elles coutent une ligne ; ne jamais compter dessus pour
 * obtenir un comportement.
 */
const PAGES_FIXES = [
  { chemin: "/", priorite: 1 },
  { chemin: "/catalogue", priorite: 0.9 },
  { chemin: "/aide", priorite: 0.5 },
  { chemin: "/contact", priorite: 0.5 },
  { chemin: "/informations-legales", priorite: 0.3 },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { produits, categories } = await lireCataloguePublic();

  const maintenant = new Date();

  const entreesFixes: MetadataRoute.Sitemap = PAGES_FIXES.map((page) => ({
    url: absolutise(page.chemin),
    lastModified: maintenant,
    changeFrequency: "weekly",
    priority: page.priorite,
  }));

  /*
   * LES CATEGORIES ENTRENT COMME URL FILTREES DU CATALOGUE, et non comme des
   * pages a elles : c'est exactement ce que la barre de filtres produit, et ce
   * que `generateMetadata` declare canonique. Un sitemap qui annoncerait
   * d'autres adresses que les canoniques de la page enverrait un signal
   * contradictoire.
   *
   * `listerCategoriesPubliees` NE REND QUE LES CATEGORIES PORTANT DU PUBLIE,
   * donc aucune page vide n'entre ici.
   */
  const entreesCategories: MetadataRoute.Sitemap = categories.map(
    (categorie) => ({
      url: absolutise(`/catalogue?categorie=${categorie.slug}`),
      lastModified: maintenant,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  );

  const entreesProduits: MetadataRoute.Sitemap = produits.map((produit) => ({
    url: absolutise(`/produit/${produit.slug}`),
    /*
     * `publieA` QUAND IL EXISTE, l'instant courant sinon. Un produit ACTIF sans
     * date de publication est un cas que le schema autorise : omettre
     * `lastModified` serait plus honnete, mais le champ est facultatif et son
     * absence prive les moteurs du seul signal de fraicheur disponible.
     */
    lastModified: produit.publieA ?? maintenant,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...entreesFixes, ...entreesCategories, ...entreesProduits];
}
