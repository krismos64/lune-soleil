/**
 * LES DEUX TACHES PLANIFIEES DU PAIEMENT, LS-120.
 *
 * ECRIT AVANT LES SERVICES, exigence du plan directeur en zone critique.
 *
 * CE QUE CES TACHES REPARENT. LS-72 a livre le squelette et le verrou, sans
 * metier : `quantiteReservee` ne redescend donc JAMAIS, et une reservation
 * expiree bloque la vente externe de sa piece indefiniment. LS-106 l'avait
 * mesure sans pouvoir le lever.
 *
 * LE CROISEMENT SE TESTE ENFIN POUR DE VRAI. LS-119 devait simuler la
 * reconciliation en appelant son propre service avec une autre origine ; les
 * deux chemins existent maintenant, et les quatre cles d'unicite par effet se
 * verifient sur le vrai croisement, dans les DEUX ordres d'arrivee.
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
  EtatSessionPaiement,
  FournisseurPaiement,
} from "@/integrations/stripe/fournisseur";
import type { EvenementPaiement } from "@/integrations/stripe/evenements";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let libererReservationsExpirees: typeof import("@/services/liberation-reservations").libererReservationsExpirees;
let reconcilierPaiements: typeof import("@/services/reconciliation-paiements").reconcilierPaiements;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;
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

const TOTAL_ATTENDU_CENTIMES = 4900;

/** Double du prestataire pour la reconciliation, etat configurable. */
function fournisseurDouble(
  etats: Record<string, EtatSessionPaiement>,
  options: { enPanne?: boolean } = {},
): { double: FournisseurPaiement; lectures: string[] } {
  const lectures: string[] = [];

  const double: FournisseurPaiement = {
    async creerSession() {
      throw new Error("creerSession n'a pas sa place dans ces tests");
    },
    async expirerSession() {
      return "DEJA_FERMEE";
    },
    async lireSession(identifiant) {
      lectures.push(identifiant);

      if (options.enPanne === true) {
        throw new PrestatairePaiementIndisponibleError("panne simulee");
      }

      return etats[identifiant] ?? { etat: "EXPIREE" };
    },
  };

  return { double, lectures };
}

/**
 * Passe une commande reelle, puis fait vieillir ce qu'il faut.
 *
 * LE VIEILLISSEMENT PASSE PAR DES `UPDATE` et non par une horloge simulee : les
 * deux taches comparent a `now()` de PostgreSQL, regle de `database.md`, et une
 * horloge Node simulee ne les toucherait pas.
 */
async function commanderUnePiece(
  options: {
    quantitePhysique?: number;
    reservationExpiree?: boolean;
    commandeAgeeDeMinutes?: number;
    identifiantSession?: string | null;
  } = {},
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

  if (options.reservationExpiree === true) {
    await client.query(
      "UPDATE reservation SET expire_a = now() - interval '1 minute' WHERE commande_id = $1",
      [issue.commandeId],
    );
  }

  if (options.commandeAgeeDeMinutes !== undefined) {
    await client.query(
      `UPDATE commande SET cree_a = now() - ($2 || ' minutes')::interval WHERE id = $1`,
      [issue.commandeId, String(options.commandeAgeeDeMinutes)],
    );
  }

  if (options.identifiantSession !== undefined) {
    await client.query(
      `INSERT INTO paiement (id, commande_id, statut, montant_centimes, identifiant_fournisseur, cree_a)
       VALUES (gen_random_uuid(), $1, 'EN_ATTENTE', $2, $3, now())`,
      [issue.commandeId, TOTAL_ATTENDU_CENTIMES, options.identifiantSession],
    );
  }

  return { commandeId: issue.commandeId, varianteId };
}

async function lireStock(
  varianteId: string,
): Promise<{ physique: number; reservee: number }> {
  const { rows } = await client.query<{
    quantite_physique: number;
    quantite_reservee: number;
  }>(
    "SELECT quantite_physique, quantite_reservee FROM variante WHERE id = $1",
    [varianteId],
  );

  const ligne = rows[0];

  if (ligne === undefined) {
    throw new Error("variante introuvable");
  }

  return {
    physique: ligne.quantite_physique,
    reservee: ligne.quantite_reservee,
  };
}

async function lireStatutCommande(commandeId: string): Promise<string> {
  const { rows } = await client.query<{ statut: string }>(
    "SELECT statut FROM commande WHERE id = $1",
    [commandeId],
  );

  return rows[0]?.statut ?? "INTROUVABLE";
}

async function compterReservations(commandeId: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM reservation WHERE commande_id = $1",
    [commandeId],
  );

  return Number(rows[0]?.n ?? "0");
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ libererReservationsExpirees } =
    await import("@/services/liberation-reservations"));
  ({ reconcilierPaiements } =
    await import("@/services/reconciliation-paiements"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ PrestatairePaiementIndisponibleError } =
    await import("@/integrations/stripe/fournisseur"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE alerte_critique, historique_statut, mouvement_stock,
     evenement_fournisseur, paiement, reservation, ligne_commande, commande,
     variante, produit, categorie, compteur_numero, verrou_tache CASCADE`,
  );
});

describe("libererReservationsExpirees", () => {
  it("rend la piece au catalogue et decremente quantiteReservee", async () => {
    const { commandeId, varianteId } = await commanderUnePiece({
      reservationExpiree: true,
    });

    // AVANT : la piece est physiquement la, mais reservee donc invendable.
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });

    const liberees = await libererReservationsExpirees();

    expect(liberees).toBe(1);

    /*
     * CRITERE 1. `quantiteReservee` redescend, donc la piece redevient vendable,
     * en ligne comme sur un marche. C'est le blocage que LS-106 avait mesure
     * sans pouvoir le lever, faute de tache.
     */
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });
    expect(await compterReservations(commandeId)).toBe(0);
  });

  it("ne touche pas une reservation encore active", async () => {
    const { varianteId } = await commanderUnePiece();

    const liberees = await libererReservationsExpirees();

    /*
     * LA RESERVATION VIT ENCORE, et la liberer serait un vol : le client est
     * peut-etre devant sa page de paiement. Seul `expire_a` decide, compare a
     * l'horloge de PostgreSQL.
     */
    expect(liberees).toBe(0);
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });
  });

  it("est idempotente : deux executions ne decrementent pas deux fois", async () => {
    const { varianteId } = await commanderUnePiece({
      reservationExpiree: true,
    });

    await libererReservationsExpirees();
    const secondPassage = await libererReservationsExpirees();

    /*
     * CRITERE 2, ET C'EST LA CONTRAINTE QUI DECIDE DE LA FORME DU CODE. La
     * suppression de la ligne et le decrement doivent tenir dans UNE transaction :
     * decrementer sans supprimer ferait retomber `quantiteReservee` a chaque
     * cycle, jusqu'a heurter `chk_variante_reservee_positif`, et supprimer sans
     * decrementer perdrait la reservation sans rendre le stock.
     */
    expect(secondPassage).toBe(0);
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });
  });

  it("ne libere jamais une reservation deja consommee par une confirmation", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();

    // Le paiement confirme consomme la reservation et la supprime, LS-119.
    const evenement: EvenementPaiement = {
      identifiant: `evt_${randomUUID()}`,
      type: "PAIEMENT_REUSSI",
      commandeId,
      identifiantSession: `cs_${commandeId.slice(0, 8)}`,
      montantCentimes: TOTAL_ATTENDU_CENTIMES,
      montantRembourseCentimes: 0,
      charge: {},
    };

    await traiterEvenementPaiement({
      corpsBrut: JSON.stringify(evenement),
      signature: "signature-de-test",
      verificateur: {
        async verifier() {
          return evenement;
        },
      },
    });

    const stockApresVente = await lireStock(varianteId);
    expect(stockApresVente).toEqual({ physique: 0, reservee: 0 });

    // La tache passe ensuite, comme elle le fait toutes les cinq minutes.
    const liberees = await libererReservationsExpirees();

    /*
     * RIEN A LIBERER, et c'est vital : la confirmation a deja rendu
     * `quantiteReservee`, en meme temps qu'elle sortait le stock physique. Une
     * seconde restitution ferait remonter le disponible d'une piece VENDUE, et
     * la boutique la revendrait.
     */
    expect(liberees).toBe(0);
    expect(await lireStock(varianteId)).toEqual(stockApresVente);
  });

  it("libere plusieurs reservations expirees en une passe", async () => {
    const premiere = await commanderUnePiece({ reservationExpiree: true });
    const seconde = await commanderUnePiece({ reservationExpiree: true });

    const liberees = await libererReservationsExpirees();

    expect(liberees).toBe(2);
    expect(await lireStock(premiere.varianteId)).toEqual({
      physique: 1,
      reservee: 0,
    });
    expect(await lireStock(seconde.varianteId)).toEqual({
      physique: 1,
      reservee: 0,
    });
  });
});

describe("reconcilierPaiements", () => {
  it("regularise une commande payee dont l'evenement n'est jamais arrive", async () => {
    const session = "cs_test_regularisee";
    const { commandeId, varianteId } = await commanderUnePiece({
      commandeAgeeDeMinutes: 90,
      identifiantSession: session,
    });

    const { double, lectures } = fournisseurDouble({
      [session]: {
        etat: "PAYEE",
        identifiantSession: session,
        montantCentimes: TOTAL_ATTENDU_CENTIMES,
        charge: { source: "reconciliation" },
      },
    });

    const bilan = await reconcilierPaiements({ fournisseur: double });

    expect(bilan).toEqual({ examinees: 1, regularisees: 1, annulees: 0 });
    expect(lectures).toEqual([session]);

    /*
     * CRITERE 3. La commande est confirmee exactement comme par le webhook :
     * meme service, meme transaction, memes cles d'unicite. Seule l'origine
     * differe, et c'est elle qui distingue les deux chemins en trace.
     */
    expect(await lireStatutCommande(commandeId)).toBe("CONFIRMEE");
    expect(await lireStock(varianteId)).toEqual({ physique: 0, reservee: 0 });

    const { rows: mouvements } = await client.query<{ origine: string }>(
      "SELECT origine FROM mouvement_stock WHERE commande_id = $1",
      [commandeId],
    );
    expect(mouvements).toEqual([{ origine: "RECONCILIATION" }]);
  });

  it("annule une commande dont la session est expiree sans paiement", async () => {
    const session = "cs_test_expiree";
    const { commandeId, varianteId } = await commanderUnePiece({
      commandeAgeeDeMinutes: 90,
      reservationExpiree: true,
      identifiantSession: session,
    });

    const { double } = fournisseurDouble({ [session]: { etat: "EXPIREE" } });

    const bilan = await reconcilierPaiements({ fournisseur: double });

    expect(bilan).toEqual({ examinees: 1, regularisees: 0, annulees: 1 });

    /*
     * CRITERE 8. La commande passe `ANNULEE`. Sans cela une commande abandonnee
     * resterait `EN_ATTENTE_PAIEMENT` pour toujours, et l'ecran de commandes
     * serait illisible.
     *
     * LE STOCK N'EST PAS RENDU PAR CETTE TACHE, et c'est une separation
     * deliberee : la liberation des reservations echues est l'affaire de
     * l'autre tache, et d'elle seule. Rendre le stock ici aussi le rendrait
     * DEUX FOIS des que les deux taches se croiseraient, faisant apparaitre du
     * disponible qu'aucun achat n'explique.
     */
    expect(await lireStatutCommande(commandeId)).toBe("ANNULEE");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });

    // C'est la liberation qui rend la piece, au cycle suivant.
    await libererReservationsExpirees();
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });

    // La transition est historisee, comme toute transition, critere 8 de LS-119.
    const { rows } = await client.query<{
      statut_precedent: string | null;
      statut_nouveau: string;
      origine: string;
    }>(
      `SELECT statut_precedent, statut_nouveau, origine
       FROM historique_statut WHERE commande_id = $1`,
      [commandeId],
    );

    expect(rows).toEqual([
      {
        statut_precedent: "EN_ATTENTE_PAIEMENT",
        statut_nouveau: "ANNULEE",
        origine: "RECONCILIATION",
      },
    ]);
  });

  it("laisse vivre une commande dont la session est encore ouverte", async () => {
    const session = "cs_test_ouverte";
    const { commandeId, varianteId } = await commanderUnePiece({
      commandeAgeeDeMinutes: 90,
      identifiantSession: session,
    });

    const { double } = fournisseurDouble({ [session]: { etat: "OUVERTE" } });

    const bilan = await reconcilierPaiements({ fournisseur: double });

    /*
     * NI REGULARISEE NI ANNULEE. Une session encore payable appartient au
     * client : l'annuler lui retirerait sa commande sous les yeux, et rendrait
     * au catalogue une piece qu'il est en train de payer.
     */
    expect(bilan).toEqual({ examinees: 1, regularisees: 0, annulees: 0 });
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });
  });

  it("ignore une commande en attente depuis moins d'une heure", async () => {
    const session = "cs_test_recente";
    const { commandeId } = await commanderUnePiece({
      commandeAgeeDeMinutes: 10,
      identifiantSession: session,
    });

    const { double, lectures } = fournisseurDouble({
      [session]: { etat: "EXPIREE" },
    });

    const bilan = await reconcilierPaiements({ fournisseur: double });

    /*
     * LE SEUIL D'UNE HEURE EST DANS `payments.md`, et il n'est pas cosmetique :
     * la session dure 30 minutes, le prestataire rejoue ses evenements pendant
     * un moment, et regulariser trop tot croiserait un webhook en vol pour rien.
     * AUCUN APPEL n'est fait, ce que `lectures` verifie.
     */
    expect(bilan).toEqual({ examinees: 0, regularisees: 0, annulees: 0 });
    expect(lectures).toEqual([]);
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
  });

  it("saute la commande et n'annule rien quand le prestataire est en panne", async () => {
    const session = "cs_test_panne";
    const { commandeId, varianteId } = await commanderUnePiece({
      commandeAgeeDeMinutes: 90,
      identifiantSession: session,
    });

    const { double } = fournisseurDouble(
      { [session]: { etat: "EXPIREE" } },
      { enPanne: true },
    );

    const bilan = await reconcilierPaiements({ fournisseur: double });

    /*
     * NE PAS SAVOIR N'AUTORISE AUCUNE DECISION. Annuler sur une panne
     * annulerait des commandes payees et rendrait au catalogue des pieces
     * vendues. La commande est sautee et le cycle suivant reessaiera.
     */
    expect(bilan).toEqual({ examinees: 1, regularisees: 0, annulees: 0 });
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });
  });

  it("annule une commande sans aucune tentative de paiement", async () => {
    const { commandeId, varianteId } = await commanderUnePiece({
      commandeAgeeDeMinutes: 90,
      reservationExpiree: true,
    });

    const { double, lectures } = fournisseurDouble({});

    const bilan = await reconcilierPaiements({ fournisseur: double });

    /*
     * AUCUNE SESSION N'A JAMAIS ETE CREEE : la creation a echoue, ou le
     * prestataire etait indisponible, cas d'erreur du parcours 1. Rien n'a pu
     * etre paye, donc rien n'est a demander au prestataire, et la commande
     * s'annule sans appel externe.
     */
    expect(bilan).toEqual({ examinees: 1, regularisees: 0, annulees: 1 });
    expect(lectures).toEqual([]);
    expect(await lireStatutCommande(commandeId)).toBe("ANNULEE");

    // Le stock reste rendu par l'autre tache, meme separation que ci-dessus.
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });
    await libererReservationsExpirees();
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });
  });
});

describe("croisement du webhook et de la reconciliation", () => {
  /*
   * LE CRITERE 4 DEMANDE LES DEUX ORDRES D'ARRIVEE, et c'est la premiere fois
   * qu'il se teste avec les DEUX CHEMINS REELS : LS-119 devait appeler son
   * propre service en changeant l'origine, faute de reconciliation existante.
   */
  it("reconciliation puis webhook tardif : aucun doublon", async () => {
    const session = "cs_test_croisement_1";
    const { commandeId, varianteId } = await commanderUnePiece({
      // TROIS EXEMPLAIRES : sur une piece unique le CHECK ferait echouer la
      // seconde ecriture, donnant un vert accidentel. A trois, seule la cle
      // d'effet s'oppose au doublon, et son absence serait SILENCIEUSE.
      quantitePhysique: 3,
      commandeAgeeDeMinutes: 90,
      identifiantSession: session,
    });

    const { double } = fournisseurDouble({
      [session]: {
        etat: "PAYEE",
        identifiantSession: session,
        montantCentimes: TOTAL_ATTENDU_CENTIMES,
        charge: {},
      },
    });

    await reconcilierPaiements({ fournisseur: double });

    const stockApresRegularisation = await lireStock(varianteId);

    // Le webhook arrive enfin, identifiant jamais vu.
    const tardif: EvenementPaiement = {
      identifiant: "evt_tardif_apres_reconciliation",
      type: "PAIEMENT_REUSSI",
      commandeId,
      identifiantSession: session,
      montantCentimes: TOTAL_ATTENDU_CENTIMES,
      montantRembourseCentimes: 0,
      charge: {},
    };

    const issue = await traiterEvenementPaiement({
      corpsBrut: JSON.stringify(tardif),
      signature: "signature-de-test",
      verificateur: {
        async verifier() {
          return tardif;
        },
      },
    });

    expect(issue).toEqual({ statut: "DEJA_TRAITE" });
    expect(await lireStock(varianteId)).toEqual(stockApresRegularisation);

    const { rows: mouvements } = await client.query(
      "SELECT id FROM mouvement_stock WHERE commande_id = $1",
      [commandeId],
    );
    expect(mouvements).toHaveLength(1);

    const { rows: encaisses } = await client.query(
      "SELECT id FROM paiement WHERE commande_id = $1 AND statut = 'REUSSI'",
      [commandeId],
    );
    expect(encaisses).toHaveLength(1);
  });

  it("webhook puis reconciliation : aucun doublon, et rien a regulariser", async () => {
    const session = "cs_test_croisement_2";
    const { commandeId, varianteId } = await commanderUnePiece({
      quantitePhysique: 3,
      commandeAgeeDeMinutes: 90,
      identifiantSession: session,
    });

    const evenement: EvenementPaiement = {
      identifiant: "evt_arrive_a_temps",
      type: "PAIEMENT_REUSSI",
      commandeId,
      identifiantSession: session,
      montantCentimes: TOTAL_ATTENDU_CENTIMES,
      montantRembourseCentimes: 0,
      charge: {},
    };

    await traiterEvenementPaiement({
      corpsBrut: JSON.stringify(evenement),
      signature: "signature-de-test",
      verificateur: {
        async verifier() {
          return evenement;
        },
      },
    });

    const stockApresWebhook = await lireStock(varianteId);

    const { double, lectures } = fournisseurDouble({
      [session]: {
        etat: "PAYEE",
        identifiantSession: session,
        montantCentimes: TOTAL_ATTENDU_CENTIMES,
        charge: {},
      },
    });

    const bilan = await reconcilierPaiements({ fournisseur: double });

    /*
     * LA COMMANDE N'EST MEME PAS EXAMINEE : elle n'est plus
     * `EN_ATTENTE_PAIEMENT`, le webhook l'ayant confirmee. Aucun appel au
     * prestataire, ce que `lectures` verifie : interroger inutilement le
     * prestataire a chaque cycle sur des commandes deja reglees couterait des
     * appels pour rien.
     */
    expect(bilan).toEqual({ examinees: 0, regularisees: 0, annulees: 0 });
    expect(lectures).toEqual([]);
    expect(await lireStock(varianteId)).toEqual(stockApresWebhook);

    const { rows: mouvements } = await client.query(
      "SELECT id FROM mouvement_stock WHERE commande_id = $1",
      [commandeId],
    );
    expect(mouvements).toHaveLength(1);
  });
});
