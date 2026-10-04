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

  test("L'atelier ouvre sur un soleil levant et ferme sur une lune", async ({
    page,
  }) => {
    await page.goto("/atelier");
    // Décor muet : il ne s'annonce pas, et le titre reste le premier contenu.
    const decors = page.locator("main [aria-hidden='true'][data-borne]");
    await expect(decors).toHaveCount(2);
    await expect(
      page.getByRole("heading", { level: 1, name: "L'atelier" }),
    ).toBeVisible();
  });

  test("la lune de la sortie attend son arrivée à l'écran", async ({
    page,
  }) => {
    /*
     * REVUE DE LS-262 : sans `AnimationsBornees` sur la page, la lune jouait
     * au chargement, hors de l'écran, et le visiteur la trouvait déjà figée.
     */
    await page.goto("/atelier");
    const lune = page.locator("main [aria-hidden='true'][data-borne]").last();
    await expect(lune).toHaveAttribute("data-borne", "attente");

    await lune.scrollIntoViewIfNeeded();
    await expect(lune).toHaveAttribute("data-borne", "joue");
  });

  test("le retard d'une carte n'est pas écrasé par sa transition", async ({
    page,
  }) => {
    /*
     * LA CASCADE EST VÉRIFIÉE, ET NON LE DÉFILEMENT : la deuxième carte est
     * déjà visible à 1280 px et n'attendrait jamais. On lui pose l'état « vu »
     * puis on lit le retard calculé. Revue de LS-262 : la transition de
     * `.carte` remettait ce retard à zéro.
     */
    await page.goto("/catalogue");
    const deuxieme = page.locator("main ul[data-inclinaison] > li").nth(1);
    const retard = await deuxieme.evaluate((carte) => {
      carte.setAttribute("data-apparition", "vu");
      return getComputedStyle(carte).transitionDelay;
    });
    expect(retard).toBe("0.08s");
  });

  test("une image hors de l'écran apparaît à son arrivée", async ({ page }) => {
    await page.goto("/atelier");
    const derniere = page.locator("main img[data-apparition]").last();
    await expect(derniere).toHaveAttribute("data-apparition", "attente");

    await derniere.scrollIntoViewIfNeeded();
    await expect(derniere).toHaveAttribute("data-apparition", "vu");
  });

  test("un texte en glissement reste lisible avant son arrivée", async ({
    page,
  }) => {
    await page.goto("/atelier");
    const geste = page.locator("[data-apparition-mode='glisse']").last();
    await expect(geste).toHaveAttribute("data-apparition", "attente");
    // Glissement seul : l'opacité ne descend jamais à zéro, ADR-045 point 5.
    await expect(geste).toHaveCSS("opacity", "1");
  });
});

test("en mouvement réduit, aucun bloc n'attend son apparition", async ({
  page,
}) => {
  await page.goto("/atelier");
  await expect(page.locator("[data-apparition='attente']")).toHaveCount(0);
});
