/**
 * Page d'accueil publique, de bout en bout. LS-122, remplace LS-68.
 *
 * CE FICHIER S'APPELAIT `page-attente.spec.ts` et verifiait « Boutique en cours
 * de construction ». LS-122 ayant remplace cette page d'attente par l'accueil
 * reel, le renommer plutot que d'en ecrire un second evite de laisser un test
 * qui decrit un ecran disparu.
 *
 * IL GARDE LES TROIS GARANTIES DE LS-68, qui restent le filet de l'integration
 * continue : l'application se sert, elle ne deborde pas a 320 px, elle ne porte
 * aucune violation d'accessibilite serieuse. S'y ajoute ce qui est propre a
 * l'accueil.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test("l'accueil se sert et porte son titre", async ({ page }) => {
  const reponse = await page.goto("/");

  expect(reponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "La lumière d'un bijou, le geste d'une main.",
  );
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

test("le lien d'evitement deplace reellement le focus", async ({ page }) => {
  await page.goto("/");

  /*
   * CE TEST EXISTE PARCE QUE LE DEFAUT A ETE LIVRE. La premiere version posait
   * la cible sur un `div` sans `tabindex` : la page defilait, le focus
   * retombait sur `body`, et la tabulation suivante repartait du haut. Un lien
   * d'evitement casse en a l'apparence exacte d'un lien qui marche.
   */
  await page.keyboard.press("Tab");
  const lien = page.getByRole("link", { name: "Aller au contenu" });
  await expect(lien).toBeFocused();

  await page.keyboard.press("Enter");

  const focalise = page.locator(":focus");
  await expect(focalise).toHaveAttribute("id", "contenu");
  await expect(focalise).toHaveJSProperty("tagName", "MAIN");
});

test("l'en-tete et le pied de page n'apparaissent pas sur l'administration", async ({
  page,
}) => {
  /*
   * LE GROUPE DE ROUTES `(boutique)` PORTE LE LAYOUT PUBLIC. Le poser dans le
   * layout racine afficherait l'en-tete de la boutique par-dessus
   * l'administration, ce qu'aucun test de la boutique ne verrait.
   */
  await page.goto("/administration");

  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Navigation principale" }),
  ).toHaveCount(0);
});
