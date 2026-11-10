/**
 * Paiement recu sur une commande annulee, LS-316. Filet releve par
 * `ls-critical-reviewer` le 10 novembre 2026, ADR-050 section Risques.
 *
 * ECRIT AVANT LA CORRECTION, zone critique paiement et stock.
 *
 * AUCUN CHEMIN CONNU NE L'ATTEINT tant que Stripe refuse le paiement d'une
 * session expiree : c'est le filet qui se teste ici, pas le chemin nominal. Les
 * deux formes du defaut :
 *
 * 1. le webhook a lu la commande EN ATTENTE, sans verrou, avant qu'une
 *    annulation ne passe ; il reprenait apres et la ramenait a `CONFIRMEE` ;
 * 2. la piece a ete reservee de nouveau apres l'annulation ; la sortie de stock
 *    heurtait `chk_variante_pas_de_survente`, l'evenement echouait en boucle et
 *    l'alerte qui signale l'argent a rendre ne partait jamais.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import type { FournisseurPaiement } from "@/integrations/stripe/fournisseur";
import type { EvenementPaiement } from "@/integrations/stripe/evenements";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let annulerCommandeEnAttente: typeof import("@/services/annulation-commande").annulerCommandeEnAttente;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;

const SAISIE_DOMICILE = {
  nomClient: "TEST Camille Dupont",
  email: "test@example.invalid",
  telephone: null,
  adresse: {
    ligne1: "1 rue de Test",
    codePostal: "75001",
    ville: "TESTVILLE",
    pays: "FR" as const,
  },
  mode: "DOMICILE" as const,
  pointRetrait: null,
};

const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 749,
  seuilFranchiseCentimes: 3900,
};

const TOTAL_ATTENDU_CENTIMES = 4900;

/** Le prestataire accepte toute expiration : la session est jugee impayable. */
const PRESTATAIRE_COMPLAISANT: FournisseurPaiement = {
  async creerSession() {
    throw new Error("creerSession n'a pas sa place ici");
  },
  async expirerSession() {
    return "EXPIREE";
  },
  async lireSession() {
    return { etat: "EXPIREE" };
  },
  async rembourser(): Promise<never> {
    throw new Error("rembourser n'a pas sa place ici");
  },
};

async function commanderUnePiece(
  varianteId?: string,
): Promise<{ commandeId: string; varianteId: string; session: string }> {
  const variante =
    varianteId ?? (await creerVarianteEnStock(client, {})).varianteId;

  const issue = await passerCommande({
    lignesCookie: [{ varianteId: variante, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  const session = `cs_${randomUUID()}`;

  await client.query(
    `INSERT INTO paiement (id, commande_id, statut, montant_centimes, identifiant_fournisseur, cree_a)
     VALUES (gen_random_uuid(), $1, 'EN_ATTENTE', $2, $3, now())`,
    [issue.commandeId, TOTAL_ATTENDU_CENTIMES, session],
  );

  return { commandeId: issue.commandeId, varianteId: variante, session };
}

function paiementReussi(
  commandeId: string,
  session: string,
): EvenementPaiement {
  return {
    identifiant: `evt_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId,
    identifiantSession: session,
    montantCentimes: TOTAL_ATTENDU_CENTIMES,
    montantRembourseCentimes: 0,
    charge: {},
  };
}

function traiter(evenement: EvenementPaiement) {
  return traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: {
      async verifier() {
        return evenement;
      },
    },
  });
}

async function un<T>(sql: string, parametres: unknown[]): Promise<T> {
  const { rows } = await client.query(sql, parametres);

  return rows[0] as T;
}

async function constat(commandeId: string, varianteId: string) {
  return {
    statut: (
      await un<{ statut: string }>(
        "SELECT statut FROM commande WHERE id = $1",
        [commandeId],
      )
    ).statut,
    stock: await un<{ physique: number; reservee: number }>(
      `SELECT quantite_physique AS physique, quantite_reservee AS reservee
         FROM variante WHERE id = $1`,
      [varianteId],
    ),
    mouvements: Number(
      (
        await un<{ n: string }>(
          "SELECT count(*)::text AS n FROM mouvement_stock WHERE commande_id = $1",
          [commandeId],
        )
      ).n,
    ),
    factures: Number(
      (
        await un<{ n: string }>(
          "SELECT count(*)::text AS n FROM facture WHERE commande_id = $1",
          [commandeId],
        )
      ).n,
    ),
    alertes: Number(
      (
        await un<{ n: string }>(
          `SELECT count(*)::text AS n FROM alerte_critique
            WHERE type = 'PAIEMENT_SUR_COMMANDE_ANNULEE' AND id_cible = $1`,
          [commandeId],
        )
      ).n,
    ),
    encaisses: Number(
      (
        await un<{ n: string }>(
          `SELECT count(*)::text AS n FROM paiement
            WHERE commande_id = $1 AND statut = 'REUSSI'`,
          [commandeId],
        )
      ).n,
    ),
  };
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ annulerCommandeEnAttente } =
    await import("@/services/annulation-commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE alerte_critique, historique_statut, mouvement_stock,
     evenement_fournisseur, envoi_en_attente, facture, jeton_acces, paiement,
     reservation, ligne_commande, commande, variante, produit, categorie,
     compteur_numero, verrou_tache CASCADE`,
  );
});

describe("webhook de paiement sur une commande annulee", () => {
  it("ne sort pas une piece reservee de nouveau, et alerte", async () => {
    const annulee = await commanderUnePiece();

    expect(
      (
        await annulerCommandeEnAttente({
          commandeId: annulee.commandeId,
          fournisseur: PRESTATAIRE_COMPLAISANT,
        })
      ).statut,
    ).toBe("ANNULEE");

    // UN AUTRE CLIENT RESERVE LA PIECE RENDUE, comme le panier reconstruit.
    await commanderUnePiece(annulee.varianteId);

    const evenement = paiementReussi(annulee.commandeId, annulee.session);

    /*
     * AUCUNE EXCEPTION : une transaction en echec ferait rejouer le prestataire
     * indefiniment, sans que l'alerte ne parte jamais.
     */
    await traiter(evenement);

    expect(await constat(annulee.commandeId, annulee.varianteId)).toEqual({
      statut: "ANNULEE",
      // La piece reste au client qui l'a reservee ensuite.
      stock: { physique: 1, reservee: 1 },
      mouvements: 0,
      factures: 0,
      alertes: 1,
      // L'ARGENT EST ENREGISTRE : c'est ce qui permet de le rendre.
      encaisses: 1,
    });

    // UN REJEU NE PRODUIT AUCUN EFFET DE PLUS.
    await traiter(evenement);

    expect(await constat(annulee.commandeId, annulee.varianteId)).toEqual({
      statut: "ANNULEE",
      stock: { physique: 1, reservee: 1 },
      mouvements: 0,
      factures: 0,
      alertes: 1,
      encaisses: 1,
    });
  });

  it("ne ramene pas a CONFIRMEE une commande annulee pendant son attente", async () => {
    const commande = await commanderUnePiece();

    /*
     * LA SECONDE CONNEXION IMITE L'ANNULATION, dans son ordre de verrous : elle
     * tient la variante, le webhook demarre et attend derriere elle, puis elle
     * annule et rend la reservation. Avant LS-316, le webhook avait deja lu la
     * commande EN ATTENTE, sans verrou, et la confirmait en reprenant.
     */
    const imitation = new Client({
      connectionString: inject(VARIABLE_URL_TEST),
    });
    await imitation.connect();

    try {
      const { rows } = await imitation.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );

      await imitation.query("BEGIN");
      await imitation.query(
        "SELECT id FROM variante WHERE id = $1 FOR UPDATE",
        [commande.varianteId],
      );

      const webhook = traiter(
        paiementReussi(commande.commandeId, commande.session),
      );

      let bloque = false;

      for (let essai = 0; essai < 100 && !bloque; essai += 1) {
        const attente = await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND pid <> $1`,
          [rows[0]?.pid],
        );

        bloque = Number(attente.rows[0]?.n ?? "0") > 0;

        if (!bloque) {
          await new Promise((resoudre) => setTimeout(resoudre, 50));
        }
      }

      expect(bloque).toBe(true);

      await imitation.query(
        "UPDATE commande SET statut = 'ANNULEE' WHERE id = $1",
        [commande.commandeId],
      );
      await imitation.query(
        `WITH rendues AS (
           DELETE FROM reservation WHERE commande_id = $1 RETURNING quantite
         )
         UPDATE variante
            SET quantite_reservee = quantite_reservee
                  - (SELECT COALESCE(SUM(quantite), 0)::int FROM rendues)
          WHERE id = $2`,
        [commande.commandeId, commande.varianteId],
      );
      await imitation.query("COMMIT");

      await webhook;
    } finally {
      await imitation.end();
    }

    expect(await constat(commande.commandeId, commande.varianteId)).toEqual({
      statut: "ANNULEE",
      stock: { physique: 1, reservee: 0 },
      mouvements: 0,
      factures: 0,
      alertes: 1,
      encaisses: 1,
    });
  });
});
