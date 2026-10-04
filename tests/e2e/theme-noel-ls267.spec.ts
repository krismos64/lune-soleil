/**
 * Thème de Noël, LS-267, ADR-046.
 *
 * LA BASE DE BOUT EN BOUT EST PARTAGÉE PAR LES QUATRE LARGEURS : y activer le
 * thème pour de bon changerait l'accueil sous les pieds des autres fichiers.
 * Le rendu de Noël est donc exercé par l'APERÇU, que seule une session
 * administratrice obtient ; l'enregistrement du thème est prouvé en
 * intégration, `theme-saisonnier.sequential.test.ts`.
 */
import { expect, test, type Page } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";

const ACCUEIL_NOEL = "/?apercu-theme=NOEL";
const CATALOGUE_NOEL = "/catalogue?apercu-theme=NOEL";

async function animationsEnCours(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
  );
}

test.describe("aperçu de l'administratrice", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("l'accueil prend le thème de Noël, le titre ne change pas", async ({
    page,
  }) => {
    await page.goto(ACCUEIL_NOEL);
    await expect(page.locator("main")).toHaveAttribute("data-theme", "noel");
    await expect(page.getByText("Fêtes de fin d'année")).toBeVisible();
    // L'administratrice sait qu'elle regarde un aperçu, pas le thème appliqué.
    await expect(
      page.getByRole("status", { name: "Aperçu du thème" }),
    ).toContainText("il n'est pas appliqué");
    // Aucun débordement horizontal, 320 px compris.
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "La lumière d'un bijou, le geste d'une main.",
      }),
    ).toBeVisible();
    await expect(page.getByText(/choisie pour quelqu'un/)).toBeVisible();
    // Aucune promesse de prix, de date ni de livraison dans le thème.
    await expect(page.locator("main")).not.toContainText(
      /avant Noël|-\s?\d+ ?%/,
    );
  });

  test("le catalogue prend sa guirlande et sa phrase", async ({ page }) => {
    await page.goto(CATALOGUE_NOEL);
    await expect(page.locator("main")).toHaveAttribute("data-theme", "noel");
    await expect(
      page.getByText("Chacun peut devenir un cadeau."),
    ).toBeVisible();
    await expect(
      page.locator('main [data-borne] svg[viewBox="0 0 640 56"]'),
    ).toBeVisible();
  });

  test("sans script, le thème est complet", async ({ browser }) => {
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      storageState: FICHIER_SESSION_ADMINISTRATION,
    });
    const page = await contexte.newPage();
    await page.goto(ACCUEIL_NOEL);
    await expect(page.getByText("Fêtes de fin d'année")).toBeVisible();
    await page.goto(CATALOGUE_NOEL);
    await expect(
      page.getByText("Chacun peut devenir un cadeau."),
    ).toBeVisible();
    await contexte.close();
  });

  test("en mouvement réduit, rien ne tourne et la neige est absente", async ({
    page,
  }) => {
    await page.goto(ACCUEIL_NOEL);
    await expect(page.getByText("Fêtes de fin d'année")).toBeVisible();
    expect(await animationsEnCours(page)).toBe(0);
    const flocons = page.locator('[class*="__flocon"]');
    expect(await flocons.count()).toBeGreaterThan(0);
    await expect(flocons.first()).toBeHidden();
  });

  test.describe("mouvement autorisé", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    test("la neige reste dans l'emblème et tout s'arrête", async ({ page }) => {
      await page.goto(ACCUEIL_NOEL);
      const cadre = page.locator('[class*="__cadre"][data-borne]').first();
      await expect(cadre).toHaveAttribute("data-borne", "joue");

      // Pendant la chute, aucun flocon ne sort du cadre de l'emblème : la
      // neige ne passe jamais sur le titre ni sur un bouton.
      await page.waitForTimeout(1500);
      const boiteCadre = await cadre.boundingBox();
      const neige = await page
        .locator('[class*="__neige"]')
        .first()
        .boundingBox();
      expect(boiteCadre && neige).toBeTruthy();
      expect(neige!.x).toBeGreaterThanOrEqual(boiteCadre!.x - 1);
      expect(neige!.x + neige!.width).toBeLessThanOrEqual(
        boiteCadre!.x + boiteCadre!.width + 1,
      );
      expect(
        await page
          .locator('[class*="__neige"]')
          .first()
          .evaluate((element) => getComputedStyle(element).overflow),
      ).toBe("hidden");

      const bornes = page.locator("main [data-borne]");
      const nombre = await bornes.count();
      for (let rang = 0; rang < nombre; rang += 1) {
        const borne = bornes.nth(rang);
        await borne.scrollIntoViewIfNeeded();
        await expect(borne).toHaveAttribute("data-borne", "fin", {
          timeout: 7_000,
        });
      }
      expect(await animationsEnCours(page)).toBe(0);
    });
  });

  test("l'écran des paramètres propose le thème et son aperçu", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");
    const groupe = page.getByRole("group", { name: "Thème saisonnier" });
    await expect(
      groupe.getByRole("radio", { name: /Aucun thème/ }),
    ).toBeChecked();
    await expect(
      groupe.getByRole("link", { name: "l'accueil" }),
    ).toHaveAttribute("href", ACCUEIL_NOEL);

    // Réappliquer « aucun thème » ne change rien d'autre que le message :
    // c'est le retour au thème par défaut, sans toucher l'état partagé.
    await page.getByRole("button", { name: "Appliquer ce thème" }).click();
    await expect(
      page.getByRole("status", { name: "État du thème saisonnier" }),
    ).toContainText("Habillage ordinaire rétabli");
  });
});

test.describe("visiteur", () => {
  test("un lien d'aperçu ne change rien pour un visiteur", async ({ page }) => {
    await page.goto(ACCUEIL_NOEL);
    await expect(page.locator("main")).not.toHaveAttribute("data-theme", /.+/);
    await expect(
      page.getByRole("status", { name: "Aperçu du thème" }),
    ).toHaveCount(0);
    await expect(page.getByText("Fêtes de fin d'année")).toHaveCount(0);
    await page.goto(CATALOGUE_NOEL);
    await expect(page.getByText("Chacun peut devenir un cadeau.")).toHaveCount(
      0,
    );
  });
});
