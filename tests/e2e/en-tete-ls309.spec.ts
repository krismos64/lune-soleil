import { expect, test, type Page } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";

/**
 * En-tête de la boutique, LS-309, aux quatre largeurs.
 *
 * CE QUE CE FICHIER MESURE ET QU'AUCUN CONTRÔLE TEXTUEL NE VOIT : la hauteur
 * réelle de la barre contre `--ls-hauteur-entete`, qui décale les éléments
 * collants des pages ; la barre qui reste en haut au défilement ; l'ancre qui
 * ne tombe pas dessous ; la page active selon le chemin ; une barre qui tient
 * sur une ligne à toutes les largeurs.
 */

const LARGEUR_LARGE = 768;
const estLarge = (page: Page) =>
  (page.viewportSize()?.width ?? LARGEUR_LARGE) >= LARGEUR_LARGE;

/** La valeur de `--ls-hauteur-entete` résolue en pixels par le navigateur. */
async function hauteurAttendue(page: Page): Promise<number> {
  return page.evaluate(() => {
    const sonde = document.createElement("div");
    sonde.style.height = "var(--ls-hauteur-entete)";
    document.body.append(sonde);
    const hauteur = sonde.getBoundingClientRect().height;
    sonde.remove();
    return hauteur;
  });
}

test("la barre tient sur une ligne et vaut la hauteur annoncée aux pages", async ({
  page,
}) => {
  await page.goto("/");
  const barre = page.getByRole("banner");
  const hauteur = (await barre.boundingBox())?.height ?? 0;

  /*
   * 69 PX À TOUTES LES LARGEURS : une cible de 44 px, 12 px de chaque côté et
   * le filet. Une barre qui passe sur deux lignes, le défaut mesuré à 360 px
   * pendant la story, la ferait doubler.
   */
  expect(hauteur).toBe(69);
  expect(await hauteurAttendue(page)).toBe(estLarge(page) ? hauteur : 0);

  const deborde = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(deborde).toBe(false);
});

test("le nom de la boutique est écrit avec la police de titre", async ({
  page,
}) => {
  await page.goto("/");
  /*
   * LA DÉCLARATION ET NON LA POLICE RENDUE : l'exécuteur Linux n'a pas Iowan
   * Old Style et retombe sur la serif suivante de la pile, à juste titre.
   */
  const police = await page
    .getByRole("banner")
    .getByRole("link", { name: /Lune-soleil/ })
    .locator("span span")
    .first()
    .evaluate((nom) => getComputedStyle(nom).fontFamily);
  expect(police).toContain("Iowan Old Style");
  expect(police).not.toContain("system-ui");
});

test("à partir de 768 px, la barre reste en haut au défilement", async ({
  page,
}) => {
  test.skip(!estLarge(page), "la barre ne colle qu'à partir de 768 px");
  await page.goto("/atelier");
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect
    .poll(async () => (await page.getByRole("banner").boundingBox())?.y)
    .toBe(0);
});

test("sous 768 px, la barre défile avec la page", async ({ page }) => {
  test.skip(estLarge(page), "la barre est collante à partir de 768 px");
  await page.goto("/atelier");
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect
    .poll(async () => (await page.getByRole("banner").boundingBox())?.y ?? 0)
    .toBeLessThan(-60);
});

test("une ancre ne tombe pas sous la barre", async ({ page }) => {
  await page.goto("/informations-legales#cgv");
  const basBarre = await page
    .getByRole("banner")
    .evaluate((barre) => barre.getBoundingClientRect().bottom);
  await expect
    .poll(() =>
      page
        .locator("#cgv")
        .evaluate((cible) => cible.getBoundingClientRect().top),
    )
    .toBeGreaterThanOrEqual(basBarre);
});

test.describe("page active", () => {
  /*
   * LA NAVIGATION EN LIGNE À PARTIR DE 768 PX, le menu mobile en deçà : les
   * deux portent le nom « Navigation principale » et une seule est dans l'arbre
   * d'accessibilité à une largeur donnée.
   */
  async function entreesActives(page: Page): Promise<string[]> {
    if (!estLarge(page)) {
      await page.getByRole("banner").locator("summary").click();
    }
    return page
      .getByRole("navigation", { name: "Navigation principale" })
      .locator('a[aria-current="page"]')
      .evaluateAll((liens) =>
        liens.map((lien) =>
          (
            lien.querySelector('[class*="libelle"]') ?? lien
          ).textContent?.trim(),
        ),
      );
  }

  const cas: Array<[string, string[]]> = [
    ["/", ["Accueil"]],
    ["/catalogue", ["Les créations"]],
    [`/produit/${CATALOGUE_TEST.enStock.slug}`, ["Les créations"]],
    ["/aide", ["Livraison et aide"]],
    ["/panier", []],
  ];

  for (const [chemin, attendu] of cas) {
    test(`${chemin} active ${JSON.stringify(attendu)}`, async ({ page }) => {
      await page.goto(chemin);
      expect(await entreesActives(page)).toEqual(attendu);
    });
  }
});

test("le sceau n'apparaît dans la barre mobile qu'à partir de 400 px", async ({
  page,
}) => {
  await page.goto("/");
  const largeur = page.viewportSize()?.width ?? 0;
  const sceau = page.getByRole("banner").locator("img").first();
  if (largeur >= 400) await expect(sceau).toBeVisible();
  else await expect(sceau).toBeHidden();
});
