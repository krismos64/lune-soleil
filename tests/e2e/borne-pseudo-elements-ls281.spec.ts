/**
 * `data-borne` suspend aussi les pseudo-éléments, LS-281.
 *
 * LE DÉFAUT : la règle de `globals.css` visait `[data-borne="attente"] *`, et
 * `*` n'atteint pas un `::before` ni un `::after`, `animation-play-state` ne
 * s'héritant pas. Le reflet du sceau de l'accueil, un `::after` de 3,8 s,
 * jouait donc au chargement, hors de l'écran, et avait fini avant que le
 * visiteur y arrive.
 *
 * CE QUE CE TEST VÉRIFIE : sur chaque page bornée, dès que le script a posé
 * `attente` sur un décor hors de l'écran, aucune animation de pseudo-élément
 * ne tourne sous un élément en `attente` ou en `fin`. Une animation de
 * pseudo-élément est renvoyée par `getAnimations()` avec son hôte pour cible
 * et `pseudoElement` renseigné.
 *
 * LE MOUVEMENT EST RÉTABLI, la configuration commune tournant en mouvement
 * réduit où aucune animation n'existe.
 */
import { expect, test } from "@playwright/test";

test.use({ contextOptions: { reducedMotion: "no-preference" } });

const PAGES = [
  "/",
  "/catalogue",
  "/aide",
  "/informations-legales",
  "/contact",
  "/atelier",
] as const;

for (const chemin of PAGES) {
  test(`${chemin} : aucune animation de pseudo-élément ne tourne sous un décor suspendu`, async ({
    page,
  }) => {
    await page.goto(chemin);

    // Le script a pris la main : un décor hors de l'écran est en attente, ou
    // la page n'en porte aucun hors de l'écran à cette largeur.
    await page.waitForFunction(
      () =>
        document.querySelector('[data-borne="attente"]') !== null ||
        [...document.querySelectorAll("[data-borne]")].every(
          (element) => element.getAttribute("data-borne") !== "",
        ),
    );

    const fautives = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running")
        .map((animation) => animation.effect as KeyframeEffect | null)
        .filter((effet) => Boolean(effet?.pseudoElement))
        .filter((effet) =>
          effet?.target?.closest('[data-borne="attente"], [data-borne="fin"]'),
        )
        .map(
          (effet) =>
            `${effet?.target?.getAttribute("class")}${effet?.pseudoElement}`,
        ),
    );

    expect(fautives).toEqual([]);
  });
}

/**
 * LE CAS QUI A MOTIVÉ LE TICKET, vérifié pour lui-même : sans lui, le test
 * générique ci-dessus pourrait rester vert faute d'avoir rencontré une seule
 * animation de pseudo-élément, une liste vide n'étant pas un verdict.
 */
test("le reflet du sceau de l'accueil est suspendu tant qu'il est hors de l'écran", async ({
  page,
}) => {
  await page.goto("/");

  const sceau = page.locator('[data-borne]:has(img[src*="logo-sceau"])');
  await expect(sceau).toHaveAttribute("data-borne", "attente");

  const etats = await sceau.evaluate((element) =>
    element
      .getAnimations({ subtree: true })
      .map((animation) => animation.effect as KeyframeEffect | null)
      .filter((effet) => effet?.pseudoElement === "::after")
      .map((effet) => effet?.getComputedTiming().progress ?? null),
  );
  // Le reflet existe bien : sinon ce test ne prouverait rien.
  expect(etats.length).toBeGreaterThan(0);

  const enCours = await sceau.evaluate((element) =>
    element
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          (animation.effect as KeyframeEffect | null)?.pseudoElement ===
          "::after",
      )
      .map((animation) => animation.playState),
  );
  expect(enCours).not.toContain("running");
});
