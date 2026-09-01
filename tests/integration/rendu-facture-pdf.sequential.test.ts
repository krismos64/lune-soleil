/**
 * RENDU DU PDF DE FACTURE, LS-129 et ADR-034. Cas d'erreur du parcours 4.
 *
 * CE QUI SE JOUE ICI EST LE COMPORTEMENT EN ECHEC, pas le cas nominal. Le rendu
 * lui-meme est couvert par `tests/unitaire/rendu-document-pdf.test.ts`, qui
 * extrait le texte du PDF produit. Ce fichier verifie ce qu'un echec doit
 * laisser derriere lui : un document VALIDE en base, `cheminPdf` nul, une
 * `AlerteCritique`, et surtout AUCUN paiement perdu.
 *
 * LE RENDU S'EXECUTE APRES LE COMMIT, decision d'ADR-034. Placer une ecriture
 * disque dans la transaction du webhook la ferait avorter sur disque plein,
 * perdant le paiement et le mouvement de stock pour un fichier manquant. Ce
 * fichier le prouve en rendant la racine inecrivable : la commande doit rester
 * confirmee et payee.
 *
 * VERIFIER UNE IDENTITE ET NON UNE CARDINALITE, convention de ce projet. Le
 * critere 5 compare le NUMERO avant et apres regeneration : un `toHaveLength(1)`
 * resterait vert sur une facture effacee puis reecrite avec un rang neuf, ce qui
 * violerait l'invariant 4 sans rien faire rougir.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import { montantNormalise, texteDuPdf } from "../aide/texte-pdf";
import type {
  EvenementPaiement,
  VerificateurSignature,
} from "@/integrations/stripe/evenements";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;
let rendreFacture: typeof import("@/services/document-comptable").rendreFacture;

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

const TOTAL_ATTENDU_CENTIMES = 4900;

/** Emetteur de test, INVENTE ET RECONNAISSABLE COMME TEL. */
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

/** Ecrit une commande reelle PAR LE SERVICE, jamais par un `INSERT` a la main. */
async function commanderUnePiece(): Promise<string> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  return issue.commandeId;
}

async function confirmer(commandeId: string): Promise<void> {
  const evenement = evenementReussi(commandeId);

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
  });
}

async function lireFactureUnique(commandeId: string): Promise<{
  id: string;
  numero: string;
  chemin_pdf: string | null;
  instantane_legal: Record<string, unknown>;
}> {
  const { rows } = await client.query(
    `SELECT id, numero, chemin_pdf, instantane_legal
     FROM facture WHERE commande_id = $1`,
    [commandeId],
  );

  expect(rows).toHaveLength(1);

  return rows[0];
}

async function lireAlertes(type: string): Promise<{ id_cible: string }[]> {
  const { rows } = await client.query(
    "SELECT id_cible FROM alerte_critique WHERE type = $1",
    [type],
  );

  return rows;
}

let racine: string;

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
  ({ rendreFacture } = await import("@/services/document-comptable"));
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  racine = await mkdtemp(join(tmpdir(), "ls-documents-integration-"));
  process.env.DOCUMENTS_RACINE = racine;
});

afterEach(async () => {
  await rm(racine, { recursive: true, force: true });
  delete process.env.DOCUMENTS_RACINE;

  await client.query(
    `TRUNCATE alerte_critique, historique_statut, mouvement_stock,
     evenement_fournisseur, paiement, avoir, facture, reservation,
     ligne_commande, commande, variante, produit, categorie, compteur_numero
     CASCADE`,
  );
});

describe("rendu du PDF a la confirmation", () => {
  /** CRITERE 2. Le PDF existe des la confirmation, sans intervention. */
  it("pose cheminPdf et ecrit le fichier apres le commit du webhook", async () => {
    const commandeId = await commanderUnePiece();
    await confirmer(commandeId);

    const facture = await lireFactureUnique(commandeId);

    expect(facture.chemin_pdf).toBe(`2026/${facture.numero}.pdf`);

    const octets = await readFile(join(racine, facture.chemin_pdf as string));

    expect(octets.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(await lireAlertes("PDF_FACTURE_EN_ECHEC")).toHaveLength(0);
  });
});

describe("echec du rendu", () => {
  /**
   * CRITERE 4, LE PLUS IMPORTANT DE LA STORY.
   *
   * LA PANNE EST REELLE ET NON SIMULEE PAR UN DOUBLE : la racine est un
   * FICHIER, donc `mkdir` echoue comme il echouerait sur un disque plein ou un
   * volume non monte. Un double du module de rendu prouverait que le service
   * rattrape ce que le double leve, pas qu'il rattrape une vraie panne disque.
   */
  it("laisse cheminPdf nul, leve une alerte, et le paiement reste acquis", async () => {
    const commandeId = await commanderUnePiece();

    const racineImpossible = join(racine, "fichier-et-non-dossier");
    await writeFile(racineImpossible, "je ne suis pas un dossier");
    process.env.DOCUMENTS_RACINE = racineImpossible;

    await confirmer(commandeId);

    const facture = await lireFactureUnique(commandeId);

    // Le document reste VALIDE en base avec son numero, regle F8.
    expect(facture.chemin_pdf).toBeNull();
    expect(facture.numero).toMatch(/^F-\d{4}-\d{4}$/);
    expect(facture.instantane_legal).not.toBeNull();

    // L'alerte porte la facture, seul moyen de savoir qu'il y a un document a rattraper.
    expect(await lireAlertes("PDF_FACTURE_EN_ECHEC")).toEqual([
      { id_cible: facture.id },
    ]);

    /*
     * ET SURTOUT : LA TRANSACTION N'A PAS ETE ANNULEE. C'est ce que le
     * placement du rendu APRES le commit garantit, et ce qu'un rendu dans la
     * transaction aurait perdu.
     */
    const { rows: commandes } = await client.query(
      "SELECT statut FROM commande WHERE id = $1",
      [commandeId],
    );
    const { rows: paiements } = await client.query(
      "SELECT statut, montant_centimes FROM paiement WHERE commande_id = $1",
      [commandeId],
    );
    const { rows: mouvements } = await client.query(
      "SELECT type FROM mouvement_stock WHERE commande_id = $1",
      [commandeId],
    );

    expect(commandes[0].statut).toBe("CONFIRMEE");
    expect(paiements[0].statut).toBe("REUSSI");
    expect(paiements[0].montant_centimes).toBe(TOTAL_ATTENDU_CENTIMES);
    expect(mouvements).toEqual([{ type: "VENTE_WEB" }]);
  });

  /** CRITERE 5. La regeneration produit le fichier SANS reattribuer de numero. */
  it("regenere apres echec sans jamais reattribuer de numero", async () => {
    const commandeId = await commanderUnePiece();

    const racineImpossible = join(racine, "fichier-et-non-dossier");
    await writeFile(racineImpossible, "je ne suis pas un dossier");
    process.env.DOCUMENTS_RACINE = racineImpossible;

    await confirmer(commandeId);

    const avant = await lireFactureUnique(commandeId);
    expect(avant.chemin_pdf).toBeNull();

    // Le stockage redevient disponible, l'exploitante relance la generation.
    process.env.DOCUMENTS_RACINE = racine;

    const resultat = await rendreFacture(avant.id);

    expect(resultat).toEqual({
      statut: "RENDU",
      cheminRelatif: `2026/${avant.numero}.pdf`,
    });

    const apres = await lireFactureUnique(commandeId);

    /*
     * LE NUMERO EST IDENTIQUE, et c'est l'assertion qui porte le critere. Un
     * rang neuf signifierait qu'un document a ete reemis, ce que l'invariant 4
     * interdit : la sequence fiscale porterait un trou et deux documents
     * existeraient pour une vente.
     */
    expect(apres.numero).toBe(avant.numero);
    expect(apres.id).toBe(avant.id);
    expect(apres.chemin_pdf).toBe(`2026/${avant.numero}.pdf`);

    const octets = await readFile(join(racine, apres.chemin_pdf as string));
    expect(octets.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  /** Une regeneration sur un document deja rendu ne reecrit rien. */
  it("ressort DEJA_RENDU sans toucher au fichier existant", async () => {
    const commandeId = await commanderUnePiece();
    await confirmer(commandeId);

    const facture = await lireFactureUnique(commandeId);

    expect(await rendreFacture(facture.id)).toEqual({
      statut: "DEJA_RENDU",
      cheminRelatif: facture.chemin_pdf,
    });
  });

  it("ressort INTROUVABLE sur une facture qui n'existe pas", async () => {
    expect(await rendreFacture(randomUUID())).toEqual({
      statut: "INTROUVABLE",
    });
  });
});

describe("figement du document", () => {
  /**
   * CRITERE 3. Le PDF reflete l'instantane, pas le catalogue.
   *
   * LE CATALOGUE EST MODIFIE APRES EMISSION, puis le document regenere : son
   * contenu doit rester celui de l'achat, invariant 3. Sans cette garantie, une
   * revision de prix reecrirait des factures deja remises au client.
   */
  it("regenere depuis l'instantane, jamais depuis le catalogue modifie", async () => {
    const commandeId = await commanderUnePiece();

    const racineImpossible = join(racine, "fichier-et-non-dossier");
    await writeFile(racineImpossible, "je ne suis pas un dossier");
    process.env.DOCUMENTS_RACINE = racineImpossible;

    await confirmer(commandeId);

    const facture = await lireFactureUnique(commandeId);
    const instantane = facture.instantane_legal as {
      lignes: { libelleProduit: string; prixUnitaireCentimes: number }[];
    };
    const premiereLigne = instantane.lignes[0];

    if (premiereLigne === undefined) {
      throw new Error("instantane sans ligne, la commande en portait une");
    }

    const libelleAchete = premiereLigne.libelleProduit;
    const prixAchete = premiereLigne.prixUnitaireCentimes;

    // LE CATALOGUE CHANGE APRES L'ACHAT : nouveau nom, nouveau prix.
    await client.query(
      `UPDATE produit SET nom = 'TEST Nom modifie apres emission'
       WHERE id IN (SELECT produit_id FROM variante
                    WHERE id IN (SELECT variante_id FROM ligne_commande
                                 WHERE commande_id = $1))`,
      [commandeId],
    );
    await client.query(
      `UPDATE variante SET prix_centimes = 9999
       WHERE id IN (SELECT variante_id FROM ligne_commande WHERE commande_id = $1)`,
      [commandeId],
    );

    process.env.DOCUMENTS_RACINE = racine;
    await rendreFacture(facture.id);

    const texte = await texteDuPdf(join(racine, `2026/${facture.numero}.pdf`));

    // Le document porte ce qui a ete ACHETE.
    expect(texte).toContain(libelleAchete);
    expect(texte).toContain(montantNormalise(prixAchete));

    // Et rien de ce que le catalogue dit AUJOURD'HUI.
    expect(texte).not.toContain("TEST Nom modifie apres emission");
    expect(texte).not.toContain("99,99");
  });
});
