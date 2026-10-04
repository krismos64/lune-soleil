/**
 * Fiche produit retenue et réaction des boutons, LS-263, ADR-045.
 *
 * LE PRODUIT DE TEST PORTE DEUX PHOTOS, `session-administration.setup.ts` :
 * le fondu de la galerie s'exerce donc réellement, il ne se saute pas.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";

const CHEMIN_FICHE = `/produit/${CATALOGUE_TEST.enStock.slug}`;
const IMAGE_PRINCIPALE = "button[aria-label^='Agrandir'] img";

test.describe("en mouvement normal", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("la première photo s'affiche sans fondu, la suivante avec", async ({
    page,
  }) => {
    await page.goto(CHEMIN_FICHE);
    const principale = page.locator(IMAGE_PRINCIPALE);

    // ADR-045 point 5 : la photo du produit n'attend aucune animation.
    await expect(principale).not.toHaveClass(/fondu/);

    await page.getByRole("button", { name: /Voir la photo 2/ }).click();
    await expect(principale).toHaveClass(/fondu/);
  });
});

/**
 * LA TRANSFORMATION EST MESURÉE PENDANT L'APPUI, et non déduite du
 * sélecteur : un sélecteur juste et une règle absente donneraient le même
 * vert. Le pointeur est relâché hors du bouton, aucun clic n'est émis.
 */
async function transformationPendantAppui(
  page: Page,
  bouton: Locator,
): Promise<string> {
  const boite = await bouton.boundingBox();
  if (!boite) throw new Error("bouton absent");
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  const transformation = await bouton.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await page.mouse.move(0, 0);
  await page.mouse.up();
  return transformation;
}

test.describe("réaction d'appui", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("un bouton de la boutique s'enfonce à l'appui", async ({ page }) => {
    await page.goto(CHEMIN_FICHE);
    const vignette = page.getByRole("button", { name: /Voir la photo 2/ });
    expect(await transformationPendantAppui(page, vignette)).not.toBe("none");
  });

  test("un bouton de l'administration ne bouge pas", async ({ page }) => {
    await page.goto("/administration/connexion");
    const bouton = page.locator("main button").first();
    expect(await transformationPendantAppui(page, bouton)).toBe("none");
  });
});
