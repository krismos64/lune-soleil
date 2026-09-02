/**
 * Le carnet d'adresses, aux trois largeurs. LS-59, critere 6, parcours 8.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent les gardes et l'ordre des ecritures sur base reelle, sept
 * mutations a l'appui ; ils ne disent rien de ce que la personne VOIT ni de ce
 * qu'elle peut ATTEINDRE.
 *
 * LA NAVIGATION SE FAIT AU CLIC, jamais par `goto` pour le premier acces : un
 * ecran qu'aucun lien ne designe est inatteignable, defaut rencontre deux fois
 * sur ce depot.
 *
 * CHAQUE LARGEUR TRAVAILLE SUR SON PROPRE LIBELLE. Les trois projets partagent
 * le compte, ouvert une fois par le projet `preparation` pour ne pas saturer le
 * plafond d'inscription, ET la base : sans ce marquage, la suppression d'une
 * largeur emporterait l'adresse qu'une autre vient de creer.
 */
import "dotenv/config";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

import {
  FICHIER_EMAIL_VERIFIE,
  FICHIER_SESSION_VERIFIEE,
} from "./chemin-session";
import { readFileSync } from "node:fs";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

async function avecBase(
  travail: (client: Client) => Promise<void>,
): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await travail(client);
  } finally {
    await client.end();
  }
}

test.use({ storageState: FICHIER_SESSION_VERIFIEE });

/** Le libelle propre a cette largeur, voir l'entete. */
let marque: string;

test.beforeEach(async ({}, infos) => {
  marque = `TEST-59-${infos.project.name}`;

  const { email } = JSON.parse(
    readFileSync(FICHIER_EMAIL_VERIFIE, "utf-8"),
  ) as {
    email: string;
  };

  /*
   * LE CARNET DE CETTE LARGEUR EST REMIS A ZERO, jamais conserve. Une adresse
   * laissee par l'execution precedente ferait echouer le test du carnet vide,
   * et une adresse par defaut survivante fausserait la bascule.
   */
  await avecBase(async (client) => {
    await client.query(
      `DELETE FROM adresse_carnet
       WHERE libelle = $1
         AND utilisateur_id = (SELECT id FROM utilisateur WHERE email = $2)`,
      [marque, email],
    );
  });
});

test("le carnet s'atteint au clic depuis le compte", async ({ page }) => {
  /*
   * AU CLIC ET NON PAR `goto` : sans ce lien, l'ecran n'existerait que pour qui
   * saisit l'URL, defaut exact de LS-162 et de `/compte/verification`.
   */
  await page.goto("/compte");

  await page.getByRole("link", { name: "Gérer mes adresses" }).click();

  await expect(
    page.getByRole("heading", { name: "Mon carnet d'adresses" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ajouter une adresse" }),
  ).toBeVisible();
});

test("ajouter une adresse la fait apparaitre dans le carnet", async ({
  page,
}) => {
  await page.goto("/compte/adresses");

  await page.getByLabel("Libellé (facultatif)").fill(marque);
  await page.getByLabel("Nom du destinataire").fill("Client de test");
  await page.getByLabel("Adresse", { exact: true }).fill("1 rue du Test");
  await page.getByLabel("Code postal").fill("64000");
  await page.getByLabel("Ville").fill("Pau");

  await page.getByRole("button", { name: "Ajouter cette adresse" }).click();

  /*
   * L'ANNONCE EST CHERCHEE PAR SON NOM ACCESSIBLE, deux regions `status`
   * coexistant sur cet ecran : celle du formulaire et celle de la liste.
   */
  await expect(
    page.getByRole("status", { name: "Enregistrement de l'adresse" }),
  ).toHaveText(/ajoutée/);

  await expect(page.getByText(marque)).toBeVisible();
});

test("une saisie invalide est refusee sans quitter l'ecran", async ({
  page,
}) => {
  /*
   * `97400` EST UN CODE D'OUTRE-MER, refuse par decision de perimetre : le
   * tarif Mondial Relay d'ADR-025 ne le couvre pas. Le test emploie donc une
   * valeur que la regle refuse REELLEMENT, et non une valeur inventee.
   *
   * `novalidate` N'EST PAS POSE : le navigateur ne bloque rien ici, le format
   * du code postal n'etant contraint par aucun `pattern`. C'est bien le serveur
   * qui refuse, invariant 7.
   */
  await page.goto("/compte/adresses");

  await page.getByLabel("Libellé (facultatif)").fill(marque);
  await page.getByLabel("Nom du destinataire").fill("Client de test");
  await page.getByLabel("Adresse", { exact: true }).fill("1 rue du Test");
  await page.getByLabel("Code postal").fill("97400");
  await page.getByLabel("Ville").fill("Saint-Denis");

  await page.getByRole("button", { name: "Ajouter cette adresse" }).click();

  const annonce = page.getByRole("status", {
    name: "Enregistrement de l'adresse",
  });
  await expect(annonce).toHaveText(/codePostal|code postal/i);

  // LE FOCUS SE DEPLACE SUR LE COMPTE RENDU : sans cela, un utilisateur au
  // clavier ne saurait pas que sa saisie a ete refusee.
  await expect(annonce).toBeFocused();
});

test("le carnet ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/compte/adresses");
  await expect(
    page.getByRole("heading", { name: "Mon carnet d'adresses" }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation axe-core sur le carnet", async ({ page }) => {
  await page.goto("/compte/adresses");
  await expect(
    page.getByRole("heading", { name: "Mon carnet d'adresses" }),
  ).toBeVisible();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

test.describe("visiteur sans session", () => {
  /*
   * `storageState: undefined` ANNULE CELUI DU FICHIER, et c'est indispensable :
   * le `test.use` de tete s'applique a tout ce qui suit, y compris a un
   * `browser.newContext()` cree a la main. Ma premiere version creait un
   * contexte neuf en croyant l'isoler, et il heritait de la session : la page
   * s'affichait normalement et le test rougissait sur un comportement CORRECT.
   */
  test.use({ storageState: undefined });

  test("est renvoye vers la connexion", async ({ page }) => {
    await page.goto("/compte/adresses");

    /*
     * VERS LA CONNEXION CLIENT ET NON CELLE DE L'ADMINISTRATION : c'est
     * l'incoherence du 13 aout, corrigee par LS-54. Verifier seulement
     * l'absence du carnet laisserait passer une redirection vers le mauvais
     * ecran.
     */
    await expect(page).toHaveURL(/\/compte\/connexion/);
  });
});
