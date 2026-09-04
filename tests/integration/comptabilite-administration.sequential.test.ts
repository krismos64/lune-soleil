/**
 * Vue d'ensemble des pieces comptables, LS-184.
 *
 * POURQUOI CE FICHIER EXISTE EN PLUS DU TEST DE BOUT EN BOUT. Celui-la mesure
 * la garde de role, le filtre et le rendu, sur la base de developpement qui ne
 * porte AUCUN AVOIR : ses assertions sur le melange des deux natures de piece
 * seraient donc vertes sans rien prouver. C'est le motif « cible de test
 * inexistante », rencontre en LS-183 sur les produits sans variante.
 *
 * CE FICHIER POSE SES PROPRES DONNEES, par les services reels et jamais par des
 * `INSERT` a la main : le numero, le figement des libelles et le cumul de
 * l'avoir doivent etre ceux de la production. Un test qui reproduirait la
 * mecanique verifierait sa propre reproduction.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import { creerVarianteEnStock } from "../aide/donnees-test";
import type {
  EvenementPaiement,
  VerificateurSignature,
} from "@/integrations/stripe/evenements";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;
let lireVueComptable: typeof import("@/services/administration-comptabilite").lireVueComptable;
let lirePieceAServir: typeof import("@/services/administration-comptabilite").lirePieceAServir;

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
  domicileCentimes: 499,
  seuilFranchiseCentimes: 3900,
};

/** La variante vaut 4900, au-dessus du seuil : livraison offerte, total 4900. */
const TOTAL_ATTENDU_CENTIMES = 4900;

/**
 * Emetteur de test, INVENTE ET RECONNAISSABLE COMME TEL. Le SIRET n'immatricule
 * aucune entreprise reelle et la raison sociale porte le prefixe `TEST` :
 * l'interdit du projet est de ne jamais introduire de donnees de prototype
 * comme donnees reelles.
 */
const EMETTEUR_TEST = {
  raisonSociale: "TEST Lune et Soleil",
  siret: "12345678901234",
  adresse: "1 rue de Test, 75001 TESTVILLE",
  emailContact: "test-emetteur@example.invalid",
};

function verificateurDouble(
  evenement: EvenementPaiement,
): VerificateurSignature {
  return {
    async verifier() {
      return evenement;
    },
  };
}

function evenementReussi(commandeId: string): EvenementPaiement {
  return {
    identifiant: `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId,
    identifiantSession: `cs_test_${commandeId.slice(0, 8)}`,
    montantCentimes: TOTAL_ATTENDU_CENTIMES,
    montantRembourseCentimes: 0,
    charge: { source: "test" },
  };
}

/** Passe une commande PAR LE SERVICE, puis la confirme, donc emet sa facture. */
async function commanderEtFacturer(): Promise<{ commandeId: string }> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  const evenement = evenementReussi(issue.commandeId);

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
  });

  return { commandeId: issue.commandeId };
}

/**
 * Ecrit un avoir sur la facture d'une commande.
 *
 * PAR UNE INSTRUCTION DIRECTE ET NON PAR `emettreAvoir`, ET C'EST ASSUME. Le
 * service d'avoir appelle le prestataire de paiement AVANT d'ecrire, ADR-032 :
 * l'exercer ici demanderait un double de Stripe pour un test dont le sujet est
 * la LECTURE. `avoir.sequential.test.ts` couvre le chemin d'emission, celui-ci
 * ne couvre que ce que la liste en fait.
 *
 * LE CUMUL DE LA FACTURE EST MIS A JOUR AVEC, parce que les deux ecritures sont
 * indissociables, `repositories/avoir.ts` : ne poser que l'avoir laisserait la
 * base dans un etat qu'aucun chemin de production ne produit.
 */
async function poserAvoir(
  commandeId: string,
  montantCentimes: number,
): Promise<{ numero: string }> {
  const { rows } = await client.query(
    `SELECT id, numero, instantane_legal FROM facture WHERE commande_id = $1`,
    [commandeId],
  );

  const facture = rows[0];

  if (!facture) {
    throw new Error("aucune facture a corriger");
  }

  const numero = `A-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  await client.query(
    `INSERT INTO avoir (id, facture_id, numero, montant_centimes, motif,
                        instantane_legal, chemin_pdf)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
    [
      randomUUID(),
      facture.id,
      numero,
      montantCentimes,
      "TEST correction",
      facture.instantane_legal,
    ],
  );

  await client.query(
    `UPDATE facture SET montant_avoir_centimes = montant_avoir_centimes + $2
     WHERE id = $1`,
    [facture.id, montantCentimes],
  );

  return { numero };
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.FACTURE_RAISON_SOCIALE = EMETTEUR_TEST.raisonSociale;
  process.env.FACTURE_SIRET = EMETTEUR_TEST.siret;
  process.env.FACTURE_ADRESSE = EMETTEUR_TEST.adresse;
  process.env.FACTURE_EMAIL_CONTACT = EMETTEUR_TEST.emailContact;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ lireVueComptable, lirePieceAServir } =
    await import("@/services/administration-comptabilite"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE alerte_critique, historique_statut, mouvement_stock,
     evenement_fournisseur, paiement, avoir, facture, reservation,
     ligne_commande, commande, variante, produit, categorie, compteur_numero
     CASCADE`,
  );
});

describe("lireVueComptable", () => {
  it("rend une liste vide quand aucune piece n'a ete emise", async () => {
    const vue = await lireVueComptable();

    expect(vue.pieces).toEqual([]);
    expect(vue.nombreFactures).toBe(0);
    expect(vue.nombreAvoirs).toBe(0);
    expect(vue.totalCentimes).toBe(0);
    expect(vue.limiteAtteinte).toBe(false);
  });

  it("liste une facture emise avec son numero de commande et son nom fige", async () => {
    const { commandeId } = await commanderEtFacturer();

    const { rows } = await client.query(
      `SELECT numero FROM commande WHERE id = $1`,
      [commandeId],
    );

    const vue = await lireVueComptable();

    expect(vue.pieces).toHaveLength(1);

    const piece = vue.pieces[0]!;

    expect(piece.type).toBe("FACTURE");
    expect(piece.numero).toMatch(/^F-\d{4}-\d+$/);
    expect(piece.numeroCommande).toBe(rows[0].numero);

    /*
     * LE NOM VIENT DE LA COMMANDE, FIGE A L'ACHAT, invariant 3. Un document
     * comptable porte le nom qu'il portait a l'emission, jamais le nom actuel
     * du compte, qui peut avoir change depuis.
     */
    expect(piece.nomClient).toBe(SAISIE_DOMICILE.nomClient);

    /*
     * LE PDF EST ABSENT ET LA PIECE EXISTE QUAND MEME, regle F8 : le rendu est
     * declenche APRES le commit du webhook, et son echec ne perd pas la
     * facture. L'ecran en fait un etat affiche, jamais une erreur.
     */
    expect(piece.cheminPdf).toBeNull();
    expect(piece.numeroFactureCorrigee).toBeNull();
  });

  /*
   * LE TEST QUE LA BASE DE DEVELOPPEMENT NE PERMETTAIT PAS. Elle ne porte aucun
   * avoir : toute assertion sur le melange des deux natures y serait verte sans
   * rien prouver.
   */
  it("melange factures et avoirs dans une seule liste chronologique", async () => {
    const { commandeId } = await commanderEtFacturer();
    const { numero } = await poserAvoir(commandeId, 1000);

    const vue = await lireVueComptable();

    expect(vue.pieces).toHaveLength(2);
    expect(vue.nombreFactures).toBe(1);
    expect(vue.nombreAvoirs).toBe(1);

    const avoir = vue.pieces.find((piece) => piece.type === "AVOIR");

    expect(avoir?.numero).toBe(numero);

    /*
     * LE MONTANT DE L'AVOIR EST NEGATIF A LA LECTURE, alors qu'il est stocke
     * POSITIF en base : `chk_facture_avoir_borne` le compare au total de la
     * facture, donc le signe ne peut pas vivre dans la colonne. C'est la
     * lecture qui lui donne son sens comptable, une seule fois, pour qu'aucun
     * appelant ne l'oublie en sommant.
     */
    expect(avoir?.montantCentimes).toBe(-1000);

    /*
     * L'AVOIR DIT LA FACTURE QU'IL CORRIGE, critere 2 : un avoir isole de sa
     * facture ne veut rien dire, et la liste etant chronologique les deux
     * peuvent etre eloignees de plusieurs ecrans.
     */
    expect(avoir?.numeroFactureCorrigee).toMatch(/^F-\d{4}-\d+$/);
  });

  /*
   * LE TOTAL EST LA RAISON D'ETRE DU SIGNE. Une facture de 4900 corrigee d'un
   * avoir de 1000 laisse 3900 encaisses : sommer des valeurs absolues rendrait
   * 5900, c'est-a-dire compterait un remboursement comme une recette.
   */
  it("soustrait l'avoir du total de la periode", async () => {
    const { commandeId } = await commanderEtFacturer();
    await poserAvoir(commandeId, 1000);

    const vue = await lireVueComptable();

    expect(vue.totalCentimes).toBe(TOTAL_ATTENDU_CENTIMES - 1000);
  });

  it("ecarte les pieces hors de la periode demandee", async () => {
    await commanderEtFacturer();

    /*
     * UNE FENETRE ENTIEREMENT PASSEE, donc vide : la facture vient d'etre
     * emise. C'est le filtre lui-meme qui est mesure, pas le calcul des bornes,
     * qui a son propre test unitaire.
     */
    const vue = await lireVueComptable({
      depuis: new Date("2020-01-01T00:00:00Z"),
      jusqua: new Date("2020-12-31T23:59:59Z"),
    });

    expect(vue.pieces).toEqual([]);
    expect(vue.totalCentimes).toBe(0);
  });

  it("garde les pieces d'une periode qui les englobe", async () => {
    await commanderEtFacturer();

    const vue = await lireVueComptable({
      depuis: new Date("2020-01-01T00:00:00Z"),
      jusqua: new Date("2099-12-31T23:59:59Z"),
    });

    expect(vue.pieces).toHaveLength(1);
    expect(vue.totalCentimes).toBe(TOTAL_ATTENDU_CENTIMES);
  });
});

describe("lirePieceAServir", () => {
  /*
   * UNE PIECE SANS PDF NE SE SERT PAS, et c'est le cas NOMINAL juste apres
   * l'emission : le rendu est declenche apres le commit, regle F8. La route de
   * telechargement rend alors le meme 404 qu'une piece inexistante, et c'est
   * l'ecran qui distingue les deux en affichant « PDF indisponible ».
   */
  it("refuse de servir une facture dont le rendu a echoue", async () => {
    const { commandeId } = await commanderEtFacturer();

    const { rows } = await client.query(
      `SELECT id FROM facture WHERE commande_id = $1`,
      [commandeId],
    );

    expect(await lirePieceAServir(rows[0].id)).toBeNull();
  });

  it("sert une facture dont le PDF existe, avec son numero", async () => {
    const { commandeId } = await commanderEtFacturer();

    const { rows } = await client.query(
      `UPDATE facture SET chemin_pdf = 'factures/test.pdf'
       WHERE commande_id = $1 RETURNING id, numero`,
      [commandeId],
    );

    const piece = await lirePieceAServir(rows[0].id);

    expect(piece).toEqual({
      numero: rows[0].numero,
      cheminPdf: "factures/test.pdf",
    });
  });

  /*
   * LES DEUX TABLES SONT INTERROGEES, et ce test est ce qui le prouve : un
   * identifiant d'avoir doit resoudre, alors que la premiere requete de la
   * fonction ne cherche que dans `facture`. Sans cette recherche, aucun avoir
   * ne serait telechargeable depuis l'ecran.
   */
  it("sert aussi un avoir, dont l'identifiant ne dit pas sa table", async () => {
    const { commandeId } = await commanderEtFacturer();
    await poserAvoir(commandeId, 1000);

    const { rows } = await client.query(
      `UPDATE avoir SET chemin_pdf = 'avoirs/test.pdf' RETURNING id, numero`,
    );

    const piece = await lirePieceAServir(rows[0].id);

    expect(piece).toEqual({
      numero: rows[0].numero,
      cheminPdf: "avoirs/test.pdf",
    });
  });

  it("rend null sur un identifiant qui n'existe dans aucune des deux tables", async () => {
    expect(
      await lirePieceAServir("3f2504e0-4f89-41d3-9a0c-0305e82c3399"),
    ).toBeNull();
  });
});
