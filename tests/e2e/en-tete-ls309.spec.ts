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

/*
 * LA NAVIGATION ET LES ACTIONS NE SE CHEVAUCHENT À AUCUNE LARGEUR, revue de
 * LS-309 : à 1024 px, le filet des actions recouvrait la fin de « Livraison et
 * aide ». La comparaison de `scrollWidth` ne voit pas un recouvrement interne
 * à la grille, d'où la mesure des deux boîtes, aux largeurs de bascule.
 */
test("la navigation et les actions ne se chevauchent pas de 768 à 1280 px", async ({
  page,
}) => {
  test.skip(
    page.viewportSize()?.width !== 1280,
    "les largeurs sont parcourues depuis un seul projet",
  );
  await page.goto("/aide");
  for (const largeur of [768, 900, 1023, 1024, 1100, 1199, 1200, 1280]) {
    await page.setViewportSize({ width: largeur, height: 800 });
    const ecart = await page.getByRole("banner").evaluate((barre) => {
      // La navigation EN LIGNE seule : celle du menu mobile, masquée, rend des
      // boîtes nulles et faisait passer la mesure à vide.
      const liens = barre.querySelectorAll(":scope > div > nav li");
      const fin = liens[liens.length - 1]!.getBoundingClientRect().right;
      const actions = barre.querySelector('a[href^="/compte"]')!.parentElement!;
      return actions.getBoundingClientRect().left - fin;
    });
    expect(ecart, `écart à ${largeur} px`).toBeGreaterThanOrEqual(16);
  }
});

test("chaque élément de l'en-tête trace un contour de focus de 3 px", async ({
  page,
}) => {
  await page.goto("/");
  const largeurs = await page.getByRole("banner").evaluate((barre) =>
    [...barre.querySelectorAll<HTMLElement>("a, summary")]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        element.focus({ focusVisible: true } as FocusOptions);
        return `${element.textContent?.trim().slice(0, 20)} ${getComputedStyle(element).outlineWidth}`;
      }),
  );
  expect(largeurs.length).toBeGreaterThan(2);
  for (const ligne of largeurs) expect(ligne).toMatch(/ 3px$/);
});
