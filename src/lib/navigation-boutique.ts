/**
 * Entrées de navigation de la boutique et page active, LS-309.
 *
 * FONCTION PURE, SANS DOMAINE : elle compare deux chemins et ne lit ni la base
 * ni la session. L'en-tête (navigation en ligne) et le menu mobile l'appellent
 * tous deux, de sorte que les deux disent la même page active.
 */

export type EntreeNavigation = {
  href: string;
  libelle: string;
  description: string;
};

/**
 * L'ordre est celui de l'affichage. « Accueil » ouvre la liste depuis LS-309,
 * arbitrage du 2 novembre 2026 : le sceau mène déjà à l'accueil, mais une
 * entrée écrite ne suppose pas qu'on connaisse cette convention.
 */
export const ENTREES_NAVIGATION: readonly EntreeNavigation[] = [
  {
    href: "/",
    libelle: "Accueil",
    description: "Les nouveautés et l'esprit de l'atelier",
  },
  {
    href: "/catalogue",
    libelle: "Les créations",
    description: "Toutes les pièces disponibles",
  },
  {
    href: "/atelier",
    libelle: "L'atelier",
    description: "L'histoire, les matériaux, l'entretien",
  },
  {
    href: "/aide",
    libelle: "Livraison et aide",
    description: "Livraison, retours et questions fréquentes",
  },
  /*
   * LS-314 : la page des avis vérifiés, demandée en navigation par Christophe.
   * Sa sous-route `/avis/signaler` la rend active aussi ; `/avis/[jeton]`,
   * l'écran de dépôt atteint depuis un email, de même, ce qui est juste.
   */
  {
    href: "/avis",
    libelle: "Avis clients",
    description: "Les avis vérifiés laissés après livraison",
  },
];

/**
 * Le menu mobile porte le contact en plus, LS-261 : sur un téléphone, le pied
 * de page qui le propose est loin.
 */
export const ENTREES_MENU_MOBILE: readonly EntreeNavigation[] = [
  ...ENTREES_NAVIGATION,
  {
    href: "/contact",
    libelle: "Contact",
    description: "Une question sur une pièce ou une commande",
  },
];

/**
 * Les sous-arbres rattachés à une entrée sans en partager le préfixe. Une fiche
 * produit est une création : `/produit/...` active « Les créations ».
 */
const RATTACHEMENTS: Record<string, readonly string[]> = {
  "/catalogue": ["/produit"],
};

/**
 * Vrai si `chemin` relève de l'entrée `href`.
 *
 * L'ACCUEIL N'EST ACTIF QUE SUR `/` EXACTEMENT : tout chemin commence par `/`,
 * un préfixe l'activerait partout.
 *
 * LE PRÉFIXE S'ARRÊTE À UN SEGMENT ENTIER : `/aide` couvre `/aide/x` mais pas
 * un futur `/aide-cadeau`. La chaîne de requête n'entre pas en compte,
 * `usePathname` ne la rend pas, donc `/catalogue?categorie=bagues` active
 * « Les créations ».
 */
export function estEntreeActive(chemin: string, href: string): boolean {
  if (href === "/") return chemin === "/";
  return [href, ...(RATTACHEMENTS[href] ?? [])].some(
    (racine) => chemin === racine || chemin.startsWith(`${racine}/`),
  );
}
