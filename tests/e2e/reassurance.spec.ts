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
import { expect, test } from "@playwright/test";
import { Client } from "pg";

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

    const bandeau = page.getByRole("region", { name: "Engagements de la boutique" });
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
