/**
 * Portes d'entrée et contact animés, LS-268, amendement d'ADR-045.
 *
 * LA CONFIGURATION COMMUNE TOURNE EN MOUVEMENT RÉDUIT : ce fichier rétablit le
 * mouvement normal pour prouver trois propriétés que l'état final ne montre
 * pas, ADR-045 point 8.
 *
 *   1. le décor s'anime, puis s'arrête en cinq secondes au plus ;
 *   2. le formulaire ne porte AUCUNE animation, rien ne bouge pendant une
 *      saisie ;
 *   3. le titre est visible et opaque dès le premier rendu.
 *
 * Puis, en mouvement réduit, qu'aucune animation ne tourne.
 */
import { expect, test, type Page } from "@playwright/test";

const ECRANS = [
  { chemin: "/compte/connexion", titre: "Se connecter" },
  { chemin: "/compte/inscription", titre: "Créer un compte" },
  { chemin: "/contact", titre: "Écrire à l'atelier" },
] as const;

/** Animations en cours sous le premier élément du sélecteur, sous-arbre compris. */
async function animationsSous(page: Page, selecteur: string): Promise<number> {
  return page.evaluate(
    (cible) =>
      document
        .querySelector(cible)
        ?.getAnimations({ subtree: true })
        .filter((animation) => animation.playState === "running").length ?? -1,
    selecteur,
  );
}

/**
 * Animations des CONTRÔLES du formulaire : champs, libellés, boutons.
 *
 * LES MESSAGES D'ÉTAT EN SONT EXCLUS, ET C'EST DÉLIBÉRÉ : leur apparition en
 * 220 ms est la micro-interaction de LS-263, « passage d'un état à
 * l'autre », permise par ADR-045 sur les pages d'action. Elle se joue même
 * sur l'annonce invisible de la bascule de mot de passe, mesuré : la compter
 * ferait échouer ce test pour une animation qui ne déplace aucun contrôle.
 */
async function animationsDesControles(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document
        .querySelector("main form")
        ?.getAnimations({ subtree: true })
        .filter((animation) => {
          const cible = (animation.effect as KeyframeEffect | null)?.target;
          return !cible?.closest('[role="status"], [role="alert"]');
        }).length ?? -1,
  );
}

test.describe("mouvement autorisé", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  for (const { chemin, titre } of ECRANS) {
    test(`${chemin} : le décor s'anime puis s'arrête, le formulaire jamais`, async ({
      page,
    }) => {
      await page.goto(chemin);

      // Le titre est là et opaque dès l'arrivée, ADR-045 point 5.
      const h1 = page.getByRole("heading", { level: 1, name: titre });
      await expect(h1).toBeVisible();
      expect(
        await h1.evaluate((titre) => getComputedStyle(titre).opacity),
      ).toBe("1");

      // Le décor joue.
      const decor = page.locator("[data-borne]").first();
      await expect(decor).toHaveAttribute("data-borne", "joue");
      expect(await animationsSous(page, "[data-borne]")).toBeGreaterThan(0);

      // Aucun contrôle du formulaire ne bouge, pendant que le décor joue,
      // ni pendant une saisie.
      expect(await animationsDesControles(page)).toBe(0);
      await page.locator("main form input:visible").first().fill("saisie");
      expect(await animationsDesControles(page)).toBe(0);

      // Au plus cinq secondes plus tard, tout est arrêté. CHAQUE élément
      // borné est amené dans l'écran puis vérifié, revue de LS-268 : le
      // contact en porte deux, et le second était sous la ligne de flottaison
      // à 320 px, donc en pause et compté zéro sans avoir joué.
      const bornes = page.locator("[data-borne]");
      const nombre = await bornes.count();
      for (let rang = 0; rang < nombre; rang += 1) {
        const borne = bornes.nth(rang);
        await borne.scrollIntoViewIfNeeded();
        await expect(borne).toHaveAttribute("data-borne", /joue|fin/);
        await expect(borne).toHaveAttribute("data-borne", "fin", {
          timeout: 7_000,
        });
        expect(
          await borne.evaluate(
            (element) =>
              element
                .getAnimations({ subtree: true })
                .filter((animation) => animation.playState === "running")
                .length,
          ),
        ).toBe(0);
      }

      // ET SUR TOUTE LA PAGE : une animation posée hors de tout élément
      // borné ne serait jamais mise en pause, et la boucle ci-dessus ne la
      // verrait pas.
      expect(
        await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((animation) => animation.playState === "running").length,
        ),
      ).toBe(0);

      // Aucun débordement horizontal.
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
  for (const { chemin } of ECRANS) {
    test(`${chemin} : aucune animation ne tourne`, async ({ page }) => {
      await page.goto(chemin);
      await expect(page.locator("[data-borne]").first()).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((animation) => animation.playState === "running").length,
        ),
      ).toBe(0);
    });
  }
});

test("le contact mène aux réponses qui n'attendent pas", async ({ page }) => {
  await page.goto("/contact");
  const encarts = page.getByRole("complementary", { name: "Avant d'écrire" });
  await expect(encarts).toContainText("Réponse sous 24 heures");
  await encarts.getByRole("link", { name: /Livraison et aide/ }).click();
  await expect(page).toHaveURL(/\/aide$/);
});
