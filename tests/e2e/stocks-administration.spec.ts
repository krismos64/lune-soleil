/**
 * Stocks et marches, de bout en bout. LS-106, parcours 2.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent le SERVICE : ils disent que la vente externe refuse une
 * piece reservee. Ils ne disent rien de la PAGE, ni du fait que chaque Server
 * Action porte sa propre garde de role.
 *
 * LE TEST D'APPEL DIRECT EST LE PLUS IMPORTANT DU FICHIER. Une Server Action
 * s'invoque sans jamais charger la page qui la porte : verifier la seule
 * redirection laisserait ce chemin ouvert, defaut trouve en relecture de LS-89.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const CHEMIN = "/administration/stocks";

test.describe("sans session", () => {
  test("l'ecran des stocks renvoie vers la connexion", async ({ page }) => {
    await page.goto(CHEMIN);

    await expect(page).toHaveURL(/\/administration\/connexion$/);
    // Le titre de l'ecran protege n'apparait nulle part : une redirection qui
    // laisserait le contenu rendu avant de naviguer serait une fuite.
    await expect(
      page.getByRole("heading", { name: "Stocks et marchés" }),
    ).toHaveCount(0);
  });

  /**
   * LA SERVER ACTION EST APPELEE DIRECTEMENT, sans passer par l'ecran.
   *
   * Next.js traite un POST sans en-tete `Next-Action` comme une NAVIGATION et
   * rend 200 : le test doit donc porter l'en-tete, sans quoi il passerait pour
   * la mauvaise raison. Piege documente de ce projet.
   */
  test("une action de stock refuse un appel direct sans session", async ({
    request,
  }) => {
    const reponse = await request.post(CHEMIN, {
      headers: {
        "Next-Action": "action-inexistante-mais-en-tete-presente",
        "Content-Type": "text/plain;charset=UTF-8",
      },
      data: '["00000000-0000-4000-8000-000000000000"]',
    });

    // Aucune action ne doit s'executer : ni succes, ni erreur applicative.
    expect(reponse.status()).not.toBe(200);
  });
});

test.describe("avec une session d'administration", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("les trois quantites sont distinctes et nommees", async ({ page }) => {
    await page.goto(CHEMIN);

    await expect(
      page.getByRole("heading", { name: "Stocks et marchés" }),
    ).toBeVisible();

    /*
     * LES TROIS ETIQUETTES EXISTENT, critere 1. Un ecran qui afficherait trois
     * chiffres nus passerait tous les tests d'integration : confondre physique
     * et disponible est precisement ce qui fait vendre une piece reservee.
     */
    await expect(
      page.getByText("Physique", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Réservé", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Disponible", { exact: true }).first(),
    ).toBeVisible();
  });

  /*
   * LES TROIS QUANTITES TIENNENT SUR UNE LIGNE, y compris a 320 px. Mesure et
   * non supposee : une premiere version en `flex-wrap` faisait retomber
   * « Disponible » seule sous les deux autres, ce qui suggerait qu'elle
   * n'appartenait pas au meme groupe. Aucun debordement ne le signalait.
   */
  test("les trois quantites restent alignees", async ({ page }) => {
    await page.goto(CHEMIN);
    await expect(
      page.getByRole("heading", { name: "Stocks et marchés" }),
    ).toBeVisible();

    const hauts = await page.evaluate(() => {
      const premiere = document.querySelector("dl");
      if (!premiere) return [];
      return [...premiere.querySelectorAll("div")].map((g) =>
        Math.round(g.getBoundingClientRect().top),
      );
    });

    expect(hauts).toHaveLength(3);
    expect(new Set(hauts).size).toBe(1);
  });

  test("l'ecran ne deborde pas horizontalement", async ({ page }) => {
    await page.goto(CHEMIN);
    await expect(
      page.getByRole("heading", { name: "Stocks et marchés" }),
    ).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test("l'ecran ne porte aucune violation d'accessibilite", async ({
    page,
  }) => {
    await page.goto(CHEMIN);
    await expect(
      page.getByRole("heading", { name: "Stocks et marchés" }),
    ).toBeVisible();

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });
});
