/**
 * Pages vitrines animées, LS-262 : Notre univers et le catalogue.
 *
 * LA SUITE TOURNE EN MOUVEMENT RÉDUIT PAR DÉFAUT. Ce fichier vérifie le mode
 * animé, où un bloc hors de l'écran attend avant d'apparaître, et la règle
 * d'ADR-045 point 5 : une carte de produit ou un texte en mode glissement ne
 * part jamais d'une opacité nulle.
 */
import { expect, test } from "@playwright/test";

test.describe("en mouvement normal", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("Notre univers ouvre sur un soleil levant et ferme sur une lune", async ({
    page,
  }) => {
    await page.goto("/notre-univers");
    // Décor muet : il ne s'annonce pas, et le titre reste le premier contenu.
    const decors = page.locator("main [aria-hidden='true'][data-borne]");
    await expect(decors).toHaveCount(2);
    await expect(
      page.getByRole("heading", { level: 1, name: "Notre univers" }),
    ).toBeVisible();
  });

  test("une image hors de l'écran apparaît à son arrivée", async ({ page }) => {
    await page.goto("/notre-univers");
    const derniere = page.locator("main img[data-apparition]").last();
    await expect(derniere).toHaveAttribute("data-apparition", "attente");

    await derniere.scrollIntoViewIfNeeded();
    await expect(derniere).toHaveAttribute("data-apparition", "vu");
  });

  test("un texte en glissement reste lisible avant son arrivée", async ({
    page,
  }) => {
    await page.goto("/notre-univers");
    const geste = page.locator("[data-apparition-mode='glisse']").last();
    await expect(geste).toHaveAttribute("data-apparition", "attente");
    // Glissement seul : l'opacité ne descend jamais à zéro, ADR-045 point 5.
    await expect(geste).toHaveCSS("opacity", "1");
  });
});

test("en mouvement réduit, aucun bloc n'attend son apparition", async ({
  page,
}) => {
  await page.goto("/notre-univers");
  await expect(page.locator("[data-apparition='attente']")).toHaveCount(0);
});
