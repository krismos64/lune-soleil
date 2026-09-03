/**
 * La declaration de retractation, aux trois largeurs. LS-134, critere 8.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent les gardes sur base reelle, neuf mutations a l'appui ; ils
 * ne disent rien de ce que la personne VOIT ni de ce qu'elle peut ATTEINDRE.
 *
 * L'ARTICLE L221-21 EXIGE PRECISEMENT UNE ATTEIGNABILITE : la fonctionnalite
 * doit etre mise a disposition, pas seulement exister. Un ecran qu'aucun lien
 * ne designe ne la met pas a disposition, et l'article L221-20 sanctionne ce
 * defaut d'information par un delai porte a douze mois.
 *
 * LA NAVIGATION SE FAIT DONC AU CLIC, jamais par `goto`, lecon de LS-162 : un
 * test qui atteint l'ecran par son URL ne peut pas voir qu'il est orphelin.
 */
import "dotenv/config";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { readFileSync } from "node:fs";

import {
  FICHIER_EMAIL_VERIFIE,
  FICHIER_SESSION_VERIFIEE,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

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
 * La commande porte le nom du PROJET, sans quoi les trois largeurs se marchent
 * dessus : elles partagent le meme compte et la meme base. Piege en fiche.
 */
let numero: string;

test.beforeEach(async ({}, infos) => {
  const { email } = JSON.parse(
    readFileSync(FICHIER_EMAIL_VERIFIE, "utf-8"),
  ) as { email: string };

  numero = `C-TEST-134-${infos.project.name}`;

  await avecBase(async (client) => {
    /* Les lignes partent avant la commande, `ligne_commande` etant en
     * `RESTRICT` : l'ordre inverse leve une violation de cle etrangere. */
    await client.query(
      `DELETE FROM demande_retractation WHERE commande_id IN (
         SELECT id FROM commande WHERE numero = $1)`,
      [numero],
    );
    await client.query(
      `DELETE FROM envoi_en_attente WHERE commande_id IN (
         SELECT id FROM commande WHERE numero = $1)`,
      [numero],
    );
    await client.query(
      `DELETE FROM expedition WHERE commande_id IN (
         SELECT id FROM commande WHERE numero = $1)`,
      [numero],
    );
    await client.query(
      `DELETE FROM ligne_commande WHERE commande_id IN (
         SELECT id FROM commande WHERE numero = $1)`,
      [numero],
    );
    await client.query(`DELETE FROM commande WHERE numero = $1`, [numero]);

    /*
     * LA FIXTURE EST VOLONTAIREMENT DURE, ET C'EST CE QUI FAIT LA VALEUR DU
     * TEST DE DEBORDEMENT : nom long sans espace, montants a trois chiffres,
     * adresse a deux lignes. Un test qui mesure sur des valeurs courtes ne
     * peut pas voir le defaut qu'il pretend attraper.
     *
     * LE STATUT EST `LIVREE`, seul etat ou le delai court reellement.
     */
    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             dissocie_a, statut, adresse_livraison, adresse_facturation,
                             sous_total_centimes, mode_livraison, frais_port_centimes,
                             total_centimes, cgv_acceptees_a, cgv_version, cree_a)
       SELECT gen_random_uuid()::text, $1, u.email,
              'Marie-Christine de la Tour du Pin', u.id, NULL,
              'LIVREE'::"StatutCommande",
              '{"nom": "Marie-Christine de la Tour du Pin",
                "ligne1": "127 avenue des Pyrenees-Atlantiques",
                "ligne2": "Residence les Glycines, batiment C, appartement 42",
                "codePostal": "64000", "ville": "Pau", "pays": "France"}'::jsonb,
              '{}'::jsonb, 123456, 'DOMICILE', 700, 124156, now(), 'v1', now()
       FROM utilisateur u WHERE u.email = $2`,
      [numero, email],
    );

    await client.query(
      `INSERT INTO ligne_commande (id, commande_id, variante_id, reference_figee,
                                   libelle_produit_fige, libelle_variante_fige,
                                   prix_fige_centimes, quantite)
       SELECT gen_random_uuid()::text, c.id, NULL, 'REF-TEST-0134',
              'CollierAurorePendentifLapisLazuliDoreAlOrFin',
              'chaine de 45 centimetres, fermoir mousqueton',
              123456, 1
       FROM commande c WHERE c.numero = $1`,
      [numero],
    );

    /*
     * `livreA` EST POSE A HIER : le delai de quatorze jours court donc et reste
     * grand ouvert. C'est LS-131 qui renseignera cette colonne en production,
     * sur le seul evenement « remis au destinataire ».
     */
    await client.query(
      `INSERT INTO expedition (id, commande_id, transporteur, mode, expedie_a, livre_a, cree_a)
       SELECT gen_random_uuid()::text, c.id, 'Mondial Relay', 'DOMICILE'::"ModeLivraison",
              now() - interval '3 days', now() - interval '1 day', now()
       FROM commande c WHERE c.numero = $1`,
      [numero],
    );
  });
});

/** Atteint le formulaire AU CLIC depuis l'historique, jamais par son URL. */
async function ouvrirLaRetractation(page: import("@playwright/test").Page) {
  await page.goto("/compte/commandes");
  await page
    .getByRole("link", { name: new RegExp(numero) })
    .first()
    .click();
  await page.getByRole("link", { name: /Déclarer ma rétractation/i }).click();
}

test("le lien de retractation est atteignable au clic depuis la commande", async ({
  page,
}) => {
  await ouvrirLaRetractation(page);

  await expect(
    page.getByRole("heading", { name: /Me rétracter/i }),
  ).toBeVisible();
});

/*
 * LE MOTIF EST FACULTATIF, ET L'ECRAN DOIT LE DIRE. Une interface qui suggere
 * qu'il faut se justifier dissuade d'exercer un droit inconditionnel, article
 * L221-18. Le test verifie le mot ET l'absence de `required`.
 */
test("le motif est annonce facultatif et le champ n'est pas requis", async ({
  page,
}) => {
  await ouvrirLaRetractation(page);

  await expect(page.getByText(/facultatif/i)).toBeVisible();

  const motif = page.getByLabel(/Motif/i);
  await expect(motif).not.toHaveAttribute("required", /.*/);
});

/* LES FRAIS DE RETOUR SONT ANNONCES, article L221-23 : sans cette mention ils
 * reviennent au vendeur, et la charge de la preuve pese sur lui. */
test("les frais de retour sont annonces avant la confirmation", async ({
  page,
}) => {
  await ouvrirLaRetractation(page);

  await expect(page.getByText(/frais de retour/i).first()).toBeVisible();
});

/* CRITERE 8, l'etat de succes. Une demande SANS motif aboutit. */
test("une demande sans motif aboutit et affiche la confirmation", async ({
  page,
}) => {
  await ouvrirLaRetractation(page);

  await page
    .getByRole("button", { name: /Confirmer ma rétractation/i })
    .click();

  await expect(
    page.getByRole("heading", { name: /Votre rétractation est enregistrée/i }),
  ).toBeVisible();

  await avecBase(async (client) => {
    const { rows } = await client.query<{ statut: string }>(
      `SELECT d.statut FROM demande_retractation d
       JOIN commande c ON c.id = d.commande_id WHERE c.numero = $1`,
      [numero],
    );

    expect(rows[0]?.statut).toBe("DEPOSEE");
  });
});

/* CRITERE 8, aucun debordement horizontal, la largeur venant du projet. */
test("le formulaire ne deborde pas horizontalement", async ({ page }) => {
  await ouvrirLaRetractation(page);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le formulaire n'a aucune violation d'accessibilite detectable", async ({
  page,
}) => {
  await ouvrirLaRetractation(page);

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});

/*
 * L'ETAT « DEJA DEPOSEE », un des etats non nominaux du critere 8. Le lien
 * reste VISIBLE sur la commande, et c'est la page cible qui explique : le
 * masquer laisserait le client sans reponse sur un droit qu'il croit avoir.
 */
test("une seconde visite annonce la demande deja deposee", async ({ page }) => {
  await ouvrirLaRetractation(page);
  await page
    .getByRole("button", { name: /Confirmer ma rétractation/i })
    .click();
  await expect(
    page.getByRole("heading", { name: /Votre rétractation est enregistrée/i }),
  ).toBeVisible();

  await ouvrirLaRetractation(page);

  await expect(page.getByText(/déjà été enregistrée/i)).toBeVisible();
});
