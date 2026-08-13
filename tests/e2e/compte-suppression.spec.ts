/**
 * Espace client et suppression de compte, de bout en bout. LS-95, critere 1.
 *
 * CE QUE CE FICHIER PROUVE ET QUE RIEN D'AUTRE NE PROUVE : que la PAGE appelle
 * vraiment `exigerSession`. Les tests d'integration exercent la garde, pas le
 * fait qu'un composant serveur l'invoque. Une page qui oublierait l'appel les
 * passerait tous, et exposerait l'adresse email d'un compte a un visiteur
 * anonyme.
 *
 * LE PARCOURS AVEC SESSION N'EST PAS COUVERT ICI, il exigerait un compte reel
 * avec mot de passe hache et une preuve d'identite recente. La suppression
 * elle-meme, la dissociation des commandes et la garde de reauthentification
 * sont couvertes par les tests d'integration, sur base reelle, ou elles
 * s'exercent sur le vrai service.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("l'espace client refuse un visiteur sans session", async ({ page }) => {
  await page.goto("/compte");

  // L'URL FINALE EST CELLE DE LA CONNEXION. Verifier seulement l'absence de
  // donnee a l'ecran ne distinguerait pas un refus d'une page vide.
  await expect(page).toHaveURL(/\/administration\/connexion$/);

  // Et le titre de l'espace client n'apparait nulle part : une redirection qui
  // laisserait le contenu rendu avant de naviguer serait une fuite.
  await expect(page.getByRole("heading", { name: "Mon compte" })).toHaveCount(
    0,
  );
});

test("la page de refus ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/compte");
  await expect(page).toHaveURL(/\/administration\/connexion$/);

  const debordement = await page.evaluate(() => {
    const racine = document.documentElement;
    return racine.scrollWidth - racine.clientWidth;
  });

  expect(debordement).toBeLessThanOrEqual(0);
});

test("la redirection depuis l'espace client ne porte aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto("/compte");
  await expect(page).toHaveURL(/\/administration\/connexion$/);

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});
