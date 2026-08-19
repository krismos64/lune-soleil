/**
 * Panier public, de bout en bout. LS-114.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES AUTRES NE PROUVENT PAS. Les tests
 * unitaires disent que la signature du cookie tient ; les tests d'integration
 * disent que le service relit le prix en base. Aucun ne dit que le PARCOURS
 * fonctionne : cliquer sur la fiche, retrouver la piece dans le panier, voir le
 * compteur bouger, changer la quantite, retirer la ligne.
 *
 * LE COOKIE FALSIFIE SE TESTE ICI ET NULLE PART AILLEURS. Le test unitaire
 * verifie que `decoderPanier` rejette ; celui-ci verifie que la PAGE se comporte
 * correctement quand un tel cookie arrive, c'est-a-dire un panier vide et
 * jamais une erreur.
 *
 * AUCUNE DONNEE DU PROTOTYPE, interdit du projet. Les pieces viennent de
 * `CATALOGUE_TEST`, prefixees `TEST`.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const CHEMIN_FICHE = `/produit/${CATALOGUE_TEST.enStock.slug}`;

/*
 * CHAQUE TEST PART D'UN PANIER VIDE. Les tests d'un meme fichier partagent leur
 * contexte de navigation : sans ce nettoyage, l'ajout du premier test peuplerait
 * le panier du suivant, et l'ordre d'execution deviendrait significatif.
 */
test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("un panier vide affiche un etat explicite et non une page nue", async ({
  page,
}) => {
  await page.goto("/panier");

  await expect(
    page.getByText("Votre panier est vide pour le moment."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Découvrir les créations" }),
  ).toBeVisible();
});

test("ajouter depuis la fiche remplit le panier et le compteur", async ({
  page,
}) => {
  await page.goto(CHEMIN_FICHE);

  // Le bouton doit etre ACTIF : il portait `disabled` jusqu'a cette story.
  const bouton = page.getByRole("button", { name: "Ajouter au panier" });
  await expect(bouton).toBeEnabled();

  await bouton.click();

  /*
   * LA REGION LIVE EST LE SEUL RETOUR AUDIBLE, critere 10. L'attendre plutot
   * qu'un delai fixe : un `waitForTimeout` passerait sur une machine rapide et
   * echouerait ailleurs.
   */
  await expect(page.getByText("Ajouté au panier.")).toBeAttached();

  // Le compteur porte le nombre dans son nom accessible, pas seulement a l'ecran.
  await expect(
    page.getByRole("link", { name: /Votre panier, 1 pièce/ }),
  ).toBeVisible();

  await page.goto("/panier");

  /*
   * `exact: true` PARCE QUE LE NOM APPARAIT TROIS FOIS : le libelle visible, le
   * nom accessible du selecteur de quantite et celui du bouton de retrait. Les
   * deux derniers sont voulus, un bouton « Retirer » sans nom de piece etant
   * indiscernable des autres dans une liste. Le test vise donc le libelle
   * affiche, pas n'importe quelle occurrence.
   */
  await expect(
    page.getByText(CATALOGUE_TEST.enStock.nom, { exact: true }),
  ).toBeVisible();
});

test("changer la quantite met le total a jour", async ({ page }) => {
  await page.goto(CHEMIN_FICHE);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByText("Ajouté au panier.")).toBeAttached();

  await page.goto("/panier");

  const prix = CATALOGUE_TEST.enStock.prixCentimes;
  const enEuros = (centimes: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(centimes / 100);

  // Le total de depart, une piece.
  await expect(page.getByText(enEuros(prix)).first()).toBeVisible();

  await page.getByRole("combobox", { name: /Quantité pour/ }).selectOption("2");

  /*
   * LE TOTAL EST RECALCULE PAR LE SERVEUR, jamais dans le navigateur. Ce test
   * echouerait si un futur developpeur multipliait cote client pour eviter un
   * aller-retour : le montant affiche doit venir de la revalidation.
   */
  await expect(page.getByText(enEuros(prix * 2)).first()).toBeVisible();
});

test("retirer une ligne vide le panier", async ({ page }) => {
  await page.goto(CHEMIN_FICHE);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByText("Ajouté au panier.")).toBeAttached();

  await page.goto("/panier");
  await page.getByRole("button", { name: /Retirer .* du panier/ }).click();

  await expect(
    page.getByText("Votre panier est vide pour le moment."),
  ).toBeVisible();
});

test("un cookie falsifie donne un panier vide et jamais une erreur", async ({
  page,
  context,
}) => {
  /*
   * CRITERE 4 DE LA STORY, TEST NEGATIF. La charge annonce une piece a
   * quantite 99 et porte une signature inventee. Le serveur doit la rejeter
   * SANS le dire : nommer « signature invalide » renseignerait qui essaie de
   * forger.
   */
  const chargeForgee = Buffer.from(
    JSON.stringify([
      { varianteId: CATALOGUE_TEST.enStock.varianteId, quantite: 99 },
    ]),
    "utf8",
  ).toString("base64url");

  await context.addCookies([
    {
      name: "ls_panier",
      value: `${chargeForgee}.signature-inventee-sans-valeur`,
      domain: "localhost",
      path: "/",
    },
  ]);

  const reponse = await page.goto("/panier");

  // La page repond normalement : un cookie douteux n'est pas une panne.
  expect(reponse?.status()).toBe(200);
  await expect(
    page.getByText("Votre panier est vide pour le moment."),
  ).toBeVisible();

  // Et le compteur ne compte rien.
  await expect(
    page.getByRole("link", { name: "Votre panier, vide" }),
  ).toBeVisible();
});

test("le panier ne deborde pas horizontalement", async ({ page }) => {
  await page.goto(CHEMIN_FICHE);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByText("Ajouté au panier.")).toBeAttached();

  await page.goto("/panier");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le panier ne porte aucune violation d'accessibilite serieuse", async ({
  page,
}) => {
  await page.goto(CHEMIN_FICHE);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByText("Ajouté au panier.")).toBeAttached();

  await page.goto("/panier");

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const resume = resultat.violations.map(
    (violation) => `${violation.id} (${violation.impact}) : ${violation.help}`,
  );

  expect(resume).toEqual([]);
});
