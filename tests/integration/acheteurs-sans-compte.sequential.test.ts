/**
 * Les acheteurs sans compte de l'écran Clients, LS-335, traitement T11.
 *
 * CE QUE CE FICHIER PROUVE. Le regroupement par adresse, et les deux
 * exclusions qui font la justesse de l'onglet : une commande DISSOCIÉE
 * appartient à quelqu'un qui a demandé la suppression de son compte, LS-95, et
 * ne doit pas le faire réapparaître ; une adresse qui PORTE un compte a déjà
 * ses commandes non rattachées sur la carte du compte, LS-317, et figurerait
 * sinon deux fois.
 *
 * LES DATES SONT POSÉES EXPLICITEMENT : deux `INSERT` consécutifs tombent
 * souvent dans la même milliseconde, et un tri ex aequo est indéterminé.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagée entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let service: typeof import("@/services/administration-clients");
let commandes: typeof import("@/services/administration-commandes");

let rang = 0;

/** Écrit une commande sans compte, ou rattachée si `utilisateurId` est donné. */
async function poserCommande(options: {
  email: string;
  nom: string;
  total: number;
  quand: string;
  statut?: "CONFIRMEE" | "ANNULEE" | "LIVREE";
  utilisateurId?: string;
  dissociee?: boolean;
}): Promise<void> {
  rang += 1;
  await client.query(
    `INSERT INTO commande (
       id, numero, email_normalise, nom_client, utilisateur_id, statut,
       mode_livraison, adresse_livraison, adresse_facturation,
       sous_total_centimes, frais_port_centimes, montant_taxe_centimes,
       total_centimes, dissocie_a, cgv_acceptees_a, cgv_version, cree_a
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'DOMICILE', '{}'::jsonb, '{}'::jsonb,
             $7, 0, 0, $7, $8, now(), 'test', $9)`,
    [
      randomUUID(),
      `C-TEST-335-${rang}`,
      options.email,
      options.nom,
      options.utilisateurId ?? null,
      options.statut ?? "CONFIRMEE",
      options.total,
      options.dissociee ? new Date() : null,
      new Date(options.quand),
    ],
  );
}

async function creerCompte(email: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO utilisateur (id, email, nom, email_verifie, role, cree_a, mis_a_jour_a)
     VALUES ($1, $2, 'TEST Compte', true, 'CLIENT', now(), now())`,
    [id, email],
  );
  return id;
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  service = await import("@/services/administration-clients");
  commandes = await import("@/services/administration-commandes");
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE journal_connexion, session, compte, verification, passkey,
              intention_remboursement, avoir, facture, paiement,
              evenement_fournisseur, historique_statut, mouvement_stock,
              reservation, ligne_commande, commande, adresse_carnet,
              envoi_en_attente, journal_email, alerte_critique, compteur_numero,
              variante, produit, categorie, utilisateur CASCADE`,
  );
});

describe("listerAcheteursSansCompte", () => {
  it("rend une liste vide sans aucune commande", async () => {
    const vue = await service.listerAcheteursSansCompte();

    expect(vue.acheteurs).toEqual([]);
    expect(vue.limiteAtteinte).toBe(false);
  });

  it("regroupe par adresse, nomme par la commande la plus récente, somme hors annulées", async () => {
    await poserCommande({
      email: "invite@example.invalid",
      nom: "TEST Ancien nom",
      total: 1500,
      quand: "2026-10-01T10:00:00Z",
    });
    await poserCommande({
      email: "invite@example.invalid",
      nom: "TEST Nom récent",
      total: 2500,
      quand: "2026-11-01T10:00:00Z",
      statut: "LIVREE",
    });
    // ARBITRAGE DE LS-317 : un paiement abandonné est compté, pas sommé.
    await poserCommande({
      email: "invite@example.invalid",
      nom: "TEST Abandon",
      total: 9900,
      quand: "2026-09-01T10:00:00Z",
      statut: "ANNULEE",
    });

    const vue = await service.listerAcheteursSansCompte();

    expect(vue.acheteurs).toEqual([
      {
        email: "invite@example.invalid",
        nom: "TEST Nom récent",
        nombreCommandes: 3,
        totalCentimes: 4000,
        derniereCommande: new Date("2026-11-01T10:00:00Z"),
      },
    ]);
  });

  it("exclut les commandes dissociées d'un compte supprimé", async () => {
    await poserCommande({
      email: "parti@example.invalid",
      nom: "TEST Parti",
      total: 1000,
      quand: "2026-10-01T10:00:00Z",
      dissociee: true,
    });

    const vue = await service.listerAcheteursSansCompte();

    expect(vue.acheteurs).toEqual([]);
  });

  it("exclut une adresse qui porte un compte, rattachée ou non", async () => {
    const id = await creerCompte("inscrit@example.invalid");
    await poserCommande({
      email: "inscrit@example.invalid",
      nom: "TEST Inscrit",
      total: 1000,
      quand: "2026-10-01T10:00:00Z",
      utilisateurId: id,
    });
    // Non rattachée, LS-317 : elle est déjà sur la carte du compte.
    await poserCommande({
      email: "inscrit@example.invalid",
      nom: "TEST Inscrit",
      total: 2000,
      quand: "2026-10-02T10:00:00Z",
    });
    // Casse différente dans le compte : la comparaison normalise.
    await creerCompte("Majuscules@Example.invalid");
    await poserCommande({
      email: "majuscules@example.invalid",
      nom: "TEST Majuscules",
      total: 500,
      quand: "2026-10-03T10:00:00Z",
    });

    const vue = await service.listerAcheteursSansCompte();

    expect(vue.acheteurs).toEqual([]);
  });

  it("trie par dernière commande, la plus récente d'abord", async () => {
    await poserCommande({
      email: "ancien@example.invalid",
      nom: "TEST Ancien",
      total: 100,
      quand: "2026-01-01T10:00:00Z",
    });
    await poserCommande({
      email: "recent@example.invalid",
      nom: "TEST Récent",
      total: 100,
      quand: "2026-06-01T10:00:00Z",
    });

    const vue = await service.listerAcheteursSansCompte();

    expect(vue.acheteurs.map((acheteur) => acheteur.email)).toEqual([
      "recent@example.invalid",
      "ancien@example.invalid",
    ]);
  });

  it("cherche sur le nom ou l'adresse, sans casse, sur toutes les commandes du groupe", async () => {
    await poserCommande({
      email: "alpha@example.invalid",
      nom: "TEST Dupont",
      total: 100,
      quand: "2026-01-01T10:00:00Z",
    });
    // Le nom recherché est celui d'une commande ANCIENNE du groupe.
    await poserCommande({
      email: "alpha@example.invalid",
      nom: "TEST Martin",
      total: 100,
      quand: "2026-02-01T10:00:00Z",
    });
    await poserCommande({
      email: "beta@example.invalid",
      nom: "TEST Durand",
      total: 100,
      quand: "2026-03-01T10:00:00Z",
    });

    const parNom = await service.listerAcheteursSansCompte({ terme: "dupont" });
    expect(parNom.acheteurs.map((acheteur) => acheteur.email)).toEqual([
      "alpha@example.invalid",
    ]);
    // Toutes les commandes du groupe restent comptées, pas seulement celle trouvée.
    expect(parNom.acheteurs[0]?.nombreCommandes).toBe(2);

    const parAdresse = await service.listerAcheteursSansCompte({
      terme: "BETA@",
    });
    expect(parAdresse.acheteurs.map((acheteur) => acheteur.email)).toEqual([
      "beta@example.invalid",
    ]);
  });

  it("traite les jokers saisis comme du texte", async () => {
    await poserCommande({
      email: "joker@example.invalid",
      nom: "TEST Joker",
      total: 100,
      quand: "2026-01-01T10:00:00Z",
    });

    for (const terme of ["%", "_", "\\"]) {
      const vue = await service.listerAcheteursSansCompte({ terme });
      expect(vue.acheteurs, `terme ${terme}`).toEqual([]);
    }
  });

  it("annonce le plafond quand il est dépassé", async () => {
    for (let i = 0; i <= service.PLAFOND_CLIENTS; i += 1) {
      await poserCommande({
        email: `acheteur-${i}@example.invalid`,
        nom: "TEST Plafond",
        total: 100,
        quand: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      });
    }

    const vue = await service.listerAcheteursSansCompte();

    expect(vue.acheteurs).toHaveLength(service.PLAFOND_CLIENTS);
    expect(vue.limiteAtteinte).toBe(true);
  });
});

/*
 * LE LIEN « VOIR SES COMMANDES » DE LA CARTE, LS-335. La revue d'interface a
 * relevé que la recherche libre, par contenu, ramenait `diana@` pour `ana@` :
 * le filtre est une égalité stricte, avec les exclusions de la carte, et ce
 * qu'il rend doit être exactement ce que la carte compte.
 */
describe("listerCommandes, filtre acheteurSansCompte", () => {
  it("rend exactement les commandes que la carte compte", async () => {
    await poserCommande({
      email: "ana@example.invalid",
      nom: "TEST Ana",
      total: 100,
      quand: "2026-01-01T10:00:00Z",
    });
    await poserCommande({
      email: "diana@example.invalid",
      nom: "TEST Diana",
      total: 100,
      quand: "2026-01-02T10:00:00Z",
    });
    await poserCommande({
      email: "ana@example.invalid",
      nom: "TEST Ana dissociée",
      total: 100,
      quand: "2026-01-03T10:00:00Z",
      dissociee: true,
    });
    const id = await creerCompte("ana-compte@example.invalid");
    await poserCommande({
      email: "ana@example.invalid",
      nom: "TEST Ana rattachée ailleurs",
      total: 100,
      quand: "2026-01-04T10:00:00Z",
      utilisateurId: id,
    });

    const liste = await commandes.listerCommandes({
      acheteurSansCompte: "ANA@example.invalid",
    });
    const carte = (await service.listerAcheteursSansCompte()).acheteurs.find(
      (acheteur) => acheteur.email === "ana@example.invalid",
    );

    expect(liste.commandes.map((commande) => commande.nomClient)).toEqual([
      "TEST Ana",
    ]);
    expect(liste.commandes).toHaveLength(carte?.nombreCommandes ?? -1);
  });
});
