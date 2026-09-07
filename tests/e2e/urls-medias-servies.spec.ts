/**
 * Toute URL de media servie par un ecran public rend 200, LS-198.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN TEST GENERIQUE PLUTOT QU'UN SECOND TEST RECOPIE. LS-187 avait
 * couvert le seul catalogue. Recopier son test pour la fiche produit aurait
 * ferme UN ecran de plus et laisse les autres, alors que SIX fichiers de `app/`
 * construisent des URL de media. Ce fichier parcourt les ecrans, et en ajouter
 * un tient en une ligne de la table ci-dessous.
 *
 * CE QU'IL AJOUTE AUX TESTS UNITAIRES d'`urls.ts`, qui verifient deja la FORME
 * des URL construites : il ferme la boucle sur le FICHIER. Une URL peut etre
 * parfaitement formee et pointer un fichier qui n'existe pas, ce que le depot
 * faisait sur cinq ecrans avant LS-187.
 *
 * UN `<img>` CASSE NE FAIT ROUGIR AUCUNE ASSERTION DE RENDU, l'element existant
 * bel et bien dans le DOM avec son texte alternatif. C'est ce qui rend ce test
 * necessaire malgre les tests de presence deja ecrits.
 * ------------------------------------------------------------------
 *
 * DEUX AFFIRMATIONS DE LS-198 ONT ETE DEMENTIES PAR LA MESURE, et le perimetre
 * reel en decoule :
 *
 *   « la galerie est le seul ecran a servir du 1920 px »
 *      -> FAUX. `LARGEURS_SRCSET` filtre a 1280 dans `urls.ts`, et AUCUN ecran
 *         ne sert le 1920, qui reste produit sans etre reference. La galerie
 *         emploie `srcSetMedia` comme le catalogue, donc les MEMES largeurs.
 *
 *   « des vignettes en 320, que le catalogue n'exerce pas »
 *      -> VRAI, et c'est le seul trou reel. `320.jpeg` est servi par TROIS
 *         ecrans, la fiche produit, le panier et la liste d'administration,
 *         qu'aucun test ne confrontait a un code de statut.
 */
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";

/**
 * Les ecrans publics qui servent des medias, et ce qu'on attend d'eux.
 *
 * `minimum` ET NON UN COMPTE EXACT, a la difference du test du catalogue. Ce
 * dernier fige sept URL parce qu'il connait sa fixture ; ici la fiche produit
 * rend un nombre d'URL qui depend du nombre de photographies de la fixture, et
 * figer ce nombre ferait rougir le test a chaque photographie ajoutee, sans
 * qu'aucun defaut n'existe.
 *
 * LE MINIMUM N'EST PAS ZERO, ET C'EST LE POINT : une page qui ne rendrait
 * AUCUNE image passerait une boucle vide sans rien verifier. C'est le garde-fou
 * que le test du catalogue pose en assertant son compte avant les codes.
 */
const ECRANS = [
  /*
   * LE CATALOGUE N'EST PAS DANS CETTE TABLE, ET C'EST DELIBERE. Son test de
   * LS-187 vit dans `catalogue-public.spec.ts` et fige un compte EXACT de sept
   * URL, plus strict que le minimum pose ici : le reprendre ferait tourner deux
   * fois la meme verification en PERDANT la plus stricte des deux.
   *
   * Un ecran s'ajoute ici quand il sert des medias ET qu'aucun test ne
   * confronte deja ses URL a un code de statut.
   */
  {
    nom: "fiche produit",
    chemin: `/produit/${CATALOGUE_TEST.enStock.slug}`,
    // NEUF URL MESUREES le 7 septembre 2026 : l'image principale en 640.jpeg,
    // ses deux `srcSet` de trois largeurs, et une vignette `320.jpeg` par
    // photographie, la fixture en portant deux.
    minimum: 9,
    declinaisonsAttendues: ["640.jpeg", "320.jpeg"],
  },
] as const;

/**
 * Releve les URL de media reellement presentes dans le DOM rendu.
 *
 * ELLES SONT LUES SUR LA PAGE ET NON RECONSTRUITES. Reconstruire appliquerait
 * la meme regle que le code, donc verifierait sa coherence avec lui-meme et
 * resterait vert si les deux changeaient ensemble. Motif deja retenu par le
 * test du catalogue en LS-187.
 *
 * LE `srcSet` EST LU AUTANT QUE LE `src`. La majorite des URL d'une page de
 * catalogue vivent dans un `srcSet`, et une erreur y est encore moins visible :
 * le navigateur retombe silencieusement sur le `<img>` de repli.
 */
async function relever(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const trouvees = new Set<string>();

    for (const image of document.querySelectorAll("img")) {
      const source = image.getAttribute("src");
      if (source?.includes("/medias/")) {
        trouvees.add(source);
      }
    }

    for (const source of document.querySelectorAll("source")) {
      for (const entree of (source.getAttribute("srcset") ?? "").split(", ")) {
        const url = entree.split(" ")[0];
        if (url?.includes("/medias/")) {
          trouvees.add(url);
        }
      }
    }

    return [...trouvees];
  });
}

for (const ecran of ECRANS) {
  test(`toute URL de média servie par ${ecran.nom} rend 200`, async ({
    page,
  }, infos) => {
    test.skip(
      infos.project.name !== "mobile-320",
      "verifie des URL, pas une mise en page : une seule largeur suffit",
    );

    await page.goto(ecran.chemin);

    const urls = await relever(page);

    /*
     * LE COMPTE EST ASSERTE AVANT LES CODES. Sans lui, une page qui ne rendrait
     * aucune image passerait ce test : une boucle sur une liste vide ne verifie
     * rien et reste verte.
     */
    expect(
      urls.length,
      `${ecran.nom} doit servir au moins ${ecran.minimum} URL de média`,
    ).toBeGreaterThanOrEqual(ecran.minimum);

    /*
     * LES DECLINAISONS ATTENDUES SONT NOMMEES, critere 2 de LS-198. Le compte
     * seul ne dit pas LESQUELLES sont servies : une fiche produit qui cesserait
     * de rendre ses vignettes `320.jpeg` garderait assez d'URL pour passer le
     * minimum, et le trou que cette story ferme se rouvrirait en silence.
     */
    for (const declinaison of ecran.declinaisonsAttendues) {
      expect(
        urls.some((url) => url.endsWith(`/${declinaison}`)),
        `${ecran.nom} doit servir la déclinaison ${declinaison}`,
      ).toBe(true);
    }

    for (const url of urls) {
      const reponse = await page.request.get(url);
      expect(reponse.status(), `${url} doit etre servi`).toBe(200);
    }
  });
}
