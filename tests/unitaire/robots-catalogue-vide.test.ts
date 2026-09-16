/**
 * `robots.txt` se ferme sur un catalogue vide, LS-234.
 *
 * ------------------------------------------------------------------
 * CE QUE CE FICHIER EMPECHE, ET POURQUOI IL EXISTE.
 *
 * Mesure du 16 septembre 2026 sur `lune-soleil.fr` : le site rendait `Allow: /`
 * avec ZERO produit publie, servant « Le catalogue s'etoffe, les premieres
 * pieces arrivent bientot » a tout moteur qui passait. LS-153 pose la regle
 * inverse en critere 4, mais elle est la story du JOUR de l'ouverture.
 *
 * Ce qui coute n'est pas la page, qui est propre : c'est sa PERSISTANCE dans un
 * index longtemps apres que le catalogue s'est rempli.
 * ------------------------------------------------------------------
 *
 * POURQUOI UN TEST UNITAIRE ET NON DE BOUT EN BOUT, et c'est le critere 3.
 *
 * `tests/e2e/referencement.spec.ts` couvre deja le cas CATALOGUE PEUPLE, sa
 * base portant trois pieces publiees par la preparation. Il ne peut pas couvrir
 * le cas vide : vider le catalogue de la base partagee casserait les seize
 * autres fichiers de la suite.
 *
 * Ici le service est injecte, donc les DEUX etats s'exercent sans base et sans
 * dependre de ce qu'elle contient au moment du test. Le bout en bout garde le
 * cas peuple sur le vrai serveur, ce fichier garde la bascule.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/*
 * LE SERVICE EST MOCKE, PAS LE DEPOT. `robots.ts` appelle `lireCataloguePublic`
 * et rien d'autre : mocker plus bas ferait passer le test par du code que ce
 * fichier ne pretend pas verifier, et le rendrait rouge le jour ou le service
 * change sa facon de lire.
 */
const lireCataloguePublic = vi.fn();

vi.mock("@/services/catalogue", () => ({
  lireCataloguePublic: () => lireCataloguePublic(),
}));

/** Forme minimale rendue par le service, seule `produits` etant lue ici. */
function catalogue(nombreDePieces: number) {
  return {
    produits: Array.from({ length: nombreDePieces }, (_, rang) => ({
      id: `piece-${rang}`,
    })),
    categories: [],
  };
}

describe("robots.txt et l'etat du catalogue", () => {
  /*
   * `absolutise` EXIGE `NEXT_PUBLIC_SITE_URL` ET LEVE SANS ELLE, `lib/seo.ts`.
   *
   * Le premier essai de ce fichier l'a appris de la bonne facon : le test du
   * catalogue VIDE passait, celui du catalogue peuple levait. C'est la preuve,
   * gratuite, que le chemin ferme n'appelle jamais `absolutise` et n'annonce
   * donc aucun sitemap. La variable n'est posee que pour l'autre chemin.
   */
  let valeurInitiale: string | undefined;

  beforeAll(() => {
    valeurInitiale = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://exemple.test";
  });

  afterAll(() => {
    if (valeurInitiale === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = valeurInitiale;
    }
  });

  beforeEach(() => {
    vi.resetModules();
    lireCataloguePublic.mockReset();
  });

  it("interdit tout le site quand aucune piece n'est publiee", async () => {
    lireCataloguePublic.mockResolvedValue(catalogue(0));

    const { default: robots } = await import("@/app/robots");
    const resultat = await robots();

    expect(resultat.rules).toEqual({ userAgent: "*", disallow: "/" });

    /*
     * LE SITEMAP N'EST PAS ANNONCE, et cette assertion porte le critere 6.
     * L'annoncer pointerait cinq URL statiques vers un site interdit en entier :
     * un moteur lit les deux signaux et le second contredit le premier.
     */
    expect(resultat.sitemap).toBeUndefined();
  });

  it("autorise le site des qu'une seule piece est publiee", async () => {
    lireCataloguePublic.mockResolvedValue(catalogue(1));

    const { default: robots } = await import("@/app/robots");
    const resultat = await robots();

    /*
     * UNE SEULE PIECE SUFFIT, et c'est le seuil qui compte : la bascule se joue
     * entre zero et un, jamais a un nombre arbitraire. Un test pose a trois
     * pieces laisserait passer une garde ecrite `> 2`.
     */
    const regles = resultat.rules as { allow?: string; disallow?: string[] };
    expect(regles.allow).toBe("/");

    /*
     * LES SIX CHEMINS INTERDITS SURVIVENT A LA BASCULE, critere 2. Une
     * reecriture qui rendrait `allow: "/"` nu rouvrirait l'administration et les
     * documents a jeton, defaut bien plus grave que celui qu'on corrige.
     */
    expect(regles.disallow).toEqual([
      "/administration",
      "/compte",
      "/panier",
      "/commande",
      "/facture/",
      "/retractation/",
    ]);

    expect(resultat.sitemap).toContain("/sitemap.xml");
  });
});
