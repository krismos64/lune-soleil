/**
 * Tunnel de commande de bout en bout, LS-115. Etape 3b du parcours 1.
 *
 * AUCUNE DONNEE DU PROTOTYPE, interdit du projet. Les pieces viennent de
 * `CATALOGUE_TEST`, prefixees `TEST`.
 *
 * LE TRANSPORTEUR EST EN PANNE PENDANT TOUS CES TESTS, et ce n'est pas une
 * simulation artificielle : le compte Mondial Relay n'est pas ouvert, LS-27 et
 * LS-18, donc `fournisseurPointsRetrait` leve. C'est exactement le cas d'erreur
 * du parcours 1, et il se trouve etre l'etat reel du systeme aujourd'hui.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const CHEMIN_FICHE = `/produit/${CATALOGUE_TEST.enStock.slug}`;

/** Remplit l'etape des coordonnees et passe a la suivante. */
async function remplirCoordonnees(page: import("@playwright/test").Page) {
  await page.getByLabel("Nom et prénom").fill("Camille Dupont");
  await page.getByLabel("Adresse email").fill("camille.dupont@exemple.test");
  await page.getByRole("button", { name: "Continuer" }).click();
}

/** Remplit l'etape de l'adresse et passe a la suivante. */
async function remplirAdresse(page: import("@playwright/test").Page) {
  await page.getByLabel("Adresse", { exact: true }).fill("12 rue des Ateliers");
  await page.getByLabel("Code postal").fill("35000");
  await page.getByLabel("Ville").fill("Rennes");
  await page.getByRole("button", { name: "Continuer" }).click();
}

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();

  await page.goto(CHEMIN_FICHE);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByText("Ajouté au panier.")).toBeAttached();
});

test("un panier vide ne peut pas entrer dans le tunnel", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/commande");

  /* Le visiteur est renvoye au panier plutot que de remplir quatre etapes. */
  await expect(page).toHaveURL(/\/panier$/);
});

test("la zone desservie est annoncee des l'entree du tunnel", async ({
  page,
}) => {
  await page.goto("/commande");

  /*
   * L221-14 ALINEA 3 : les restrictions de livraison s'indiquent « au plus tard
   * au debut du processus de commande », donc pas au recapitulatif. Etabli par
   * LS-86, voir `.claude/rules/legal.md`.
   */
  await expect(
    page.getByText("Livraison en France métropolitaine, Corse comprise."),
  ).toBeVisible();
});

test("les quatre etapes s'enchainent et le focus suit le titre", async ({
  page,
}) => {
  await page.goto("/commande");

  await expect(
    page.getByRole("heading", { name: "Vos coordonnées" }),
  ).toBeVisible();

  await remplirCoordonnees(page);

  await expect(
    page.getByRole("heading", { name: "Votre adresse de livraison" }),
  ).toBeVisible();

  /*
   * LE FOCUS EST SUR LE TITRE, critere 7 et LS-85. Sans `tabIndex={-1}` sur le
   * titre, `focus()` ne fait rien et le focus retombe sur `body` : la page
   * defile peut-etre, mais personne au lecteur d'ecran ne sait qu'elle a
   * change, et axe-core ne le voit pas non plus.
   */
  await expect(
    page.getByRole("heading", { name: "Votre adresse de livraison" }),
  ).toBeFocused();

  await remplirAdresse(page);

  await expect(
    page.getByRole("heading", { name: "Votre mode de livraison" }),
  ).toBeFocused();
});

test("une saisie invalide est annoncee et ne fait pas avancer", async ({
  page,
}) => {
  await page.goto("/commande");

  await page.getByLabel("Nom et prénom").fill("Camille Dupont");
  await page.getByLabel("Adresse email").fill("camille.dupont@exemple.test");
  await page.getByLabel("Téléphone").fill("00");
  await page.getByRole("button", { name: "Continuer" }).click();

  /*
   * REGION LIVE `alert` ET NON `status`, critere 8 : une erreur de saisie
   * interrompt la personne, c'est precisement ce que `alert` fait.
   *
   * ELLE EST NOMMEE, et c'est necessaire : Next.js pose son propre
   * `role="alert"` pour annoncer les changements de route, et un selecteur non
   * qualifie resout vers deux elements. Le nom rend la region identifiable pour
   * le test comme pour un lecteur d'ecran, qui distingue alors les erreurs de
   * saisie de l'annonce de navigation.
   */
  await expect(
    page.getByRole("alert", { name: "Erreurs de saisie" }),
  ).toContainText("telephone");

  /* Et l'etape n'a pas change : un echec ne fait jamais avancer. */
  await expect(
    page.getByRole("heading", { name: "Vos coordonnées" }),
  ).toBeVisible();
});

test("le transporteur indisponible laisse commander a domicile", async ({
  page,
}) => {
  await page.goto("/commande");
  await remplirCoordonnees(page);
  await remplirAdresse(page);

  /*
   * LE CRITERE 6, LE PLUS IMPORTANT DE LA STORY. La liste des points ne
   * s'affiche pas, le message est explicite et sans jargon, et le domicile
   * reste choisissable : une panne degrade le choix au lieu de fermer la vente.
   */
  await expect(page.getByRole("status")).toContainText(
    "momentanément indisponible",
  );

  await expect(page.getByRole("radio", { name: "À domicile" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Point Relais" })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(
    page.getByRole("heading", { name: "Vérifier et payer" }),
  ).toBeVisible();
});

test("le recapitulatif porte le montant et la mention imposee", async ({
  page,
}) => {
  await page.goto("/commande");
  await remplirCoordonnees(page);
  await remplirAdresse(page);
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(
    page.getByRole("heading", { name: "Vérifier et payer" }),
  ).toBeVisible();

  /* L221-14 alinea 1 : les caracteristiques essentielles et le prix. */
  await expect(page.getByText("Sous-total")).toBeVisible();

  /*
   * L221-14 ALINEA 2 : la mention est imposee SUR LE BOUTON lui-meme. « Payer »
   * ou « Valider » seuls ne satisfont pas l'exigence. Etabli par LS-86.
   */
  await expect(
    page.getByRole("button", { name: "Commander avec obligation de paiement" }),
  ).toBeVisible();

  /*
   * L'ADRESSE EST RAPPELEE. Aucun texte ne l'impose, ni L221-14 ni L221-5 ni
   * L111-1 : c'est une decision d'ergonomie du 25 aout 2026, et ce test la
   * verrouille sans en faire une obligation legale.
   */
  await expect(page.getByText("12 rue des Ateliers")).toBeVisible();
  await expect(page.getByText("35000 Rennes")).toBeVisible();
});

test("le tunnel ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/commande");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  await remplirCoordonnees(page);
  await remplirAdresse(page);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  await page.getByRole("button", { name: "Continuer" }).click();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le tunnel ne porte aucune violation d'accessibilite serieuse", async ({
  page,
}) => {
  await page.goto("/commande");
  await remplirCoordonnees(page);
  await remplirAdresse(page);
  await page.getByRole("button", { name: "Continuer" }).click();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const resume = resultat.violations.map(
    (violation) => `${violation.id} (${violation.impact}) : ${violation.help}`,
  );

  expect(resume).toEqual([]);
});
