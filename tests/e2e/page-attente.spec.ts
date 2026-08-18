/**
 * Scenario de bout en bout minimal, LS-68.
 *
 * CE QUE CE FICHIER PROUVE, ET RIEN DE PLUS : l'application se construit, se
 * sert, rend son contenu, ne deborde pas a 320 px et ne porte aucune violation
 * d'accessibilite serieuse. Le parcours d'achat appartient a la phase 2, il n'y
 * a pas de catalogue a parcourir aujourd'hui.
 *
 * Ces trois verifications ne sont pas decoratives : elles cassent au premier
 * defaut de configuration Next.js, ce qui en fait le filet de LS-69, ou
 * l'integration continue lancera cette suite sur une machine vierge.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test("la page d'attente se sert et affiche son contenu", async ({ page }) => {
  const reponse = await page.goto("/");

  expect(reponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Lune & Soleil",
  );
  await expect(
    page.getByText("Boutique en cours de construction."),
  ).toBeVisible();
});

test("la page ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/");

  // Mesure et non inspection visuelle : la largeur du contenu ne doit jamais
  // depasser celle de la fenetre, sans quoi le visiteur defile lateralement
  // pour lire. Le defaut est systematique a 320 px, largeur de reference du
  // projet, et invisible sur un ecran de bureau.
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("la page ne porte aucune violation d'accessibilite serieuse", async ({
  page,
}) => {
  await page.goto("/");

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  // Le message nomme les violations trouvees plutot que d'afficher un compte :
  // « attendu 0, obtenu 3 » n'aide personne a corriger.
  const resume = resultat.violations.map(
    (violation) => `${violation.id} (${violation.impact}) : ${violation.help}`,
  );

  expect(resume).toEqual([]);
});
