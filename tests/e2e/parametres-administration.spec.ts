/**
 * La rubrique Paramètres de l'administration, LS-98 et ADR-043.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTÉGRATION NE PROUVENT PAS. Ces
 * derniers exercent le service et ses gardes sur une base réelle ; ils ne
 * disent rien de l'écran, de son rendu à 320 px, ni du fait qu'un chemin y
 * mène. C'est le motif de LS-162, dont le défaut a survécu huit stories.
 *
 * LE TEST NÉGATIF D'AUTORISATION EST ICI AUSSI, et il n'est pas redondant avec
 * celui de l'intégration : celui-là exerce le SERVICE, celui-ci la ROUTE. Une
 * page qui oublierait sa garde laisserait le service la rattraper en lecture,
 * et l'écran s'afficherait quand même vide de ses valeurs.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  FICHIER_SESSION_ADMINISTRATION,
  FICHIER_SESSION,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.describe("refus d'accès", () => {
  test.use({ storageState: FICHIER_SESSION });

  /*
   * LA SESSION CLIENTE ET NON L'ABSENCE DE SESSION : une redirection sans
   * session prouverait qu'il faut être connecté, jamais qu'il faut le RÔLE.
   */
  test("un client connecté sans rôle n'atteint pas les paramètres", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");

    await expect(page).toHaveURL(/\/administration\/connexion/);

    /*
     * LE CONTENU EST VÉRIFIÉ EN PLUS DE L'URL. Une redirection qui laisserait
     * le corps de la page protégée dans la réponse ferait fuiter les tarifs et
     * l'adresse d'alerte malgré l'URL affichée.
     */
    const texte = (await page.locator("body").textContent()) ?? "";

    expect(texte).not.toContain("Livraison offerte à partir de");
    expect(texte).not.toContain("Adresse qui reçoit les alertes");
  });
});

test.describe("écran connecté", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  /*
   * LES TROIS BLOCS SONT RENDUS, et le compte est dans l'assertion : « au moins
   * un groupe » passerait sur un écran qui aurait perdu les alertes.
   */
  test("l'écran rend les deux groupes de réglages", async ({ page }) => {
    await page.goto("/administration/parametres");

    await expect(
      page.getByRole("heading", { name: "Paramètres", level: 1 }),
    ).toBeVisible();

    await expect(page.getByRole("group", { name: "Livraison" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Alertes" })).toBeVisible();
  });

  /*
   * LES TARIFS S'AFFICHENT EN EUROS, jamais en centimes.
   *
   * CE TEST ATTRAPE UNE CONFUSION QUI COÛTE CHER : un champ pré-rempli à « 410 »
   * au lieu de « 4,10 » se réenregistre en 410 euros de port au premier
   * enregistrement, et le défaut ne se voit qu'à la commande suivante.
   */
  test("les tarifs sont présentés en euros et non en centimes", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");

    await expect(
      page.getByLabel("Point Relais et Locker, en euros"),
    ).toHaveValue("4,10");
    await expect(page.getByLabel("Livraison à domicile, en euros")).toHaveValue(
      "7,49",
    );
  });

  /*
   * LES TROIS ÉTATS DU SEUIL SONT DITS À L'ÉCRAN, ADR-043 décision 3 bis.
   *
   * Vide, zéro et un montant produisent trois comportements différents, et rien
   * dans un champ de saisie ne le laisse deviner. Le taire ferait désactiver la
   * franchise en croyant l'offrir, ou l'inverse.
   */
  test("l'écran explique les trois états du seuil de franchise", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");

    const aide = page.locator("#aide-seuil");

    await expect(aide).toBeVisible();

    const texte = (await aide.textContent()) ?? "";

    expect(texte).toMatch(/vide/i);
    expect(texte).toMatch(/[Zz]éro/);
    expect(texte).toMatch(/domicile/i);
  });

  /*
   * L'ÉCRAN DIT CE QU'IL NE RÈGLE PAS. Sans cette section, l'exploitante
   * chercherait le réglage manquant à chaque ouverture, et finirait par croire
   * à un oubli plutôt qu'à une décision.
   */
  test("l'écran nomme ce qui ne se règle pas ici", async ({ page }) => {
    await page.goto("/administration/parametres");

    const section = page.locator("section", {
      has: page.getByRole("heading", { name: "Ce qui ne se règle pas ici" }),
    });

    await expect(section).toBeVisible();

    const texte = (await section.textContent()) ?? "";

    expect(texte).toMatch(/nom de la boutique/i);
    expect(texte).toMatch(/modes de livraison/i);
  });

  /*
   * LE BOUTON PORTE UN LIBELLÉ FIXE, et ce test le verrouille.
   *
   * Un bouton `disabled` perd le focus : un lecteur d'écran n'y reviendrait pas
   * pour lire un nom qui vient de changer, et l'attente ne serait annoncée
   * nulle part. Leçon de la revue frontend de LS-61, appliquée ici d'entrée.
   */
  test("le bouton garde un nom accessible stable", async ({ page }) => {
    await page.goto("/administration/parametres");

    await expect(
      page.getByRole("button", { name: "Enregistrer", exact: true }),
    ).toBeVisible();
  });

  /*
   * LA RÉGION LIVE EST NOMMÉE, C39. Une région anonyme s'annonce « status »
   * sans rien dire de plus à la navigation par régions, et deux régions
   * anonymes d'un même écran y sont indiscernables.
   */
  test("la région live porte un nom", async ({ page }) => {
    await page.goto("/administration/parametres");

    await expect(
      page.getByRole("status", {
        name: "État de l'enregistrement des paramètres",
      }),
    ).toBeAttached();
  });

  test("l'écran ne déborde pas horizontalement", async ({ page }) => {
    await page.goto("/administration/parametres");

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test("aucune violation d'accessibilité sur l'écran", async ({ page }) => {
    await page.goto("/administration/parametres");

    const resultats = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultats.violations).toEqual([]);
  });

  /*
   * ------------------------------------------------------------------
   * LA GARDE DE RÉAUTHENTIFICATION SE VOIT À L'ÉCRAN, et ce test est le seul
   * qui la mesure sur le rendu réel.
   *
   * LA SESSION PARTAGÉE N'A AUCUNE PREUVE RÉCENTE : elle est ouverte par
   * `session-administration.setup.ts`, qui ne réauthentifie pas. Soumettre le
   * formulaire doit donc rendre le refus ET son chemin de sortie.
   *
   * SANS LE LIEN DE SORTIE, l'exploitante recliquerait et conclurait à une
   * panne. C'est la leçon de `PLAFOND` dans la revue frontend de LS-61 : un
   * refus dont on ne peut pas sortir coûte plus cher qu'un refus explicite.
   * ------------------------------------------------------------------
   */
  test("un enregistrement sans preuve récente propose de confirmer son identité", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");

    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(
      page.getByText(
        "Confirmez votre identité pour enregistrer ces paramètres.",
      ),
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Confirmer mon identité" }),
    ).toBeVisible();
  });
});
