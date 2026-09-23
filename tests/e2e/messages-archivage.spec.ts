/**
 * Archivage des messages par sélection, de bout en bout. LS-243.
 *
 * L'EXPLOITANTE VOULAIT SUPPRIMER SES MESSAGES, par sélection ou tous d'un
 * coup. Arbitrage de Christophe du 23 septembre 2026 : ils s'ARCHIVENT, rien ne
 * s'efface en base de production.
 *
 * CHAQUE PROJET DE LARGEUR POSE SES PROPRES MESSAGES, au statut `LU` : les
 * messages de `MESSAGES_TEST` sont partagés avec d'autres fichiers, et les
 * archiver les ferait disparaître sous leurs assertions. `LU` et non `NOUVEAU`,
 * pour ne pas déplacer le compte des non-lus que la pastille expose.
 *
 * « TOUT SÉLECTIONNER » N'EST PAS CLIQUÉ ICI, et c'est une limite assumée : dans
 * une base partagée, il archiverait les messages des autres fichiers. Son
 * effet sur les cases se lit dans le composant, dix lignes sans branche.
 */
import { Client } from "pg";

import { expect, test } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";

const ECRAN = "/administration/messages";

function sujets(projet: string) {
  return {
    premier: `TEST archivage premier ${projet}`,
    second: `TEST archivage second ${projet}`,
  } as const;
}

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

test.beforeEach(async ({}, infos) => {
  const { premier, second } = sujets(infos.project.name);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // Repartir d'un etat connu a chaque essai, relance comprise.
    await client.query("DELETE FROM message WHERE sujet = ANY($1)", [
      [premier, second],
    ]);
    for (const sujet of [premier, second]) {
      await client.query(
        `INSERT INTO message (id, nom, email, sujet, corps, statut, lu_a, cree_a)
         VALUES (gen_random_uuid(), 'TEST Camille', 'camille@exemple.invalid',
                 $1, 'Bonjour', 'LU', now(), now())`,
        [sujet],
      );
    }
  } finally {
    await client.end();
  }
});

test("archiver deux messages cochés les retire de la liste, le filtre les retrouve", async ({
  page,
}, infos) => {
  const { premier, second } = sujets(infos.project.name);

  await page.goto(ECRAN);

  await page
    .getByRole("checkbox", { name: `Sélectionner le message « ${premier} »` })
    .check();
  await page
    .getByRole("checkbox", { name: `Sélectionner le message « ${second} »` })
    .check();

  // Le nombre coche est dans le libelle : le bouton dit ce qu'il va faire.
  await page.getByRole("button", { name: "Archiver la sélection (2)" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "2 messages archivés." }),
  ).toBeVisible();
  await expect(page.getByText(premier)).toHaveCount(0);
  await expect(page.getByText(second)).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "Filtrer par statut" })
    .getByRole("link", { name: "Archivés" })
    .click();

  await expect(page.getByText(premier)).toBeVisible();

  await page
    .getByRole("checkbox", { name: `Sélectionner le message « ${premier} »` })
    .check();
  await page
    .getByRole("button", { name: "Désarchiver la sélection (1)" })
    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "1 message désarchivé." }),
  ).toBeVisible();

  await page.goto(ECRAN);
  await expect(page.getByText(premier)).toBeVisible();
  await expect(page.getByText(second)).toHaveCount(0);
});
