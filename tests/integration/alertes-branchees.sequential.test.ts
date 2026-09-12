/**
 * LES INTERRUPTEURS D'ALERTE COMMANDENT REELLEMENT UN ENVOI, LS-219.
 *
 * ------------------------------------------------------------------
 * CE QUE CE FICHIER PROUVE, ET QU'AUCUN AUTRE NE COUVRAIT.
 *
 * L'ecran des parametres, LS-98, porte cinq interrupteurs d'alerte. Quatre
 * n'apparaissaient que dans le circuit « je coche, j'enregistre, je relis ma
 * coche » : aucun code de production ne les lisait, et aucun envoi n'existait
 * pour leurs evenements.
 *
 * UN INTERRUPTEUR QUI S'ALLUME SANS FIL DERRIERE MENT DANS LES DEUX SENS.
 * L'exploitante decoche « paiement annule » en croyant reduire ses emails, rien
 * ne change ; elle laisse coche « stock faible » en croyant etre prevenue d'une
 * rupture, et ne l'est jamais. Le second cas est le plus couteux, la boutique
 * vendant sur trois canaux.
 *
 * LA MESURE PORTE SUR `envoi_en_attente`, la table d'outbox, et jamais sur un
 * envoyeur double : c'est l'ecriture en base qui prouve qu'un email PARTIRA,
 * un double n'attestant que de l'appel d'une fonction.
 * ------------------------------------------------------------------
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import type {
  EvenementPaiement,
  VerificateurSignature,
} from "@/integrations/stripe/evenements";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;

const TOTAL_CENTIMES = 4900;
const EMAIL_ALERTES = "alertes@exemple.invalid";

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

/** Verificateur double : il rend l'evenement sans rien verifier. */
function verificateurDouble(
  evenement: EvenementPaiement,
): VerificateurSignature {
  return {
    async verifier() {
      return evenement;
    },
  };
}

/**
 * Pose la ligne de parametres avec les interrupteurs demandes.
 *
 * ELLE ECRIT EN SQL ET NON PAR LE SERVICE, deliberement : `enregistrerParametres`
 * exige une session administratrice et une preuve d'identite recente, gardes
 * que `parametres.sequential.test.ts` eprouve deja. Les rejouer ici
 * allongerait chaque cas sans rien prouver de plus sur le BRANCHEMENT, qui est
 * le seul objet de ce fichier.
 */
async function poserParametres(
  reglages: Partial<{
    alerteCommandePayee: boolean;
    alertePaiementAnnule: boolean;
    alerteStockFaible: boolean;
    alerteMessageRecu: boolean;
    alerteAvisAModerer: boolean;
    seuilStockFaible: number;
  }>,
): Promise<void> {
  const valeurs = {
    alerteCommandePayee: false,
    alertePaiementAnnule: false,
    alerteStockFaible: false,
    alerteMessageRecu: false,
    alerteAvisAModerer: false,
    /*
     * LE SEUIL PAR DEFAUT EST UN EXEMPLAIRE, ce qui fait alerter au passage a
     * zero : c'est le reglage que l'exploitante aura le plus souvent sur des
     * pieces uniques. Chaque cas qui mesure autre chose le pose explicitement.
     */
    seuilStockFaible: 1,
    ...reglages,
  };

  await client.query("DELETE FROM parametre_boutique");
  await client.query(
    `INSERT INTO parametre_boutique (
       id, tarif_relais_centimes, tarif_domicile_centimes,
       seuil_franchise_centimes, seuil_stock_faible, email_alertes,
       alerte_commande_payee, alerte_paiement_annule, alerte_stock_faible,
       alerte_message_recu, alerte_avis_a_moderer, modifie_a
     ) VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
    [
      CONFIGURATION.relaisCentimes,
      CONFIGURATION.domicileCentimes,
      CONFIGURATION.seuilFranchiseCentimes,
      valeurs.seuilStockFaible,
      EMAIL_ALERTES,
      valeurs.alerteCommandePayee,
      valeurs.alertePaiementAnnule,
      valeurs.alerteStockFaible,
      valeurs.alerteMessageRecu,
      valeurs.alerteAvisAModerer,
    ],
  );
}

/** Les envois deposes pour l'adresse d'alerte, par type d'incident. */
async function typesNotifies(): Promise<string[]> {
  const { rows } = await client.query<{ type: string }>(
    `SELECT variables->>'type' AS type
     FROM envoi_en_attente
     WHERE destinataire = $1 AND modele = 'admin-incident-critique'`,
    [EMAIL_ALERTES],
  );

  return rows.map((ligne) => ligne.type);
}

/** Passe une commande, la confirme, et rend ses identifiants. */
async function commanderEtConfirmer(): Promise<{
  commandeId: string;
  varianteId: string;
}> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  const evenement: EvenementPaiement = {
    identifiant: `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId: issue.commandeId,
    identifiantSession: `cs_test_${issue.commandeId.slice(0, 8)}`,
    montantCentimes: TOTAL_CENTIMES,
    montantRembourseCentimes: 0,
    charge: { source: "test" },
  };

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
  });

  return { commandeId: issue.commandeId, varianteId };
}

beforeAll(async () => {
  process.env[VARIABLE_URL_TEST] = inject("DATABASE_URL_TEST");
  process.env.DATABASE_URL = inject("DATABASE_URL_TEST");

  client = new Client({ connectionString: inject("DATABASE_URL_TEST") });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));

  const { rows } = await client.query("SELECT * FROM parametre_boutique");
  ligneOrigine = rows[0];
});

/**
 * LA LIGNE DE PARAMETRES D'ORIGINE, RELEVEE AVANT LE PREMIER CAS.
 *
 * ELLE EST RESTAURÉE EN FIN DE FICHIER, et cette precaution n'est pas theorique :
 * la base est PARTAGEE entre fichiers d'integration, et la migration
 * `20260911110000_parametres_boutique` amorce cette ligne unique. La laisser
 * supprimee faisait rougir QUATRE tests de deux autres fichiers, qui lisent les
 * tarifs depuis la base : « la base migrée porte une ligne de paramètres aux
 * valeurs d'ADR-035 » notamment. Mesure du 12 septembre 2026.
 */
let ligneOrigine: Record<string, unknown> | undefined;

afterEach(async () => {
  await client.query("DELETE FROM envoi_en_attente");
});

afterAll(async () => {
  await client.query("DELETE FROM parametre_boutique");

  if (ligneOrigine !== undefined) {
    const colonnes = Object.keys(ligneOrigine);
    const place = colonnes.map((_, rang) => `$${rang + 1}`).join(", ");

    await client.query(
      `INSERT INTO parametre_boutique (${colonnes.join(", ")}) VALUES (${place})`,
      colonnes.map((colonne) => ligneOrigine?.[colonne]),
    );
  }

  await client.end();
});

describe("alerte de stock faible, LS-219", () => {
  /**
   * LE SEUIL EST LE PASSAGE A ZERO, arbitrage de Christophe du 12 septembre
   * 2026. La boutique vend sur trois canaux : l'information qui compte est la
   * rupture REELLE. Alerter a un exemplaire restant ferait partir un email a
   * presque chaque vente sur des pieces souvent uniques, et un interrupteur
   * qui produit du bruit finit decoche.
   */
  it("previent quand la derniere piece part, interrupteur coche", async () => {
    await poserParametres({ alerteStockFaible: true });

    await commanderEtConfirmer();

    expect(await typesNotifies()).toContain("STOCK_FAIBLE");
  });

  it("n'envoie RIEN quand l'interrupteur est decoche", async () => {
    /*
     * LE TEST QUI PORTE LE CRITERE 1, et le seul qui rougisse si la lecture de
     * l'interrupteur est retiree. Sans lui, un branchement qui ignore la case a
     * cocher passerait le test precedent sans difficulte.
     */
    await poserParametres({ alerteStockFaible: false });

    await commanderEtConfirmer();

    expect(await typesNotifies()).not.toContain("STOCK_FAIBLE");
  });

  it("ne previent pas tant qu'il reste du stock", async () => {
    /*
     * LA CONDITION PORTE SUR LA TRANSITION VERS ZERO, jamais sur l'etat. Sans
     * cette distinction, chaque vente d'une variante bien approvisionnee
     * declencherait une alerte de rupture.
     */
    await poserParametres({ alerteStockFaible: true });

    const { varianteId } = await creerVarianteEnStock(client);
    await client.query(
      "UPDATE variante SET quantite_physique = 5 WHERE id = $1",
      [varianteId],
    );

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const evenement: EvenementPaiement = {
      identifiant: `evt_test_${randomUUID()}`,
      type: "PAIEMENT_REUSSI",
      commandeId: issue.commandeId,
      identifiantSession: `cs_test_${issue.commandeId.slice(0, 8)}`,
      montantCentimes: TOTAL_CENTIMES,
      montantRembourseCentimes: 0,
      charge: { source: "test" },
    };

    await traiterEvenementPaiement({
      corpsBrut: JSON.stringify(evenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenement),
    });

    expect(await typesNotifies()).not.toContain("STOCK_FAIBLE");
  });

  it("ne renvoie pas l'alerte sur un webhook rejoue", async () => {
    /*
     * CRITERE 3, INVARIANT 5. Le rejeu d'un evenement deja traite sort en
     * `DEJA_TRAITE` avant tout effet : la sortie de stock n'a pas lieu une
     * seconde fois, donc aucune transition vers zero n'est observee.
     *
     * L'ASSERTION COMPTE LES ENVOIS, elle ne teste pas leur presence : un
     * second email est exactement ce que l'idempotence doit empecher, et
     * « au moins un » serait vrai dans les deux cas.
     */
    await poserParametres({ alerteStockFaible: true });

    const { commandeId } = await commanderEtConfirmer();

    const evenement: EvenementPaiement = {
      identifiant: `evt_test_${randomUUID()}`,
      type: "PAIEMENT_REUSSI",
      commandeId,
      identifiantSession: `cs_test_${commandeId.slice(0, 8)}`,
      montantCentimes: TOTAL_CENTIMES,
      montantRembourseCentimes: 0,
      charge: { source: "test" },
    };

    await traiterEvenementPaiement({
      corpsBrut: JSON.stringify(evenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenement),
    });

    const alertes = (await typesNotifies()).filter(
      (type) => type === "STOCK_FAIBLE",
    );

    expect(alertes).toHaveLength(1);
  });
});

describe("alerte de commande payee, LS-29 et LS-219", () => {
  it("previent quand l'interrupteur est coche", async () => {
    await poserParametres({ alerteCommandePayee: true });

    await commanderEtConfirmer();

    const { rows } = await client.query<{ nombre: string }>(
      `SELECT count(*)::text AS nombre FROM envoi_en_attente
       WHERE destinataire = $1 AND modele = 'admin-commande-payee'`,
      [EMAIL_ALERTES],
    );

    expect(rows[0]?.nombre).toBe("1");
  });

  it("n'envoie RIEN quand l'interrupteur est decoche", async () => {
    await poserParametres({ alerteCommandePayee: false });

    await commanderEtConfirmer();

    const { rows } = await client.query<{ nombre: string }>(
      `SELECT count(*)::text AS nombre FROM envoi_en_attente
       WHERE modele = 'admin-commande-payee'`,
    );

    expect(rows[0]?.nombre).toBe("0");
  });
});

describe("un echec d'envoi n'interrompt aucun chemin metier, LS-219", () => {
  /**
   * CRITERE 4, ET C'EST LE PLUS IMPORTANT DE CE FICHIER. Ce chemin confirme un
   * PAIEMENT : laisser remonter une exception parce qu'une pastille ne sait pas
   * si elle doit sonner annulerait la transaction entiere, donc l'encaissement.
   *
   * LA PANNE EST SIMULEE EN SUPPRIMANT LA LIGNE DE PARAMETRES, ce qui fait
   * lever la lecture cote service. C'est la forme de panne la plus proche du
   * reel sans couper la base : une base restauree avant la migration d'ADR-043
   * est exactement dans cet etat.
   */
  it("confirme la commande meme sans ligne de parametres", async () => {
    await client.query("DELETE FROM parametre_boutique");

    const { commandeId } = await commanderEtConfirmer();

    const { rows } = await client.query<{ statut: string }>(
      "SELECT statut FROM commande WHERE id = $1",
      [commandeId],
    );

    expect(rows[0]?.statut).toBe("CONFIRMEE");
  });

  it("emet la facture meme sans ligne de parametres", async () => {
    /*
     * L'ASSERTION PORTE SUR LA FACTURE ET NON SEULEMENT SUR LE STATUT : une
     * transaction avortee laisserait la commande en `EN_ATTENTE_PAIEMENT` ET
     * sans facture, mais un chemin partiellement casse pourrait rendre l'un
     * sans l'autre.
     */
    await client.query("DELETE FROM parametre_boutique");

    const { commandeId } = await commanderEtConfirmer();

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM facture WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows[0]?.nombre).toBe("1");
  });
});
