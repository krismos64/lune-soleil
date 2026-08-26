/**
 * Page de confirmation et d'attente de paiement, LS-118. Etapes 5 et 6 du
 * parcours 1, dans l'etat reel du systeme : le compte Stripe n'existe pas,
 * LS-18, la cle est videe par la configuration Playwright, et la creation de
 * session echoue proprement. C'est le cas d'erreur « echec de creation de la
 * session de paiement » du parcours 1, exerce de bout en bout.
 *
 * LA COMMANDE VIENT DE `commande.setup.ts`, cookie signe compris : passer par
 * le tunnel consommerait le stock partage du catalogue de test a chaque
 * largeur, voir le setup.
 *
 * CE QUE CES TESTS VERROUILLENT AVANT TOUT : la page n'affiche JAMAIS une
 * confirmation de paiement sur la seule foi du retour navigateur, invariant 5
 * et critere 5 de la story.
 */
import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { COMMANDE_TEST, FICHIER_COMMANDE } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.beforeEach(async ({ context, baseURL }) => {
  await context.clearCookies();

  const { valeur } = JSON.parse(readFileSync(FICHIER_COMMANDE, "utf8")) as {
    valeur: string;
  };

  await context.addCookies([
    {
      name: "ls_commande",
      value: valeur,
      url: baseURL ?? "http://127.0.0.1:3100",
    },
  ]);
});

test("la page d'attente montre l'etat reel et propose le paiement", async ({
  page,
}) => {
  await page.goto("/commande/confirmation");

  await expect(
    page.getByRole("heading", { name: "Votre commande est enregistrée" }),
  ).toBeVisible();

  /* Le numero vient de la BASE par le cookie signe, pas de l'URL. */
  await expect(page.getByText(COMMANDE_TEST.numero)).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Payer ma commande" }),
  ).toBeVisible();

  /* Rien n'est paye : aucune formulation de confirmation ne doit exister. */
  await expect(page.getByText("Votre paiement est enregistré")).toHaveCount(0);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le retour du prestataire n'affiche aucune confirmation, invariant 5", async ({
  page,
}) => {
  /*
   * C'EST L'URL DE `success_url` : le client revient de la page de paiement.
   * Elle annonce une VERIFICATION, jamais une confirmation, et ne propose pas
   * de payer a nouveau, ADR-032.
   */
  await page.goto("/commande/confirmation?retour=paiement");

  await expect(
    page.getByRole("heading", { name: "Paiement en cours de vérification" }),
  ).toBeVisible();

  await expect(page.getByText("ne vaut pas confirmation")).toBeVisible();

  await expect(page.getByRole("button", { name: /[Pp]ayer/ })).toHaveCount(0);

  await expect(page.getByText("Votre paiement est enregistré")).toHaveCount(0);
});

test("la panne du prestataire laisse la commande payable, avec un message", async ({
  page,
}) => {
  await page.goto("/commande/confirmation");

  /*
   * LA CLE EST ABSENTE, configuration Playwright : le clic traverse la vraie
   * Server Action et le vrai service, et la creation echoue en indisponibilite.
   * La commande reste affichee, le message est associe a l'action, aucun faux
   * succes, `frontend-design.md`.
   */
  await page.getByRole("button", { name: "Payer ma commande" }).click();

  /*
   * L'ALERTE EST DESIGNEE PAR SON NOM ACCESSIBLE, jamais par le seul role :
   * `__next-route-announcer__` de Next.js porte lui aussi `role="alert"`, et un
   * selecteur par role seul est ambigu, donc en echec strict.
   */
  await expect(
    page.getByRole("alert", { name: "Erreur de paiement" }),
  ).toContainText("momentanément indisponible");

  await expect(
    page.getByRole("heading", { name: "Votre commande est enregistrée" }),
  ).toBeVisible();

  /* Le bouton reste disponible pour reessayer plus tard. */
  await expect(
    page.getByRole("button", { name: "Payer ma commande" }),
  ).toBeEnabled();
});

test("la page d'attente ne porte aucune violation d'accessibilite serieuse", async ({
  page,
}) => {
  await page.goto("/commande/confirmation");

  await expect(
    page.getByRole("heading", { name: "Votre commande est enregistrée" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Votre commande/);

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const resume = resultat.violations.map(
    (violation) => `${violation.id} (${violation.impact}) : ${violation.help}`,
  );

  expect(resume).toEqual([]);
});
