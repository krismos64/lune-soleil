/** Sonde temporaire de revue, a supprimer. */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let autoriserMonAvoir: typeof import("@/services/espace-client-commandes").autoriserMonAvoir;
let autoriserMaFacture: typeof import("@/services/espace-client-commandes").autoriserMaFacture;
let lireMaCommande: typeof import("@/services/espace-client-commandes").lireMaCommande;
let listerMesCommandes: typeof import("@/services/espace-client-commandes").listerMesCommandes;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;
  client = new Client({ connectionString: url });
  await client.connect();
  ({ autoriserMonAvoir, autoriserMaFacture, lireMaCommande, listerMesCommandes } =
    await import("@/services/espace-client-commandes"));
});

afterAll(async () => {
  await client.end();
});

async function compte(email: string) {
  const { rows } = await client.query(
    `INSERT INTO utilisateur (id, email, nom, email_verifie, role, cree_a, mis_a_jour_a)
     VALUES (gen_random_uuid()::text, $1, 'T', true, 'CLIENT', now(), now()) RETURNING id`,
    [email],
  );
  return rows[0].id as string;
}

async function commande(numero: string, utilisateurId: string | null, dissociee = false) {
  const { rows } = await client.query(
    `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id, dissocie_a,
       adresse_livraison, adresse_facturation, sous_total_centimes, mode_livraison,
       frais_port_centimes, total_centimes, cgv_acceptees_a, cgv_version)
     VALUES (gen_random_uuid()::text, $1, 'x@y.fr', 'T', $2, $3,
       '{"ville":"Pau"}'::jsonb, '{"ville":"Pau"}'::jsonb, 4500, 'DOMICILE', 499, 4999, now(), 'v1')
     RETURNING id`,
    [numero, utilisateurId, dissociee ? new Date() : null],
  );
  return rows[0].id as string;
}

async function facture(commandeId: string, numero: string, chemin: string | null) {
  const { rows } = await client.query(
    `INSERT INTO facture (id, commande_id, numero, montant_total_centimes, instantane_legal, chemin_pdf)
     VALUES (gen_random_uuid()::text, $1, $2, 4999, '{}'::jsonb, $3) RETURNING id`,
    [commandeId, numero, chemin],
  );
  return rows[0].id as string;
}

async function avoir(factureId: string, numero: string, chemin: string | null) {
  const { rows } = await client.query(
    `INSERT INTO avoir (id, facture_id, numero, montant_centimes, motif, instantane_legal, chemin_pdf)
     VALUES (gen_random_uuid()::text, $1, $2, 1000, 'M', '{}'::jsonb, $3) RETURNING id`,
    [factureId, numero, chemin],
  );
  return rows[0].id as string;
}

describe("sonde", () => {
  it("avoir dont la commande a utilisateur_id NUL (achat invite) n'est pas servi", async () => {
    await client.query(`TRUNCATE avoir, facture, ligne_commande, commande, utilisateur CASCADE`);
    const moi = await compte("a@a.fr");
    const invitee = await commande("C-1", null);
    const f = await facture(invitee, "F-1", "2026/f.pdf");
    const a = await avoir(f, "A-1", "2026/a.pdf");

    console.log("AVOIR invite ->", JSON.stringify(await autoriserMonAvoir(a, moi)));
    console.log("FACTURE invite ->", JSON.stringify(await autoriserMaFacture(invitee, moi)));
  });

  it("chaine avoir : commande dissociee", async () => {
    await client.query(`TRUNCATE avoir, facture, ligne_commande, commande, utilisateur CASCADE`);
    const moi = await compte("b@b.fr");
    const c = await commande("C-2", moi, true);
    const f = await facture(c, "F-2", "2026/f.pdf");
    const a = await avoir(f, "A-2", "2026/a.pdf");
    console.log("AVOIR dissocie ->", JSON.stringify(await autoriserMonAvoir(a, moi)));
  });

  it("utilisateurId vide ou faux type", async () => {
    await client.query(`TRUNCATE avoir, facture, ligne_commande, commande, utilisateur CASCADE`);
    const invitee = await commande("C-3", null);
    const f = await facture(invitee, "F-3", "2026/f.pdf");
    const a = await avoir(f, "A-3", "2026/a.pdf");
    // un utilisateurId vide : est-ce que Prisma le traite comme "pas de filtre" ?
    console.log("LISTE avec id vide ->", JSON.stringify(await listerMesCommandes("")));
    console.log("AVOIR avec id vide ->", JSON.stringify(await autoriserMonAvoir(a, "")));
    console.log("COMMANDE avec id vide ->", JSON.stringify((await lireMaCommande(invitee, ""))?.numero ?? null));
  });

  it("timing : inexistant contre pas-a-moi", async () => {
    await client.query(`TRUNCATE avoir, facture, ligne_commande, commande, utilisateur CASCADE`);
    const moi = await compte("c@c.fr");
    const voisin = await compte("d@d.fr");
    const sienne = await commande("C-4", voisin);
    await facture(sienne, "F-4", "2026/f.pdf");
    const inexistant = "00000000-0000-4000-8000-000000000000";

    const mesure = async (fn: () => Promise<unknown>) => {
      for (let i = 0; i < 30; i++) await fn();
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 200; i++) await fn();
      return Number(process.hrtime.bigint() - t0) / 200 / 1e6;
    };
    const tAutrui = await mesure(() => autoriserMaFacture(sienne, moi));
    const tInexistant = await mesure(() => autoriserMaFacture(inexistant, moi));
    console.log(`TIMING autrui=${tAutrui.toFixed(3)}ms inexistant=${tInexistant.toFixed(3)}ms`);
    expect(true).toBe(true);
  });
});
