/**
 * Accuse du lien de verification d'adresse email, LS-298.
 *
 * LE JETON N'EST PAS FABRIQUE ICI : il est signe avec le secret de
 * l'application, et ce test ne le lit pas. Better Auth redirige vers
 * `callbackURL` en succes et vers `callbackURL&error=<code>` en echec, verifie
 * dans sa source 1.7 : ces tests partent donc de ces deux arrivees, et un
 * dernier verifie que l'inscription demande bien ce retour.
 */
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION, FICHIER_SESSION_VERIFIEE } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const accuse = (page: import("@playwright/test").Page) =>
  page.getByRole("status", { name: "Vérification de l'adresse email" });

test.describe("compte verifie", () => {
  test.use({ storageState: FICHIER_SESSION_VERIFIEE });

  test("annonce la verification, puis ne la redit pas au rechargement", async ({
    page,
  }) => {
    await page.goto("/compte?verifie=1");

    // Critere 1 : message clair, region live nommee.
    await expect(accuse(page)).toHaveText("Adresse email vérifiée.");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );

    // Critere 3 : l'adresse ne porte plus le parametre, le rechargement non plus.
    await expect(page).toHaveURL(/\/compte$/);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Mon compte", level: 1 }),
    ).toBeVisible();
    await expect(accuse(page)).toHaveCount(0);
  });

  test("un lien expire reste un echec, meme sur une adresse deja verifiee", async ({
    page,
  }) => {
    // Critere 2 : la base dit « verifiee », le lien a pourtant echoue.
    await page.goto("/compte?verifie=1&error=TOKEN_EXPIRED");

    await expect(accuse(page)).toContainText(
      "Ce lien de vérification a expiré.",
    );
    await expect(accuse(page)).not.toContainText("Adresse email vérifiée");
    await expect(page).toHaveURL(/\/compte$/);
  });
});

test.describe("changement d'adresse", () => {
  test.use({ storageState: FICHIER_SESSION_VERIFIEE });

  test("un lien de changement en echec n'annonce aucune nouvelle adresse", async ({
    page,
  }) => {
    /*
     * Meme defaut que `?verifie=1`, corrige dans la meme story : Better Auth
     * ajoute `error` a `?email=1`, et l'ecran annoncait le changement.
     */
    await page.goto("/compte?email=1&error=INVALID_TOKEN");
    await expect(
      page.getByRole("heading", { name: "Mon compte", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("Votre nouvelle adresse email est confirmée."),
    ).toHaveCount(0);
    await expect(
      page.getByText("Ce lien de changement d'adresse n'est pas valide"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Changer d'adresse" }),
    ).toHaveAttribute("href", "/compte/profil");
    await expect(page).toHaveURL(/\/compte$/);
  });
});

test.describe("compte non verifie", () => {
  test.use({ storageState: FICHIER_SESSION });

  test("n'annonce rien que la base dement", async ({ page }) => {
    await page.goto("/compte?verifie=1");

    await expect(
      page.getByText("Votre adresse email n'est pas encore confirmée."),
    ).toBeVisible();
    await expect(accuse(page)).toHaveCount(0);
  });

  test("un lien invalide propose un nouveau lien", async ({ page }) => {
    await page.goto("/compte?verifie=1&error=INVALID_TOKEN");

    await expect(accuse(page)).toContainText(
      "Ce lien de vérification n'est pas valide.",
    );
    const lien = accuse(page).getByRole("link", {
      name: "Recevoir un nouveau lien",
    });
    await expect(lien).toHaveAttribute("href", "/compte/verification");
    const boite = await lien.boundingBox();
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });
});

test.describe("lien ouvert sans session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("l'accuse suit la redirection vers la connexion", async ({ page }) => {
    await page.goto("/compte?verifie=1");

    await expect(
      page.getByRole("heading", { name: "Se connecter", level: 1 }),
    ).toBeVisible();
    await expect(accuse(page)).toHaveText(
      "Adresse email vérifiée. Connectez-vous pour accéder à votre compte.",
    );
    await expect(page).toHaveURL(/\/compte\/connexion$/);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );

    // L'accuse se detache du formulaire : colles, ils se lisaient d'un bloc.
    const bas = await accuse(page).evaluate(
      (e) => e.getBoundingClientRect().bottom,
    );
    const haut = await page
      .locator("main form")
      .first()
      .evaluate((e) => e.getBoundingClientRect().top);
    expect(haut - bas).toBeGreaterThanOrEqual(8);
  });

  test("l'echec suit aussi, sans jamais annoncer la reussite", async ({
    page,
  }) => {
    await page.goto("/compte?verifie=1&error=TOKEN_EXPIRED");

    await expect(accuse(page)).toContainText(
      "Ce lien de vérification a expiré.",
    );
    await expect(accuse(page)).not.toContainText("Adresse email vérifiée");
  });

  test("ne renvoie jamais la valeur recue dans la redirection", async ({
    page,
  }) => {
    await page.goto("/compte?verifie=1&error=%3Cscript%3E");

    await expect(page).toHaveURL(/\/compte\/connexion/);
    await expect(accuse(page)).toContainText(
      "Ce lien de vérification n'est pas valide.",
    );
    expect(page.url()).not.toContain("script");
  });

  test("l'inscription demande le retour vers l'accuse", async ({ page }) => {
    /*
     * La requete est interceptee et jamais transmise : l'inscription est
     * plafonnee a trois par minute et par adresse IP, et ce test ne veut que
     * le corps envoye. Sans `callbackURL`, Better Auth ramenait a `/`.
     */
    let corps: Record<string, unknown> | null = null;
    await page.route("**/api/auth/sign-up/email", async (route) => {
      corps = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 500, body: "{}" });
    });

    await page.goto("/compte/inscription");
    await page.getByLabel("Nom", { exact: true }).fill("Camille Dupont");
    await page.getByLabel("Adresse email").fill("ls298@exemple.test");
    await page
      .getByLabel("Mot de passe", { exact: true })
      .fill("phrase-de-passe-assez-longue");
    await page.getByRole("button", { name: /Créer/ }).click();

    await expect.poll(() => corps?.callbackURL).toBe("/compte?verifie=1");
  });
});
