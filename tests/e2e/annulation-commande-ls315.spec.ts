/**
 * Reprendre ou annuler une commande en attente, LS-315, ADR-050.
 *
 * LE DEFAUT DE DEPART, mesure en production le 10 novembre 2026 : un client
 * sorti de la page de paiement sans passer par son bouton de retour trouvait
 * un panier vide, sa piece epuisee, et aucun chemin vers sa commande.
 *
 * CHAQUE TEST AMORCE SA PROPRE COMMANDE, identifiants tires au hasard : une
 * annulation consomme la commande, et la partager entre largeurs ou avec
 * `confirmation-paiement.spec.ts` ferait dependre un test de l'ordre des
 * autres. Le produit reste en `BROUILLON`, comme les autres amorces : rien
 * n'apparait au catalogue public.
 *
 * LE PRESTATAIRE EST ABSENT, cle videe par la configuration Playwright. Une
 * commande sans session s'annule sans l'appeler ; une commande qui en porte une
 * bute sur l'indisponibilite, et c'est le cas de panne exerce ici.
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";
import { Client } from "pg";

import { encoderCommandeEnCours } from "@/lib/commande-cookie";
import { COMMANDE_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const NOM_PIECE = "TEST Pièce réservée LS-315";

type Amorce = { commandeId: string; varianteId: string; numero: string };

async function avecBase<T>(
  travail: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    return await travail(client);
  } finally {
    await client.end();
  }
}

/**
 * Une piece unique reservee par une commande en attente, et le cookie signe
 * qui designe cette commande.
 *
 * LA CATEGORIE EST CELLE DE `commande.setup.ts`, jamais une neuve : son
 * `ordre` est fixe et reserve, C24, et deux tests paralleles qui en creeraient
 * chacun une se disputeraient le meme rang.
 */
async function amorcerCommande(
  context: BrowserContext,
  baseURL: string | undefined,
  options: { avecSession: boolean },
): Promise<Amorce> {
  const produitId = randomUUID();
  const varianteId = randomUUID();
  const commandeId = randomUUID();
  const suffixe = commandeId.slice(0, 8);
  const numero = `C-E2E-${suffixe}`;

  await avecBase(async (client) => {
    await client.query(
      `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
       VALUES ($1, $2, $3, $4, 'BROUILLON', now(), now())`,
      [produitId, COMMANDE_TEST.categorieId, NOM_PIECE, `e2e-ls315-${suffixe}`],
    );
    await client.query(
      `INSERT INTO variante (id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a)
       VALUES ($1, $2, $3, 'TEST Déclinaison', 3900, 1, 1, true, now())`,
      [varianteId, produitId, `TEST-LS315-${suffixe}`],
    );
    await client.query(
      `INSERT INTO commande (id, numero, statut, email_normalise, nom_client,
         adresse_livraison, adresse_facturation, sous_total_centimes,
         mode_livraison, frais_port_centimes, total_centimes,
         montant_taxe_centimes, cgv_acceptees_a, cgv_version, cree_a)
       VALUES ($1, $2, 'EN_ATTENTE_PAIEMENT', 'e2e-ls315@exemple.test',
         'TEST Camille', $3::jsonb, $3::jsonb, 3900, 'DOMICILE', 0, 3900, 0,
         now(), 'test', now())`,
      [
        commandeId,
        numero,
        JSON.stringify({
          nom: "TEST Camille",
          ligne1: "1 rue de Test",
          codePostal: "35000",
          ville: "TESTVILLE",
          pays: "FR",
        }),
      ],
    );
    await client.query(
      `INSERT INTO ligne_commande (id, commande_id, variante_id, reference_figee,
         libelle_produit_fige, libelle_variante_fige, prix_fige_centimes, quantite)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'TEST Déclinaison', 3900, 1)`,
      [commandeId, varianteId, `TEST-LS315-${suffixe}`, NOM_PIECE],
    );
    await client.query(
      `INSERT INTO reservation (id, variante_id, commande_id, quantite, expire_a, cree_a)
       VALUES (gen_random_uuid(), $1, $2, 1, now() + interval '30 minutes', now())`,
      [varianteId, commandeId],
    );

    if (options.avecSession) {
      await client.query(
        `INSERT INTO paiement (id, commande_id, statut, montant_centimes,
           identifiant_fournisseur, cree_a)
         VALUES (gen_random_uuid(), $1, 'EN_ATTENTE', 3900, $2, now())`,
        [commandeId, `cs_e2e_${suffixe}`],
      );
    }
  });

  await context.clearCookies();
  await context.addCookies([
    {
      name: "ls_commande",
      value: encoderCommandeEnCours({ commandeId }),
      url: baseURL ?? "http://127.0.0.1:3100",
    },
  ]);

  return { commandeId, varianteId, numero };
}

async function aucuneViolationSerieuse(
  page: import("@playwright/test").Page,
): Promise<void> {
  const analyse = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(
    analyse.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
}

async function lireEtat(
  amorce: Amorce,
): Promise<{ statut: string; reservee: number }> {
  return avecBase(async (client) => {
    const { rows } = await client.query<{ statut: string; reservee: number }>(
      `SELECT c.statut, v.quantite_reservee AS reservee
         FROM commande c, variante v
        WHERE c.id = $1 AND v.id = $2`,
      [amorce.commandeId, amorce.varianteId],
    );

    return rows[0] ?? { statut: "INTROUVABLE", reservee: -1 };
  });
}

test("le panier vide mene a la commande en attente", async ({
  page,
  context,
  baseURL,
}) => {
  const amorce = await amorcerCommande(context, baseURL, {
    avecSession: false,
  });

  await page.goto("/panier");

  const bandeau = page.getByRole("region", {
    name: "Une commande vous attend",
  });

  await expect(bandeau).toBeVisible();
  await expect(bandeau).toContainText(amorce.numero);
  await expect(bandeau).toContainText("réservées jusqu'à");
  await expect(
    bandeau.getByRole("link", { name: "Reprendre le paiement" }),
  ).toHaveAttribute("href", "/commande/confirmation");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  await aucuneViolationSerieuse(page);
});

test("annuler rend la piece au panier et la libere tout de suite", async ({
  page,
  context,
  baseURL,
}) => {
  const amorce = await amorcerCommande(context, baseURL, {
    avecSession: false,
  });

  await page.goto("/panier");
  await expect(
    page.getByText("Votre panier est vide pour le moment."),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Annuler et revenir au panier" })
    .click();

  /*
   * LE PANIER REND LA PIECE, avec le NOUVEAU cookie : un rendu servi avec
   * l'ancien afficherait encore « vide ». La ligne reste signalee, le produit
   * de test etant en brouillon, et c'est ce qui la rend observable.
   */
  await expect(page.getByText(NOM_PIECE).first()).toBeVisible();
  await expect(
    page.getByText("Votre panier est vide pour le moment."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Une commande vous attend" }),
  ).toHaveCount(0);

  /*
   * L'ANNULATION SE DIT, ET LE FOCUS EST SUR CE QU'ELLE DIT : le bouton qui le
   * portait a quitte le DOM avec la redirection. Releve par
   * `ls-frontend-revue` le 10 novembre 2026.
   */
  const annonce = page.getByRole("status", { name: "Annulation de la commande" });

  await expect(annonce).toContainText(`La commande ${amorce.numero} est annulée`);
  await expect(annonce).toBeFocused();

  // LA BASE DIT LA MEME CHOSE QUE L'ECRAN.
  expect(await lireEtat(amorce)).toEqual({ statut: "ANNULEE", reservee: 0 });

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
  await aucuneViolationSerieuse(page);
});

test("le parametre d'URL seul n'annonce aucune annulation", async ({
  page,
  context,
  baseURL,
}) => {
  /*
   * UN LIEN PORTANT `?annulation=1` NE PROUVE RIEN : la commande du
   * navigateur est encore en attente, l'annonce ne doit pas paraitre.
   */
  await amorcerCommande(context, baseURL, { avecSession: false });

  await page.goto("/panier?annulation=1");

  await expect(
    page.getByRole("region", { name: "Une commande vous attend" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Annulation de la commande" }),
  ).toHaveCount(0);
});

test("la page de confirmation propose l'annulation, et dit la panne", async ({
  page,
  context,
  baseURL,
}) => {
  const amorce = await amorcerCommande(context, baseURL, { avecSession: true });

  await page.goto("/commande/confirmation?retour=abandon");
  await page
    .getByRole("button", { name: "Annuler et revenir au panier" })
    .click();

  /*
   * SANS REPONSE DU PRESTATAIRE, LA SESSION EST PEUT-ETRE ENCORE PAYABLE :
   * rien n'est annule, et le message le dit a cote du bouton.
   */
  await expect(
    page.getByRole("alert", { name: "Erreur d'annulation" }),
  ).toContainText("momentanément indisponible");
  await expect(
    page.getByRole("button", { name: "Annuler et revenir au panier" }),
  ).toBeEnabled();

  expect(await lireEtat(amorce)).toEqual({
    statut: "EN_ATTENTE_PAIEMENT",
    reservee: 1,
  });
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
  await aucuneViolationSerieuse(page);
});

test("le retour apres paiement ne propose pas d'annuler", async ({
  page,
  context,
  baseURL,
}) => {
  await amorcerCommande(context, baseURL, { avecSession: false });

  // LE CLIENT VIENT DE PAYER : lui proposer d'annuler l'inviterait a renoncer
  // a une commande que l'evenement signe va confirmer.
  await page.goto("/commande/confirmation?retour=paiement");

  await expect(
    page.getByRole("heading", { name: "Paiement en cours de vérification" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Annuler et revenir au panier" }),
  ).toHaveCount(0);
});
