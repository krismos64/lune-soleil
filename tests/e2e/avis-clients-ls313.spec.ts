/**
 * Page « Avis clients » et bloc de l'accueil, de bout en bout. LS-313.
 *
 * L'AVIS PUBLIÉ DE CONTRÔLE vient de `commande.setup.ts`, « TEST Commentaire
 * publié sur la fiche. » : aucun test ne le dépublie, `avis-administration`
 * ne fait que le lire. D'autres tests publient leurs propres avis en
 * parallèle : l'accueil, qui n'en montre que trois, n'est donc vérifié que sur
 * la présence du bloc et de son lien, jamais sur un texte précis.
 *
 * CE QUI SE MESURE ICI ET NULLE PART AILLEURS : le statut 200, les mentions de
 * l'article D111-10 1° à côté des avis, le chemin au clic depuis l'accueil et
 * le pied de page (C41), aucun débordement aux quatre largeurs, et axe-core.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const AVIS_DE_CONTROLE = "TEST Commentaire publié sur la fiche.";

test("la page des avis repond et porte les mentions pres des avis", async ({
  page,
}) => {
  const reponse = await page.goto("/avis");
  expect(reponse?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { level: 1, name: "Avis clients" }),
  ).toBeVisible();
  await expect(page.getByText(AVIS_DE_CONTROLE)).toBeVisible();

  // D111-10 1° : contrôle et classement, puis les deux dates de l'avis.
  await expect(page.getByText(/Ces avis sont vérifiés/)).toBeVisible();
  await expect(
    page.getByText(/classés du plus récent au plus ancien/),
  ).toBeVisible();
  const carte = page
    .getByRole("listitem")
    .filter({ hasText: AVIS_DE_CONTROLE });
  await expect(carte.getByText(/Expérience du .*, publié le /)).toBeVisible();

  // L111-7-2 : le signalement près de l'avis.
  await expect(
    carte.getByRole("link", { name: "Signaler un doute sur cet avis" }),
  ).toBeVisible();

  // La rubrique du 2°, sur les informations légales.
  await expect(
    page.getByRole("link", {
      name: "Comment les avis sont collectés, contrôlés et conservés",
    }),
  ).toHaveAttribute("href", "/informations-legales#avis");
});

test("la page des avis ne deborde pas et ne porte aucune violation", async ({
  page,
}) => {
  await page.goto("/avis");
  await expect(page.getByText(AVIS_DE_CONTROLE)).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(resultat.violations).toEqual([]);
});

test("l'accueil montre les derniers avis et mene a la page au clic", async ({
  page,
}) => {
  await page.goto("/");

  const bloc = page.getByRole("region", {
    name: "Ce qu'en disent les clients",
  });
  await expect(bloc).toBeVisible();
  await expect(bloc.getByText(/Ces avis sont vérifiés/)).toBeVisible();
  // Trois avis au plus, LS-313.
  expect(await bloc.getByRole("listitem").count()).toBeLessThanOrEqual(3);

  await bloc.getByRole("link", { name: "Voir tous les avis" }).click();
  await expect(page).toHaveURL(/\/avis$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Avis clients" }),
  ).toBeVisible();
});

test("le pied de page designe la page des avis", async ({ page }) => {
  await page.goto("/aide");

  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Avis clients" }),
  ).toHaveAttribute("href", "/avis");
});
