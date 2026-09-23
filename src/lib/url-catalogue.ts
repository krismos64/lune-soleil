/**
 * Adresses du catalogue public, LS-241.
 *
 * UNE SEULE FONCTION CONSTRUIT LES URL DU CATALOGUE : la canonical, les liens
 * de pagination et les filtres de categorie. Trois constructions a la main se
 * seraient desaccordees sur l'ordre des parametres ou sur `page=1`, et deux
 * URL d'un meme contenu divisent son referencement.
 *
 * `page=1` N'APPARAIT JAMAIS : la premiere page est `/catalogue`, sans quoi
 * `/catalogue` et `/catalogue?page=1` seraient deux adresses du meme contenu.
 */
import { schemaNumeroPage } from "@/lib/validation";

export function cheminCatalogue({
  categorie,
  page,
}: {
  categorie?: string | undefined;
  page?: number | undefined;
}): string {
  const parametres = new URLSearchParams();

  if (categorie) {
    parametres.set("categorie", categorie);
  }

  if (page !== undefined && page > 1) {
    parametres.set("page", String(page));
  }

  const requete = parametres.toString();

  return requete ? `/catalogue?${requete}` : "/catalogue";
}

/**
 * Lit le numero de page d'un parametre d'URL.
 *
 * ABSENT VAUT 1, INVALIDE VAUT `null` : l'appelant en fait un 404. Un tableau,
 * `?page=2&page=3`, est invalide plutot que resolu au premier, une adresse
 * ambigue n'ayant pas a etre servie.
 */
export function lireNumeroPage(
  brut: string | string[] | undefined,
): number | null {
  if (brut === undefined) {
    return 1;
  }

  if (Array.isArray(brut)) {
    return null;
  }

  const lu = schemaNumeroPage.safeParse(brut);

  return lu.success ? lu.data : null;
}
