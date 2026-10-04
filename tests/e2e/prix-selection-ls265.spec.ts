/**
 * Un même prix pour plusieurs articles, LS-265.
 *
 * LA BASE DE BOUT EN BOUT EST PARTAGÉE : modifier le prix des produits de test
 * communs casserait la fiche et le panier. Ce fichier pose donc SES produits,
 * un jeu par largeur, archivés pour ne jamais paraître au catalogue public,
 * et remet leur prix de départ avant chaque test.
 */
import { Client } from "pg";

import { expect, test } from "@playwright/test";

import {
  CATALOGUE_TEST,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";

const ECRAN = "/administration/produits?statut=ARCHIVE";

const RANG_PROJET: Record<string, number> = {
  "mobile-320": 1,
  "mobile-390": 2,
  "tablette-768": 3,
  "bureau-1280": 4,
};

/** Deux produits, le premier à deux déclinaisons, prix de départ 19,99 €. */
function pieces(projet: string) {
  const rang = RANG_PROJET[projet] ?? 9;
  return [1, 2].map((numero) => ({
    id: `c7a2b3c4-1265-4ccc-8888-0000000${numero}000${rang}`,
    nom: `TEST Prix ${numero} largeur ${rang}`,
    slug: `e2e-ls265-prix-${numero}-${rang}`,
    variantes: (numero === 1 ? [1, 2] : [1]).map((v) => ({
      id: `c7a2b3c4-1265-4ddd-8888-000000${numero}${v}000${rang}`,
      reference: `TEST-LS265-${numero}${v}-${rang}`,
    })),
  }));
}

async function avecBase<T>(action: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

test.beforeEach(async ({}, infos) => {
  await avecBase(async (client) => {
    for (const piece of pieces(infos.project.name)) {
      await client.query(
        `INSERT INTO produit (id, categorie_id, nom, slug, statut, archive_a, cree_a, modifie_a)
         VALUES ($1, $2, $3, $4, 'ARCHIVE', now(), now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [piece.id, CATALOGUE_TEST.categorieB.id, piece.nom, piece.slug],
      );
      for (const variante of piece.variantes) {
        await client.query(
          `INSERT INTO variante (id, produit_id, reference, libelle, prix_centimes,
             quantite_physique, quantite_reservee, vente_web_activee, cree_a)
           VALUES ($1, $2, $3, 'TEST Déclinaison', 1999, 1, 0, true, now())
           ON CONFLICT (id) DO UPDATE SET prix_centimes = 1999`,
          [variante.id, piece.id, variante.reference],
        );
      }
    }
  });
});

test("un prix confirmé s'applique à toutes les déclinaisons choisies", async ({
  page,
}, infos) => {
  const [premier, second] = pieces(infos.project.name);
  await page.goto(ECRAN);

  for (const piece of [premier!, second!]) {
    await page
      .getByRole("checkbox", { name: `Sélectionner ${piece.nom}` })
      .check();
  }
  await page.getByLabel("Prix pour la sélection, en euros").fill("24,90");
  await page.getByRole("button", { name: /^Appliquer ce prix/ }).click();

  // Le récapitulatif liste les trois déclinaisons, et ne modifie rien.
  const recapitulatif = page.getByRole("region", {
    name: /Passer 3 déclinaisons à 24,90/,
  });
  await expect(recapitulatif).toBeVisible();
  await expect(recapitulatif.getByRole("listitem")).toHaveCount(3);
  const avant = await avecBase((client) =>
    client.query<{ prix_centimes: number }>(
      "SELECT prix_centimes FROM variante WHERE produit_id = ANY($1)",
      [[premier!.id, second!.id]],
    ),
  );
  expect(avant.rows.map((ligne) => ligne.prix_centimes)).toEqual([
    1999, 1999, 1999,
  ]);

  await recapitulatif
    .getByRole("button", { name: "Confirmer le prix" })
    .click();
  await expect(
    page.getByRole("status", { name: "Bilan de la sélection" }),
  ).toContainText("3 déclinaisons à 24,90");

  const apres = await avecBase((client) =>
    client.query<{ prix_centimes: number }>(
      "SELECT prix_centimes FROM variante WHERE produit_id = ANY($1)",
      [[premier!.id, second!.id]],
    ),
  );
  expect(apres.rows.map((ligne) => ligne.prix_centimes)).toEqual([
    2490, 2490, 2490,
  ]);
});

test("un prix nul est refusé avant tout récapitulatif", async ({
  page,
}, infos) => {
  const [premier] = pieces(infos.project.name);
  await page.goto(ECRAN);

  await page
    .getByRole("checkbox", { name: `Sélectionner ${premier!.nom}` })
    .check();
  await page.getByLabel("Prix pour la sélection, en euros").fill("0");
  await page.getByRole("button", { name: /^Appliquer ce prix/ }).click();

  await expect(
    page.getByRole("status", { name: "Bilan de la sélection" }),
  ).toContainText("supérieur à zéro");
  await expect(
    page.getByRole("button", { name: "Confirmer le prix" }),
  ).toHaveCount(0);
});

test("annuler le récapitulatif ne modifie aucun prix", async ({
  page,
}, infos) => {
  const [premier] = pieces(infos.project.name);
  await page.goto(ECRAN);

  await page
    .getByRole("checkbox", { name: `Sélectionner ${premier!.nom}` })
    .check();
  await page.getByLabel("Prix pour la sélection, en euros").fill("12");
  await page.getByRole("button", { name: /^Appliquer ce prix/ }).click();
  await page.getByRole("button", { name: "Annuler" }).click();

  await expect(
    page.getByRole("button", { name: "Confirmer le prix" }),
  ).toHaveCount(0);
  const lignes = await avecBase((client) =>
    client.query<{ prix_centimes: number }>(
      "SELECT prix_centimes FROM variante WHERE produit_id = $1",
      [premier!.id],
    ),
  );
  expect(lignes.rows.map((ligne) => ligne.prix_centimes)).toEqual([1999, 1999]);
});
