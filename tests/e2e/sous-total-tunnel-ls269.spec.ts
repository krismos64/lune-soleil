/**
 * Le sous-total affiché au récapitulatif est confronté à la commande, LS-269.
 *
 * LE SCÉNARIO DU TICKET : le client lit son récapitulatif, l'exploitante change
 * le prix de la pièce, le client clique « Commander ». Aucune commande ne doit
 * partir, et l'écran doit dire le nouveau montant puis le réafficher.
 *
 * LA BASE DE BOUT EN BOUT EST PARTAGÉE : changer le prix de
 * `CATALOGUE_TEST.enStock` casserait la fiche et le panier des fichiers
 * voisins. Ce fichier pose donc SA pièce, une par largeur puisque les quatre
 * projets tournent en parallèle, et remet son prix de départ avant chaque
 * test. Elle est `ACTIF`, faute de quoi `revalider` la déclare invendable ; sa
 * date de publication ancienne la range en fin de catalogue, et les tests du
 * catalogue mesurent des rangs relatifs depuis LS-232.
 */
import { Client } from "pg";

import { expect, test, type Page } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";

const RANG_PROJET: Record<string, number> = {
  "mobile-320": 1,
  "mobile-390": 2,
  "tablette-768": 3,
  "bureau-1280": 4,
};

const PRIX_AFFICHE = 2490;
const PRIX_REVISE = 3490;

function piece(projet: string) {
  const rang = RANG_PROJET[projet] ?? 9;
  return {
    produitId: `c9a2b3c4-1269-4ccc-8888-00000000000${rang}`,
    varianteId: `c9a2b3c4-1269-4ddd-8888-00000000000${rang}`,
    nom: `TEST Sous-total largeur ${rang}`,
    slug: `e2e-ls269-sous-total-${rang}`,
    reference: `TEST-LS269-${rang}`,
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

async function poserPrix(varianteId: string, prixCentimes: number) {
  await avecBase((client) =>
    client.query("UPDATE variante SET prix_centimes = $1 WHERE id = $2", [
      prixCentimes,
      varianteId,
    ]),
  );
}

/** Mène le tunnel jusqu'au récapitulatif, au domicile. */
async function allerAuRecapitulatif(page: Page) {
  await page.goto("/commande");
  await page.getByLabel("Nom et prénom").fill("Camille Dupont");
  await page.getByLabel("Adresse email").fill("camille.dupont@exemple.test");
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByLabel("Adresse", { exact: true }).fill("12 rue des Ateliers");
  await page.getByLabel("Code postal").fill("35000");
  await page.getByLabel("Ville").fill("Rennes");
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByRole("radio", { name: "À domicile" }).check();
  // Le bouton reste inactif tant que le rendu n'a pas levé `disabled`.
  await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(
    page.getByRole("heading", { name: "Vérifier votre commande" }),
  ).toBeVisible();
}

/** La ligne « Sous-total » du récapitulatif, montant compris. */
function ligneSousTotal(page: Page) {
  return page.locator("p").filter({ hasText: /^Sous-total/ });
}

test.beforeEach(async ({ context, page }, infos) => {
  const { produitId, varianteId, nom, slug, reference } = piece(
    infos.project.name,
  );

  await avecBase(async (client) => {
    await client.query(
      `INSERT INTO produit (id, categorie_id, nom, slug, statut, publie_a, cree_a, modifie_a)
       VALUES ($1, $2, $3, $4, 'ACTIF', '2026-01-01T10:00:00Z', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [produitId, CATALOGUE_TEST.categorieB.id, nom, slug],
    );

    await client.query(
      `INSERT INTO variante (
         id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a
       )
       VALUES ($1, $2, $3, 'Déclinaison', $4, 5, 0, true, now())
       ON CONFLICT (id) DO UPDATE SET prix_centimes = EXCLUDED.prix_centimes`,
      [varianteId, produitId, reference, PRIX_AFFICHE],
    );
  });

  await context.clearCookies();
  await page.goto(`/produit/${slug}`);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(
    page.getByRole("status", { name: "Ajout au panier" }),
  ).toHaveText("Ajouté au panier.");
});

test.afterEach(async ({}, infos) => {
  await poserPrix(piece(infos.project.name).varianteId, PRIX_AFFICHE);
});

test("un prix revu pendant le recapitulatif est annonce et rien n'est commande", async ({
  page,
}, infos) => {
  const { varianteId } = piece(infos.project.name);

  await allerAuRecapitulatif(page);
  await expect(ligneSousTotal(page)).toContainText("24,90");

  // L'exploitante revoit le prix APRÈS que le client a lu son récapitulatif.
  await poserPrix(varianteId, PRIX_REVISE);

  await page
    .getByRole("button", { name: "Commander avec obligation de paiement" })
    .click();

  /*
   * LE NOUVEAU MONTANT EST DIT, et le client reste sur le récapitulatif :
   * aucune redirection vers le prestataire ni vers la confirmation.
   */
  await expect(
    page.getByRole("alert", { name: "Erreurs de saisie" }),
  ).toContainText(
    /Le montant de vos pièces vient de changer et s'élève désormais à 34,90/,
  );
  await expect(page).toHaveURL(/\/commande/);
  await expect(page).not.toHaveURL(/confirmation/);

  // LE RÉCAPITULATIF EST REDESSINÉ au nouveau prix, `router.refresh()`.
  await expect(ligneSousTotal(page)).toContainText("34,90");

  /*
   * AUCUNE RÉSERVATION SUR LA PIÈCE : la transaction a été annulée. C'est
   * l'identité de la variante qui est vérifiée, pas un compte global de la
   * table, partagée avec les fichiers voisins.
   */
  const { rows } = await avecBase((client) =>
    client.query<{ reservee: number }>(
      "SELECT quantite_reservee AS reservee FROM variante WHERE id = $1",
      [varianteId],
    ),
  );
  expect(rows[0]?.reservee).toBe(0);
});
