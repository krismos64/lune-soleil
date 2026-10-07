/**
 * Informations légales et catalogue en motion design, LS-282 et LS-283,
 * amendement d'ADR-045.
 *
 * LA CONFIGURATION COMMUNE TOURNE EN MOUVEMENT RÉDUIT : ce fichier rétablit le
 * mouvement normal pour prouver ce que l'état final ne montre pas, ADR-045
 * point 8 :
 *
 *   1. chaque décor borné s'anime à son entrée dans l'écran, puis s'arrête en
 *      cinq secondes au plus, et rien ne tourne ailleurs sur la page ;
 *   2. aucun élément du contenu n'est animé, pseudo-éléments compris : une
 *      animation de `::after` est renvoyée par son hôte, et `data-borne` ne la
 *      suspendrait pas, LS-281 ;
 *   3. aucun débordement horizontal.
 *
 * Puis, en mouvement réduit, qu'aucune animation ne tourne et que le décor
 * est dessiné.
 */
import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  { chemin: "/informations-legales", titre: "Informations légales" },
  { chemin: "/catalogue", titre: "Le catalogue" },
] as const;

async function animationsEnCours(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
  );
}

/**
 * Éléments portant une ANIMATION en cours hors de tout décor `aria-hidden`.
 *
 * LES TRANSITIONS N'Y SONT PAS COMPTÉES, et c'est délibéré : les cartes du
 * catalogue arrivent par un glissement en transition, sans partir d'une
 * opacité nulle, permis par LS-262. Une animation de mot-clé, elle, n'a rien
 * à faire sur le contenu.
 *
 * LES MESSAGES D'ÉTAT EN SONT EXCLUS, comme dans le test du contact de
 * LS-268 : leur apparition en 220 ms est la micro-interaction de LS-263,
 * « passage d'un état à l'autre ». Le compte du catalogue, `role="status"`,
 * la joue à chaque chargement, mesuré au premier passage.
 */
async function animationsDuContenu(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation instanceof CSSAnimation)
      .filter((animation) => animation.playState === "running")
      .map((animation) => (animation.effect as KeyframeEffect | null)?.target)
      .filter(
        (cible): cible is Element =>
          cible instanceof Element &&
          !cible.closest(
            '[aria-hidden="true"], [role="status"], [role="alert"]',
          ),
      )
      .map((cible) => `${cible.tagName}.${cible.getAttribute("class")}`),
  );
}

test.describe("mouvement autorisé", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  for (const { chemin, titre } of PAGES) {
    test(`${chemin} : chaque décor s'anime à son entrée puis s'arrête, le contenu jamais`, async ({
      page,
    }) => {
      // Jusqu'à sept décors, chacun amené dans l'écran puis attendu 5 s.
      test.setTimeout(90_000);
      await page.goto(chemin);

      const h1 = page.getByRole("heading", { level: 1, name: titre });
      await expect(h1).toBeVisible();
      expect(
        await h1.evaluate((element) => getComputedStyle(element).opacity),
      ).toBe("1");

      const bornes = page.locator("[data-borne]");
      const nombre = await bornes.count();
      expect(nombre).toBeGreaterThanOrEqual(2);

      for (let rang = 0; rang < nombre; rang += 1) {
        const borne = bornes.nth(rang);
        /*
         * Le médaillon et les étoiles n'existent pas à toutes les largeurs.
         * `checkVisibility` et non `isVisible` : un conteneur d'étoiles sans
         * hauteur propre passait pour invisible à toutes les largeurs, et
         * n'était jamais éprouvé, revue de LS-283.
         */
        if (!(await borne.evaluate((element) => element.checkVisibility())))
          continue;
        await borne.scrollIntoViewIfNeeded();
        await expect(borne).toHaveAttribute("data-borne", /joue|fin/);
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
              /*
               * LE TEMPS ÉCOULÉ ET NON `playState` : sous `fin`, la règle
               * globale pose `animation-play-state: paused`, et une animation
               * déjà terminée signale alors `paused`, son temps bloqué à la
               * fin. Mesuré au premier passage de ce contrôle.
               */
              .filter((animation) => {
                const fin = animation.effect?.getComputedTiming().endTime;
                return Number(animation.currentTime) < Number(fin) - 1;
              })
              .map((animation) => (animation as CSSAnimation).animationName),
          ),
        ).toEqual([]);
      }

      expect(await animationsEnCours(page)).toBe(0);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("mouvement réduit", () => {
  for (const { chemin } of PAGES) {
    test(`${chemin} : aucune animation ne tourne et le décor est dessiné`, async ({
      page,
    }) => {
      await page.goto(chemin);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await animationsEnCours(page)).toBe(0);

      const masques = await page.evaluate(
        () =>
          [...document.querySelectorAll("main svg path, main svg circle")]
            .filter((forme) => forme.getClientRects().length > 0)
            .filter((forme) => {
              const style = getComputedStyle(forme);
              return (
                parseFloat(style.strokeDashoffset) !== 0 ||
                parseFloat(style.opacity) === 0
              );
            }).length,
      );
      expect(masques).toBe(0);
    });
  }
});

test("les six liens du sommaire légal mènent à leur section, et leur titre garde son nom", async ({
  page,
}) => {
  await page.goto("/informations-legales");
  const sommaire = page.getByRole("navigation", {
    name: "Sections de cette page",
  });

  const RUBRIQUES = [
    { lien: "Mentions légales", ancre: "#mentions", titre: "Mentions légales" },
    {
      lien: "Conditions de vente",
      ancre: "#cgv",
      titre: "Conditions générales de vente",
    },
    {
      lien: "Confidentialité",
      ancre: "#confidentialite",
      titre: "Confidentialité et données personnelles",
    },
    {
      lien: "Rétractation",
      ancre: "#retractation",
      titre: "Droit de rétractation",
    },
    { lien: "Avis de clients", ancre: "#avis", titre: "Avis de clients" },
    { lien: "Accessibilité", ancre: "#accessibilite", titre: "Accessibilité" },
  ];

  for (const { lien, ancre, titre } of RUBRIQUES) {
    const cible = sommaire.getByRole("link", { name: lien, exact: true });
    await expect(cible).toHaveAttribute("href", ancre);
    // L'icône décorative ne s'ajoute pas au nom du titre.
    await expect(
      page.getByRole("heading", { level: 2, name: titre, exact: true }),
    ).toBeVisible();
  }
});

test("la bande de nuit du catalogue mène au contact", async ({ page }) => {
  await page.goto("/catalogue");
  const lien = page.getByRole("link", { name: "Écrire à l'atelier" });
  await expect(lien).toHaveAttribute("href", "/contact");
});
