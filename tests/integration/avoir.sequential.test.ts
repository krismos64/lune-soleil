/**
 * REMBOURSEMENT ET EMISSION DE L'AVOIR, LS-128, etapes 4 a 6 du parcours 4.
 *
 * CE QUI SE JOUE ICI EST L'INVARIANT 4. Une facture emise est immuable : un
 * remboursement ne la corrige jamais, il produit un AVOIR, document distinct
 * portant sa propre sequence de numerotation. Un defaut ici modifie un document
 * comptable opposable, ce qu'aucun correctif ulterieur ne repare.
 *
 * L'ORDRE EST LE SUJET PRINCIPAL : le prestataire d'abord, la base ensuite. Un
 * avoir ne doit naitre que si l'argent est REELLEMENT parti. Les tests de refus
 * et de panne verifient l'etat de la base APRES, pas seulement la valeur rendue :
 * une fonction peut rendre le bon statut en ayant deja ecrit.
 *
 * LE DOUBLE DU PRESTATAIRE EST EXPLICITE, jamais complaisant. Chaque scenario
 * dit ce que Stripe repond, et les appels sont comptes : c'est ainsi que la cle
 * d'idempotence se verifie, ADR-032.
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
import type {
  DemandeRemboursement,
  FournisseurPaiement,
  IssueRemboursement,
} from "@/integrations/stripe/fournisseur";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;
let rembourserCommande: typeof import("@/services/avoir").rembourserCommande;
let PrestatairePaiementIndisponibleError: typeof import("@/integrations/stripe/fournisseur").PrestatairePaiementIndisponibleError;

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
const TOTAL_CENTIMES = 4900;

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

/**
 * Double du prestataire, dont le comportement de remboursement est choisi par
 * le test.
 *
 * IL ENREGISTRE SES APPELS, cles d'idempotence comprises : sans cela, le
 * critere d'idempotence d'ADR-032 ne serait pas verifiable, et deux appels
 * portant deux cles differentes passeraient pour un comportement correct.
 */
function fournisseurDouble(
  reponse: (demande: DemandeRemboursement) => Promise<IssueRemboursement>,
): FournisseurPaiement & { appels: DemandeRemboursement[] } {
  const appels: DemandeRemboursement[] = [];

  return {
    appels,
    async creerSession(): Promise<never> {
      throw new Error("creerSession n'a pas sa place dans ces tests");
    },
    async expirerSession() {
      return "DEJA_FERMEE" as const;
    },
    async lireSession(): Promise<never> {
      throw new Error("lireSession n'a pas sa place dans ces tests");
    },
    async rembourser(demande: DemandeRemboursement) {
      appels.push(demande);
      return reponse(demande);
    },
  };
}

/** Prestataire qui rembourse exactement ce qu'on lui demande. */
function fournisseurQuiRembourse(): ReturnType<typeof fournisseurDouble> {
  return fournisseurDouble(async (demande) => ({
    issue: "REMBOURSE",
    identifiantRemboursement: `re_test_${randomUUID().slice(0, 8)}`,
    montantCentimes: demande.montantCentimes,
  }));
}

/** Passe une commande, la confirme, et rend ses identifiants. */
async function commanderEtConfirmer(): Promise<{
  commandeId: string;
  factureId: string;
  numeroFacture: string;
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

  const { rows } = await client.query<{ id: string; numero: string }>(
    "SELECT id, numero FROM facture WHERE commande_id = $1",
    [issue.commandeId],
  );

  const facture = rows[0];

  if (facture === undefined) {
    throw new Error("aucune facture emise par la confirmation");
  }

  return {
    commandeId: issue.commandeId,
    factureId: facture.id,
    numeroFacture: facture.numero,
  };
}

/** Les avoirs d'une facture, tels qu'ils sont en base. */
async function lireAvoirs(factureId: string): Promise<
  {
    id: string;
    numero: string;
    montant_centimes: number;
    motif: string;
    instantane_legal: Record<string, unknown>;
  }[]
> {
  const { rows } = await client.query(
    `SELECT id, numero, montant_centimes, motif, instantane_legal
     FROM avoir WHERE facture_id = $1 ORDER BY emis_a`,
    [factureId],
  );

  return rows;
}

/** L'etat du paiement d'une commande. */
async function lirePaiement(commandeId: string): Promise<{
  statut: string;
  montant_rembourse_centimes: number;
}> {
  const { rows } = await client.query<{
    statut: string;
    montant_rembourse_centimes: number;
  }>(
    `SELECT statut, montant_rembourse_centimes FROM paiement
     WHERE commande_id = $1 AND identifiant_fournisseur IS NOT NULL`,
    [commandeId],
  );

  const paiement = rows[0];

  if (paiement === undefined) {
    throw new Error("aucun paiement encaisse");
  }

  return paiement;
}

/** L'etat de la facture, pour prouver son immuabilite. */
async function lireFacture(factureId: string): Promise<{
  numero: string;
  montant_total_centimes: number;
  montant_avoir_centimes: number;
  instantane_legal: Record<string, unknown>;
  emise_a: Date;
}> {
  const { rows } = await client.query<{
    numero: string;
    montant_total_centimes: number;
    montant_avoir_centimes: number;
    instantane_legal: Record<string, unknown>;
    emise_a: Date;
  }>(
    `SELECT numero, montant_total_centimes, montant_avoir_centimes,
            instantane_legal, emise_a
     FROM facture WHERE id = $1`,
    [factureId],
  );

  const facture = rows[0];

  if (facture === undefined) {
    throw new Error("facture introuvable");
  }

  return facture;
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
  ({ rembourserCommande } = await import("@/services/avoir"));
  ({ PrestatairePaiementIndisponibleError } =
    await import("@/integrations/stripe/fournisseur"));
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

describe("critere 1, un remboursement effectif produit un avoir numerote", () => {
  it("emet un avoir sur la sequence AVOIR, distincte de celle des factures", async () => {
    const { commandeId, factureId, numeroFacture } =
      await commanderEtConfirmer();

    const fournisseur = fournisseurQuiRembourse();

    const issue = await rembourserCommande({
      commandeId,
      montantCentimes: TOTAL_CENTIMES,
      motif: "Retractation du client",
      fournisseur,
    });

    expect(issue.statut).toBe("REMBOURSE");

    if (issue.statut !== "REMBOURSE") {
      throw new Error("le remboursement n'a pas abouti");
    }

    /*
     * LA SEQUENCE EST DISTINCTE, ET C'EST LE POINT. `A-2026-0001` face a
     * `F-2026-0001` : deux compteurs, deux rangs qui repartent chacun de 1.
     * Un avoir numerote sur la sequence des factures creerait un trou dans
     * celle-ci, qu'un controle fiscal lit comme une facture disparue.
     */
    expect(issue.numeroAvoir).toMatch(/^A-\d{4}-0001$/);
    expect(numeroFacture).toMatch(/^F-\d{4}-0001$/);
    expect(issue.numeroAvoir).not.toBe(numeroFacture);

    const avoirs = await lireAvoirs(factureId);

    expect(avoirs).toHaveLength(1);
    expect(avoirs[0]?.numero).toBe(issue.numeroAvoir);
    expect(avoirs[0]?.montant_centimes).toBe(TOTAL_CENTIMES);
    expect(avoirs[0]?.motif).toBe("Retractation du client");
  });

  /**
   * L'AVOIR PORTE SON PROPRE INSTANTANE, invariant 3 et LS-49. Sans lui, une
   * correction du catalogue ou de l'adresse changerait le contenu d'un document
   * deja emis.
   */
  it("ecrit un instantane legal propre, derive de celui de la facture", async () => {
    const { commandeId, factureId, numeroFacture } =
      await commanderEtConfirmer();

    await rembourserCommande({
      commandeId,
      montantCentimes: 2000,
      motif: "Geste commercial",
      fournisseur: fournisseurQuiRembourse(),
    });

    const avoir = (await lireAvoirs(factureId))[0];

    if (avoir === undefined) {
      throw new Error("aucun avoir emis");
    }

    const instantane = avoir.instantane_legal as {
      mentions: string[];
      lignes: unknown[];
      totalCentimes: number;
    };

    /* LE DOCUMENT CORRIGE EST NOMME, sans quoi le rapprochement se ferait a la main. */
    expect(instantane.mentions.join(" ")).toContain(numeroFacture);
    expect(instantane.mentions.join(" ")).toContain("2000");
    expect(instantane.mentions.join(" ")).toContain("Geste commercial");

    /* LES LIGNES FIGEES SONT REPRISES, jamais relues du catalogue. */
    expect(instantane.lignes.length).toBeGreaterThan(0);
    expect(instantane.totalCentimes).toBe(TOTAL_CENTIMES);
  });
});

describe("critere 2, la facture n'est ni modifiee ni supprimee", () => {
  /**
   * L'INVARIANT 4 SE PROUVE PAR COMPARAISON AVANT ET APRES, jamais par
   * relecture du code. Seul `montantAvoirCentimes` a le droit de bouger : il ne
   * fait pas partie de l'instantane legal, il porte le cumul rembourse.
   */
  it("laisse numero, total, instantane et date d'emission inchanges", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();

    const avant = await lireFacture(factureId);

    await rembourserCommande({
      commandeId,
      montantCentimes: 1500,
      motif: "Article abime",
      fournisseur: fournisseurQuiRembourse(),
    });

    const apres = await lireFacture(factureId);

    expect(apres.numero).toBe(avant.numero);
    expect(apres.montant_total_centimes).toBe(avant.montant_total_centimes);
    expect(apres.emise_a.getTime()).toBe(avant.emise_a.getTime());
    expect(apres.instantane_legal).toEqual(avant.instantane_legal);

    /* SEUL LE CUMUL BOUGE, regle F9. */
    expect(avant.montant_avoir_centimes).toBe(0);
    expect(apres.montant_avoir_centimes).toBe(1500);
  });

  it("ne supprime aucune facture, l'identite restant la meme", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();

    await rembourserCommande({
      commandeId,
      montantCentimes: TOTAL_CENTIMES,
      motif: "Retractation",
      fournisseur: fournisseurQuiRembourse(),
    });

    /*
     * IDENTITE ET NON CARDINALITE, convention de ce projet : un
     * `toHaveLength(1)` resterait vert sur une facture effacee puis reecrite,
     * ce qui violerait l'invariant 4 sans rien faire rougir.
     */
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM facture WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows.map((ligne) => ligne.id)).toEqual([factureId]);
  });
});

describe("critere 3, un refus du prestataire ne cree aucun avoir", () => {
  /**
   * L'ORDRE SE VERIFIE PAR L'ETAT DE LA BASE, jamais par la valeur rendue. Une
   * fonction peut rendre « refuse » apres avoir deja ecrit : c'est exactement
   * le defaut que ce test doit attraper.
   */
  it("laisse la base intacte et journalise, sans changer le statut du paiement", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();

    const avantPaiement = await lirePaiement(commandeId);
    const avantFacture = await lireFacture(factureId);

    const fournisseur = fournisseurDouble(async () => ({
      issue: "REFUSE",
      code: "charge_already_refunded",
    }));

    const issue = await rembourserCommande({
      commandeId,
      montantCentimes: 1000,
      motif: "Tentative refusee",
      fournisseur,
    });

    expect(issue.statut).toBe("REFUSE_PRESTATAIRE");

    if (issue.statut !== "REFUSE_PRESTATAIRE") {
      throw new Error("le refus n'a pas ete rendu");
    }

    expect(issue.code).toBe("charge_already_refunded");

    /* AUCUN AVOIR, AUCUN CHANGEMENT D'ETAT. */
    expect(await lireAvoirs(factureId)).toHaveLength(0);

    const apresPaiement = await lirePaiement(commandeId);

    expect(apresPaiement.statut).toBe(avantPaiement.statut);
    expect(apresPaiement.montant_rembourse_centimes).toBe(
      avantPaiement.montant_rembourse_centimes,
    );

    const apresFacture = await lireFacture(factureId);

    expect(apresFacture.montant_avoir_centimes).toBe(
      avantFacture.montant_avoir_centimes,
    );
  });
});

describe("critere 4, deux remboursements partiels produisent deux avoirs", () => {
  it("emet deux avoirs numerotes et finit en REMBOURSE", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();

    const fournisseur = fournisseurQuiRembourse();

    const premier = await rembourserCommande({
      commandeId,
      montantCentimes: 2000,
      motif: "Premier remboursement partiel",
      fournisseur,
    });

    expect(premier.statut).toBe("REMBOURSE");

    /* APRES LE PREMIER : partiellement rembourse, le cumul suit. */
    const apresPremier = await lirePaiement(commandeId);

    expect(apresPremier.statut).toBe("PARTIELLEMENT_REMBOURSE");
    expect(apresPremier.montant_rembourse_centimes).toBe(2000);

    const second = await rembourserCommande({
      commandeId,
      montantCentimes: TOTAL_CENTIMES - 2000,
      motif: "Solde rembourse",
      fournisseur,
    });

    expect(second.statut).toBe("REMBOURSE");

    /* DEUX AVOIRS DISTINCTS, sur la meme facture, rangs consecutifs. */
    const avoirs = await lireAvoirs(factureId);

    expect(avoirs).toHaveLength(2);
    expect(avoirs.map((avoir) => avoir.numero)).toEqual([
      expect.stringMatching(/^A-\d{4}-0001$/),
      expect.stringMatching(/^A-\d{4}-0002$/),
    ]);
    expect(avoirs.map((avoir) => avoir.montant_centimes)).toEqual([2000, 2900]);

    /* APRES LE SECOND : entierement rembourse. */
    const apresSecond = await lirePaiement(commandeId);

    expect(apresSecond.statut).toBe("REMBOURSE");
    expect(apresSecond.montant_rembourse_centimes).toBe(TOTAL_CENTIMES);

    expect((await lireFacture(factureId)).montant_avoir_centimes).toBe(
      TOTAL_CENTIMES,
    );
  });

  /**
   * LA CLE D'IDEMPOTENCE DOIT DIFFERER ENTRE LES DEUX APPELS, ADR-032. Si elle
   * etait stable, le prestataire avalerait le second remboursement en rendant
   * le premier : l'exploitante lirait « rembourse » sans qu'un centime ne parte.
   *
   * ELLE DOIT AUSSI ETRE STABLE POUR UNE MEME INTENTION, ce que le test de
   * l'appel repete verifie plus bas.
   */
  it("emploie deux cles d'idempotence differentes pour deux montants successifs", async () => {
    const { commandeId } = await commanderEtConfirmer();

    const fournisseur = fournisseurQuiRembourse();

    await rembourserCommande({
      commandeId,
      montantCentimes: 2000,
      motif: "Premier",
      fournisseur,
    });

    await rembourserCommande({
      commandeId,
      montantCentimes: 2000,
      motif: "Second, meme montant",
      fournisseur,
    });

    expect(fournisseur.appels).toHaveLength(2);

    const cles = fournisseur.appels.map((appel) => appel.cleIdempotence);

    expect(new Set(cles).size).toBe(2);
  });
});

describe("critere 5, le montant ne depasse jamais le total", () => {
  /**
   * LA GARDE APPLICATIVE REND UN REFUS LISIBLE, la ou le `CHECK` leverait une
   * exception. L'exploitante doit lire « il reste tant », pas « operation
   * indisponible ».
   */
  it("refuse un montant superieur au restant et nomme ce restant", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();

    const issue = await rembourserCommande({
      commandeId,
      montantCentimes: TOTAL_CENTIMES + 1,
      motif: "Trop eleve",
      fournisseur: fournisseurQuiRembourse(),
    });

    expect(issue.statut).toBe("MONTANT_TROP_ELEVE");

    if (issue.statut !== "MONTANT_TROP_ELEVE") {
      throw new Error("le montant excessif a ete accepte");
    }

    expect(issue.restantCentimes).toBe(TOTAL_CENTIMES);
    expect(await lireAvoirs(factureId)).toHaveLength(0);
  });

  it("refuse un second remboursement qui depasserait le restant", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();

    const fournisseur = fournisseurQuiRembourse();

    await rembourserCommande({
      commandeId,
      montantCentimes: 4000,
      motif: "Partiel",
      fournisseur,
    });

    const issue = await rembourserCommande({
      commandeId,
      montantCentimes: 1000,
      motif: "Depasse le restant",
      fournisseur,
    });

    expect(issue.statut).toBe("MONTANT_TROP_ELEVE");

    if (issue.statut !== "MONTANT_TROP_ELEVE") {
      throw new Error("le depassement a ete accepte");
    }

    expect(issue.restantCentimes).toBe(TOTAL_CENTIMES - 4000);

    /* UN SEUL AVOIR, LE PREMIER : le prestataire n'a pas ete rappele. */
    expect(await lireAvoirs(factureId)).toHaveLength(1);
    expect(fournisseur.appels).toHaveLength(1);
  });

  /**
   * LE `CHECK` EST LA SECONDE LIGNE DE DEFENSE, regle F9. Ce test l'exerce
   * DIRECTEMENT, en court-circuitant la garde applicative : sans cela, la
   * contrainte resterait une intention jamais atteinte par le code.
   */
  it("la contrainte de base refuse un cumul superieur au total", async () => {
    const { factureId } = await commanderEtConfirmer();

    await expect(
      client.query(
        "UPDATE facture SET montant_avoir_centimes = $1 WHERE id = $2",
        [TOTAL_CENTIMES + 1, factureId],
      ),
    ).rejects.toThrow(/chk_facture_avoir_borne|violates check constraint/);
  });
});

describe("critere 7, panne du prestataire", () => {
  /**
   * INDISPONIBILITE : RIEN N'A CHANGE, ET LE REESSAI EST SUR. C'est la
   * difference avec un refus : le prestataire n'a pas repondu, l'argent n'est
   * peut-etre pas parti, et rejouer avec la MEME cle est ce qui rend le
   * reessai inoffensif.
   */
  it("laisse la commande coherente, sans avoir, et le reessai aboutit", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();

    const avantPaiement = await lirePaiement(commandeId);

    const enPanne = fournisseurDouble(async () => {
      throw new PrestatairePaiementIndisponibleError(new Error("timeout"));
    });

    const issue = await rembourserCommande({
      commandeId,
      montantCentimes: 1000,
      motif: "Pendant la panne",
      fournisseur: enPanne,
    });

    expect(issue.statut).toBe("PRESTATAIRE_INDISPONIBLE");
    expect(await lireAvoirs(factureId)).toHaveLength(0);

    const apresPanne = await lirePaiement(commandeId);

    expect(apresPanne.statut).toBe(avantPaiement.statut);
    expect(apresPanne.montant_rembourse_centimes).toBe(
      avantPaiement.montant_rembourse_centimes,
    );

    /* LE REESSAI ABOUTIT, la base n'ayant pas ete abimee par la panne. */
    const retabli = fournisseurQuiRembourse();

    const reessai = await rembourserCommande({
      commandeId,
      montantCentimes: 1000,
      motif: "Apres retablissement",
      fournisseur: retabli,
    });

    expect(reessai.statut).toBe("REMBOURSE");
    expect(await lireAvoirs(factureId)).toHaveLength(1);
  });

  /**
   * LA CLE EST STABLE POUR UNE MEME INTENTION, ADR-032. Deux tentatives du
   * meme remboursement, apres une panne, doivent porter la MEME cle : sinon le
   * prestataire creerait un second remboursement si le premier etait en fait
   * parti, et le client serait rembourse deux fois.
   */
  it("rejoue la meme cle d'idempotence apres une panne", async () => {
    const { commandeId } = await commanderEtConfirmer();

    const clesVues: string[] = [];

    const enPanne = fournisseurDouble(async (demande) => {
      clesVues.push(demande.cleIdempotence);
      throw new PrestatairePaiementIndisponibleError(new Error("timeout"));
    });

    await rembourserCommande({
      commandeId,
      montantCentimes: 1000,
      motif: "Tentative",
      fournisseur: enPanne,
    });

    const retabli = fournisseurDouble(async (demande) => {
      clesVues.push(demande.cleIdempotence);
      return {
        issue: "REMBOURSE",
        identifiantRemboursement: "re_test_reessai",
        montantCentimes: demande.montantCentimes,
      };
    });

    await rembourserCommande({
      commandeId,
      montantCentimes: 1000,
      motif: "Tentative",
      fournisseur: retabli,
    });

    expect(clesVues).toHaveLength(2);
    expect(clesVues[0]).toBe(clesVues[1]);
  });
});

describe("etats sans remboursement possible", () => {
  it("refuse quand aucun paiement n'est encaisse", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const fournisseur = fournisseurQuiRembourse();

    const resultat = await rembourserCommande({
      commandeId: issue.commandeId,
      montantCentimes: 1000,
      motif: "Commande non payee",
      fournisseur,
    });

    expect(resultat.statut).toBe("AUCUN_PAIEMENT");

    /* LE PRESTATAIRE N'EST MEME PAS APPELE : rien a rembourser. */
    expect(fournisseur.appels).toHaveLength(0);
  });

  /**
   * LE MONTANT ECRIT EST CELUI QUE LE PRESTATAIRE A RENDU, jamais celui
   * demande. Un ecart doit apparaitre dans le document plutot que d'etre
   * suppose : c'est l'argent reellement sorti qui fait foi.
   */
  it("ecrit le montant rendu par le prestataire, pas celui demande", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();

    const partiel = fournisseurDouble(async () => ({
      issue: "REMBOURSE",
      identifiantRemboursement: "re_test_partiel",
      /* Le prestataire rend MOINS que demande. */
      montantCentimes: 750,
    }));

    const issue = await rembourserCommande({
      commandeId,
      montantCentimes: 1000,
      motif: "Ecart de montant",
      fournisseur: partiel,
    });

    expect(issue.statut).toBe("REMBOURSE");

    if (issue.statut !== "REMBOURSE") {
      throw new Error("le remboursement n'a pas abouti");
    }

    expect(issue.montantCentimes).toBe(750);

    const avoirs = await lireAvoirs(factureId);

    expect(avoirs[0]?.montant_centimes).toBe(750);
    expect((await lireFacture(factureId)).montant_avoir_centimes).toBe(750);
    expect((await lirePaiement(commandeId)).montant_rembourse_centimes).toBe(
      750,
    );
  });
});
