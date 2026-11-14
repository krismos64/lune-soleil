/**
 * Les douze thèmes d'ambiance, LS-323, ADR-045 et ADR-046 amendés le
 * 14 novembre 2026.
 *
 * UN SEUL FICHIER, PARAMÉTRÉ SUR LA TABLE `AMBIANCES` : les douze thèmes
 * partagent leurs composants et leurs règles, un thème ajouté à la table est
 * exercé ici sans une ligne de plus. Ce qui diffère d'un thème à l'autre est
 * ce qui se mesure : ses jetons (contrastes, par axe-core sur le rendu), ses
 * phrases (rien de promis) et la largeur de son nom (débordement).
 *
 * MÊME PRINCIPE QUE `theme-noel-ls277.spec.ts` : le rendu est exercé par
 * l'APERÇU d'une session administratrice, jamais en activant un thème dans la
 * base partagée. L'enregistrement des seize valeurs et la migration sont
 * prouvés en intégration, `theme-saisonnier.sequential.test.ts`.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  AMBIANCES,
  LIBELLES_THEMES,
  type ThemeAmbiance,
} from "../../src/lib/theme-saisonnier";
import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";

const THEMES = Object.keys(AMBIANCES) as ThemeAmbiance[];

const accueil = (theme: string) => `/?apercu-theme=${theme}`;
const catalogue = (theme: string) => `/catalogue?apercu-theme=${theme}`;

async function debordement(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/** Les violations de contraste, nommées avec l'élément fautif. */
async function contrastes(page: Page): Promise<string[]> {
  const resultat = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .analyze();
  return resultat.violations.flatMap((violation) =>
    violation.nodes.map((noeud) => `${noeud.html} : ${noeud.failureSummary}`),
  );
}

/*
 * UN THÈME N'ANNONCE RIEN, ADR-046 : ni taux, ni prix, ni échéance, ni délai.
 * Les noms de mois n'y figurent pas, « Octobre rose » et « Novembre bleu »
 * étant des noms d'événements.
 */
const ALLEGATION = /\d+\s?%|€|jusqu'au|derni[eè]res? heures?|offre limitée/i;

test.describe("aperçu de l'administratrice", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  for (const theme of THEMES) {
    const ambiance = AMBIANCES[theme];

    test(`${theme} : accueil et catalogue habillés, titres inchangés, rien de promis`, async ({
      page,
    }) => {
      await page.goto(accueil(theme));
      const main = page.locator("main");
      await expect(main).toHaveAttribute("data-theme", theme.toLowerCase());
      await expect(
        page.getByText(ambiance.evenement, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "La lumière d'un bijou, le geste d'une main.",
        }),
      ).toBeVisible();
      await expect(page.getByText(ambiance.accroche)).toBeVisible();
      const heros = page.locator("main section").first();
      await expect(heros).not.toContainText(ALLEGATION);
      // Sans promotion active, le bandeau d'opération n'ouvre aucune région.
      await expect(
        heros.getByRole("region", { name: "Promotion en cours" }),
      ).toHaveCount(0);
      expect(await debordement(page), "accueil").toBeLessThanOrEqual(0);
      expect(await contrastes(page), "accueil").toEqual([]);

      await page.goto(catalogue(theme));
      await expect(main).toHaveAttribute("data-theme", theme.toLowerCase());
      const titres = page.getByRole("heading", { level: 1 });
      await expect(titres).toHaveCount(1);
      await expect(titres).toHaveText("Le catalogue");
      await expect(
        page.getByText(ambiance.evenement, { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(ambiance.accrocheCatalogue)).toBeVisible();
      expect(await debordement(page), "catalogue").toBeLessThanOrEqual(0);
      expect(await contrastes(page), "catalogue").toEqual([]);
    });
  }

  /*
   * LE TEXTE EST HORS DE TOUT DÉCOR ANIMÉ, ADR-045 : ni le ruban ni le
   * bandeau d'opération ne vivent sous `data-continu`, sur les douze thèmes.
   */
  test("le nom de l'événement n'est jamais dans un décor en mouvement", async ({
    page,
  }) => {
    for (const theme of THEMES) {
      await page.goto(accueil(theme));
      const nom = page.getByText(AMBIANCES[theme].evenement, { exact: true });
      await expect(nom).toBeVisible();
      expect(
        await nom.evaluate((el) => el.closest("[data-continu]") === null),
        theme,
      ).toBe(true);
    }
  });

  test("sans script, les thèmes sont complets et rien ne tourne sans fin", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
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
    for (const theme of THEMES) {
      for (const chemin of [accueil(theme), catalogue(theme)]) {
        await page.goto(chemin);
        await expect(
          page.getByText(AMBIANCES[theme].evenement, { exact: true }),
        ).toBeVisible();
        expect(await sansFin(), chemin).toBe(0);
      }
    }
    await contexte.close();
  });

  test.describe("mouvement autorisé", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    /*
     * UN THÈME PAR MOUVEMENT DE NUÉE, chute, montée et scintillement : passé
     * la borne de cinq secondes, seuls les décors `data-continu` durent, et le
     * bouton de pause les fige.
     */
    /*
     * CHAQUE BORNE DU THÈME EST ATTENDUE À `fin`, pas la première seule : une
     * borne restée en `attente` a ses animations en pause et passerait le
     * filtre sans avoir été contrôlée, relevé par `ls-frontend-revue`.
     * L'accueil est exercé sous Saint-Valentin, qui porte aussi le bandeau
     * d'opération.
     */
    for (const [theme, chemin] of [
      ["AUTOMNE", catalogue("AUTOMNE")],
      ["SAINT_VALENTIN", catalogue("SAINT_VALENTIN")],
      ["ETE", catalogue("ETE")],
      ["SAINT_VALENTIN", accueil("SAINT_VALENTIN")],
    ] as const) {
      test(`${theme}, ${chemin} : passé la borne, seuls les décors continus durent, la pause fige tout`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        await page.goto(chemin);
        // Les bornes qui portent un décor de saison, visibles à cette largeur.
        const bornes = page.locator(
          "main [data-borne]:has([data-mouvement], svg pattern)",
        );
        await expect(bornes.first()).toBeAttached();
        const nombre = await bornes.count();
        let controlees = 0;
        for (let rang = 0; rang < nombre; rang += 1) {
          const borne = bornes.nth(rang);
          if (!(await borne.isVisible())) continue;
          await borne.scrollIntoViewIfNeeded();
          await expect(borne, `borne ${rang}`).toHaveAttribute(
            "data-borne",
            "fin",
            { timeout: 15_000 },
          );
          controlees += 1;
        }
        expect(controlees).toBeGreaterThan(1);
        const etat = () =>
          page.evaluate(() => {
            const enCours = document
              .getAnimations()
              .filter((animation) => animation.playState === "running");
            const horsContinu = enCours.filter((animation) => {
              const cible = (animation.effect as KeyframeEffect | null)?.target;
              return !(
                cible instanceof Element && cible.closest("[data-continu]")
              );
            });
            return { enCours: enCours.length, horsContinu: horsContinu.length };
          });
        await expect
          .poll(async () => (await etat()).horsContinu, { timeout: 10_000 })
          .toBe(0);
        expect((await etat()).enCours).toBeGreaterThan(0);

        await page
          .getByRole("button", { name: "Mettre en pause les animations" })
          .click();
        await expect.poll(async () => (await etat()).enCours).toBe(0);
      });
    }
  });

  test.describe("mouvement réduit", () => {
    test.use({ contextOptions: { reducedMotion: "reduce" } });

    test("aucune nuée, aucun bouton de pause, rien ne bouge", async ({
      page,
    }) => {
      await page.goto(catalogue("HIVER"));
      await expect(
        page.getByText(AMBIANCES.HIVER.evenement, { exact: true }),
      ).toBeVisible();
      await expect(page.locator("main [data-mouvement]").first()).toBeHidden();
      await expect(
        page.getByRole("button", { name: /animations/ }),
      ).toHaveCount(0);
      const immobile = () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((animation) => animation.playState === "running").length,
        );
      expect(await immobile(), "catalogue").toBe(0);
      await page.goto(accueil("SAINT_VALENTIN"));
      await expect(
        page.getByText(AMBIANCES.SAINT_VALENTIN.evenement, { exact: true }),
      ).toBeVisible();
      await expect(page.locator("main [data-mouvement]").first()).toBeHidden();
      expect(
        await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((animation) => animation.playState === "running").length,
        ),
      ).toBe(0);
    });
  });

  test("l'écran des paramètres range les douze thèmes par famille, avec leurs aperçus", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");
    const groupe = page.getByRole("group", { name: "Thème saisonnier" });
    for (const theme of THEMES) {
      await expect(
        groupe.getByRole("radio", {
          name: LIBELLES_THEMES[theme],
          exact: true,
        }),
        theme,
      ).toBeVisible();
      await expect(
        groupe.locator(`a[href="${accueil(theme)}"]`),
        theme,
      ).toHaveCount(1);
      await expect(
        groupe.locator(`a[href="${catalogue(theme)}"]`),
        theme,
      ).toHaveCount(1);
    }
    for (const famille of [
      "Fêtes de fin d'année",
      "Saisons",
      "Fêtes et journées",
      "Opérations commerciales",
    ]) {
      await expect(groupe.getByRole("list", { name: famille })).toBeVisible();
    }
    expect(await debordement(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("visiteur", () => {
  test("un lien d'aperçu ne change rien pour un visiteur", async ({ page }) => {
    await page.goto(accueil("SAINT_VALENTIN"));
    await expect(page.locator("main")).not.toHaveAttribute("data-theme", /.+/);
    await expect(
      page.getByText(AMBIANCES.SAINT_VALENTIN.evenement, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /animations/ })).toHaveCount(
      0,
    );
  });
});
