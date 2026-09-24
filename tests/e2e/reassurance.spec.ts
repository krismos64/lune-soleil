/**
 * Bandeau de réassurance, de bout en bout. LS-236.
 *
 * LE MONTANT AFFICHÉ EST CONFRONTÉ À LA BASE, pas à une constante du test :
 * le seuil est lu dans `parametre_boutique` puis cherché sur la page. Écrire
 * « 39,00 » ici ferait comparer le code à lui-même, motif « garde-fou comparé
 * à lui-même », déjà en fiche sur ce dépôt. Le seuil n'est jamais MODIFIÉ par
 * ce test : d'autres fichiers en dépendent sur la base partagée.
 */
import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import { Client } from "pg";

import { CATALOGUE_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

async function seuilEnBase(): Promise<number | null> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<{ seuil: number | null }>(
      "SELECT seuil_franchise_centimes AS seuil FROM parametre_boutique WHERE id = true",
    );
    return rows[0]?.seuil ?? null;
  } finally {
    await client.end();
  }
}

const euros = (centimes: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })
    .format(centimes / 100)
    .replace(/\s/g, " ");

for (const chemin of ["/", "/notre-univers"]) {
  test(`${chemin} porte le bandeau, au seuil configuré, sans débordement`, async ({
    page,
  }) => {
    const seuil = await seuilEnBase();
    await page.goto(chemin);

    const bandeau = page.getByRole("region", {
      name: "Engagements de la boutique",
    });
    await expect(bandeau).toBeVisible();

    const texte = ((await bandeau.textContent()) ?? "").replace(/\s/g, " ");

    expect(texte).toMatch(/Faits main en Béarn/);
    expect(texte).toMatch(/Frais de retour à votre charge/);

    if (seuil !== null) {
      expect(texte).toContain(`Livraison offerte dès ${euros(seuil)}`);
      expect(texte).toMatch(/En Point Relais et Locker/);
    }

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );

    const resultat = await new AxeBuilder({ page })
      .include('[aria-label="Engagements de la boutique"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      resultat.violations.map((v) => `${v.id} (${v.impact}) : ${v.help}`),
    ).toEqual([]);
  });
}

/*
 * LS-251, LA MEME REASSURANCE SUR LA FICHE, LE PANIER ET LE TUNNEL.
 *
 * Chaque ecran porte un SOUS-ENSEMBLE du bandeau, arbitrage du 24 septembre
 * 2026 : ce qui se verifie ici est que chacun porte le sien, avec le texte du
 * composant et au seuil de la base, sans deborder.
 */
const CHEMIN_FICHE = `/produit/${CATALOGUE_TEST.enStock.slug}`;

async function sansDefautAccessible(page: Page, nom: string): Promise<void> {
  const resultat = await new AxeBuilder({ page })
    .include(`[aria-label="${nom}"]`)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    resultat.violations.map((v) => `${v.id} (${v.impact}) : ${v.help}`),
  ).toEqual([]);
}

async function remplirLePanier(page: Page): Promise<void> {
  await page.goto(CHEMIN_FICHE);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(
    page.getByRole("status", { name: "Ajout au panier" }),
  ).toHaveText("Ajouté au panier.");
}

test("la fiche porte la livraison et sa gratuité au bloc 7, et rien d'autre", async ({
  page,
}) => {
  const seuil = await seuilEnBase();
  await page.goto(CHEMIN_FICHE);

  const bloc = page.getByRole("region", { name: "Informations de livraison" });
  await expect(bloc).toBeVisible();

  const texte = ((await bloc.textContent()) ?? "").replace(/\s/g, " ");
  expect(texte).toMatch(/Livraison Mondial Relay/);
  if (seuil !== null) {
    expect(texte).toContain(`Livraison offerte dès ${euros(seuil)}`);
    expect(texte).toMatch(/le domicile reste payant/);
  }

  // Le bandeau entier n'entre pas dans la zone d'achat.
  expect(texte).not.toMatch(/Faits main|Stripe|14 jours/);
  await expect(
    page.getByRole("region", { name: "Engagements de la boutique" }),
  ).toHaveCount(0);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
  await sansDefautAccessible(page, "Informations de livraison");
});

test("le panier porte le bandeau entier, sous le bouton de commande", async ({
  page,
}) => {
  await remplirLePanier(page);
  await page.goto("/panier");

  const bandeau = page.getByRole("region", {
    name: "Engagements de la boutique",
  });
  await expect(bandeau).toBeVisible();
  const texte = ((await bandeau.textContent()) ?? "").replace(/\s/g, " ");
  expect(texte).toMatch(/Faits main en Béarn/);
  expect(texte).toMatch(/Frais de retour à votre charge/);

  /*
   * APRES LE BOUTON ET NON AVANT : a 320 px, six elements places entre le
   * total et « Passer la commande » repousseraient l'action principale de
   * pres de 500 px. La position se mesure, un ordre DOM ne suffisant pas a
   * dire ce qui s'affiche au-dessus.
   */
  const bouton = await page
    .getByRole("link", { name: "Passer la commande" })
    .boundingBox();
  const boite = await bandeau.boundingBox();
  expect(bouton).not.toBeNull();
  expect(boite).not.toBeNull();
  expect(boite!.y).toBeGreaterThan(bouton!.y);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
  await sansDefautAccessible(page, "Engagements de la boutique");
});

test("le tunnel porte le paiement, la rétractation et le contact", async ({
  page,
}) => {
  await remplirLePanier(page);
  await page.goto("/commande");

  const bandeau = page.getByRole("region", {
    name: "Engagements de la boutique",
  });
  await expect(bandeau).toBeVisible();
  await expect(bandeau.getByRole("listitem")).toHaveCount(3);

  const texte = ((await bandeau.textContent()) ?? "").replace(/\s/g, " ");
  expect(texte).toMatch(/Paiement sécurisé/);
  expect(texte).toMatch(/14 jours pour changer d.avis\s*Frais de retour/);
  expect(texte).toMatch(/Réponse par email/);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
  await sansDefautAccessible(page, "Engagements de la boutique");
});
