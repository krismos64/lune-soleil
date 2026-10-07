/**
 * Page Livraison et aide animée, LS-280, amendement d'ADR-045.
 *
 * LA CONFIGURATION COMMUNE TOURNE EN MOUVEMENT RÉDUIT : ce fichier rétablit le
 * mouvement normal pour prouver ce que l'état final ne montre pas, ADR-045
 * point 8.
 *
 *   1. chaque décor borné s'anime à son entrée dans l'écran, puis s'arrête en
 *      cinq secondes au plus, et rien ne tourne ailleurs sur la page ;
 *   2. le contenu ne bouge pas : titre, tarifs et boutons sont opaques et
 *      sans animation dès le premier rendu ;
 *   3. aucun débordement horizontal, le colis voyageur compris.
 *
 * Puis, en mouvement réduit, qu'aucune animation ne tourne et que le décor
 * est dessiné.
 */
import { expect, test, type Page } from "@playwright/test";

/** Animations en cours sur la page entière. */
async function animationsEnCours(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
  );
}

/**
 * Animations portées par le CONTENU : tout élément animé qui n'est pas sous
 * un décor `aria-hidden`. Les transitions de survol n'y figurent pas, la
 * souris de Playwright ne survolant rien ici.
 *
 * UNE ANIMATION DE PSEUDO-ÉLÉMENT Y EST RENVOYÉE PAR SON HÔTE, et c'est
 * voulu : `[data-borne="attente"] *` n'atteint pas un `::before` ni un
 * `::after`, qui jouerait donc hors de l'écran. Le trait du chemin du colis
 * en était un au premier passage, revue de LS-280 : ce test l'a vu, et la
 * correction est dans la page, pas ici.
 */
async function animationsDuContenu(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .map((animation) => (animation.effect as KeyframeEffect | null)?.target)
      .filter(
        (cible): cible is Element =>
          cible instanceof Element && !cible.closest('[aria-hidden="true"]'),
      )
      .map((cible) => `${cible.tagName}.${cible.getAttribute("class")}`),
  );
}

test.describe("mouvement autorisé", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("chaque décor s'anime à son entrée puis s'arrête, le contenu jamais", async ({
    page,
  }) => {
    await page.goto("/aide");

    // Le titre est là et opaque dès l'arrivée, ADR-045 point 5.
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    expect(await h1.evaluate((titre) => getComputedStyle(titre).opacity)).toBe(
      "1",
    );

    // Le décor de l'en-tête joue.
    const premier = page.locator("[data-borne]").first();
    await expect(premier).toHaveAttribute("data-borne", "joue");
    expect(await animationsEnCours(page)).toBeGreaterThan(0);

    /*
     * LES TROIS DÉCORS DES SECTIONS (modes, franchise, chemin du colis,
     * cadran, cas, étoiles) sont amenés un à un dans l'écran : un décor sous
     * la ligne de flottaison reste en attente et compterait zéro sans avoir
     * joué, revue de LS-268.
     */
    const bornes = page.locator("[data-borne]");
    const nombre = await bornes.count();
    expect(nombre).toBeGreaterThanOrEqual(6);

    for (let rang = 0; rang < nombre; rang += 1) {
      const borne = bornes.nth(rang);
      /*
       * Les étoiles de la FAQ n'existent qu'à partir de 1024 px.
       * `checkVisibility` et non `isVisible` : leur conteneur sans hauteur
       * passait pour invisible à toutes les largeurs, revue de LS-283.
       */
      if (!(await borne.evaluate((element) => element.checkVisibility())))
        continue;
      await borne.scrollIntoViewIfNeeded();
      await expect(borne).toHaveAttribute("data-borne", /joue|fin/);

      // Pendant qu'il joue, aucun élément du contenu n'est animé.
      expect(await animationsDuContenu(page)).toEqual([]);

      await expect(borne).toHaveAttribute("data-borne", "fin", {
        timeout: 7_000,
      });
      /*
       * À L'ÉTAT `fin`, CHAQUE ANIMATION EST TERMINÉE, et non figée : `fin`
       * suspend ce qui tourne encore, et une animation de 8 s y resterait
       * gelée à mi-course sans qu'un compte des animations en cours le voie,
       * revue de LS-283. ADR-045 exige qu'elles finissent en cinq secondes.
       */
      expect(
        await borne.evaluate((element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState !== "finished")
            .map((animation) => (animation as CSSAnimation).animationName),
        ),
      ).toEqual([]);
      expect(
        await borne.evaluate(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === "running").length,
        ),
      ).toBe(0);
    }

    // ET SUR TOUTE LA PAGE : une animation hors de tout élément borné ne
    // serait jamais suspendue, et la boucle ci-dessus ne la verrait pas.
    expect(await animationsEnCours(page)).toBe(0);

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  test("les tarifs sont opaques et immobiles dès le premier rendu", async ({
    page,
  }) => {
    await page.goto("/aide#livraison");

    const prix = page
      .locator("#livraison")
      .getByText(/\d+,\d{2}\s?€/)
      .first();
    await expect(prix).toBeVisible();
    expect(
      await prix.evaluate((element) => getComputedStyle(element).opacity),
    ).toBe("1");
    expect(
      await prix.evaluate((element) => element.getAnimations().length),
    ).toBe(0);
  });
});

test.describe("mouvement réduit", () => {
  test("aucune animation ne tourne et le décor est dessiné", async ({
    page,
  }) => {
    await page.goto("/aide");
    await expect(page.locator("[data-borne]").first()).toBeVisible();
    expect(await animationsEnCours(page)).toBe(0);

    /*
     * LE DÉCOR N'EST PAS MASQUÉ : un tracé laissé à `stroke-dashoffset: 1`
     * serait une page immobile mais amputée de ses icônes.
     */
    const masques = await page.evaluate(
      () =>
        [...document.querySelectorAll("main svg path, main svg circle")].filter(
          (forme) => {
            const style = getComputedStyle(forme);
            return (
              parseFloat(style.strokeDashoffset) !== 0 ||
              parseFloat(style.opacity) === 0
            );
          },
        ).length,
    );
    expect(masques).toBe(0);
  });
});

test("le bouton de l'espace client mène aux commandes, jamais à une page absente", async ({
  page,
}) => {
  await page.goto("/aide#retours");

  const lien = page
    .locator("#retours")
    .getByRole("link", { name: /Mes commandes/ });
  await expect(lien).toHaveAttribute("href", "/compte/commandes");

  const reponse = await page.request.get("/compte/commandes", {
    maxRedirects: 0,
  });
  expect(reponse.status()).not.toBe(404);
});
