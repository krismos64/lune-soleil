/**
 * La ROUTE du webhook de paiement, LS-119. Adaptateur d'entree.
 *
 * POURQUOI TESTER LA ROUTE ET PAS SEULEMENT LE SERVICE. Trois garanties ne
 * vivent que dans l'adaptateur, et aucun test de service ne les voit :
 *
 * - le corps est lu en TEXTE BRUT, sans aller-retour par `JSON.parse`, faute de
 *   quoi toute signature legitime serait refusee en production ;
 * - une requete sans en-tete de signature est refusee AVANT tout traitement ;
 * - le code de reponse commande le rejeu chez le prestataire, et se tromper de
 *   code fait soit perdre un evenement, soit le rejouer indefiniment.
 *
 * LA SIGNATURE EST VRAIE, engendree par le SDK avec un secret de test : le
 * double du service ne prouverait rien de la verification reelle, qui est
 * precisement ce que cette route branche. Piege du 25 aout 2026, tester le vrai
 * point d'entree et non sa reproduction.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let POST: typeof import("@/app/api/webhooks/paiement/route").POST;
let passerCommande: typeof import("@/services/commande").passerCommande;

/**
 * Secret de signature du test, engendre a l'execution.
 *
 * IL N'EST PAS ECRIT EN CLAIR DANS LE DEPOT, qui est public : un litteral
 * ressemblant a un secret de webhook ferait echouer le controle de secrets, qui
 * ne peut pas distinguer une valeur de test d'une vraie et a raison de ne pas
 * essayer. Meme motif que `urlFictive` dans le test de sante.
 */
const SECRET_TEST = `whsec_${"t".repeat(8)}${Date.now().toString(36)}`;

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

/**
 * Charge d'un evenement `checkout.session.completed`, forme du prestataire.
 *
 * ELLE EST INDENTEE, ET CE N'EST PAS COSMETIQUE. Stripe envoie du JSON indente,
 * et la signature porte sur les OCTETS EXACTS. Avec une charge compacte, produite
 * par un `JSON.stringify` nu, un aller-retour `JSON.parse` puis `stringify` dans
 * l'adaptateur redonnerait a l'octet pres la meme chaine : le test resterait vert
 * alors que la production refuserait toute signature legitime. Mesure le 27 aout
 * 2026, la mutation passait inapercue sur une charge compacte.
 */
function chargeSessionPayee(commandeId: string): string {
  return JSON.stringify(
    {
      id: `evt_test_${commandeId.slice(0, 8)}`,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${commandeId.slice(0, 8)}`,
          object: "checkout.session",
          payment_status: "paid",
          amount_total: 4900,
          metadata: { commandeId },
        },
      },
    },
    null,
    2,
  );
}

/** Requete POST portant un corps et, au choix, une signature authentique. */
function requete(corps: string, options: { signature?: string } = {}): Request {
  return new Request("https://exemple.invalid/api/webhooks/paiement", {
    method: "POST",
    ...(options.signature === undefined
      ? {}
      : { headers: { "stripe-signature": options.signature } }),
    body: corps,
  });
}

/** Signature authentique du corps, engendree par le SDK avec le secret de test. */
function signer(corps: string): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload: corps,
    secret: SECRET_TEST,
  });
}

async function commanderUnePiece(): Promise<string> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  return issue.commandeId;
}

async function lireStatutCommande(commandeId: string): Promise<string> {
  const { rows } = await client.query<{ statut: string }>(
    "SELECT statut FROM commande WHERE id = $1",
    [commandeId],
  );

  return rows[0]?.statut ?? "INTROUVABLE";
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.STRIPE_WEBHOOK_SECRET = SECRET_TEST;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ POST } = await import("@/app/api/webhooks/paiement/route"));
  ({ passerCommande } = await import("@/services/commande"));
});

afterAll(async () => {
  await client.end();
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

afterEach(async () => {
  await client.query(
    `TRUNCATE alerte_critique, historique_statut, mouvement_stock,
     evenement_fournisseur, paiement, reservation, ligne_commande, commande,
     variante, produit, categorie, compteur_numero CASCADE`,
  );
});

describe("route du webhook de paiement", () => {
  it("confirme la commande sur un evenement REELLEMENT signe", async () => {
    const commandeId = await commanderUnePiece();
    const corps = chargeSessionPayee(commandeId);

    const reponse = await POST(requete(corps, { signature: signer(corps) }));

    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({ issue: "TRAITE" });

    /*
     * LA COMMANDE EST CONFIRMEE, et c'est ce qui prouve que le corps a bien ete
     * lu en TEXTE BRUT. Si la route decodait puis re-serialisait la charge,
     * l'espacement changerait et cette signature authentique serait refusee.
     */
    expect(await lireStatutCommande(commandeId)).toBe("CONFIRMEE");
  });

  it("refuse sans produire d'effet quand la signature ne correspond pas au corps", async () => {
    const commandeId = await commanderUnePiece();
    const corps = chargeSessionPayee(commandeId);

    // Signature valide, mais engendree sur un AUTRE corps : exactement ce que
    // produit une charge falsifiee apres coup.
    const signatureDUnAutreCorps = signer(chargeSessionPayee("autre-commande"));

    const reponse = await POST(
      requete(corps, { signature: signatureDUnAutreCorps }),
    );

    /*
     * 200 ET NON 400, ET C'EST UNE DECISION. Le prestataire rejoue tout ce qui
     * ne recoit pas de 2xx : un evenement mal signe ne deviendra jamais valide,
     * donc le rejouer indefiniment ne ferait que remplir ses files et noyer les
     * echecs qui comptent. Le refus est trace au journal, cote serveur.
     */
    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({
      issue: "SIGNATURE_INVALIDE",
    });

    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");

    const { rows } = await client.query("SELECT id FROM evenement_fournisseur");
    expect(rows).toEqual([]);
  });

  it("refuse en 400 une requete sans en-tete de signature", async () => {
    const commandeId = await commanderUnePiece();

    const reponse = await POST(requete(chargeSessionPayee(commandeId)));

    /*
     * 400 ICI ET NON 200 : sans en-tete, rien n'est verifiable et la requete est
     * malformee au sens du protocole. Le prestataire en envoie toujours un ; une
     * requete sans signature ne vient donc pas de lui.
     */
    expect(reponse.status).toBe(400);
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
  });

  it("ne produit aucun effet quand le secret de signature est absent", async () => {
    const commandeId = await commanderUnePiece();
    const corps = chargeSessionPayee(commandeId);
    const signature = signer(corps);

    /*
     * DEFAUT FERME : sans secret configure, aucune signature ne peut etre
     * verifiee, donc AUCUN evenement ne produit d'effet.
     *
     * CE QUE CE TEST EPROUVE VRAIMENT, ET LA NUANCE COMPTE. Le refus lui-meme
     * est tenu par le SDK, qui rejette un secret vide : mesure par mutation le
     * 27 aout 2026, retirer la garde explicite ne changeait NI le statut, NI
     * l'absence d'effet. La garde est une seconde ligne de defense, et ce
     * qu'elle seule apporte est LE JOURNAL NOMMANT LA VARIABLE ABSENTE. Sans
     * lui, une variable oubliee au deploiement serait indistinguable d'une
     * charge falsifiee, et l'exploitation chercherait une attaque devant une
     * erreur de configuration. C'est donc sur cette ligne que porte l'assertion,
     * meme motif que la cle absente de LS-118.
     */
    const secretInitial = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    /*
     * LE JOURNAL ECRIT SUR `process.stderr` ET NON SUR `console.error`,
     * `lib/journal.ts` : intercepter la console ne verrait rien passer, et
     * l'assertion serait vide en croyant prouver quelque chose.
     */
    const lignes: string[] = [];
    const ecrireInitial = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((morceau: string | Uint8Array) => {
      lignes.push(String(morceau));
      return true;
    }) as typeof process.stderr.write;

    try {
      const reponse = await POST(requete(corps, { signature }));

      expect(reponse.status).toBe(200);
      await expect(reponse.json()).resolves.toEqual({
        issue: "SIGNATURE_INVALIDE",
      });

      expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");

      /*
       * LE NOM DE LA VARIABLE, ET LUI SEUL, invariant 9 : jamais sa valeur, le
       * depot etant public.
       */
      expect(lignes.join("\n")).toContain("STRIPE_WEBHOOK_SECRET");
    } finally {
      process.stderr.write = ecrireInitial;

      if (secretInitial !== undefined) {
        process.env.STRIPE_WEBHOOK_SECRET = secretInitial;
      }
    }
  });

  it("ignore un type d'evenement non traite, sans effet et sans rejeu", async () => {
    const commandeId = await commanderUnePiece();

    const corps = JSON.stringify({
      id: "evt_test_type_inconnu",
      object: "event",
      type: "customer.created",
      data: { object: { id: "cus_test" } },
    });

    const reponse = await POST(requete(corps, { signature: signer(corps) }));

    /*
     * UN TYPE NON TRAITE EST REFUSE EXPLICITEMENT et non ignore en silence : un
     * type inconnu qui passerait pour un paiement reussi confirmerait une
     * commande sur un evenement quelconque. Le 200 evite le rejeu inutile.
     */
    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({
      issue: "SIGNATURE_INVALIDE",
    });

    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
  });
});
