/**
 * Publier ou archiver plusieurs produits d'un geste, de bout en bout. LS-242.
 *
 * CHAQUE PROJET DE LARGEUR POSE SES PROPRES PRODUITS ARCHIVÉS, sans variante :
 * ils ne peuvent donc pas être publiés, et c'est le cas qui compte. Une
 * publication groupée qui les publierait aurait contourné la garde du geste
 * unitaire.
 *
 * AUCUN STATUT NE CHANGE PENDANT CE TEST, et c'est une contrainte de la base
 * partagée, mesurée : une première version archivait des brouillons, et
 * `navigation-administration.spec.ts`, qui additionne les vues du catalogue
 * sur une autre largeur au même moment, a compté 12 au lieu de 14. Le succès
 * d'une action groupée est prouvé en intégration ; ici, les deux refus.
 *
 * « TOUT SÉLECTIONNER » N'EST PAS CLIQUÉ, même raison qu'en LS-243 : dans une
 * base partagée, il agirait sur les produits des autres fichiers.
 */
import { Client } from "pg";

import { expect, test } from "@playwright/test";

import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";
import {
  CATALOGUE_TEST,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";

const ECRAN = "/administration/produits";

const RANG_PROJET: Record<string, number> = {
  "mobile-320": 1,
  "mobile-390": 2,
  "tablette-768": 3,
  "bureau-1280": 4,
};

function brouillons(projet: string) {
  const rang = RANG_PROJET[projet] ?? 9;

  return [1, 2].map((numero) => ({
    id: `c7a2b3c4-1242-4ccc-8888-0000000${numero}000${rang}`,
    nom: `TEST Archivé ${numero} largeur ${rang}`,
    slug: `e2e-ls242-archive-${numero}-${rang}`,
  }));
}

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

test.beforeEach(async ({}, infos) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const piece of brouillons(infos.project.name)) {
      await client.query(
        `INSERT INTO produit (id, categorie_id, nom, slug, statut, archive_a, cree_a, modifie_a)
         VALUES ($1, $2, $3, $4, 'ARCHIVE', now(), now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [piece.id, CATALOGUE_TEST.categorieB.id, piece.nom, piece.slug],
      );
    }
  } finally {
    await client.end();
  }
});

test("une action groupée refuse ce qu'elle ne peut pas faire, et dit pourquoi", async ({
  page,
}, infos) => {
  const [premier, second] = brouillons(infos.project.name);

  await page.goto(`${ECRAN}?statut=ARCHIVE`);

  async function cocher() {
    for (const piece of [premier!, second!]) {
      await page
        .getByRole("checkbox", { name: `Sélectionner ${piece.nom}` })
        .check();
    }
  }

  await cocher();
  await page.getByRole("button", { name: "Publier (2)" }).click();

  const bilan = page.getByRole("status", { name: "Bilan de la sélection" });
  await expect(bilan).toContainText("Aucun produit n'a changé.");
  await expect(bilan).toContainText(`${premier!.nom} : aucune déclinaison`);
  await expect(bilan).toContainText(`${second!.nom} : aucune déclinaison`);

  await cocher();
  const boutonArchiver = page.getByRole("button", { name: "Archiver (2)" });
  await boutonArchiver.click();

  /*
   * LS-278 : L'ARCHIVAGE GROUPÉ NOMME CE QU'IL VA FAIRE AVANT DE PARTIR. Le
   * 4 octobre 2026, un seul clic sans confirmation a vidé la boutique.
   */
  const confirmation = page.getByRole("alertdialog", {
    name: "Archiver ces 2 articles\u202F?",
  });
  await expect(confirmation).toBeFocused();
  await expect(confirmation).toContainText(premier!.nom);
  await expect(confirmation).toContainText(second!.nom);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  // Annuler n'envoie rien et rend le focus au bouton.
  await confirmation.getByRole("button", { name: "Annuler" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(boutonArchiver).toBeFocused();
  await expect(bilan).not.toContainText("déjà dans cet état");

  await boutonArchiver.click();
  await confirmation
    .getByRole("button", { name: "Confirmer l'archivage" })
    .click();
  await expect(bilan).toContainText(`${premier!.nom} : déjà dans cet état`);

  // Toujours archives, donc toujours dans cette vue.
  await expect(page.getByRole("link", { name: premier!.nom })).toBeVisible();
});
