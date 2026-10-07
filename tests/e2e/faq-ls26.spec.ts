/**
 * Questions fréquentes de la page d'aide, LS-26.
 *
 * Trois propriétés que seul le rendu montre :
 *
 *   1. les questions s'ouvrent et se ferment, au clic comme au clavier, sans
 *      script propre : ce sont des `<details>` natifs ;
 *   2. le balisage `FAQPage` reprend mot pour mot les questions et les
 *      réponses affichées, une donnée structurée qui diverge étant trompeuse ;
 *   3. les tarifs de la FAQ sont ceux de la section Livraison, lus dans la
 *      même configuration.
 */
import { expect, test } from "@playwright/test";

test("une question s'ouvre et se referme, au clic et au clavier", async ({
  page,
}) => {
  await page.goto("/aide#faq");

  const question = page.locator("#faq-corse");
  const reponse = question.getByText(/Corse comprise/);
  await expect(reponse).toBeHidden();

  await question.locator("summary").click();
  await expect(reponse).toBeVisible();

  await question.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(reponse).toBeHidden();
});

test("le balisage FAQPage reprend les questions et réponses affichées", async ({
  page,
}) => {
  await page.goto("/aide");

  const balisage = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((blocs) =>
      blocs
        .map((bloc) => JSON.parse(bloc.textContent ?? "{}"))
        .find((objet) => objet["@type"] === "FAQPage"),
    );
  expect(balisage).toBeTruthy();

  const affichees = await page.locator("#faq details").evaluateAll((liste) =>
    liste.map((details) => ({
      question: details.querySelector("summary")?.textContent?.trim() ?? "",
      reponse: details.querySelector("div p")?.textContent?.trim() ?? "",
    })),
  );
  expect(affichees.length).toBeGreaterThanOrEqual(10);

  const balisees = (
    balisage.mainEntity as {
      name: string;
      acceptedAnswer: { text: string };
    }[]
  ).map((entree) => ({
    question: entree.name,
    reponse: entree.acceptedAnswer.text,
  }));
  expect(balisees).toEqual(affichees);
});

test("les tarifs de la FAQ sont ceux de la section Livraison", async ({
  page,
}) => {
  await page.goto("/aide");

  const prix = await page
    .locator("#livraison")
    .getByText(/^\d+,\d{2}\s?€$/)
    .allTextContents();
  expect(prix.length).toBeGreaterThanOrEqual(2);

  const reponse =
    (await page.locator("#faq-modes-livraison div p").textContent()) ?? "";
  for (const montant of prix) {
    expect(reponse).toContain(montant.trim());
  }
});

/*
 * LE FOCUS DE LA SECTION RESTE VISIBLE APRÈS LE SAUT, revue de LS-26. Tracé à
 * l'extérieur, il était coupé sur les côtés par `overflow-x: clip` et poussé
 * hors de l'écran en haut. L'anneau double est tracé à l'intérieur : ses deux
 * couleurs tiennent l'une sur la nuit, l'autre sur le blanc.
 */
test("le focus de la section des questions se voit dans l'écran", async ({
  page,
}, testInfo) => {
  await page.goto("/aide");
  const section = page.locator("#faq");
  await section.focus();
  await expect(section).toBeFocused();

  const anneau = await section.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    const boite = element.getBoundingClientRect();
    return {
      ombre: style.boxShadow,
      gauche: boite.left + parseFloat(style.left),
      droite: boite.right - parseFloat(style.right),
      largeurVue: document.documentElement.clientWidth,
    };
  });

  expect(anneau.ombre).toMatch(/inset/);
  expect(anneau.ombre.split("rgb").length - 1).toBe(2);
  // L'anneau extérieur fait 3 px : il doit tenir dans la largeur visible.
  expect(anneau.gauche - 3).toBeGreaterThanOrEqual(0);
  expect(anneau.droite + 3).toBeLessThanOrEqual(anneau.largeurVue);

  await section.scrollIntoViewIfNeeded();
  await testInfo.attach("focus-faq", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});
