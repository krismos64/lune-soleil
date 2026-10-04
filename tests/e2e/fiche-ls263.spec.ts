/**
 * Fiche produit retenue et réaction des boutons, LS-263, ADR-045.
 *
 * LE PRODUIT DE TEST PORTE DEUX PHOTOS, `session-administration.setup.ts` :
 * le fondu de la galerie s'exerce donc réellement, il ne se saute pas.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";

const CHEMIN_FICHE = `/produit/${CATALOGUE_TEST.enStock.slug}`;
const IMAGE_PRINCIPALE = "button[aria-label^='Agrandir'] img";

test.describe("en mouvement normal", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("la photo suivante entre en fondu sans que l'image soit remontée", async ({
    page,
  }) => {
    /*
     * LE FONDU PASSE PAR `Element.animate`, espionné ici : la première photo
     * ne l'appelle pas, la suivante l'appelle à son arrivée. L'image doit
     * rester LE MÊME élément, revue de LS-263 : un `key` la remontait et la
     * vidait pendant le chargement.
     */
    await page.addInitScript(() => {
      const origine = Element.prototype.animate;
      (window as unknown as { fondus: number }).fondus = 0;
      Element.prototype.animate = function (...args) {
        if (this.tagName === "IMG")
          (window as unknown as { fondus: number }).fondus += 1;
        return origine.apply(this, args);
      };
    });
    await page.goto(CHEMIN_FICHE);
    const principale = page.locator(IMAGE_PRINCIPALE);
    await principale.evaluate((img) => img.setAttribute("data-temoin", ""));
    expect(
      await page.evaluate(
        () => (window as unknown as { fondus: number }).fondus,
      ),
    ).toBe(0);

    await page.getByRole("button", { name: /Voir la photo 2/ }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { fondus: number }).fondus),
      )
      .toBe(1);
    await expect(principale).toHaveAttribute("data-temoin", "");
  });
});

/**
 * LA TRANSFORMATION EST MESURÉE PENDANT L'APPUI, et non déduite du
 * sélecteur : un sélecteur juste et une règle absente donneraient le même
 * vert. Le pointeur est relâché hors du bouton, aucun clic n'est émis.
 */
async function transformationPendantAppui(
  page: Page,
  bouton: Locator,
): Promise<string> {
  const boite = await bouton.boundingBox();
  if (!boite) throw new Error("bouton absent");
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  const transformation = await bouton.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await page.mouse.move(0, 0);
  await page.mouse.up();
  return transformation;
}

test.describe("réaction d'appui", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("un bouton de la boutique s'enfonce à l'appui", async ({ page }) => {
    await page.goto(CHEMIN_FICHE);
    /*
     * LE BOUTON D'AGRANDISSEMENT ET NON UNE VIGNETTE : la vignette se soulève
     * déjà au survol, sa transformation n'est jamais « none », et le test
     * passait sans la règle d'appui. Mutation qui l'a montré, LS-263.
     */
    const agrandir = page.getByRole("button", { name: /^Agrandir la photo/ });
    expect(await transformationPendantAppui(page, agrandir)).not.toBe("none");
  });

  test("un bouton de paiement ne bouge jamais", async ({ page }) => {
    /*
     * ADR-045 point 7, revue de LS-263 : « Commander avec obligation de
     * paiement » et « Payer » portent `data-paiement`. Un bouton marqué de la
     * même façon dans une page de la boutique ne doit pas s'enfoncer.
     */
    await page.goto(CHEMIN_FICHE);
    await page.locator("main").evaluate((main) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.dataset.paiement = "";
      bouton.textContent = "Payer";
      bouton.id = "temoin-paiement";
      main.prepend(bouton);
    });
    const bouton = page.locator("#temoin-paiement");
    expect(await transformationPendantAppui(page, bouton)).toBe("none");
  });

  test("un message d'alerte apparaît en douceur", async ({ page }) => {
    await page.goto(CHEMIN_FICHE);
    const animations = await page.locator("main").evaluate((main) => {
      const alerte = document.createElement("p");
      alerte.setAttribute("role", "alert");
      alerte.textContent = "Message de test";
      main.prepend(alerte);
      return alerte
        .getAnimations()
        .map((a) => (a as CSSAnimation).animationName);
    });
    expect(animations).toContain("message-etat");
  });

  test("un bouton de l'administration ne bouge pas", async ({ page }) => {
    await page.goto("/administration/connexion");
    const bouton = page.locator("main button").first();
    expect(await transformationPendantAppui(page, bouton)).toBe("none");
  });
});
