/**
 * Historique des commandes et acces aux documents, sur base reelle. LS-57.
 * Zone critique : ce chemin decide qui lit une commande, une facture, un avoir.
 *
 * CE QUE CETTE SUITE DOIT PROUVER, ET LES DEUX ERREURS SYMETRIQUES QU'ELLE
 * ATTRAPE :
 *
 *   TROP MONTRER   exposer le nom, l'adresse et les montants d'un tiers, ce que
 *                  chaque garde ferme separement
 *   PAS ASSEZ      cacher a un client SES propres commandes, ce qui viderait
 *                  l'espace client de sa raison d'etre
 *
 * CHAQUE TEST VERIFIE DONC LES DEUX SENS : que le proprietaire voit, et que le
 * voisin ne voit pas. Les separer laisserait un test vert sur un service qui
 * ne montre rien, l'autre vert sur un service qui montre tout.
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique
 * en SQL : c'est le `where` du repository qui doit etre exerce.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let listerMesCommandes: typeof import("@/services/espace-client-commandes").listerMesCommandes;
let lireMaCommande: typeof import("@/services/espace-client-commandes").lireMaCommande;
let autoriserMaFacture: typeof import("@/services/espace-client-commandes").autoriserMaFacture;
let autoriserMonAvoir: typeof import("@/services/espace-client-commandes").autoriserMonAvoir;

const EMAIL = "proprietaire@exemple.fr";
const EMAIL_TIERS = "voisin@exemple.fr";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({
    listerMesCommandes,
    lireMaCommande,
    autoriserMaFacture,
    autoriserMonAvoir,
  } = await import("@/services/espace-client-commandes"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE avoir, facture, ligne_commande, commande, utilisateur CASCADE`,
  );
});

async function creerCompte(email: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO utilisateur (id, email, nom, email_verifie, role, cree_a, mis_a_jour_a)
     VALUES (gen_random_uuid()::text, $1, 'Client Test', true, 'CLIENT', now(), now())
     RETURNING id`,
    [email],
  );

  return rows[0].id as string;
}

async function creerCommande(
  numero: string,
  email: string,
  options: { utilisateurId?: string | null; dissociee?: boolean } = {},
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                           dissocie_a, adresse_livraison, adresse_facturation,
                           sous_total_centimes, mode_livraison, frais_port_centimes,
                           total_centimes, cgv_acceptees_a, cgv_version)
     VALUES (gen_random_uuid()::text, $1, $2, 'Client Test', $3, $4,
             '{"ville": "Pau"}'::jsonb, '{"ville": "Pau"}'::jsonb,
             4500, 'DOMICILE', 499, 4999, now(), 'v1')
     RETURNING id`,
    [
      numero,
      email,
      options.utilisateurId ?? null,
      options.dissociee === true ? new Date() : null,
    ],
  );

  return rows[0].id as string;
}

/** Emet une facture, avec ou sans PDF rendu, regle F8. */
async function creerFacture(
  commandeId: string,
  numero: string,
  cheminPdf: string | null,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO facture (id, commande_id, numero, montant_total_centimes,
                          instantane_legal, chemin_pdf)
     VALUES (gen_random_uuid()::text, $1, $2, 4999, '{}'::jsonb, $3)
     RETURNING id`,
    [commandeId, numero, cheminPdf],
  );

  return rows[0].id as string;
}

async function creerAvoir(
  factureId: string,
  numero: string,
  cheminPdf: string | null,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO avoir (id, facture_id, numero, montant_centimes, motif,
                        instantane_legal, chemin_pdf)
     VALUES (gen_random_uuid()::text, $1, $2, 1000, 'Retractation',
             '{}'::jsonb, $3)
     RETURNING id`,
    [factureId, numero, cheminPdf],
  );

  return rows[0].id as string;
}

describe("critere 1, le client voit ses commandes, les plus recentes d'abord", () => {
  it("liste les siennes et ignore celles du voisin", async () => {
    const moi = await creerCompte(EMAIL);
    const voisin = await creerCompte(EMAIL_TIERS);

    await creerCommande("C-2026-0001", EMAIL, { utilisateurId: moi });
    await creerCommande("C-2026-0002", EMAIL_TIERS, { utilisateurId: voisin });

    const miennes = await listerMesCommandes(moi);

    // LES DEUX SENS : la mienne est la, celle du voisin n'y est pas. Un service
    // qui listerait TOUTE commande passerait la premiere assertion seule.
    expect(miennes.map((c) => c.numero)).toEqual(["C-2026-0001"]);
  });

  it("rend les plus recentes d'abord", async () => {
    const moi = await creerCompte(EMAIL);

    const ancienne = await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: moi,
    });
    await client.query(
      `UPDATE commande SET cree_a = now() - interval '10 days' WHERE id = $1`,
      [ancienne],
    );
    await creerCommande("C-2026-0002", EMAIL, { utilisateurId: moi });

    const miennes = await listerMesCommandes(moi);

    expect(miennes.map((c) => c.numero)).toEqual([
      "C-2026-0002",
      "C-2026-0001",
    ]);
  });

  it("ignore une commande invitee encore rattachee a personne", async () => {
    // Elle porte la MEME adresse, mais aucun proprietaire : elle releve du
    // rattachement de LS-56, pas de l'historique.
    const moi = await creerCompte(EMAIL);
    await creerCommande("C-2026-0001", EMAIL);

    expect(await listerMesCommandes(moi)).toEqual([]);
  });
});

describe("critere 5, une commande dissociee n'apparait dans aucun espace client", () => {
  it("l'exclut de la liste alors qu'elle porte l'utilisateur", async () => {
    /*
     * LE CAS CONSTRUIT ICI N'ARRIVE PAS PAR LE CHEMIN NOMINAL : la suppression
     * de compte met `utilisateur_id` a nul en meme temps qu'elle pose
     * `dissocie_a`. Le test pose LES DEUX pour exercer le filtre lui-meme, et
     * non l'effet de bord d'un `utilisateur_id` nul. Sans cela, le retrait du
     * filtre `dissocieA` resterait invisible.
     */
    const moi = await creerCompte(EMAIL);
    await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: moi,
      dissociee: true,
    });
    await creerCommande("C-2026-0002", EMAIL, { utilisateurId: moi });

    const miennes = await listerMesCommandes(moi);

    expect(miennes.map((c) => c.numero)).toEqual(["C-2026-0002"]);
  });

  it("refuse aussi son detail", async () => {
    const moi = await creerCompte(EMAIL);
    const dissociee = await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: moi,
      dissociee: true,
    });

    expect(await lireMaCommande(dissociee, moi)).toBeNull();
  });
});

describe("critere 2, le detail affiche les lignes figees et les documents", () => {
  it("rend la commande de son proprietaire", async () => {
    const moi = await creerCompte(EMAIL);
    const commande = await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: moi,
    });

    const detail = await lireMaCommande(commande, moi);

    expect(detail?.numero).toBe("C-2026-0001");
    expect(detail?.totalCentimes).toBe(4999);
    expect(detail?.fraisPortCentimes).toBe(499);
    expect(detail?.modeLivraison).toBe("DOMICILE");
  });

  it("rattache l'avoir a sa facture d'origine, invariant 4", async () => {
    const moi = await creerCompte(EMAIL);
    const commande = await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: moi,
    });
    const facture = await creerFacture(commande, "F-2026-0001", "f/2026/1.pdf");
    await creerAvoir(facture, "A-2026-0001", "a/2026/1.pdf");

    const detail = await lireMaCommande(commande, moi);

    expect(detail?.facture?.numero).toBe("F-2026-0001");
    expect(detail?.facture?.avoirs.map((a) => a.numero)).toEqual([
      "A-2026-0001",
    ]);
  });

  it("distingue « aucune facture » de « facture sans PDF », regle F8", async () => {
    const moi = await creerCompte(EMAIL);

    const sansFacture = await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: moi,
    });
    const avecFactureSansPdf = await creerCommande("C-2026-0002", EMAIL, {
      utilisateurId: moi,
    });
    await creerFacture(avecFactureSansPdf, "F-2026-0001", null);

    // LES DEUX ETATS N'APPELLENT PAS LE MEME GESTE a l'ecran : « aucune
    // facture » est normal avant paiement, « facture sans PDF » est un rendu en
    // echec. Les confondre ferait disparaitre l'anomalie.
    expect((await lireMaCommande(sansFacture, moi))?.facture).toBeNull();

    const enEchec = await lireMaCommande(avecFactureSansPdf, moi);
    expect(enEchec?.facture?.numero).toBe("F-2026-0001");
    expect(enEchec?.facture?.cheminPdf).toBeNull();
  });
});

describe("critere 4, test negatif de securite", () => {
  it("refuse le detail de la commande d'un tiers", async () => {
    /*
     * LA TENTATIVE VISEE : un client connecte manipule l'identifiant dans
     * l'URL. L'identifiant est VRAI, la commande existe, seule l'appartenance
     * manque. Invariant 2.
     */
    const moi = await creerCompte(EMAIL);
    const voisin = await creerCompte(EMAIL_TIERS);
    const sienne = await creerCommande("C-2026-0001", EMAIL_TIERS, {
      utilisateurId: voisin,
    });

    expect(await lireMaCommande(sienne, moi)).toBeNull();
    // LE SECOND SENS : son proprietaire, lui, la lit. Sans cette assertion, un
    // service qui rendrait TOUJOURS `null` passerait le test.
    expect((await lireMaCommande(sienne, voisin))?.numero).toBe("C-2026-0001");
  });

  it("refuse la facture d'un tiers, meme avec le bon identifiant", async () => {
    const moi = await creerCompte(EMAIL);
    const voisin = await creerCompte(EMAIL_TIERS);
    const sienne = await creerCommande("C-2026-0001", EMAIL_TIERS, {
      utilisateurId: voisin,
    });
    await creerFacture(sienne, "F-2026-0001", "f/2026/1.pdf");

    expect(await autoriserMaFacture(sienne, moi)).toEqual({
      statut: "REFUSE",
    });
    expect(await autoriserMaFacture(sienne, voisin)).toEqual({
      statut: "AUTORISE",
      numero: "F-2026-0001",
      cheminPdf: "f/2026/1.pdf",
    });
  });

  it("refuse l'avoir d'un tiers, la chaine de propriete etant parcourue", async () => {
    /*
     * UN AVOIR N'APPARTIENT A PERSONNE DIRECTEMENT : la chaine est
     * avoir -> facture -> commande -> utilisateur. Sauter un maillon en
     * supposant que l'avoir suit sa facture ferait dependre la garde d'une
     * hypothese non ecrite.
     */
    const moi = await creerCompte(EMAIL);
    const voisin = await creerCompte(EMAIL_TIERS);
    const sienne = await creerCommande("C-2026-0001", EMAIL_TIERS, {
      utilisateurId: voisin,
    });
    const facture = await creerFacture(sienne, "F-2026-0001", "f/2026/1.pdf");
    const avoir = await creerAvoir(facture, "A-2026-0001", "a/2026/1.pdf");

    expect(await autoriserMonAvoir(avoir, moi)).toEqual({ statut: "REFUSE" });
    expect(await autoriserMonAvoir(avoir, voisin)).toEqual({
      statut: "AUTORISE",
      numero: "A-2026-0001",
      cheminPdf: "a/2026/1.pdf",
    });
  });

  it("refuse les documents d'une commande dissociee", async () => {
    // Le compte a ete supprime puis un homonyme recree : les documents ne
    // rouvrent pas, regle V15 transposee a la lecture.
    const moi = await creerCompte(EMAIL);
    const commande = await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: moi,
      dissociee: true,
    });
    const facture = await creerFacture(commande, "F-2026-0001", "f/1.pdf");
    const avoir = await creerAvoir(facture, "A-2026-0001", "a/1.pdf");

    expect(await autoriserMaFacture(commande, moi)).toEqual({
      statut: "REFUSE",
    });
    expect(await autoriserMonAvoir(avoir, moi)).toEqual({ statut: "REFUSE" });
  });

  it("refuse un document dont le PDF n'a jamais ete rendu", async () => {
    // `cheminPdf` nul : la facture EXISTE et l'ecran doit le dire, mais il n'y
    // a aucun fichier a servir. Refus, et non un chemin vide qui ferait lever
    // la lecture disque plus loin.
    const moi = await creerCompte(EMAIL);
    const commande = await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: moi,
    });
    await creerFacture(commande, "F-2026-0001", null);

    expect(await autoriserMaFacture(commande, moi)).toEqual({
      statut: "REFUSE",
    });
  });

  it("refuse un identifiant de commande inexistant, sans distinguer du refus", async () => {
    /*
     * LE REFUS EST UNIFORME : « inexistante » et « pas la votre » rendent la
     * MEME valeur. Un appelant ne peut donc pas construire d'oracle qui
     * revelerait l'existence de la commande d'autrui.
     */
    const moi = await creerCompte(EMAIL);
    const inexistante = "00000000-0000-4000-8000-000000000000";

    expect(await lireMaCommande(inexistante, moi)).toBeNull();
    expect(await autoriserMaFacture(inexistante, moi)).toEqual({
      statut: "REFUSE",
    });
  });
});
