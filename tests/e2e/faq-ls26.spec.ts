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
