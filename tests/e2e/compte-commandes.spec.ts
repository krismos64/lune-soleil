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
     * LA COMMANDE EST RECREEE A CHAQUE EXECUTION, jamais conservee.
     *
     * `ON CONFLICT DO NOTHING` seul ne suffisait pas : une fixture DURCIE ne
     * remplaçait jamais l'ancienne, restee en base depuis l'execution
     * precedente, et onze tests rougissaient en cherchant des valeurs que la
     * ligne conservee ne portait pas. La cause designee, un rendu fautif,
     * n'etait pas la vraie.
     *
     * LES LIGNES PARTENT AVANT LA COMMANDE, `ligne_commande` etant en
     * `RESTRICT` : l'ordre inverse leve une violation de cle etrangere.
     */
    await client.query(
      `DELETE FROM ligne_commande WHERE commande_id IN (
         SELECT id FROM commande WHERE numero = $1)`,
      [numero],
    );
    await client.query(`DELETE FROM commande WHERE numero = $1`, [numero]);

    /*
     * LA COMMANDE EST RATTACHEE DES SA CREATION, `utilisateur_id` renseigne :
     * ce fichier mesure l'HISTORIQUE, pas le rattachement, qui a son propre
     * fichier. Une commande invitee n'apparaitrait pas ici, et le test
     * rougirait sur un comportement correct.
     *
     * `ON CONFLICT` SUR LE NUMERO, unique : la relance suivante reutilise la
     * ligne plutot que d'echouer, meme motif que `commande.setup.ts`.
     */
    /*
     * LA FIXTURE EST VOLONTAIREMENT DURE, ET C'EST CE QUI FAIT LA VALEUR DU
     * TEST DE DEBORDEMENT. La premiere version portait « Client verifie »,
     * « 1 rue du Test » et 49,99 € : un test qui mesure le debordement sur des
     * valeurs courtes ne peut pas voir le defaut qu'il pretend attraper, motif
     * du controle qui n'a jamais echoue. Releve par la revue frontend.
     *
     * Trois durcissements, chacun visant une colonne differente a 320 px :
     *
     *   nom de produit  quarante caracteres SANS espace, le seul cas qu'aucun
     *                   `overflow-wrap` par defaut ne casse
     *   montants        trois chiffres avant la virgule, 1 234,56 €
     *   adresse         une `ligne2`, un nom long, un pays ecrit en toutes
     *                   lettres
     */
    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             dissocie_a, adresse_livraison, adresse_facturation,
                             sous_total_centimes, mode_livraison, frais_port_centimes,
                             total_centimes, cgv_acceptees_a, cgv_version, cree_a)
       SELECT gen_random_uuid()::text, $1, u.email,
              'Marie-Christine de la Tour du Pin', u.id, NULL,
              '{"nom": "Marie-Christine de la Tour du Pin",
                "ligne1": "127 avenue des Pyrenees-Atlantiques",
                "ligne2": "Residence les Glycines, batiment C, appartement 42",
                "codePostal": "64000", "ville": "Pau", "pays": "France"}'::jsonb,
              '{}'::jsonb, 123456, 'DOMICILE', 700, 124156, now(), 'v1', now()
       FROM utilisateur u WHERE u.email = $2
`,
      [numero, email],
    );

    /*
     * UNE LIGNE AU LIBELLE LONG SANS ESPACE. `varianteId` reste nul, la
     * colonne etant nullable pour que la ligne survive a sa variante : ce
     * fichier mesure un RENDU, il n'a pas besoin d'un produit au catalogue.
     */
    await client.query(
      `INSERT INTO ligne_commande (id, commande_id, variante_id, reference_figee,
                                   libelle_produit_fige, libelle_variante_fige,
                                   prix_fige_centimes, quantite)
       SELECT gen_random_uuid()::text, c.id, NULL, 'REF-TEST-0057',
              'CollierAurorePendentifLapisLazuliDoreAlOrFin',
              'chaine de 45 centimetres, fermoir mousqueton',
              123456, 1
       FROM commande c WHERE c.numero = $1
`,
      [numero],
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

  /*
   * LES MONTANTS VIENNENT DES COLONNES FIGEES, invariant 3 : 123456 + 700 =
   * 124156. Trois chiffres avant la virgule, ce qui exerce la colonne de
   * montants a 320 px.
   *
   * L'ESPACE EST INSECABLE dans la sortie de `Intl.NumberFormat`, motif deja en
   * fiche : `getByText` avec une chaine portant un espace ordinaire ne
   * trouverait rien. Le motif souple evite d'ecrire le caractere en dur.
   */
  /*
   * `.first()` PARCE QUE LE SOUS-TOTAL APPARAIT DEUX FOIS, dans la ligne
   * d'article et dans le recapitulatif : la commande ne porte qu'un exemplaire.
   * C'est le rendu attendu, et un selecteur strict le refusait pour ambiguite.
   */
  await expect(page.getByText(/1\s?234,56/).first()).toBeVisible();
  await expect(page.getByText(/1\s?241,56/)).toBeVisible();

  // L'ADRESSE FIGEE EST CELLE DU JOUR DE LA COMMANDE, jamais le carnet actuel,
  // et sa `ligne2` doit apparaitre.
  await expect(page.getByText("127 avenue des Pyrenees")).toBeVisible();
  await expect(page.getByText(/Residence les Glycines/)).toBeVisible();
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
