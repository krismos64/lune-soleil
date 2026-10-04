/**
 * Menu mobile plein écran, LS-261, critère 8.
 *
 * SOUS 768 PX, la navigation vit dans un `<details>` : ce fichier vérifie
 * qu'elle s'ouvre, qu'elle garde le focus, qu'Échap la referme, qu'elle mène
 * à la page choisie, et qu'elle marche SANS SCRIPT, repli exigé par le
 * critère 4. Au-delà de 768 px, il vérifie que la navigation en ligne a pris
 * le relais.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const LARGEUR_MENU = 768;

const estMobile = (page: Page) =>
  (page.viewportSize()?.width ?? LARGEUR_MENU) < LARGEUR_MENU;

const bouton = (page: Page) => page.getByRole("banner").locator("summary");
const navigation = (page: Page) =>
  page.getByRole("navigation", { name: "Navigation principale" });

test.describe("en mouvement normal", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("le menu s'ouvre, garde le focus et se ferme à Échap", async ({
    page,
  }) => {
    test.skip(!estMobile(page), "le menu n'existe que sous 768 px");
    await page.goto("/");

    await bouton(page).click();
    await expect(page.locator("header details")).toHaveAttribute("open", "");
    await expect(bouton(page)).toHaveText("Fermer");

    // Le focus va sur le premier lien, la page derrière devient inerte.
    const premier = navigation(page).getByRole("link", {
      name: /Les créations/,
    });
    await expect(premier).toBeFocused();
    expect(
      await page.locator("main").evaluate((m) => (m as HTMLElement).inert),
    ).toBe(true);

    /*
     * LA TABULATION BOUCLE SANS FUITE : quatre entrées, deux raccourcis, puis
     * le bouton, puis à nouveau la première entrée. Une fuite atteindrait un
     * élément de la page inerte ou de l'en-tête masqué.
     */
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    await expect(bouton(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(premier).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(bouton(page)).toBeFocused();
    await expect(page.locator("header details")).not.toHaveAttribute(
      "open",
      "",
      { timeout: 2_000 },
    );
    expect(
      await page.locator("main").evaluate((m) => (m as HTMLElement).inert),
    ).toBe(false);
  });

  test("un lien du menu mène à sa page et referme le menu", async ({
    page,
  }) => {
    test.skip(!estMobile(page), "le menu n'existe que sous 768 px");
    await page.goto("/");

    await bouton(page).click();
    await navigation(page)
      .getByRole("link", { name: /Livraison et aide/ })
      .click();

    await expect(page).toHaveURL(/\/aide$/);
    await expect(page.locator("header details")).not.toHaveAttribute(
      "open",
      "",
      { timeout: 2_000 },
    );
    expect(
      await page.locator("main").evaluate((m) => (m as HTMLElement).inert),
    ).toBe(false);
  });

  test("le menu ouvert ne porte aucune violation d'accessibilité", async ({
    page,
  }) => {
    test.skip(!estMobile(page), "le menu n'existe que sous 768 px");
    await page.goto("/");
    await bouton(page).click();
    // Fin de l'ouverture en cercle et de l'arrivée des entrées.
    await page.waitForTimeout(1_200);

    const resultat = await new AxeBuilder({ page })
      .include("header")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      resultat.violations.map((v) => `${v.id} (${v.impact}) : ${v.help}`),
    ).toEqual([]);
  });
});

test.describe("sans JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("le menu s'ouvre et mène à la page choisie", async ({ page }) => {
    test.skip(!estMobile(page), "le menu n'existe que sous 768 px");
    await page.goto("/");

    await bouton(page).click();
    const lien = navigation(page).getByRole("link", { name: /Les créations/ });
    await expect(lien).toBeVisible();
    await lien.click();
    await expect(page).toHaveURL(/\/catalogue$/);
  });
});

test("au-delà de 768 px, la navigation est en ligne et le menu absent", async ({
  page,
}) => {
  test.skip(estMobile(page), "la navigation en ligne commence à 768 px");
  await page.goto("/");

  await expect(bouton(page)).toBeHidden();
  await expect(
    navigation(page).getByRole("link", { name: "Les créations" }),
  ).toBeVisible();
});
