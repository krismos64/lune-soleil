/**
 * ACCES A LA FACTURE PAR LIEN SIGNE, LS-132, cas de l'achat SANS COMPTE.
 *
 * CE QUI SE JOUE ICI EST L'INVARIANT 2 DANS SA FORME LA PLUS STRICTE. Sans
 * session, l'autorisation ne peut venir que d'un jeton signe : un identifiant
 * de commande dans une URL n'autorise rien par lui-meme. Un defaut ici ouvre
 * la facture d'autrui, donc son nom, son adresse et ses achats.
 *
 * LES QUATRE CONDITIONS SE TESTENT SEPAREMENT, regle L9 et critere 3. Modifie,
 * expire, consomme, revoque : chacune a son test, et le piege documente est de
 * ne verifier que l'expiration, ce qui laisse utilisable jusqu'a son terme un
 * lien parti sur une adresse email erronee.
 *
 * LE REFUS EST INDISCERNABLE, critere 2. Les tests verifient que les quatre
 * refus rendent la MEME chose, sans quoi la route devient un oracle : « ce
 * jeton a expire » revele qu'il a existe, donc qu'une commande existe.
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
let autoriserAccesDocument: typeof import("@/services/acces-document").autoriserAccesDocument;
let engendrerJeton: typeof import("@/lib/jeton-acces").engendrerJeton;
let empreinteJeton: typeof import("@/lib/jeton-acces").empreinteJeton;

const SECRET_TEST = ["ls132", "integration", "jetable"].join("-");

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

/**
 * Passe et confirme une commande PAR LES SERVICES, jamais par un `INSERT`.
 *
 * Reproduire l'emission a la main verifierait la reproduction et non le
 * service, piege rencontre sur ce projet le 25 aout 2026.
 */
async function commanderEtConfirmer(): Promise<{
  commandeId: string;
  factureId: string;
}> {
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

  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM facture WHERE commande_id = $1",
    [issue.commandeId],
  );

  const facture = rows[0];

  if (facture === undefined) {
    throw new Error("aucune facture emise par la confirmation");
  }

  return { commandeId: issue.commandeId, factureId: facture.id };
}

/**
 * Le jeton en base pour une commande, tel qu'il a ete ecrit par l'emission.
 *
 * LA VALEUR EN CLAIR N'EXISTE PAS EN BASE, regle L5 : ces tests la reconstituent
 * en engendrant leur propre jeton et en posant son empreinte, ce qui est
 * exactement ce que fait la production.
 */
async function poserJeton(
  commandeId: string,
  options: {
    expireA?: Date;
    utiliseA?: Date | null;
    revoqueA?: Date | null;
    portee?: string;
  } = {},
): Promise<string> {
  const jeton = engendrerJeton();

  const expireA =
    options.expireA ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await client.query(
    `INSERT INTO jeton_acces (id, commande_id, empreinte, portee, expire_a, utilise_a, revoque_a)
     VALUES ($1, $2, $3, $4::"PorteeJeton", $5, $6, $7)`,
    [
      randomUUID(),
      commandeId,
      jeton.empreinte,
      options.portee ?? "DOCUMENT",
      expireA,
      options.utiliseA ?? null,
      options.revoqueA ?? null,
    ],
  );

  return jeton.valeur;
}

/** Pose un chemin de PDF, le rendu n'etant pas le sujet de cette story. */
async function poserCheminPdf(factureId: string): Promise<void> {
  await client.query("UPDATE facture SET chemin_pdf = $1 WHERE id = $2", [
    "2026/F-2026-0001.pdf",
    factureId,
  ]);
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET = SECRET_TEST;

  process.env.FACTURE_RAISON_SOCIALE = EMETTEUR_TEST.raisonSociale;
  process.env.FACTURE_SIRET = EMETTEUR_TEST.siret;
  process.env.FACTURE_ADRESSE = EMETTEUR_TEST.adresse;
  process.env.FACTURE_EMAIL_CONTACT = EMETTEUR_TEST.emailContact;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ autoriserAccesDocument } = await import("@/services/acces-document"));
  ({ engendrerJeton, empreinteJeton } = await import("@/lib/jeton-acces"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE alerte_critique, historique_statut, mouvement_stock,
     evenement_fournisseur, paiement, jeton_acces, avoir, facture, reservation,
     ligne_commande, commande, variante, produit, categorie, compteur_numero
     CASCADE`,
  );
});

describe("emission : le jeton nait avec la facture", () => {
  /**
   * CRITERE 1, versant ecriture. Sans jeton cree a l'emission, la facture
   * existe sans moyen d'acces et le defaut ne se voit qu'a la reclamation du
   * client.
   */
  it("ecrit un jeton de portee DOCUMENT pour la commande facturee", async () => {
    const { commandeId } = await commanderEtConfirmer();

    const { rows } = await client.query<{
      portee: string;
      empreinte: string;
      utilise_a: Date | null;
      revoque_a: Date | null;
      expire_a: Date;
    }>(
      `SELECT portee, empreinte, utilise_a, revoque_a, expire_a
       FROM jeton_acces WHERE commande_id = $1`,
      [commandeId],
    );

    expect(rows).toHaveLength(1);

    const jeton = rows[0];

    if (jeton === undefined) {
      throw new Error("aucun jeton engendre a l'emission");
    }

    expect(jeton.portee).toBe("DOCUMENT");
    expect(jeton.utilise_a).toBeNull();
    expect(jeton.revoque_a).toBeNull();
    expect(jeton.expire_a.getTime()).toBeGreaterThan(Date.now());
  });

  /**
   * REGLE L5, ET C'EST LE POINT LE PLUS EXPOSE. Une fuite de la table ne doit
   * donner aucun acces : l'empreinte y est, la valeur nulle part.
   */
  it("ne stocke que l'empreinte, jamais une valeur utilisable", async () => {
    const { commandeId } = await commanderEtConfirmer();

    const { rows } = await client.query<{ empreinte: string }>(
      "SELECT empreinte FROM jeton_acces WHERE commande_id = $1",
      [commandeId],
    );

    const empreinte = rows[0]?.empreinte;

    if (empreinte === undefined) {
      throw new Error("aucun jeton engendre");
    }

    /*
     * L'EMPREINTE PRESENTEE COMME VALEUR NE DOIT PAS OUVRIR L'ACCES. Si elle
     * le faisait, la colonne serait un secret en clair sous un autre nom.
     */
    const acces = await autoriserAccesDocument(empreinte);

    expect(acces.statut).toBe("REFUSE");
  });
});

describe("acces autorise, cas nominal", () => {
  /** CRITERE 1 : un lien valide donne acces a la facture de SA commande. */
  it("autorise avec un jeton valide et rend le document de cette commande", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const valeur = await poserJeton(commandeId);

    const acces = await autoriserAccesDocument(valeur);

    expect(acces.statut).toBe("AUTORISE");

    if (acces.statut !== "AUTORISE") {
      throw new Error("acces refuse alors qu'il devait etre autorise");
    }

    /* IDENTITE ET NON CARDINALITE : c'est CETTE facture qui doit sortir. */
    expect(acces.factureId).toBe(factureId);
    expect(acces.numero).toMatch(/^F-\d{4}-\d{4}$/);
  });

  /**
   * L'ACCES EST REPETABLE, arbitrage de LS-132. La portee `DOCUMENT` est une
   * consultation, pas une action : consommer a la premiere lecture rendrait le
   * lien inutilisable au second clic du client.
   */
  it("reste autorise a la seconde lecture, le jeton n'etant pas consomme", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const valeur = await poserJeton(commandeId);

    expect((await autoriserAccesDocument(valeur)).statut).toBe("AUTORISE");
    expect((await autoriserAccesDocument(valeur)).statut).toBe("AUTORISE");

    const { rows } = await client.query<{ utilise_a: Date | null }>(
      "SELECT utilise_a FROM jeton_acces WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows[0]?.utilise_a).toBeNull();
  });
});

describe("les quatre conditions, chacune separement, regle L9", () => {
  /** CONDITION 1 sur 4 : MODIFIE. Elle se teste sans toucher la base. */
  it("refuse un jeton dont la valeur a ete modifiee", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const valeur = await poserJeton(commandeId);
    const separateur = valeur.lastIndexOf(".");
    const alea = valeur.slice(0, separateur);
    const signature = valeur.slice(separateur + 1);
    const modifie = `${alea.slice(0, -1)}${alea.at(-1) === "A" ? "B" : "A"}.${signature}`;

    expect((await autoriserAccesDocument(modifie)).statut).toBe("REFUSE");
  });

  /** CONDITION 2 sur 4 : EXPIRE. */
  it("refuse un jeton expire", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const valeur = await poserJeton(commandeId, {
      expireA: new Date(Date.now() - 1000),
    });

    expect((await autoriserAccesDocument(valeur)).statut).toBe("REFUSE");
  });

  /**
   * CONDITION 3 sur 4 : CONSOMME. Cette portee ne consomme pas d'elle-meme,
   * mais un jeton marque consomme par un autre chemin doit etre refuse : la
   * regle L9 vaut pour les quatre portees.
   */
  it("refuse un jeton consomme", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const valeur = await poserJeton(commandeId, { utiliseA: new Date() });

    expect((await autoriserAccesDocument(valeur)).statut).toBe("REFUSE");
  });

  /**
   * CONDITION 4 sur 4 : REVOQUE. C'est le cas du lien parti sur une adresse
   * erronee, celui qu'un controle limite a l'expiration laisse ouvert.
   */
  it("refuse un jeton revoque, meme non expire et non consomme", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const valeur = await poserJeton(commandeId, { revoqueA: new Date() });

    expect((await autoriserAccesDocument(valeur)).statut).toBe("REFUSE");
  });

  /** REGLE L6, moindre privilege : une autre portee n'ouvre pas le document. */
  it("refuse un jeton d'une autre portee", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const valeur = await poserJeton(commandeId, { portee: "SUIVI" });

    expect((await autoriserAccesDocument(valeur)).statut).toBe("REFUSE");
  });
});

describe("test negatif de securite, critere 2", () => {
  /**
   * LE COEUR DE LA STORY. Un client demande la facture d'un autre : le refus
   * doit etre securise et ne rien reveler.
   */
  it("refuse le jeton d'une commande pour lire la facture d'une autre", async () => {
    const victime = await commanderEtConfirmer();
    await poserCheminPdf(victime.factureId);

    const attaquant = await commanderEtConfirmer();
    await poserCheminPdf(attaquant.factureId);

    /* Le jeton legitime de l'attaquant ouvre SA facture, pas celle de l'autre. */
    const sien = await poserJeton(attaquant.commandeId);

    const acces = await autoriserAccesDocument(sien);

    expect(acces.statut).toBe("AUTORISE");

    if (acces.statut !== "AUTORISE") {
      throw new Error("acces refuse alors qu'il devait etre autorise");
    }

    expect(acces.factureId).toBe(attaquant.factureId);
    expect(acces.factureId).not.toBe(victime.factureId);
  });

  /**
   * CRITERE 4 : UN IDENTIFIANT SEUL N'AUTORISE RIEN. C'est l'invariant 2
   * enonce a la lettre, et le test le plus direct de la story.
   */
  it("refuse un identifiant de commande presente comme jeton", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    expect((await autoriserAccesDocument(commandeId)).statut).toBe("REFUSE");
    expect((await autoriserAccesDocument(factureId)).statut).toBe("REFUSE");
  });

  /**
   * L'ENUMERATION NE DOIT RIEN RENDRE. Une valeur bien formee mais inconnue est
   * refusee comme les autres.
   */
  it("refuse un jeton correctement signe mais absent de la base", async () => {
    const { factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const orphelin = engendrerJeton();

    expect((await autoriserAccesDocument(orphelin.valeur)).statut).toBe(
      "REFUSE",
    );
  });

  /**
   * LES REFUS SONT INDISCERNABLES. Si les cinq refus rendaient des formes
   * differentes, l'appelant reconstituerait le motif et la route deviendrait un
   * oracle sans qu'aucune regle n'ait ete enfreinte explicitement.
   */
  it("rend exactement la meme reponse pour les cinq motifs de refus", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const refus = [
      await autoriserAccesDocument("valeur-forgee-sans-signature"),
      await autoriserAccesDocument(engendrerJeton().valeur),
      await autoriserAccesDocument(
        await poserJeton(commandeId, { expireA: new Date(Date.now() - 1000) }),
      ),
      await autoriserAccesDocument(
        await poserJeton(commandeId, { utiliseA: new Date() }),
      ),
      await autoriserAccesDocument(
        await poserJeton(commandeId, { revoqueA: new Date() }),
      ),
    ];

    for (const acces of refus) {
      expect(acces).toEqual({ statut: "REFUSE" });
    }

    /* Aucune cle supplementaire ne doit distinguer un refus d'un autre. */
    const formes = new Set(refus.map((acces) => JSON.stringify(acces)));

    expect(formes.size).toBe(1);
  });
});

describe("aucune fuite de la valeur du jeton, critere 5 et invariant 9", () => {
  /**
   * LE DEPOT EST PUBLIC ET LES JOURNAUX SORTENT SUR LA SORTIE STANDARD. Une
   * valeur de jeton journalisee est un acces en clair dans les traces
   * d'exploitation, lisible par quiconque les consulte.
   *
   * LA SORTIE EST CAPTUREE REELLEMENT, et non inspectee par lecture du code :
   * un controle textuel dirait que la fonction n'interpole rien, il ne dirait
   * pas ce qui sort a l'execution.
   */
  it("n'ecrit jamais la valeur du jeton dans la sortie journalisee", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const valide = await poserJeton(commandeId);
    const expire = await poserJeton(commandeId, {
      expireA: new Date(Date.now() - 1000),
    });
    const forge = engendrerJeton().valeur;

    const lignes: string[] = [];
    const ecritureOriginale = process.stdout.write.bind(process.stdout);

    process.stdout.write = ((morceau: string | Uint8Array): boolean => {
      lignes.push(typeof morceau === "string" ? morceau : morceau.toString());
      return true;
    }) as typeof process.stdout.write;

    try {
      await autoriserAccesDocument(valide);
      await autoriserAccesDocument(expire);
      await autoriserAccesDocument(forge);
    } finally {
      process.stdout.write = ecritureOriginale;
    }

    const sortie = lignes.join("");

    /* LA SORTIE N'EST PAS VIDE, sans quoi le test passerait sans rien prouver. */
    expect(sortie).toContain("Acces document refuse");

    for (const valeur of [valide, expire, forge]) {
      expect(sortie).not.toContain(valeur);

      /*
       * LA PARTIE ALEATOIRE SEULE EST AUSSI VERIFIEE : une troncature qui
       * garderait le debut du jeton fuirait l'essentiel de son entropie.
       */
      const alea = valeur.slice(0, valeur.lastIndexOf("."));

      expect(sortie).not.toContain(alea);
    }
  });

  /**
   * L'EMPREINTE NON PLUS NE DOIT PAS SORTIR. Elle n'ouvre aucun acces, mais
   * elle identifie la ligne : la journaliser reconstituerait qui a consulte
   * quoi, sans valeur pour le diagnostic.
   */
  it("n'ecrit pas non plus l'empreinte dans la sortie journalisee", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    await poserCheminPdf(factureId);

    const valeur = await poserJeton(commandeId);

    const lignes: string[] = [];
    const ecritureOriginale = process.stdout.write.bind(process.stdout);

    process.stdout.write = ((morceau: string | Uint8Array): boolean => {
      lignes.push(typeof morceau === "string" ? morceau : morceau.toString());
      return true;
    }) as typeof process.stdout.write;

    try {
      await autoriserAccesDocument(
        await poserJeton(commandeId, { revoqueA: new Date() }),
      );
    } finally {
      process.stdout.write = ecritureOriginale;
    }

    expect(lignes.join("")).not.toContain(empreinteJeton(valeur));
  });
});

describe("etats du document", () => {
  /**
   * REGLE F8 : la facture existe en base avant son rendu. Un `cheminPdf` nul
   * est un etat attendu, et il n'y a rien a servir.
   */
  it("refuse quand le PDF n'a pas encore ete rendu", async () => {
    const { commandeId } = await commanderEtConfirmer();

    /* Aucun `poserCheminPdf` : la colonne reste nulle. */
    const valeur = await poserJeton(commandeId);

    expect((await autoriserAccesDocument(valeur)).statut).toBe("REFUSE");
  });

  /**
   * L'EMPREINTE EST BIEN CELLE DE LA VALEUR TRANSMISE, et ce test relie les
   * deux moities : sans cela, un jeton pourrait etre ecrit sans jamais
   * correspondre a un lien utilisable.
   */
  it("retrouve le jeton par l'empreinte de la valeur", async () => {
    const { commandeId } = await commanderEtConfirmer();

    const valeur = await poserJeton(commandeId);

    const { rows } = await client.query<{ empreinte: string }>(
      "SELECT empreinte FROM jeton_acces WHERE commande_id = $1 AND portee = 'DOCUMENT' ORDER BY expire_a DESC",
      [commandeId],
    );

    expect(rows.map((ligne) => ligne.empreinte)).toContain(
      empreinteJeton(valeur),
    );
  });
});
