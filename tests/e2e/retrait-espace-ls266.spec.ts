/**
 * Retirer un article archivé de l'espace d'administration, LS-266.
 *
 * RIEN NE SE SUPPRIME EN BASE, LS-246 : le test relit la ligne après le geste,
 * elle existe et porte sa date de retrait. La fiche rend ensuite 404 à
 * l'administration, même par son adresse.
 *
 * LA BASE DE BOUT EN BOUT EST PARTAGÉE : chaque largeur pose ses propres
 * produits, et le retrait est remis à zéro avant chaque test.
 */
import { Client } from "pg";

import { expect, test } from "@playwright/test";

import {
  CATALOGUE_TEST,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";

const RANG_PROJET: Record<string, number> = {
  "mobile-320": 1,
  "mobile-390": 2,
  "tablette-768": 3,
  "bureau-1280": 4,
};

function pieces(projet: string) {
  const rang = RANG_PROJET[projet] ?? 9;
  return {
    archivee: {
      id: `d7a2b3c4-1266-4aaa-8888-00000000010${rang}`,
      nom: `TEST Retrait archivée ${rang}`,
      slug: `e2e-ls266-archivee-${rang}`,
    },
    brouillon: {
      id: `d7a2b3c4-1266-4aaa-8888-00000000020${rang}`,
      nom: `TEST Retrait brouillon ${rang}`,
      slug: `e2e-ls266-brouillon-${rang}`,
    },
  };
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
  const { archivee, brouillon } = pieces(infos.project.name);
  await avecBase(async (client) => {
    await client.query(
      `INSERT INTO produit (id, categorie_id, nom, slug, statut, publie_a, archive_a, cree_a, modifie_a)
       VALUES ($1, $2, $3, $4, 'ARCHIVE', now(), now(), now(), now())
       ON CONFLICT (id) DO UPDATE SET retire_a = NULL`,
      [archivee.id, CATALOGUE_TEST.categorieB.id, archivee.nom, archivee.slug],
    );
    await client.query(
      `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
       VALUES ($1, $2, $3, $4, 'BROUILLON', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [brouillon.id, CATALOGUE_TEST.categorieB.id, brouillon.nom, brouillon.slug],
    );
  });
});

async function dateDeRetrait(id: string): Promise<Date | null> {
  return avecBase(async (client) => {
    const { rows } = await client.query<{ retire_a: Date | null }>(
      "SELECT retire_a FROM produit WHERE id = $1",
      [id],
    );
    expect(rows).toHaveLength(1);
    return rows[0]!.retire_a;
  });
}

test("retirer un archivé le fait disparaître de l'espace sans l'effacer", async ({
  page,
}, infos) => {
  const { archivee } = pieces(infos.project.name);
  await page.goto(`/administration/produits/${archivee.id}`);

  await page.getByRole("button", { name: "Retirer de mon espace" }).click();
  const dialogue = page.getByRole("alertdialog", {
    name: "Retirer cette fiche de votre espace ?",
  });
  await expect(dialogue).toBeFocused();
  await expect(dialogue).toHaveAccessibleDescription(
    /Seul le développeur pourra la récupérer\./,
  );
  await dialogue.getByRole("button", { name: "Retirer de mon espace" }).click();

  await expect(page).toHaveURL(/statut=ARCHIVE&retrait=1/);
  await expect(page.getByRole("status").filter({ hasText: "Fiche retirée" }))
    .toContainText("seul le développeur pourra la récupérer");
  await expect(page.getByRole("link", { name: archivee.nom })).toHaveCount(0);

  // La ligne existe toujours, datée.
  expect(await dateDeRetrait(archivee.id)).toBeInstanceOf(Date);

  // Introuvable par son adresse directe.
  const reponse = await page.goto(`/administration/produits/${archivee.id}`);
  expect(reponse?.status()).toBe(404);
});

test("annuler ne retire rien et rend le focus au bouton", async ({
  page,
}, infos) => {
  const { archivee } = pieces(infos.project.name);
  await page.goto(`/administration/produits/${archivee.id}`);

  const bouton = page.getByRole("button", { name: "Retirer de mon espace" });
  await bouton.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Annuler" })
    .click();

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(bouton).toBeFocused();
  expect(await dateDeRetrait(archivee.id)).toBeNull();
});

test("une fiche non archivée n'offre pas le retrait", async ({
  page,
}, infos) => {
  const { brouillon } = pieces(infos.project.name);
  await page.goto(`/administration/produits/${brouillon.id}`);

  await expect(
    page.getByRole("button", { name: "Archiver la fiche" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retirer de mon espace" }),
  ).toHaveCount(0);
});
