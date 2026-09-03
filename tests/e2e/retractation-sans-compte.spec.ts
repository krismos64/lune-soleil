/**
 * La retractation SANS COMPTE, par lien signe. LS-134, critere 1.
 *
 * CE QUE CE FICHIER PROUVE. La revue critique du 3 septembre 2026 a montre que
 * le chemin sans compte etait mort-ne : le service l'annoncait, aucune route ne
 * l'exposait. Ce fichier verifie qu'un acheteur sans compte atteint reellement
 * la fonctionnalite, ce que l'article L221-21 impose.
 *
 * AUCUNE SESSION ICI, et c'est le point : `test.use` ne charge aucun
 * `storageState`. Un test qui hériterait d'une session prouverait le chemin
 * deja couvert par `compte-retractation.spec.ts` et laisserait celui-ci
 * invisible.
 *
 * LE JETON EST POSE EN BASE PAR LE TEST, comme le fait la production a la
 * confirmation : la valeur en clair n'existe qu'a sa creation, regle L5.
 */
import "dotenv/config";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

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

/** Aucune session : c'est tout l'objet de ce fichier. */
test.use({ storageState: { cookies: [], origins: [] } });

let numero: string;
let valeurJeton: string;

/**
 * Engendre un jeton comme la production, sans importer le module applicatif.
 *
 * PLAYWRIGHT NE PARTAGE PAS LE RUNTIME DE L'APPLICATION : l'import de
 * `@/lib/jeton-acces` y est indisponible. Le test rejoue donc exactement la
 * derivation de `src/lib/jeton-acces.ts`, et un ecart la ferait echouer de
 * facon visible plutot que silencieuse.
 *
 * LA CLE EST DERIVEE, ELLE N'EST PAS LE SECRET : `HMAC(secret, "document-v1")`
 * produit la cle qui signe ensuite l'alea. Signer directement avec le secret,
 * ce que la premiere version de ce fichier faisait, produit une valeur que le
 * serveur refuse.
 */
async function engendrerJetonLocal(): Promise<{
  valeur: string;
  empreinte: string;
}> {
  const { createHash, createHmac, randomBytes } = await import("node:crypto");

  const secret = process.env.BETTER_AUTH_SECRET;

  if (secret === undefined || secret === "") {
    throw new Error("BETTER_AUTH_SECRET absente, le jeton ne peut etre signe");
  }

  const cle = createHmac("sha256", secret).update("document-v1").digest();

  const alea = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", cle).update(alea).digest("base64url");
  const valeur = `${alea}.${signature}`;

  return {
    valeur,
    empreinte: createHash("sha256").update(valeur).digest("hex"),
  };
}

test.beforeEach(async ({}, infos) => {
  numero = `C-TEST-134J-${infos.project.name}`;

  await avecBase(async (client) => {
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
      `DELETE FROM jeton_acces WHERE commande_id IN (
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
     * `utilisateur_id` RESTE NUL : c'est une commande passee SANS COMPTE, le
     * cas que ce fichier existe pour couvrir. La renseigner rendrait le test
     * indistinguable de celui de l'espace client.
     */
    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             statut, adresse_livraison, adresse_facturation,
                             sous_total_centimes, mode_livraison, frais_port_centimes,
                             total_centimes, cgv_acceptees_a, cgv_version, cree_a)
       VALUES (gen_random_uuid()::text, $1, 'invite@example.invalid',
               'Client sans compte', NULL, 'LIVREE'::"StatutCommande",
               '{"nom": "Client sans compte", "ligne1": "1 rue de Test",
                 "codePostal": "64000", "ville": "Pau", "pays": "France"}'::jsonb,
               '{}'::jsonb, 4900, 'DOMICILE', 499, 5399, now(), 'v1', now())`,
      [numero],
    );

    await client.query(
      `INSERT INTO ligne_commande (id, commande_id, variante_id, reference_figee,
                                   libelle_produit_fige, libelle_variante_fige,
                                   prix_fige_centimes, quantite)
       SELECT gen_random_uuid()::text, c.id, NULL, 'REF-TEST-134J',
              'Collier Aurore', 'chaine de 45 centimetres', 4900, 1
       FROM commande c WHERE c.numero = $1`,
      [numero],
    );

    await client.query(
      `INSERT INTO expedition (id, commande_id, transporteur, mode, expedie_a, livre_a, cree_a)
       SELECT gen_random_uuid()::text, c.id, 'Mondial Relay', 'DOMICILE'::"ModeLivraison",
              now() - interval '3 days', now() - interval '1 day', now()
       FROM commande c WHERE c.numero = $1`,
      [numero],
    );

    const jeton = await engendrerJetonLocal();
    valeurJeton = jeton.valeur;

    await client.query(
      `INSERT INTO jeton_acces (id, commande_id, empreinte, portee, expire_a)
       SELECT $1, c.id, $2, 'RETRACTATION'::"PorteeJeton", now() + interval '60 days'
       FROM commande c WHERE c.numero = $3`,
      [randomUUID(), jeton.empreinte, numero],
    );
  });
});

test("un client sans compte atteint le formulaire par son lien signe", async ({
  page,
}) => {
  await page.goto(`/retractation/${valeurJeton}`);

  await expect(
    page.getByRole("heading", { level: 1, name: /Me rétracter/i }),
  ).toBeVisible();
  await expect(page.getByText(/facultatif/i)).toBeVisible();
});

test("une demande sans motif aboutit sans aucune session", async ({ page }) => {
  await page.goto(`/retractation/${valeurJeton}`);
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

/*
 * LE TEST NEGATIF DE SECURITE A L'ECRAN. Un jeton forge rend 404 et non une
 * page de refus : un « acces refuse » revelerait qu'une commande existe.
 */
test("un jeton forge rend 404, sans rien reveler", async ({ page }) => {
  const forge = await engendrerJetonLocal();
  const reponse = await page.goto(`/retractation/${forge.valeur}`);

  expect(reponse?.status()).toBe(404);
});

test("le formulaire sans compte ne deborde pas horizontalement", async ({
  page,
}) => {
  await page.goto(`/retractation/${valeurJeton}`);
  await expect(
    page.getByRole("heading", { level: 1, name: /Me rétracter/i }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le formulaire sans compte n'a aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto(`/retractation/${valeurJeton}`);
  await expect(
    page.getByRole("heading", { level: 1, name: /Me rétracter/i }),
  ).toBeVisible();

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});
