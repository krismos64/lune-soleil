/**
 * Journal des connexions, de bout en bout. LS-80, criteres 6 et 8.
 *
 * CE QUE CE FICHIER PROUVE ET QUE RIEN D'AUTRE NE PROUVE : que la PAGE appelle
 * vraiment `exigerAdministratrice`. Les tests d'integration exercent la
 * fonction de garde, pas le fait qu'un composant serveur l'invoque. Un ecran
 * qui oublierait l'appel les passerait tous, et exposerait a un visiteur
 * anonyme les adresses IP de toutes les connexions.
 *
 * Le contenu de la liste ne se verifie pas ici, il exigerait une session
 * d'administration donc une passkey ou un mot de passe reel. Les quatre
 * combinaisons d'issue et de moyen sont couvertes par les tests d'integration,
 * sur base reelle.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("le journal des connexions refuse un visiteur sans session", async ({
  page,
}) => {
  await page.goto("/administration/journal-connexions");

  // L'URL FINALE EST CELLE DE LA CONNEXION. Verifier seulement l'absence de
  // donnee a l'ecran ne distinguerait pas un refus d'un journal vide.
  await expect(page).toHaveURL(/\/administration\/connexion$/);

  // Et le titre du journal n'apparait nulle part : une redirection qui
  // laisserait le contenu rendu avant de naviguer serait une fuite.
  await expect(
    page.getByRole("heading", { name: "Journal des connexions" }),
  ).toHaveCount(0);
});

test("la page de refus ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/administration/journal-connexions");
  await expect(page).toHaveURL(/\/administration\/connexion$/);

  const debordement = await page.evaluate(() => {
    const racine = document.documentElement;
    return racine.scrollWidth - racine.clientWidth;
  });

  expect(debordement).toBeLessThanOrEqual(0);
});

test("la redirection depuis le journal ne porte aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto("/administration/journal-connexions");
  await expect(page).toHaveURL(/\/administration\/connexion$/);

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});
