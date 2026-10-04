/**
 * Accueil animé, LS-260, ADR-045 point 8.
 *
 * LA SUITE TOURNE EN MOUVEMENT RÉDUIT PAR DÉFAUT, `playwright.config.ts`. Ce
 * fichier est celui qui voit le mode animé : sans lui, la scène collante, le
 * bornage et l'apparition n'étaient couverts par aucun test, et la revue de
 * LS-260 a trouvé deux défauts réels dans ce trou, des phrases retirées aux
 * lecteurs d'écran et un contraste sous le seuil pendant le crépuscule.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SCENE = "section[aria-label='Du matin à la nuit']";

/** Fait défiler jusqu'à la progression `t` de la scène, de 0 à 1. */
async function allerA(page: Page, t: number): Promise<void> {
  await page.evaluate(
    ({ selecteur, t }) => {
      const scene = document.querySelector<HTMLElement>(selecteur);
      if (!scene) throw new Error("scène absente");
      const course = scene.offsetHeight - window.innerHeight;
      window.scrollTo(0, scene.offsetTop + t * course);
    },
    { selecteur: SCENE, t },
  );
  // Le rendu suit le défilement à l'image suivante, la transition dure 600 ms.
  await page.waitForTimeout(900);
}

/** Rang des phrases affichées, d'après l'état posé par le script. */
async function phrasesActives(page: Page): Promise<number[]> {
  return page
    .locator(`${SCENE} [data-phrase]`)
    .evaluateAll((phrases) =>
      phrases.flatMap((phrase, rang) =>
        (phrase as HTMLElement).dataset.active === "true" ? [rang] : [],
      ),
    );
}

test.describe("en mouvement normal", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("la scène montre une phrase à la fois, et aucune au crépuscule", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(SCENE)).toHaveAttribute("data-mode", "anime");

    await allerA(page, 0.1);
    expect(await phrasesActives(page)).toEqual([0]);

    await allerA(page, 0.42);
    expect(await phrasesActives(page)).toEqual([1]);

    /*
     * LE PASSAGE OÙ AUCUN TEXTE NE TIENT 4,5:1, calculé dans `tokens.css` :
     * aucune phrase ne doit s'y afficher.
     */
    await allerA(page, 0.67);
    expect(await phrasesActives(page)).toEqual([]);

    await allerA(page, 0.92);
    expect(await phrasesActives(page)).toEqual([2]);
  });

  test("les trois phrases restent dans l'arbre d'accessibilité", async ({
    page,
  }) => {
    await page.goto("/");
    await allerA(page, 0.1);

    /*
     * UN LECTEUR D'ÉCRAN NE FAIT PAS DÉFILER LA FENÊTRE. La première version
     * posait `aria-hidden` sur les phrases hors fenêtre, qui disparaissaient
     * alors de la navigation par titres.
     */
    const scene = page.getByRole("region", { name: "Du matin à la nuit" });
    await expect(scene.getByRole("heading", { level: 2 })).toHaveCount(3);
    await expect(
      scene.locator("[aria-hidden='true'][data-phrase]"),
    ).toHaveCount(0);
  });

  test("la scène animée ne porte aucune violation d'accessibilité", async ({
    page,
  }) => {
    await page.goto("/");

    for (const t of [0.1, 0.42, 0.92]) {
      await allerA(page, t);
      const resultat = await new AxeBuilder({ page })
        .include(SCENE)
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const resume = resultat.violations.map(
        (violation) => `t=${t} ${violation.id} : ${violation.help}`,
      );
      expect(resume).toEqual([]);
    }
  });

  test("les animations de l'emblème s'arrêtent en cinq secondes", async ({
    page,
  }) => {
    await page.goto("/");
    const heros = page.locator("main section[data-borne]").first();
    await expect(heros).toHaveAttribute("data-borne", "joue");

    // WCAG 2.2.2 : cinq secondes au plus, une seconde de marge pour la mesure.
    await expect(heros).toHaveAttribute("data-borne", "fin", {
      timeout: 6_000,
    });
    const enCours = await heros.evaluate(
      (element) =>
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running").length,
    );
    expect(enCours).toBe(0);
  });

  test("le logo du sceau apparaît à son entrée dans l'écran", async ({
    page,
  }) => {
    await page.goto("/");
    const enveloppe = page.locator("[data-apparition]").filter({
      has: page.getByRole("img", { name: /^Logo / }),
    });
    await expect(enveloppe).toHaveAttribute("data-apparition", "attente");

    await enveloppe.scrollIntoViewIfNeeded();
    await expect(enveloppe).toHaveAttribute("data-apparition", "vu");
  });
});

test("en mouvement réduit, la scène est statique et ses phrases visibles", async ({
  page,
}) => {
  await page.goto("/");
  const scene = page.locator(SCENE);
  await expect(scene).not.toHaveAttribute("data-mode", "anime");

  const phrases = scene.locator("[data-phrase]");
  await expect(phrases).toHaveCount(3);
  for (const phrase of await phrases.all()) {
    await expect(phrase).toBeVisible();
    await expect(phrase).toHaveCSS("opacity", "1");
  }
});
