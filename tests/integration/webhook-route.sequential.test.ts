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

/**
 * Ce que `creerSession` transmet REELLEMENT dans `payment_intent_data.metadata`.
 *
 * POURQUOI PASSER PAR LE SDK PLUTOT QUE DE LIRE LE CODE. C'est ce bloc, et lui
 * seul, que Stripe recopie sur le PaymentIntent puis sur la Charge. Le lire ici
 * revient a demander au code de production « qu'est-ce que tu poses sur la
 * charge », au lieu de le supposer : retirer `payment_intent_data` rend un objet
 * vide, la commande n'est plus retrouvee, et le test du remboursement rougit.
 *
 * L'APPEL RESEAU EST INTERCEPTE, aucun compte n'etant ouvert, LS-18 : seul
 * compte ce qui PART, pas ce qui reviendrait.
 */
async function metadataTransmiseAuPaymentIntent(
  commandeId: string,
): Promise<Record<string, string>> {
  const { fournisseurStripe } = await import("@/integrations/stripe");

  /*
   * L'INTERCEPTION PORTE SUR LE PROTOTYPE DU SDK et non sur `globalThis.fetch` :
   * le client HTTP par defaut de stripe-node ne passe pas par `fetch`, une
   * premiere version interceptait donc dans le vide et l'appel partait pour de
   * bon, echouant sur la cle. Le prototype est le seul point que le code de
   * production traverse forcement, sans avoir a le modifier pour le test.
   */
  let transmis: Record<string, unknown> = {};

  const prototype = Object.getPrototypeOf(
    (fournisseurStripeInterne() as { checkout: { sessions: unknown } }).checkout
      .sessions,
  ) as { create: (...arguments_: unknown[]) => Promise<unknown> };

  const creerInitial = prototype.create;

  prototype.create = async (...arguments_: unknown[]) => {
    transmis = (arguments_[0] ?? {}) as Record<string, unknown>;

    return {
      id: "cs_test_intercepte",
      url: "https://paiement.example.invalid/intercepte",
    };
  };

  const cleInitiale = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = `sk_test_${"x".repeat(8)}`;

  try {
    await fournisseurStripe.creerSession({
      commandeId,
      numeroCommande: "C-2026-TEST",
      emailClient: "test@example.invalid",
      lignes: [{ libelle: "TEST", quantite: 1, prixUnitaireCentimes: 4900 }],
      expireA: new Date(Date.now() + 1_800_000),
      cleIdempotence: `test-${commandeId}`,
      urlRetour: "https://exemple.invalid/retour",
      urlAbandon: "https://exemple.invalid/abandon",
    });
  } finally {
    prototype.create = creerInitial;

    if (cleInitiale === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = cleInitiale;
    }
  }

  const donnees = transmis as {
    payment_intent_data?: { metadata?: Record<string, string> };
  };

  return donnees.payment_intent_data?.metadata ?? {};
}

/** Une instance du SDK, seulement pour atteindre le prototype a intercepter. */
function fournisseurStripeInterne(): Stripe {
  return new Stripe(`sk_test_${"y".repeat(8)}`);
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

  /*
   * LE REMBOURSEMENT PAR LE CHEMIN REEL, ET CE TEST EXISTE PARCE QU'IL MANQUAIT.
   *
   * `ls-critical-reviewer` a releve le 27 aout 2026 que TOUT remboursement etait
   * refuse en production : `creerSession` ne posait les metadonnees que sur la
   * Checkout Session, et Stripe ne les recopie NI sur le PaymentIntent, NI sur
   * la Charge. L'evenement `charge.refunded` portait donc `metadata: {}`, la
   * commande n'etait pas retrouvee, et le remboursement disparaissait en
   * silence, l'evenement n'etant pas rejoue apres un 200.
   *
   * La logique de remboursement etait pourtant testee, mais par un double qui
   * fabriquait l'evenement du DOMAINE : elle n'etait jamais atteinte par le
   * chemin reel. C'est le motif « tester le service, pas sa reproduction », ici
   * sur l'autre bout du contrat. Ce test part de la charge telle que le
   * prestataire l'envoie, donc il traverse la traduction.
   */
  it("enregistre un remboursement recu sur la forme reelle d'une charge", async () => {
    const commandeId = await commanderUnePiece();

    // La commande est d'abord payee, par le chemin reel lui aussi.
    const paiement = chargeSessionPayee(commandeId);
    await POST(requete(paiement, { signature: signer(paiement) }));

    /*
     * LES METADONNEES DE LA CHARGE NE SONT PAS ECRITES A LA MAIN, ET C'EST TOUT
     * L'INTERET DE CE TEST. Les ecrire ici prouverait le test et non le code :
     * mesure le 27 aout 2026, la mutation retirant `payment_intent_data` restait
     * INVISIBLE sur une charge fabriquee.
     *
     * Elles sont donc prises la ou la production les met : ce que
     * `creerSession` transmet au prestataire dans `payment_intent_data.metadata`,
     * capture par un client double. Stripe recopie ce bloc sur le PaymentIntent
     * puis sur la Charge ; sans lui, la charge arrive avec `metadata: {}` et
     * tout remboursement est refuse en silence.
     */
    const metadataCharge = await metadataTransmiseAuPaymentIntent(commandeId);

    const corps = JSON.stringify(
      {
        id: `evt_remboursement_${commandeId.slice(0, 8)}`,
        object: "event",
        type: "charge.refunded",
        data: {
          object: {
            id: `ch_test_${commandeId.slice(0, 8)}`,
            object: "charge",
            amount: 4900,
            amount_refunded: 1000,
            payment_intent: `pi_test_${commandeId.slice(0, 8)}`,
            metadata: metadataCharge,
          },
        },
      },
      null,
      2,
    );

    const reponse = await POST(requete(corps, { signature: signer(corps) }));

    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({ issue: "TRAITE" });

    const { rows } = await client.query<{
      statut: string;
      montant_rembourse_centimes: number;
    }>(
      `SELECT statut, montant_rembourse_centimes FROM paiement
       WHERE commande_id = $1 AND statut <> 'ECHOUE'`,
      [commandeId],
    );

    expect(rows[0]?.statut).toBe("PARTIELLEMENT_REMBOURSE");
    expect(rows[0]?.montant_rembourse_centimes).toBe(1000);

    // LE STATUT LOGISTIQUE N'EST PAS TOUCHE, les deux axes restant distincts.
    expect(await lireStatutCommande(commandeId)).toBe("CONFIRMEE");
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
     *
     * L'ISSUE EST `CHARGE_INEXPLOITABLE` ET NON `SIGNATURE_INVALIDE`, correction
     * du 27 aout 2026 : la signature est VALIDE, l'evenement vient bien du
     * prestataire. Les confondre ferait chercher une attaque devant une simple
     * evolution d'API, et revoquer le secret casserait le webhook legitime.
     */
    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({
      issue: "CHARGE_INEXPLOITABLE",
    });

    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
  });
});
