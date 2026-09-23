/**
 * Produits archivés masqués de la vue par défaut, de bout en bout. LS-247.
 *
 * L'EXPLOITANTE VOULAIT SUPPRIMER SES ARCHIVES pour désencombrer sa liste, et
 * rien ne se supprime en base de production, arbitrage LS-246. La vue par
 * défaut les masquait déjà depuis LS-183, SANS LE DIRE : le filtre s'appelle
 * « Tous ». Ce fichier prouve que l'écran annonce le masquage et mène aux
 * archives en un clic.
 *
 * LE NOMBRE N'EST PAS FIGÉ dans les assertions : chaque projet de largeur pose
 * sa propre pièce archivée dans la même base, le total dépend donc de l'ordre
 * des projets. Le test vérifie la phrase, et que la pièce de SON projet est
 * atteignable par le lien.
 */
import { Client } from "pg";

import { expect, test } from "@playwright/test";

import {
  CATALOGUE_TEST,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";

const ECRAN = "/administration/produits";

/** Un rang par largeur, pour composer un UUID distinct et fixe. */
const RANG_PROJET: Record<string, number> = {
  "mobile-320": 1,
  "mobile-390": 2,
  "tablette-768": 3,
  "bureau-1280": 4,
};

function pieceArchivee(projet: string) {
  const rang = RANG_PROJET[projet] ?? 9;

  return {
    id: `b7a2b3c4-1247-4bbb-8888-00000000000${rang}`,
    nom: `TEST Pièce archivée ${rang}`,
    slug: `e2e-ls247-archivee-${rang}`,
  } as const;
}

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

test.beforeAll(async ({}, infos) => {
  const piece = pieceArchivee(infos.project.name);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      `INSERT INTO produit (id, categorie_id, nom, slug, statut, publie_a, archive_a, cree_a, modifie_a)
       VALUES ($1, $2, $3, $4, 'ARCHIVE', now(), now(), now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [piece.id, CATALOGUE_TEST.categorieB.id, piece.nom, piece.slug],
    );
  } finally {
    await client.end();
  }
});

test("la vue par défaut annonce les archivés qu'elle masque et y mène", async ({
  page,
}, infos) => {
  const piece = pieceArchivee(infos.project.name);

  await page.goto(ECRAN);

  // Masqué de la vue par défaut : le lien du produit n'y est pas.
  await expect(page.getByRole("link", { name: piece.nom })).toHaveCount(0);

  await expect(
    page.getByText(/produits? archivés? (est|sont) masqués? de cette vue\./),
  ).toBeVisible();

  await page.getByRole("link", { name: "Voir les archivés" }).click();

  await expect(page).toHaveURL(/statut=ARCHIVE/);
  await expect(page.getByRole("link", { name: piece.nom })).toBeVisible();
});
