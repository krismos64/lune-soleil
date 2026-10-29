/**
 * Le carnet d'adresses dans le tunnel de commande, LS-299.
 *
 * LE COMPTE EST CELUI DE `compte-adresses.spec.ts`, la session verifiee, le
 * seul dont un fichier de bout en bout gere le carnet. Chaque largeur y pose SA
 * propre adresse, prefixee, jamais par defaut, et la retire en sortie : poser
 * une adresse par defaut ferait se marcher dessus les deux fichiers, qui
 * tournent en parallele. La preselection de l'adresse par defaut est donc
 * prouvee par `tests/unitaire/carnet-tunnel.test.ts`, fonction pure.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { readFileSync } from "node:fs";

import {
  CATALOGUE_TEST,
  FICHIER_EMAIL_VERIFIE,
  FICHIER_SESSION_VERIFIEE,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const CHEMIN_FICHE = `/produit/${CATALOGUE_TEST.enStock.slug}`;

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

function emailVerifie(): string {
  return (
    JSON.parse(readFileSync(FICHIER_EMAIL_VERIFIE, "utf-8")) as {
      email: string;
    }
  ).email;
}

/** Ajoute une piece au panier et atteint l'etape adresse. */
async function atteindreEtapeAdresse(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto(CHEMIN_FICHE);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(
    page.getByRole("status", { name: "Ajout au panier" }),
  ).toHaveText("Ajouté au panier.");

  await page.goto("/commande");
  await page.getByLabel("Nom et prénom").fill("Client verifie");
  await page.getByLabel("Adresse email").fill("client.verifie@exemple.test");
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByLabel("Code postal")).toBeVisible();
}

test.describe("connecte, avec un carnet", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: FICHIER_SESSION_VERIFIEE });

  /** Le libelle propre a cette largeur. */
  let marque: string;

  test.beforeEach(async ({ context }, infos) => {
    marque = `TEST-299-${infos.project.name}`;
    await context.clearCookies({ name: "ls_tunnel" });
    await context.clearCookies({ name: "ls_panier" });

    await avecBase(async (client) => {
      await client.query(
        `DELETE FROM adresse_carnet
         WHERE libelle LIKE $1
           AND utilisateur_id = (SELECT id FROM utilisateur WHERE email = $2)`,
        [`${marque}%`, emailVerifie()],
      );
      await client.query(
        `INSERT INTO adresse_carnet (id, utilisateur_id, libelle, nom_complet,
                                     ligne1, ligne2, code_postal, ville, pays,
                                     est_par_defaut)
         SELECT gen_random_uuid()::text, u.id, $1, 'Client verifie',
                '127 avenue des Pyrenees-Atlantiques', 'Batiment C',
                '64000', 'Pau', 'FR', false
         FROM utilisateur u WHERE u.email = $2`,
        [`${marque}-Atelier`, emailVerifie()],
      );
    });
  });

  test.afterEach(async () => {
    await avecBase(async (client) => {
      await client.query(
        `DELETE FROM adresse_carnet
         WHERE libelle LIKE $1
           AND utilisateur_id = (SELECT id FROM utilisateur WHERE email = $2)`,
        [`${marque}%`, emailVerifie()],
      );
    });
  });

  /*
   * CRITERE 1 : un choix remplit les champs, qui restent modifiables, et
   * l'adresse ainsi choisie passe a l'etape suivante comme une frappe.
   */
  test("un choix du carnet remplit l'adresse et le tunnel continue", async ({
    page,
  }) => {
    await atteindreEtapeAdresse(page);

    const liste = page.getByLabel("Adresse enregistrée");
    await liste.selectOption({
      label: `${marque}-Atelier : 127 avenue des Pyrenees-Atlantiques, 64000 Pau`,
    });

    await expect(page.getByLabel("Adresse", { exact: true })).toHaveValue(
      "127 avenue des Pyrenees-Atlantiques",
    );
    await expect(page.getByLabel(/Complément/)).toHaveValue("Batiment C");
    await expect(page.getByLabel("Code postal")).toHaveValue("64000");
    await expect(page.getByLabel("Ville")).toHaveValue("Pau");

    // Les champs restent modifiables apres le choix.
    await page.getByLabel(/Complément/).fill("Batiment D");
    await expect(page.getByLabel(/Complément/)).toHaveValue("Batiment D");

    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/etape=livraison/);
  });

  test("« Saisir une autre adresse » vide les champs", async ({ page }) => {
    await atteindreEtapeAdresse(page);

    const liste = page.getByLabel("Adresse enregistrée");
    await liste.selectOption({
      label: `${marque}-Atelier : 127 avenue des Pyrenees-Atlantiques, 64000 Pau`,
    });
    await liste.selectOption({ label: "Saisir une autre adresse" });

    await expect(page.getByLabel("Adresse", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Code postal")).toHaveValue("");
  });

  // Critere 5 : la liste et ses libelles longs ne debordent pas a 320 px.
  test("l'etape adresse ne deborde pas et reste accessible", async ({
    page,
  }) => {
    await atteindreEtapeAdresse(page);
    await expect(page.getByLabel("Adresse enregistrée")).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(resultat.violations).toEqual([]);
  });
});

test.describe("sans session", () => {
  test.use({ storageState: undefined });

  // Critere 3 : sans session, le tunnel est inchange, aucune liste n'existe.
  test("ne propose aucune adresse enregistree", async ({ page }) => {
    await atteindreEtapeAdresse(page);

    await expect(page.getByLabel("Adresse enregistrée")).toHaveCount(0);
    await expect(page.getByLabel("Adresse", { exact: true })).toHaveValue("");
  });
});
