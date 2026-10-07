/**
 * Retirer plusieurs archivés d'un geste depuis la liste, LS-279.
 *
 * RIEN NE SE SUPPRIME EN BASE, LS-246 : le test relit les lignes après le
 * geste, elles existent et portent leur date de retrait.
 *
 * LA BASE DE BOUT EN BOUT EST PARTAGÉE : chaque largeur pose ses propres
 * archivés, remis à zéro avant chaque test, et seules leurs cases sont
 * cochées. « Tout sélectionner » n'est jamais cliqué, il agirait sur les
 * produits des autres fichiers.
 */
import { Client } from "pg";

import { expect, test, type Page } from "@playwright/test";

import {
  CATALOGUE_TEST,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";

const ARCHIVES = "/administration/produits?statut=ARCHIVE";

const RANG_PROJET: Record<string, number> = {
  "mobile-320": 1,
  "mobile-390": 2,
  "tablette-768": 3,
  "bureau-1280": 4,
};

function archives(projet: string) {
  const rang = RANG_PROJET[projet] ?? 9;
  return [1, 2].map((numero) => ({
    id: `e7a2b3c4-1279-4aaa-8888-0000000${numero}000${rang}`,
    nom: `TEST Retrait groupé ${numero} largeur ${rang}`,
    slug: `e2e-ls279-archive-${numero}-${rang}`,
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

async function datesDeRetrait(ids: string[]): Promise<(Date | null)[]> {
  return avecBase(async (client) => {
    const { rows } = await client.query<{ id: string; retire_a: Date | null }>(
      "SELECT id, retire_a FROM produit WHERE id = ANY($1::text[])",
      [ids],
    );
    expect(rows).toHaveLength(ids.length);
    return ids.map((id) => rows.find((ligne) => ligne.id === id)!.retire_a);
  });
}

async function debordement(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

test.beforeEach(async ({}, infos) => {
  await avecBase(async (client) => {
    for (const piece of archives(infos.project.name)) {
      await client.query(
        `INSERT INTO produit (id, categorie_id, nom, slug, statut, archive_a, cree_a, modifie_a)
         VALUES ($1, $2, $3, $4, 'ARCHIVE', now(), now(), now())
         ON CONFLICT (id) DO UPDATE SET retire_a = NULL`,
        [piece.id, CATALOGUE_TEST.categorieB.id, piece.nom, piece.slug],
      );
    }
  });
});

test("le retrait n'est proposé que dans la vue des archivés", async ({
  page,
}) => {
  await page.goto("/administration/produits");
  await expect(page.getByRole("button", { name: /^Publier \(/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Retirer de mon espace/ }),
  ).toHaveCount(0);

  await page.goto(ARCHIVES);
  await expect(
    page.getByRole("button", { name: "Retirer de mon espace (0)" }),
  ).toBeDisabled();
});

test("retirer deux archivés nomme chacun, puis les fait disparaître sans les effacer", async ({
  page,
}, infos) => {
  const pieces = archives(infos.project.name);
  await page.goto(ARCHIVES);

  for (const piece of pieces) {
    await page
      .getByRole("checkbox", { name: `Sélectionner ${piece.nom}` })
      .check();
  }
  await page.getByRole("button", { name: "Retirer de mon espace (2)" }).click();

  const dialogue = page.getByRole("alertdialog", {
    name: "Retirer ces 2 articles de votre espace ?",
  });
  await expect(dialogue).toBeFocused();
  for (const piece of pieces) {
    await expect(dialogue.getByRole("listitem")).toContainText([piece.nom]);
  }
  await expect(dialogue).toHaveAccessibleDescription(
    /Seul le développeur pourra les récupérer\./,
  );
  // Rien n'est parti avant la confirmation.
  expect(await datesDeRetrait(pieces.map((piece) => piece.id))).toEqual([
    null,
    null,
  ]);
  expect(await debordement(page)).toBeLessThanOrEqual(0);

  await dialogue.getByRole("button", { name: "Confirmer le retrait" }).click();

  const bilan = page.getByRole("status", { name: "Bilan de la sélection" });
  await expect(bilan).toContainText("2 produits retirés de votre espace.");
  // Le dialogue démonté, le focus va au bilan et jamais à `body`.
  await expect(bilan).toBeFocused();
  for (const piece of pieces) {
    await expect(page.getByRole("link", { name: piece.nom })).toHaveCount(0);
  }

  // Les lignes existent toujours, datées.
  for (const date of await datesDeRetrait(pieces.map((piece) => piece.id))) {
    expect(date).toBeInstanceOf(Date);
  }
});

/*
 * DEUX ONGLETS OUVERTS : l'article est retiré ailleurs pendant que la
 * confirmation est affichée. Le bilan dit « déjà retiré », jamais « n'existe
 * plus », qui contredirait la promesse que rien n'est effacé.
 */
test("un article retiré entre-temps est nommé, sans rien d'autre de changé", async ({
  page,
}, infos) => {
  const [piece] = archives(infos.project.name);
  await page.goto(ARCHIVES);
  await page
    .getByRole("checkbox", { name: `Sélectionner ${piece!.nom}` })
    .check();
  await page.getByRole("button", { name: "Retirer de mon espace (1)" }).click();

  await avecBase((client) =>
    client.query("UPDATE produit SET retire_a = now() WHERE id = $1", [
      piece!.id,
    ]),
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmer le retrait" })
    .click();

  const bilan = page.getByRole("status", { name: "Bilan de la sélection" });
  await expect(bilan).toContainText("Aucun produit n'a changé.");
  await expect(bilan).toContainText(
    `${piece!.nom} : déjà retiré de votre espace`,
  );
  await expect(bilan).not.toContainText("n'existe plus");
});

test("annuler ou Échap ne retire rien et rend le focus au bouton", async ({
  page,
}, infos) => {
  const [piece] = archives(infos.project.name);
  await page.goto(ARCHIVES);
  await page
    .getByRole("checkbox", { name: `Sélectionner ${piece!.nom}` })
    .check();

  const bouton = page.getByRole("button", {
    name: "Retirer de mon espace (1)",
  });
  await bouton.click();
  const dialogue = page.getByRole("alertdialog", {
    name: "Retirer cet article de votre espace ?",
  });
  await expect(dialogue).toHaveAccessibleDescription(
    /Seul le développeur pourra le récupérer\./,
  );
  await dialogue.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(bouton).toBeFocused();

  await bouton.click();
  await expect(dialogue).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(bouton).toBeFocused();

  expect(await datesDeRetrait([piece!.id])).toEqual([null]);
});

/*
 * L'ALIGNEMENT DE LA BARRE, défaut de la capture du 7 octobre : le bouton de
 * prix est sur la ligne de son champ, et les gestes de statut sur une même
 * ligne quand la largeur le permet.
 */
test("la barre aligne le champ prix et son bouton, sans débordement", async ({
  page,
}) => {
  await page.goto("/administration/produits");

  const champ = page.getByLabel("Prix pour la sélection, en euros");
  const boutonPrix = page.getByRole("button", { name: /^Appliquer ce prix/ });
  // `boundingBox` n'attend pas : la liste arrive sous un `<Suspense>`.
  await expect(boutonPrix).toBeVisible();
  const boiteChamp = (await champ.boundingBox())!;
  const boitePrix = (await boutonPrix.boundingBox())!;

  // Centres verticaux à un pixel près ; à 320 px le bouton peut passer
  // dessous, il commence alors sous le champ et à la même marge gauche.
  const centreChamp = boiteChamp.y + boiteChamp.height / 2;
  const centrePrix = boitePrix.y + boitePrix.height / 2;
  if (boitePrix.y < boiteChamp.y + boiteChamp.height) {
    expect(Math.abs(centreChamp - centrePrix)).toBeLessThanOrEqual(1);
    // Le bouton suit son champ, à l'écart d'un espacement : le défaut de la
    // capture était un libellé plus large que le champ qui l'en éloignait.
    expect(boitePrix.x - (boiteChamp.x + boiteChamp.width)).toBeLessThanOrEqual(
      12,
    );
  } else {
    expect(Math.abs(boitePrix.x - boiteChamp.x)).toBeLessThanOrEqual(1);
  }
  expect(boiteChamp.height).toBeGreaterThanOrEqual(44);
  expect(boitePrix.height).toBeGreaterThanOrEqual(44);

  const publier = (await page
    .getByRole("button", { name: /^Publier \(/ })
    .boundingBox())!;
  const archiver = (await page
    .getByRole("button", { name: /^Archiver \(/ })
    .boundingBox())!;
  if (archiver.y < publier.y + publier.height) {
    expect(Math.abs(publier.y - archiver.y)).toBeLessThanOrEqual(1);
  }

  expect(await debordement(page)).toBeLessThanOrEqual(0);
});
