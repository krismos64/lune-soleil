/**
 * L'historique des commandes et l'acces aux documents, aux trois largeurs.
 * LS-57, critere 6.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent les gardes sur base reelle, sept mutations a l'appui ; ils
 * ne disent rien de ce que la personne VOIT ni de ce qu'elle peut ATTEINDRE.
 *
 * LA NAVIGATION SE FAIT AU CLIC, jamais par `goto`, et c'est la lecon de
 * LS-162 puis de `/compte/verification` : un ecran qu'aucun lien ne designe est
 * inatteignable, et un test qui y arrive par son URL ne peut pas le voir.
 *
 * LE TEST NEGATIF DE SECURITE EST ICI AUSSI, sous sa forme d'ecran : la
 * commande d'un tiers rend 404 et non 403, un 403 revelant son existence.
 */
import "dotenv/config";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

import {
  FICHIER_EMAIL_VERIFIE,
  FICHIER_SESSION_VERIFIEE,
} from "./chemin-session";
import { readFileSync } from "node:fs";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * Ouvre une connexion, execute, ferme. Le `finally` est ce qui compte : une
 * connexion laissee ouverte par un test en echec epuise le pool et fait rougir
 * les fichiers suivants, loin de la cause.
 */
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

test.use({ storageState: FICHIER_SESSION_VERIFIEE });

/**
 * La commande de ce fichier porte le nom du PROJET, et sans cela les trois
 * largeurs se marchent dessus : elles partagent le meme compte, ouvert une
 * fois par le projet `preparation` pour ne pas saturer le plafond
 * d'inscription, ET la meme base. Piege deja en fiche sur ce depot.
 */
let numero: string;

test.beforeEach(async ({}, infos) => {
  const { email } = JSON.parse(
    readFileSync(FICHIER_EMAIL_VERIFIE, "utf-8"),
  ) as { email: string };

  numero = `C-TEST-57-${infos.project.name}`;

  await avecBase(async (client) => {
    /*
     * LA COMMANDE EST RATTACHEE DES SA CREATION, `utilisateur_id` renseigne :
     * ce fichier mesure l'HISTORIQUE, pas le rattachement, qui a son propre
     * fichier. Une commande invitee n'apparaitrait pas ici, et le test
     * rougirait sur un comportement correct.
     *
     * `ON CONFLICT` SUR LE NUMERO, unique : la relance suivante reutilise la
     * ligne plutot que d'echouer, meme motif que `commande.setup.ts`.
     */
    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             dissocie_a, adresse_livraison, adresse_facturation,
                             sous_total_centimes, mode_livraison, frais_port_centimes,
                             total_centimes, cgv_acceptees_a, cgv_version, cree_a)
       SELECT gen_random_uuid()::text, $1, u.email, 'Client verifie', u.id, NULL,
              '{"nom": "Client verifie", "ligne1": "1 rue du Test",
                "codePostal": "64000", "ville": "Pau", "pays": "FR"}'::jsonb,
              '{}'::jsonb, 4500, 'DOMICILE', 499, 4999, now(), 'v1', now()
       FROM utilisateur u WHERE u.email = $2
       ON CONFLICT (numero) DO NOTHING`,
      [numero, email],
    );
  });
});

test("l'historique s'atteint au clic depuis le compte", async ({ page }) => {
  /*
   * AU CLIC ET NON PAR `goto`. Sans ce lien, `/compte/commandes` serait
   * inatteignable autrement qu'en saisissant l'URL, defaut exact de LS-162 et
   * de `/compte/verification`. Un test qui y arrive par son URL ne peut pas
   * voir ce defaut.
   */
  await page.goto("/compte");

  await page.getByRole("link", { name: "Voir mes commandes" }).click();

  await expect(
    page.getByRole("heading", { name: "Mes commandes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Commande ${numero}` }),
  ).toBeVisible();
});

test("le detail s'atteint au clic et affiche les montants figes", async ({
  page,
}) => {
  await page.goto("/compte/commandes");

  await page.getByRole("link", { name: `Commande ${numero}` }).click();

  await expect(
    page.getByRole("heading", { name: `Commande ${numero}` }),
  ).toBeVisible();

  // LES MONTANTS VIENNENT DES COLONNES FIGEES, invariant 3 : 4500 + 499 = 4999.
  await expect(page.getByText("49,99 €")).toBeVisible();
  await expect(page.getByText("4,99 €")).toBeVisible();

  // L'ADRESSE FIGEE EST CELLE DU JOUR DE LA COMMANDE, jamais le carnet actuel.
  await expect(page.getByText("1 rue du Test")).toBeVisible();
});

test("aucune facture n'est annoncee avant le paiement", async ({ page }) => {
  /*
   * TROIS ETATS DISTINCTS a l'ecran, et celui-ci est le premier : la commande
   * est `EN_ATTENTE_PAIEMENT`, aucune facture n'existe. Le dire explicitement
   * evite qu'un client croie a un oubli.
   */
  await page.goto("/compte/commandes");
  await page.getByRole("link", { name: `Commande ${numero}` }).click();

  await expect(
    page.getByText("La facture sera disponible ici une fois le paiement"),
  ).toBeVisible();
});

test("la commande d'un tiers rend 404 et non 403", async ({ page }) => {
  /*
   * TEST NEGATIF DE SECURITE, critere 4, vu de l'ecran. L'identifiant est
   * syntaxiquement valide et ne designe aucune commande de ce compte.
   *
   * 404 ET NON 403 : un 403 signifierait « cette commande existe mais vous n'y
   * avez pas droit », ce qui revele son existence. Le refus est indiscernable
   * d'une commande inexistante, invariant 2.
   */
  const reponse = await page.goto(
    "/compte/commandes/00000000-0000-4000-8000-000000000000",
  );

  expect(reponse?.status()).toBe(404);
});

test("la facture d'un tiers rend 404, jamais le fichier", async ({ page }) => {
  const reponse = await page.request.get(
    "/compte/commandes/00000000-0000-4000-8000-000000000000/facture",
  );

  expect(reponse.status()).toBe(404);
  // AUCUN PDF NE SORT : verifier le seul statut laisserait passer une reponse
  // 404 qui porterait malgre tout le document.
  expect(reponse.headers()["content-type"]).not.toContain("application/pdf");
});

test("l'historique ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/compte/commandes");
  await expect(
    page.getByRole("heading", { name: "Mes commandes", exact: true }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le detail ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/compte/commandes");
  await page.getByRole("link", { name: `Commande ${numero}` }).click();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation axe-core sur les deux ecrans", async ({ page }) => {
  await page.goto("/compte/commandes");
  await expect(
    page.getByRole("heading", { name: "Mes commandes", exact: true }),
  ).toBeVisible();

  const liste = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(liste.violations).toEqual([]);

  await page.getByRole("link", { name: `Commande ${numero}` }).click();
  await expect(
    page.getByRole("heading", { name: `Commande ${numero}` }),
  ).toBeVisible();

  const detail = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(detail.violations).toEqual([]);
});
