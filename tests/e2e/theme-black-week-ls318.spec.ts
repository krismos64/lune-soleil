/**
 * Thème Black Week, LS-318, ADR-045 et ADR-046 amendés le 12 novembre 2026.
 *
 * MÊME PRINCIPE QUE LES THÈMES DE NOËL, `theme-noel-ls277.spec.ts` : la base
 * de bout en bout est partagée par les quatre largeurs, le rendu est donc
 * exercé par l'APERÇU d'une session administratrice, jamais en activant le
 * thème pour de bon. L'enregistrement et la migration sont prouvés en
 * intégration, `theme-saisonnier.sequential.test.ts`.
 */
import { expect, test, type Page } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";

const accueil = "/?apercu-theme=BLACK_WEEK";
const catalogue = "/catalogue?apercu-theme=BLACK_WEEK";

/** Animations en cours, et parmi elles celles qui ne sont pas des décors continus. */
async function animations(page: Page) {
  return page.evaluate(() => {
    const enCours = document
      .getAnimations()
      .filter((animation) => animation.playState === "running");
    const horsContinu = enCours.filter((animation) => {
      const cible = (animation.effect as KeyframeEffect | null)?.target;
      return !(cible instanceof Element && cible.closest("[data-continu]"));
    });
    return { enCours: enCours.length, horsContinu: horsContinu.length };
  });
}

async function debordement(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/*
 * LE THÈME N'ANNONCE RIEN, ADR-046 et critère 5 de LS-318 : ni taux, ni
 * prix barré, ni date, ni urgence. La réduction relève de LS-319.
 */
const ALLEGATION_PROMOTIONNELLE =
  /\d+\s?%|novembre|jusqu'au|derni[eè]res? heures?|offre limitée/i;

test.describe("aperçu de l'administratrice", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("l'accueil s'habille, le titre ne change pas, rien n'est promis", async ({
    page,
  }) => {
    await page.goto(accueil);
    const main = page.locator("main");
    await expect(main).toHaveAttribute("data-theme", "black_week");
    await expect(page.getByText("Black Week", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "La lumière d'un bijou, le geste d'une main.",
      }),
    ).toBeVisible();
    expect(await debordement(page)).toBeLessThanOrEqual(0);
    const heros = page.locator("main section").first();
    await expect(heros).not.toContainText(ALLEGATION_PROMOTIONNELLE);
    await expect(page.locator("main a button")).toHaveCount(0);
  });

  test("le catalogue s'habille, le h1 reste « Le catalogue »", async ({
    page,
  }) => {
    await page.goto(catalogue);
    await expect(page.locator("main")).toHaveAttribute(
      "data-theme",
      "black_week",
    );
    const titres = page.getByRole("heading", { level: 1 });
    await expect(titres).toHaveCount(1);
    await expect(titres).toHaveText("Le catalogue");
    await expect(page.getByText("Fait main, pièces uniques")).toBeVisible();
    await expect(
      page.getByText("Des bijoux faits main, une pièce à la fois"),
    ).toBeVisible();
    expect(await debordement(page)).toBeLessThanOrEqual(0);

    /*
     * LE LISERÉ DORÉ BORDE LA CARTE ET NE COUVRE PAS LA PHOTO : son tracé
     * suit le bord de la carte, à deux pixels près. Un liseré rentré dans la
     * carte passerait sur la photographie.
     */
    const cartes = page.locator("main ul > li:has(a[href^='/produit/'])");
    await expect(cartes.first()).toBeVisible();
    const nombre = await cartes.count();
    expect(nombre).toBeGreaterThan(0);
    for (let rang = 0; rang < Math.min(nombre, 4); rang += 1) {
      const carte = cartes.nth(rang);
      const boiteCarte = await carte.boundingBox();
      const trace = await carte.locator(":scope > svg").boundingBox();
      expect(boiteCarte && trace, `carte ${rang}`).toBeTruthy();
      expect(Math.abs(trace!.x - boiteCarte!.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(trace!.width - boiteCarte!.width)).toBeLessThanOrEqual(4);
    }

    // Bouton d'achat de nuit, texte blanc : 18,91:1.
    const bouton = page
      .getByRole("button", { name: /^Ajouter au panier, / })
      .first();
    if ((await bouton.count()) > 0) {
      const couleurs = await bouton.evaluate((element) => {
        const style = getComputedStyle(element);
        return { fond: style.backgroundColor, texte: style.color };
      });
      expect(couleurs).toEqual({
        fond: "rgb(18, 16, 21)",
        texte: "rgb(255, 255, 255)",
      });
    }
    await expect(page.locator("main")).not.toContainText(
      /-\s?\d+\s?%|jusqu'au|derni[eè]res? heures?/i,
    );
    await expect(page.locator("main a button")).toHaveCount(0);
  });

  test("en mouvement réduit, rien ne bouge et pas de bouton de pause", async ({
    page,
  }) => {
    for (const chemin of [accueil, catalogue]) {
      await page.goto(chemin);
      await expect(page.locator("main")).toHaveAttribute(
        "data-theme",
        "black_week",
      );
      expect((await animations(page)).enCours, chemin).toBe(0);
      await expect(
        page.getByRole("button", { name: /animations/ }),
      ).toHaveCount(0);
    }
    // La poussière d'or du bandeau est retirée, et non figée.
    const grains = page.locator('[class*="_grain"]');
    expect(await grains.count()).toBeGreaterThan(0);
    await expect(grains.first()).toBeHidden();
  });

  test("sans script, le thème est complet et rien ne tourne sans fin", async ({
    browser,
  }) => {
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      storageState: FICHIER_SESSION_ADMINISTRATION,
      reducedMotion: "no-preference",
    });
    const page = await contexte.newPage();
    const sansFin = async () => {
      const cdp = await contexte.newCDPSession(page);
      await cdp.send("Runtime.enable");
      const { result } = await cdp.send("Runtime.evaluate", {
        expression: `document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getTiming().iterations === Infinity).length`,
        returnByValue: true,
      });
      await cdp.detach();
      return result.value as number;
    };
    await page.goto(accueil);
    await expect(page.getByText("Black Week", { exact: true })).toBeVisible();
    expect(await sansFin(), "accueil").toBe(0);
    await page.goto(catalogue);
    await expect(page.getByText("Fait main, pièces uniques")).toBeVisible();
    expect(await sansFin(), "catalogue").toBe(0);
    await contexte.close();
  });

  test.describe("mouvement autorisé", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    /*
     * CHAQUE ÉLÉMENT BORNÉ, SUR LES DEUX PAGES : passé la borne, seuls les
     * décors `data-continu` tournent encore, ADR-045 amendé.
     */
    for (const chemin of [accueil, catalogue]) {
      test(`${chemin} : passé la borne, seuls les décors continus durent`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await page.goto(chemin);
        const bornes = page.locator("main [data-borne]");
        await expect(bornes.first()).toBeAttached();
        const nombre = await bornes.count();
        expect(nombre).toBeGreaterThan(1);
        for (let rang = 0; rang < nombre; rang += 1) {
          const borne = bornes.nth(rang);
          // Les marges dorées sont masquées sous 1240 px : rien à borner.
          if (!(await borne.isVisible())) continue;
          await borne.scrollIntoViewIfNeeded();
          await expect(borne).toHaveAttribute("data-borne", "fin", {
            timeout: 7_000,
          });
        }
        await bornes.first().scrollIntoViewIfNeeded();
        await expect
          .poll(async () => (await animations(page)).enCours)
          .toBeGreaterThan(0);
        await expect(bornes.first()).toHaveAttribute("data-borne", "fin", {
          timeout: 7_000,
        });
        expect((await animations(page)).horsContinu).toBe(0);
      });
    }

    test("le bouton de pause fige tout, sur les deux pages", async ({
      page,
    }) => {
      for (const chemin of [accueil, catalogue]) {
        await page.goto(chemin);
        const pause = page.getByRole("button", {
          name: "Mettre en pause les animations",
        });
        await expect(pause).toBeVisible();
        await expect(pause).toHaveAttribute("aria-pressed", "false");
        await page.waitForTimeout(800);
        expect((await animations(page)).enCours).toBeGreaterThan(0);

        await pause.click();
        const relancer = page.getByRole("button", {
          name: "Relancer les animations",
        });
        await expect(relancer).toHaveAttribute("aria-pressed", "true");
        await expect.poll(async () => (await animations(page)).enCours).toBe(0);
        await relancer.click();
      }
    });
  });

  test("l'écran des paramètres propose Black Week et son aperçu", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");
    const groupe = page.getByRole("group", { name: "Thème saisonnier" });
    await expect(
      groupe.getByRole("radio", { name: /Black Week/ }),
    ).toBeVisible();
    await expect(
      groupe.getByRole("link", { name: "l'accueil" }).last(),
    ).toHaveAttribute("href", accueil);
  });
});

test.describe("visiteur", () => {
  test("un lien d'aperçu Black Week ne change rien pour un visiteur", async ({
    page,
  }) => {
    await page.goto(accueil);
    await expect(page.locator("main")).not.toHaveAttribute("data-theme", /.+/);
    await expect(page.getByText("Black Week", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /animations/ })).toHaveCount(
      0,
    );
    await page.goto(catalogue);
    await expect(page.getByText("Fait main, pièces uniques")).toHaveCount(0);
  });
});
