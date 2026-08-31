/**
 * EMISSION DE LA FACTURE A LA CONFIRMATION, LS-126, etape 8 du parcours 1.
 *
 * ECRIT AVANT LE SERVICE, exigence du plan directeur sur les documents
 * comptables. Ce fichier dit ce que l'emission doit garantir, pas ce qu'elle
 * fait.
 *
 * CE QUI SE JOUE ICI EST LA TROISIEME CLE D'IDEMPOTENCE PAR EFFET,
 * `facture (commande_id)`. Elle est en base depuis la migration initiale de
 * juillet 2026, et AUCUN CODE NE L'AVAIT JAMAIS ATTEINTE : LS-119 a livre avec
 * deux cles sur quatre prouvees, faute d'un chemin qui ecrive une facture. Une
 * contrainte qu'aucun test n'exerce est une intention, pas une garantie.
 *
 * LE SUJET N'EST PAS LE REJEU DU MEME EVENEMENT, que l'unicite sur
 * `identifiant_fournisseur` suffit a fermer. C'est LE CROISEMENT DES DEUX
 * CHEMINS, webhook et reconciliation : l'evenement tardif porte un identifiant
 * jamais vu, donc rien dans l'idempotence par identifiant ne le rejette.
 *
 * VERIFIER UNE IDENTITE ET NON UNE CARDINALITE, convention de ce projet : ces
 * tests nomment le numero attendu et l'identifiant de la facture, plutot que de
 * compter des lignes. Un `toHaveLength(1)` resterait vert sur une facture
 * effacee puis reecrite, ce qui violerait l'invariant 4 sans rien faire rougir.
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

/** Saisie minimale d'un client, mode DOMICILE, aucun point de retrait. */
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

/** Configuration tarifaire figee, pour ne dependre d'aucune variable. */
const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 499,
  seuilFranchiseCentimes: 3900,
};

/** La variante vaut 4900, au-dessus du seuil : livraison offerte, total 4900. */
const TOTAL_ATTENDU_CENTIMES = 4900;

/**
 * Emetteur de test, INVENTE ET RECONNAISSABLE COMME TEL.
 *
 * Le SIRET est une suite de quatorze chiffres qui n'immatricule aucune
 * entreprise reelle, et la raison sociale porte le prefixe `TEST`. L'interdit
 * du projet est explicite : ne jamais introduire de donnees de prototype comme
 * donnees reelles. Les vraies valeurs vivent en configuration, hors du depot
 * qui est public.
 */
const EMETTEUR_TEST = {
  raisonSociale: "TEST Lune et Soleil",
  siret: "12345678901234",
  adresse: "1 rue de Test, 75001 TESTVILLE",
  emailContact: "test-emetteur@example.invalid",
};

/** Double du verificateur de signature, la signature n'est pas le sujet ici. */
function verificateurDouble(
  evenement: EvenementPaiement,
): VerificateurSignature {
  return {
    async verifier() {
      return evenement;
    },
  };
}

function corpsDe(evenement: EvenementPaiement): string {
  return JSON.stringify(evenement);
}

/** Evenement de paiement reussi, forme neutre du domaine. */
function evenementReussi(
  commandeId: string,
  options: { identifiant?: string } = {},
): EvenementPaiement {
  return {
    identifiant: options.identifiant ?? `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId,
    identifiantSession: `cs_test_${commandeId.slice(0, 8)}`,
    montantCentimes: TOTAL_ATTENDU_CENTIMES,
    montantRembourseCentimes: 0,
    charge: { source: "test" },
  };
}

/**
 * Ecrit une commande reelle PAR LE SERVICE, jamais par un `INSERT` a la main.
 *
 * Le numero, le figement des libelles et la reservation doivent etre ceux de la
 * production : un test qui reproduirait le mecanisme verifierait sa propre
 * reproduction, piege rencontre sur ce projet le 25 aout 2026.
 */
async function commanderUnePiece(
  options: { quantitePhysique?: number } = {},
): Promise<{ commandeId: string; varianteId: string }> {
  const { varianteId } = await creerVarianteEnStock(client, {
    ...(options.quantitePhysique === undefined
      ? {}
      : { quantitePhysique: options.quantitePhysique }),
  });

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  return { commandeId: issue.commandeId, varianteId };
}

/** Les factures d'une commande, telles qu'elles sont en base. */
async function lireFactures(commandeId: string): Promise<
  {
    id: string;
    numero: string;
    montant_total_centimes: number;
    montant_avoir_centimes: number;
    instantane_legal: Record<string, unknown>;
    chemin_pdf: string | null;
  }[]
> {
  const { rows } = await client.query(
    `SELECT id, numero, montant_total_centimes, montant_avoir_centimes,
            instantane_legal, chemin_pdf
     FROM facture WHERE commande_id = $1 ORDER BY emise_a`,
    [commandeId],
  );

  return rows;
}

/** LA facture d'une commande, quand le test en attend exactement une. */
async function lireFactureUnique(
  commandeId: string,
): Promise<Awaited<ReturnType<typeof lireFactures>>[number]> {
  const factures = await lireFactures(commandeId);

  expect(factures).toHaveLength(1);

  const facture = factures[0];

  if (facture === undefined) {
    throw new Error("aucune facture emise");
  }

  return facture;
}

/** Confirme une commande par le service, chemin webhook par defaut. */
async function confirmer(
  commandeId: string,
  options: {
    identifiant?: string;
    origine?: "SYSTEME" | "RECONCILIATION";
  } = {},
): Promise<{ statut: string }> {
  const evenement = evenementReussi(commandeId, {
    ...(options.identifiant === undefined
      ? {}
      : { identifiant: options.identifiant }),
  });

  return traiterEvenementPaiement({
    corpsBrut: corpsDe(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
    ...(options.origine === undefined ? {} : { origine: options.origine }),
  });
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  // Les services lisent `DATABASE_URL` a l'evaluation du module `@/lib/prisma`,
  // d'ou les imports differes : le renseigner apres coup n'aurait aucun effet.
  process.env.DATABASE_URL = url;

  // L'EMETTEUR EST INJECTE PAR L'ENVIRONNEMENT, comme en production. Le service
  // le lit au moment d'emettre, et son absence est un etat teste plus bas.
  process.env.FACTURE_RAISON_SOCIALE = EMETTEUR_TEST.raisonSociale;
  process.env.FACTURE_SIRET = EMETTEUR_TEST.siret;
  process.env.FACTURE_ADRESSE = EMETTEUR_TEST.adresse;
  process.env.FACTURE_EMAIL_CONTACT = EMETTEUR_TEST.emailContact;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
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

describe("emission de la facture, cas nominal", () => {
  /** CRITERE 1. La facture nait avec la confirmation, pas par un autre chemin. */
  it("emet la facture dans la transaction qui confirme le paiement", async () => {
    const { commandeId } = await commanderUnePiece();

    expect(await lireFactures(commandeId)).toHaveLength(0);

    expect(await confirmer(commandeId)).toEqual({ statut: "TRAITE" });

    const facture = await lireFactureUnique(commandeId);

    // LE MONTANT EST CELUI FIGE PAR LA COMMANDE, jamais recalcule depuis le
    // catalogue : c'est l'invariant 3.
    expect(facture.montant_total_centimes).toBe(TOTAL_ATTENDU_CENTIMES);
    expect(facture.montant_avoir_centimes).toBe(0);

    // LE PDF EST ABSENT ET LA FACTURE EXISTE QUAND MEME, regle F8. Le rendu est
    // le sujet de LS-129 : `chemin_pdf` nul est l'etat « PDF a produire », pas
    // un document invalide.
    expect(facture.chemin_pdf).toBeNull();
  });

  /** CRITERE 2. Le numero vient du compteur, dans la meme transaction. */
  it("attribue le numero par le compteur, sans trou ni doublon", async () => {
    const premiere = await commanderUnePiece();
    const seconde = await commanderUnePiece();

    await confirmer(premiere.commandeId);
    await confirmer(seconde.commandeId);

    const annee = new Date().getUTCFullYear();

    // DEUX NUMEROS CONSECUTIFS, nommes et non comptes. Le format vient
    // d'ADR-031 : prefixe, annee, rang sur quatre chiffres.
    expect((await lireFactureUnique(premiere.commandeId)).numero).toBe(
      `F-${annee}-0001`,
    );
    expect((await lireFactureUnique(seconde.commandeId)).numero).toBe(
      `F-${annee}-0002`,
    );

    // LE COMPTEUR DE FACTURE EST DISTINCT DE CELUI DES COMMANDES, regle F3.
    // Les confondre ferait porter a une facture le rang d'une commande, et deux
    // series se marcheraient dessus des le premier avoir.
    const { rows } = await client.query<{ type: string; dernier: number }>(
      "SELECT type, dernier FROM compteur_numero ORDER BY type",
    );
    expect(rows).toEqual([
      { type: "COMMANDE", dernier: 2 },
      { type: "FACTURE", dernier: 2 },
    ]);
  });

  /** CRITERE 6. La mention de franchise figure sur le document. */
  it("porte la mention de franchise en base de TVA", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    const facture = await lireFactureUnique(commandeId);
    const instantane = facture.instantane_legal as {
      mentions: string[];
    };

    // LA MENTION EST NOMMEE INTEGRALEMENT, avec ses accents. Chercher un
    // fragment comme « 293 B » laisserait passer un texte tronque ou desaccentue,
    // et un document legal se lit en entier.
    expect(instantane.mentions).toContain(
      "TVA non applicable, article 293 B du Code général des impôts",
    );
  });
});

describe("emission de la facture, instantane legal", () => {
  /** CRITERE 5. Le document ne depend plus du catalogue apres emission. */
  it("fige les donnees legales, une modification du catalogue ne le change pas", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();
    await confirmer(commandeId);

    const avant = await lireFactureUnique(commandeId);

    // LE CATALOGUE CHANGE APRES L'EMISSION : prix double et libelle reecrit.
    // C'est le scenario reel d'une revalorisation ou d'une correction de fiche.
    await client.query(
      "UPDATE variante SET prix_centimes = 9800, libelle = 'LIBELLE REECRIT' WHERE id = $1",
      [varianteId],
    );
    await client.query(
      `UPDATE produit SET nom = 'PRODUIT RENOMME'
       WHERE id = (SELECT produit_id FROM variante WHERE id = $1)`,
      [varianteId],
    );

    const apres = await lireFactureUnique(commandeId);

    // LE DOCUMENT EST INCHANGE, OCTET POUR OCTET. Comparer l'instantane entier
    // plutot qu'un champ : une comparaison ciblee laisserait passer la derive
    // d'un champ voisin, et l'invariant 3 porte sur TOUT le document.
    expect(apres.instantane_legal).toEqual(avant.instantane_legal);
    expect(apres.montant_total_centimes).toBe(TOTAL_ATTENDU_CENTIMES);

    const instantane = apres.instantane_legal as {
      lignes: { libelleProduit: string; prixUnitaireCentimes: number }[];
    };

    // LE PRIX DU DOCUMENT EST CELUI DE L'ACHAT, pas les 9800 du catalogue.
    expect(instantane.lignes[0]?.prixUnitaireCentimes).toBe(
      TOTAL_ATTENDU_CENTIMES,
    );
    expect(instantane.lignes[0]?.libelleProduit).not.toBe("PRODUIT RENOMME");
  });

  it("porte l'emetteur, le client et les lignes, structure versionnee", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    const instantane = (await lireFactureUnique(commandeId))
      .instantane_legal as {
      version: number;
      emetteur: Record<string, string>;
      client: { nom: string; adresseFacturation: Record<string, string> };
      totalCentimes: number;
    };

    // LA VERSION EST CE QUI REND LA RELECTURE POSSIBLE dans dix ans : sans elle,
    // un changement de structure rendrait les anciennes factures illisibles.
    expect(instantane.version).toBe(1);
    expect(instantane.emetteur).toEqual(EMETTEUR_TEST);
    expect(instantane.client.nom).toBe(SAISIE_DOMICILE.nomClient);
    expect(instantane.client.adresseFacturation.ville).toBe("TESTVILLE");
    expect(instantane.totalCentimes).toBe(TOTAL_ATTENDU_CENTIMES);
  });
});

describe("emission de la facture, idempotence", () => {
  /** CRITERE 3. Le rejeu du meme evenement ne produit pas de seconde facture. */
  it("ne cree aucune seconde facture au rejeu du MEME evenement", async () => {
    const { commandeId } = await commanderUnePiece({ quantitePhysique: 3 });

    await confirmer(commandeId, { identifiant: "evt_unique" });
    const premiere = await lireFactureUnique(commandeId);

    // MEME EVENEMENT, RENVOYE. Le prestataire rejoue tant qu'il n'a pas d'accuse.
    await confirmer(commandeId, { identifiant: "evt_unique" });

    const apres = await lireFactureUnique(commandeId);

    // L'IDENTITE EST VERIFIEE, PAS LE NOMBRE. Une facture supprimee puis
    // reecrite garderait le compte a un tout en violant l'invariant 4, et en
    // consommant un second numero au passage.
    expect(apres.id).toBe(premiere.id);
    expect(apres.numero).toBe(premiere.numero);
  });

  /**
   * CRITERE 4. L'evenement tardif apres regularisation.
   *
   * L'identifiant est NEUF, donc l'idempotence par identifiant d'evenement ne
   * le rejette pas : c'est la cle par effet qui doit tenir.
   */
  it("ne cree aucune seconde facture quand l'evenement arrive apres une regularisation", async () => {
    const { commandeId } = await commanderUnePiece({ quantitePhysique: 3 });

    await confirmer(commandeId, {
      identifiant: "evt_reconciliation",
      origine: "RECONCILIATION",
    });
    const premiere = await lireFactureUnique(commandeId);

    // Le webhook arrive enfin, avec un identifiant jamais vu.
    const tardif = await confirmer(commandeId, {
      identifiant: "evt_tardif_jamais_vu",
    });
    expect(tardif).toEqual({ statut: "DEJA_TRAITE" });

    const apres = await lireFactureUnique(commandeId);
    expect(apres.id).toBe(premiere.id);
    expect(apres.numero).toBe(premiere.numero);

    // AUCUN NUMERO N'A ETE CONSOMME EN VAIN. Un compteur qui avance sans
    // produire de document laisse un trou dans la sequence, ce que
    // l'administration fiscale lit comme une facture disparue.
    const { rows } = await client.query<{ dernier: number }>(
      "SELECT dernier FROM compteur_numero WHERE type = 'FACTURE'",
    );
    expect(rows[0]?.dernier).toBe(1);
  });

  /**
   * LE TEST PRECEDENT N'ATTEINT PAS L'ECRITURE, ET C'EST LE PIEGE QUE LE
   * CRITERE 7 NOMME. Quand la regularisation a tout ecrit, c'est la cle du
   * PAIEMENT qui arrete l'evenement tardif : le service sort en `DEJA_TRAITE`
   * avant meme d'arriver a la facture. Neutraliser la garde de facture
   * laisserait donc le test precedent VERT.
   *
   * CE TEST-CI PART D'UN ETAT INCOMPLET : la facture existe, le paiement n'est
   * pas encaisse. C'est ce que laisse une panne entre deux ecritures, et c'est
   * le seul chemin par lequel la garde de facture se prouve seule.
   */
  it("ne cree aucune seconde facture quand la facture existe deja sans paiement encaisse", async () => {
    const { commandeId } = await commanderUnePiece({ quantitePhysique: 3 });

    await confirmer(commandeId, { identifiant: "evt_premier" });
    const premiere = await lireFactureUnique(commandeId);

    // LE PAIEMENT EST EFFACE, la facture reste. L'etat est artificiel, la
    // situation ne l'est pas : elle correspond a une reprise apres panne.
    await client.query("DELETE FROM paiement WHERE commande_id = $1", [
      commandeId,
    ]);

    await confirmer(commandeId, { identifiant: "evt_second_jamais_vu" });

    // LA FACTURE EST LA MEME. Sans la garde, une seconde naitrait ici : la
    // contrainte `facture (commande_id)` la refuserait, mais en faisant AVORTER
    // toute la transaction, code 25P02, ce qui perdrait aussi les autres effets.
    const apres = await lireFactureUnique(commandeId);
    expect(apres.id).toBe(premiere.id);
    expect(apres.numero).toBe(premiere.numero);
  });
});

describe("emission de la facture, emetteur non configure", () => {
  /**
   * L'ABSENCE DE CONFIGURATION EST UN ETAT, PAS UN PLANTAGE.
   *
   * Cas reel du premier deploiement : les quatre variables ne sont pas encore
   * renseignees. Emettre une facture sans raison sociale ni SIRET produirait un
   * document NON CONFORME et IMMUABLE, que seul un avoir pourrait corriger.
   *
   * L'ARBITRAGE EST DONC : NE PAS EMETTRE, CONFIRMER QUAND MEME, ALERTER. Le
   * meme que pour le stock epuise : l'argent est encaisse, refuser la
   * confirmation laisserait de l'argent sans commande.
   */
  it("confirme la commande et alerte sans emettre quand l'emetteur manque", async () => {
    const { commandeId } = await commanderUnePiece();

    const siret = process.env.FACTURE_SIRET;
    delete process.env.FACTURE_SIRET;

    try {
      expect(await confirmer(commandeId)).toEqual({ statut: "TRAITE" });

      // AUCUNE FACTURE, plutot qu'une facture incomplete et inrattrapable.
      expect(await lireFactures(commandeId)).toHaveLength(0);

      // LA COMMANDE EST CONFIRMEE MALGRE TOUT, l'argent etant encaisse.
      const { rows: commandes } = await client.query<{ statut: string }>(
        "SELECT statut FROM commande WHERE id = $1",
        [commandeId],
      );
      expect(commandes[0]?.statut).toBe("CONFIRMEE");

      // L'ALERTE EST CE QUI REND LE DEFAUT VISIBLE. Sans elle, l'absence de
      // facture ne se verrait qu'a la reclamation du client, ou au controle.
      const { rows: alertes } = await client.query<{
        type: string;
        gravite: string;
      }>("SELECT type, gravite FROM alerte_critique WHERE id_cible = $1", [
        commandeId,
      ]);
      expect(alertes).toEqual([
        { type: "FACTURE_NON_EMISE", gravite: "CRITIQUE" },
      ]);

      // AUCUN NUMERO CONSOMME : le compteur ne doit pas avancer pour un
      // document qui n'existe pas, sans quoi la sequence porte un trou.
      const { rows: compteurs } = await client.query(
        "SELECT dernier FROM compteur_numero WHERE type = 'FACTURE'",
      );
      expect(compteurs).toHaveLength(0);
    } finally {
      process.env.FACTURE_SIRET = siret;
    }
  });
});
