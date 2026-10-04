/**
 * Fiche produit retenue et réaction des boutons, LS-263, ADR-045.
 *
 * LE PRODUIT DE TEST PORTE DEUX PHOTOS, `session-administration.setup.ts` :
 * le fondu de la galerie s'exerce donc réellement, il ne se saute pas.
 */
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";

const CHEMIN_FICHE = `/produit/${CATALOGUE_TEST.enStock.slug}`;
const IMAGE_PRINCIPALE = "button[aria-label^='Agrandir'] img";

/** La règle d'appui de `globals.css`, limitée à la boutique par son en-tête. */
const SELECTEUR_APPUI =
  ':root:has(header nav[aria-label="Navigation principale"]) button';

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

test("la réaction d'appui vise la boutique et jamais l'administration", async ({
  page,
}) => {
  await page.goto(CHEMIN_FICHE);
  expect(
    await page
      .locator("main button")
      .first()
      .evaluate((bouton, s) => bouton.matches(s), SELECTEUR_APPUI),
  ).toBe(true);

  await page.goto("/administration/connexion");
  const bouton = page.locator("button").first();
  expect(await bouton.evaluate((b, s) => b.matches(s), SELECTEUR_APPUI)).toBe(
    false,
  );
});
