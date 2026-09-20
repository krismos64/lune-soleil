/**
 * La page « Notre univers », LS-25 et LS-123.
 *
 * CE QUE CE FICHIER PROUVE EN PREMIER : « Notre histoire » atteint une page
 * reelle. Le lien existait au pied de page depuis LS-122 et rendait 404, verifie
 * en production le 20 septembre 2026, comme les deux appels de l'accueil. Le
 * critere 1 de LS-123 exige qu'aucun lien du pied ne soit mort.
 *
 * LA NAVIGATION SE FAIT AU CLIC, jamais par `page.goto` sur l'URL en dur. Un
 * test qui atteint toujours sa cible directement ne peut pas decouvrir qu'aucun
 * chemin n'y mene, motif de LS-162.
 *
 * ---------------------------------------------------------------------------
 * LES ASSERTIONS DE PRUDENCE SONT LE CŒUR DE CE FICHIER, et elles gardent des
 * engagements que la relecture seule ne tient pas :
 *
 * AUCUN PRENOM, AUCUNE SECONDE PERSONNE. L'exploitante exerce seule et demande
 * que son prenom reste hors du site, confirme le 20 septembre 2026. Une
 * reecriture au « nous », ou nommant une seconde creatrice, decrirait une
 * entreprise qui n'existe pas.
 *
 * AUCUNE PROMESSE D'ABSENCE D'ALLERGIE. « Hypoallergenique » promet ce que
 * l'acier inoxydable ne garantit pas : une etude relevee le meme jour mesure
 * encore environ 2 % de reactions sur l'acier 316L. La page dit « libere tres
 * peu de nickel », qui est un fait, et non une absence de risque.
 *
 * AUCUNE NUANCE D'ACIER. L'exploitante ne connait pas la sienne. Ecrire « 316L »
 * serait une specification inventee, du meme ordre que le « modele » qu'un
 * generateur avait produit avant LS-25.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * Les trois sections de la page, avec le titre que chacune doit rendre.
 *
 * LA LISTE EST ECRITE ICI PLUTOT QU'IMPORTEE DU COMPOSANT, deliberement : une
 * assertion qui lit la meme constante que le code verifie sa coherence avec
 * lui-meme et reste verte si les deux changent ensemble.
 */
const SECTIONS = [
  { ancre: "histoire", titre: "Mon histoire" },
  { ancre: "matieres", titre: "Les matières" },
  { ancre: "entretien", titre: "L'entretien" },
] as const;

test("le lien « Notre histoire » du pied de page atteint une page réelle", async ({
  page,
}) => {
  await page.goto("/");

  /*
   * LE LIEN EST CHERCHE DANS LE PIED, jamais dans toute la page : l'accueil
   * porte deux autres appels vers cette meme page, et un selecteur global
   * trouverait le mauvais element sans que rien ne le dise.
   */
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Notre histoire" })
    .click();

  await expect(page).toHaveURL(/\/notre-univers/);

  await expect(
    page.getByRole("heading", { name: "Notre univers", level: 1 }),
  ).toBeVisible();
});

test("les trois sections sont rendues et nommées", async ({ page }) => {
  await page.goto("/notre-univers");

  for (const section of SECTIONS) {
    await expect(
      page.getByRole("heading", { name: section.titre, level: 2 }),
    ).toBeVisible();
  }
});

/**
 * LE SOMMAIRE NE POINTE PAS DANS LE VIDE. Une ancre absente retombe en haut de
 * page sans lever d'erreur, piege nomme par LS-123 : le lecteur croit avoir
 * saute a la section et ne comprend pas pourquoi rien ne bouge.
 */
test("chaque ancre du sommaire atteint une section réelle", async ({
  page,
}) => {
  await page.goto("/notre-univers");

  const ancresSommaire = await page
    .locator("nav a[href^='#']")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href")?.slice(1) ?? ""),
    );

  const sections = await page
    .locator("main > section[id]")
    .evaluateAll((elements) => elements.map((element) => element.id));

  expect(ancresSommaire.length).toBeGreaterThan(0);
  expect([...ancresSommaire].sort()).toEqual([...sections].sort());

  for (const ancre of ancresSommaire) {
    await expect(page.locator(`#${ancre}`)).toBeVisible();
  }
});

/**
 * L'EXPLOITANTE EXERCE SEULE, ET SON PRENOM RESTE HORS DU SITE.
 *
 * Ce test garde une demande explicite du 20 septembre 2026. Il ne verifie pas
 * une preference de style : le recit au pluriel decrirait une entreprise a deux
 * personnes, quand une seule est declaree.
 */
test("la page ne nomme personne et ne parle jamais au pluriel", async ({
  page,
}) => {
  await page.goto("/notre-univers");

  const texte = (await page.getByRole("main").textContent()) ?? "";

  expect(texte).not.toMatch(/stacy/i);
  expect(texte).not.toMatch(/créatrices|creatrices/i);
  expect(texte).not.toMatch(/(ma|sa) sœur|(ma|sa) soeur/i);
  expect(texte).not.toMatch(/nous (créons|fabriquons|sommes)/i);

  /* Le recit EST a la premiere personne du singulier, et pas seulement exempt
   * de pluriel : un texte vide passerait les quatre assertions ci-dessus. */
  expect(texte).toMatch(/je modèle/i);
});

/**
 * AUCUNE PROMESSE QUE LA MATIERE NE TIENT PAS.
 *
 * « Hypoallergenique » promet l'absence d'allergie a qui pourrait reagir quand
 * meme, ce qui est une allegation trompeuse. « 316L » serait une specification
 * que l'exploitante ne connait pas. Les deux sont ecartes a dessein, et ce test
 * empeche qu'un enrichissement ulterieur les reintroduise.
 */
test("la page ne promet aucune absence d'allergie", async ({ page }) => {
  await page.goto("/notre-univers");

  const texte = (await page.getByRole("main").textContent()) ?? "";

  expect(texte).not.toMatch(/hypoallerg/i);
  expect(texte).not.toMatch(/316\s?L/i);
  expect(texte).not.toMatch(/sans (risque|allergie)/i);

  /* La formulation retenue dit le fait et sa portee, sans promettre. */
  expect(texte).toMatch(/libère très peu de nickel/i);
});

/**
 * LA PAGE OFFRE UNE SORTIE VERS LE CATALOGUE.
 *
 * Elle n'en avait aucune, relevé le 20 septembre 2026 : le lecteur arrivé au
 * bout n'avait que le bouton précédent de son navigateur. Une page éditoriale
 * sans sortie laisse partir qui vient d'être convaincu.
 *
 * LE CLIC EST JOUE, jamais une simple présence d'attribut `href` : un lien
 * visible ne prouve pas qu'un chemin existe, motif deja paye sur ce depot.
 */
test("la page offre une sortie vers le catalogue", async ({ page }) => {
  await page.goto("/notre-univers");

  await page
    .getByRole("main")
    .getByRole("link", { name: "Découvrir les créations" })
    .click();

  await expect(page).toHaveURL(/\/catalogue/);
});

/**
 * « ECRIVEZ-MOI » MENE QUELQUE PART.
 *
 * La phrase invitait a ecrire sans donner aucun moyen de le faire, releve le
 * 20 septembre 2026. Ce test garde le chemin plutot que la presence du bouton :
 * un lien visible ne prouve pas qu'il aboutit.
 */
test("l'invitation à écrire mène au formulaire de contact", async ({
  page,
}) => {
  await page.goto("/notre-univers");

  await page
    .getByRole("main")
    .getByRole("link", { name: "Écrire un message" })
    .click();

  await expect(page).toHaveURL(/\/contact/);
});

test("la page ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/notre-univers");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation d'accessibilité sur la page", async ({ page }) => {
  await page.goto("/notre-univers");

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});
