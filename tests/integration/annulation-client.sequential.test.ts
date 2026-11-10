/**
 * ANNULATION D'UNE COMMANDE EN ATTENTE PAR LE CLIENT, LS-315, ADR-050.
 *
 * ECRIT AVANT LE SERVICE, exigence du plan directeur en zone critique : stock
 * et paiement.
 *
 * CE QUE CE CHEMIN AJOUTE. Jusqu'a ADR-050, la reconciliation etait le seul
 * chemin d'annulation et ne touchait jamais au stock. L'annulation par le
 * client rend la piece elle-meme, donc croise QUATRE chemins sur les memes
 * lignes : le webhook de confirmation, la tache de liberation, le reessai de
 * paiement et une seconde annulation. Chacun a son cas ci-dessous.
 *
 * LE PRESTATAIRE EST UN DOUBLE, et ses methodes servent de points de
 * rendez-vous : l'appel d'expiration est hors transaction, ADR-024, c'est donc
 * exactement la ou un chemin concurrent peut s'intercaler en production.
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
  IssueExpirationSession,
} from "@/integrations/stripe/fournisseur";
import type { EvenementPaiement } from "@/integrations/stripe/evenements";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let annulerCommandeEnAttente: typeof import("@/services/annulation-commande").annulerCommandeEnAttente;
let lireCommandeEnAttente: typeof import("@/services/annulation-commande").lireCommandeEnAttente;
let libererReservationsExpirees: typeof import("@/services/liberation-reservations").libererReservationsExpirees;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;
let demarrerPaiement: typeof import("@/services/paiement").demarrerPaiement;
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
  domicileCentimes: 749,
  seuilFranchiseCentimes: 3900,
};

const TOTAL_ATTENDU_CENTIMES = 4900;

type OptionsDouble = {
  /** Issue de l'expiration, par session. `EXPIREE` par defaut. */
  expirations?: Record<string, IssueExpirationSession>;
  /** Etat lu apres un `DEJA_FERMEE`, par session. `EXPIREE` par defaut. */
  etats?: Record<string, EtatSessionPaiement>;
  expirationEnPanne?: boolean;
  lectureEnPanne?: boolean;
  /** Execute PENDANT l'appel d'expiration, hors de toute transaction. */
  pendantExpiration?: () => Promise<void>;
};

/** Double du prestataire, qui trace ce que le service lui demande. */
function fournisseurDouble(options: OptionsDouble = {}): {
  double: FournisseurPaiement;
  expirees: string[];
  lues: string[];
} {
  const expirees: string[] = [];
  const lues: string[] = [];

  const double: FournisseurPaiement = {
    async creerSession() {
      throw new Error("creerSession n'a pas sa place dans l'annulation");
    },
    async expirerSession(identifiant) {
      expirees.push(identifiant);

      if (options.pendantExpiration !== undefined) {
        await options.pendantExpiration();
      }

      if (options.expirationEnPanne === true) {
        throw new PrestatairePaiementIndisponibleError("panne simulee");
      }

      return options.expirations?.[identifiant] ?? "EXPIREE";
    },
    async lireSession(identifiant) {
      lues.push(identifiant);

      if (options.lectureEnPanne === true) {
        throw new PrestatairePaiementIndisponibleError("panne simulee");
      }

      return options.etats?.[identifiant] ?? { etat: "EXPIREE" };
    },
    /*
     * UNE ANNULATION NE REMBOURSE JAMAIS : elle n'existe que sur une commande
     * sans encaissement. L'appel leve plutot que de rendre un succes muet.
     */
    async rembourser(): Promise<never> {
      throw new Error("rembourser n'a pas sa place dans l'annulation");
    },
  };

  return { double, expirees, lues };
}

/** Passe une vraie commande, avec ou sans session rattachee. */
async function commanderUnePiece(
  options: {
    quantitePhysique?: number;
    identifiantSession?: string | null;
  } = {},
): Promise<{ commandeId: string; varianteId: string; session: string | null }> {
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

  const session =
    options.identifiantSession === undefined
      ? `cs_${randomUUID()}`
      : options.identifiantSession;

  if (session !== null) {
    await client.query(
      `INSERT INTO paiement (id, commande_id, statut, montant_centimes, identifiant_fournisseur, cree_a)
       VALUES (gen_random_uuid(), $1, 'EN_ATTENTE', $2, $3, now())`,
      [issue.commandeId, TOTAL_ATTENDU_CENTIMES, session],
    );
  }

  return { commandeId: issue.commandeId, varianteId, session };
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

async function compter(sql: string, parametres: unknown[]): Promise<number> {
  const { rows } = await client.query<{ n: string }>(sql, parametres);

  return Number(rows[0]?.n ?? "0");
}

const compterReservations = (commandeId: string) =>
  compter(
    "SELECT count(*)::text AS n FROM reservation WHERE commande_id = $1",
    [commandeId],
  );

const compterAnnulationsClient = (commandeId: string) =>
  compter(
    `SELECT count(*)::text AS n FROM historique_statut
      WHERE commande_id = $1 AND statut_nouveau = 'ANNULEE' AND origine = 'CLIENT'`,
    [commandeId],
  );

const compterMouvements = (varianteId: string) =>
  compter(
    "SELECT count(*)::text AS n FROM mouvement_stock WHERE variante_id = $1",
    [varianteId],
  );

const compterAlertes = () =>
  compter("SELECT count(*)::text AS n FROM alerte_critique", []);

/** Un evenement de paiement reussi sur la session donnee. */
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

async function confirmerParWebhook(
  evenement: EvenementPaiement,
): Promise<void> {
  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: {
      async verifier() {
        return evenement;
      },
    },
  });
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ annulerCommandeEnAttente, lireCommandeEnAttente } =
    await import("@/services/annulation-commande"));
  ({ libererReservationsExpirees } =
    await import("@/services/liberation-reservations"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ demarrerPaiement } = await import("@/services/paiement"));
  ({ PrestatairePaiementIndisponibleError } =
    await import("@/integrations/stripe/fournisseur"));
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

describe("annulerCommandeEnAttente, chemin nominal", () => {
  it("expire la session, annule, rend la piece et historise CLIENT", async () => {
    const { commandeId, varianteId, session } = await commanderUnePiece();
    const { double, expirees } = fournisseurDouble();

    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    /*
     * LES LIGNES SONT RENDUES pour que l'adaptateur reconstruise le panier :
     * c'est la moitie du defaut mesure le 10 novembre 2026, le client
     * retrouvait un panier vide.
     */
    expect(issue).toEqual({
      statut: "ANNULEE",
      lignes: [{ varianteId, quantite: 1 }],
    });
    expect(expirees).toEqual([session]);

    // LA PIECE REVIENT TOUT DE SUITE, sans attendre la tache de liberation.
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });
    expect(await compterReservations(commandeId)).toBe(0);
    expect(await lireStatutCommande(commandeId)).toBe("ANNULEE");
    expect(await compterAnnulationsClient(commandeId)).toBe(1);

    // INVARIANT 6 : rendre une reservation n'est pas un mouvement de stock.
    expect(await compterMouvements(varianteId)).toBe(0);

    // ARBITRAGE DU 10 NOVEMBRE 2026 : renoncer n'est pas une anomalie.
    expect(await compterAlertes()).toBe(0);
  });

  it("annule sans appel au prestataire quand aucune session n'existe", async () => {
    const { commandeId, varianteId } = await commanderUnePiece({
      identifiantSession: null,
    });
    const { double, expirees, lues } = fournisseurDouble();

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    expect(issue.statut).toBe("ANNULEE");
    expect(expirees).toEqual([]);
    expect(lues).toEqual([]);
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });
  });

  it("annule quand la session est deja fermee sans paiement", async () => {
    const { commandeId, varianteId, session } = await commanderUnePiece();
    const { double, lues } = fournisseurDouble({
      expirations: { [session as string]: "DEJA_FERMEE" },
    });

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    /*
     * `DEJA_FERMEE` NE DIT PAS POURQUOI, ADR-032 : payee ou expiree. La lecture
     * de la session tranche, et ici elle dit expiree.
     */
    expect(lues).toEqual([session]);
    expect(issue.statut).toBe("ANNULEE");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });
  });
});

describe("annulerCommandeEnAttente, refus", () => {
  it("refuse quand la session est payee, sans rien toucher", async () => {
    const { commandeId, varianteId, session } = await commanderUnePiece();
    const { double } = fournisseurDouble({
      expirations: { [session as string]: "DEJA_FERMEE" },
      etats: {
        [session as string]: {
          etat: "PAYEE",
          identifiantSession: session as string,
          montantCentimes: TOTAL_ATTENDU_CENTIMES,
          charge: {},
        },
      },
    });

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    /*
     * LE CLIENT A PAYE, l'evenement n'est simplement pas encore arrive.
     * Annuler ici rendrait au catalogue une piece vendue, et lui ferait payer
     * une commande annulee.
     */
    expect(issue).toEqual({ statut: "PAIEMENT_EN_COURS" });
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });
    expect(await compterReservations(commandeId)).toBe(1);
  });

  it("refuse sur une panne d'expiration, sans rien toucher", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();
    const { double } = fournisseurDouble({ expirationEnPanne: true });

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    /*
     * SANS REPONSE DU PRESTATAIRE, LA SESSION EST PEUT-ETRE ENCORE PAYABLE.
     * Annuler quand meme ouvrirait le paiement sur commande annulee, donc un
     * remboursement manuel.
     */
    expect(issue).toEqual({ statut: "PANNE" });
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });
  });

  it("refuse sur une panne de lecture apres DEJA_FERMEE", async () => {
    const { commandeId, varianteId, session } = await commanderUnePiece();
    const { double } = fournisseurDouble({
      expirations: { [session as string]: "DEJA_FERMEE" },
      lectureEnPanne: true,
    });

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    expect(issue).toEqual({ statut: "PANNE" });
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });
  });

  it("refuse une commande confirmee sans appeler le prestataire", async () => {
    const { commandeId, varianteId, session } = await commanderUnePiece();

    /*
     * UNE ANCIENNE TENTATIVE RESTEE `EN_ATTENTE`, celle qu'un rattrapage
     * d'ADR-032 n'a pas pu expirer. Sans elle, la garde de la transaction
     * rattrapait seule ce cas et celle de la lecture n'etait jamais exercee,
     * mesure par mutation le 10 novembre 2026.
     */
    await client.query(
      `INSERT INTO paiement (id, commande_id, statut, montant_centimes, identifiant_fournisseur, cree_a)
       VALUES (gen_random_uuid(), $1, 'EN_ATTENTE', $2, $3, now() - interval '5 minutes')`,
      [commandeId, TOTAL_ATTENDU_CENTIMES, `cs_${randomUUID()}`],
    );

    await confirmerParWebhook(paiementReussi(commandeId, session as string));
    expect(await lireStatutCommande(commandeId)).toBe("CONFIRMEE");

    const stockAvant = await lireStock(varianteId);
    const { double, expirees } = fournisseurDouble();

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    expect(issue).toEqual({ statut: "NON_ANNULABLE" });
    expect(expirees).toEqual([]);
    expect(await lireStatutCommande(commandeId)).toBe("CONFIRMEE");
    expect(await lireStock(varianteId)).toEqual(stockAvant);
  });

  it("refuse un identifiant inconnu comme une commande non annulable", async () => {
    const { double } = fournisseurDouble();

    const issue = await annulerCommandeEnAttente({
      commandeId: randomUUID(),
      fournisseur: double,
    });

    expect(issue).toEqual({ statut: "NON_ANNULABLE" });
  });
});

describe("annulerCommandeEnAttente, idempotence et concurrence", () => {
  it("une seconde annulation ne rend rien de plus", async () => {
    /*
     * DEUX EXEMPLAIRES, DONT UN RESERVE PAR UNE AUTRE COMMANDE : un double
     * decrement ne viole alors aucun CHECK, il fait juste disparaitre la
     * reservation d'autrui. C'est la forme silencieuse du defaut, celle qu'une
     * piece unique ne montrerait pas.
     */
    const { commandeId, varianteId } = await commanderUnePiece({
      quantitePhysique: 2,
    });

    await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });
    expect(await lireStock(varianteId)).toEqual({ physique: 2, reservee: 2 });

    const { double } = fournisseurDouble();

    const premiere = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });
    const seconde = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    expect(premiere.statut).toBe("ANNULEE");
    expect(seconde).toEqual({ statut: "NON_ANNULABLE" });
    expect(await lireStock(varianteId)).toEqual({ physique: 2, reservee: 1 });
    expect(await compterAnnulationsClient(commandeId)).toBe(1);
  });

  it("deux annulations simultanees ne passent qu'une fois", async () => {
    const { commandeId, varianteId } = await commanderUnePiece({
      quantitePhysique: 2,
    });

    await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    /*
     * LES DEUX SE RETROUVENT PENDANT L'EXPIRATION, hors transaction : c'est la
     * que le double clic se chevauche reellement, l'appel reseau durant
     * jusqu'a vingt secondes.
     */
    let arrivees = 0;
    let liberer: () => void = () => {};
    const rendezVous = new Promise<void>((resoudre) => {
      liberer = resoudre;
    });

    const { double } = fournisseurDouble({
      async pendantExpiration() {
        arrivees += 1;

        if (arrivees === 2) {
          liberer();
        }

        await rendezVous;
      },
    });

    const issues = await Promise.all([
      annulerCommandeEnAttente({ commandeId, fournisseur: double }),
      annulerCommandeEnAttente({ commandeId, fournisseur: double }),
    ]);

    expect(issues.map((issue) => issue.statut).sort()).toEqual([
      "ANNULEE",
      "NON_ANNULABLE",
    ]);
    expect(await lireStock(varianteId)).toEqual({ physique: 2, reservee: 1 });
    expect(await compterAnnulationsClient(commandeId)).toBe(1);
  });

  it("ne rend pas une reservation que la liberation a deja rendue", async () => {
    const { commandeId, varianteId } = await commanderUnePiece({
      quantitePhysique: 2,
    });

    /*
     * LA LIBERATION PASSE PENDANT L'EXPIRATION, puis un autre client reserve le
     * second exemplaire. L'annulation trouve alors `quantite_reservee` a 1, et
     * ce 1 n'est plus le sien : le decrementer ferait disparaitre la
     * reservation de l'autre client, sans qu'aucun CHECK ne s'y oppose.
     */
    const { double } = fournisseurDouble({
      async pendantExpiration() {
        await client.query(
          "UPDATE reservation SET expire_a = now() - interval '1 second' WHERE commande_id = $1",
          [commandeId],
        );
        await libererReservationsExpirees();
        await passerCommande({
          lignesCookie: [{ varianteId, quantite: 1 }],
          saisie: SAISIE_DOMICILE,
          configuration: CONFIGURATION,
        });
      },
    });

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    expect(issue.statut).toBe("ANNULEE");
    expect(await lireStock(varianteId)).toEqual({ physique: 2, reservee: 1 });
  });

  it("croise la liberation dans la meme fenetre sans interblocage", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();

    await client.query(
      "UPDATE reservation SET expire_a = now() - interval '1 second' WHERE commande_id = $1",
      [commandeId],
    );

    /*
     * LA LIBERATION DEMARRE au moment ou l'annulation sort de l'appel reseau,
     * donc juste devant sa transaction : les deux prennent leurs verrous sur
     * la meme variante et la meme reservation. Un ordre de verrous inverse
     * s'interbloque ici, et PostgreSQL tue l'une des deux.
     */
    let liberation: Promise<number> | undefined;
    const { double } = fournisseurDouble({
      async pendantExpiration() {
        // LANCEE SANS ATTENDRE : sa transaction court pendant celle de
        // l'annulation, qui demarre des le retour de cet appel.
        liberation = libererReservationsExpirees();
      },
    });

    const [annulation] = await Promise.allSettled([
      annulerCommandeEnAttente({ commandeId, fournisseur: double }),
    ]);
    const [liberee] = await Promise.allSettled([liberation]);

    expect(liberation).toBeDefined();
    expect(annulation.status).toBe("fulfilled");
    expect(liberee.status).toBe("fulfilled");
    expect(await lireStatutCommande(commandeId)).toBe("ANNULEE");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });
  });

  it("ne tient aucune reservation en attendant le verrou de la variante", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();

    /*
     * POURQUOI CE TEST ET NON LE PRECEDENT SEUL, mesure le 10 novembre 2026 :
     * le verrou des variantes retire, le croisement precedent restait vert.
     * PostgreSQL designe comme victime celui qui attend depuis le plus
     * longtemps, ici l'annulation, et son rejeu borne la fait aboutir. Le
     * defaut existe pourtant : face au webhook, c'est la confirmation d'un
     * paiement qui peut mourir.
     *
     * LA SECONDE CONNEXION IMITE LA LIBERATION, variante puis reservation, et
     * rend l'ordre observable sans dependre de l'ordonnancement. Elle tient la
     * variante ; l'annulation se bloque. Dans le bon ordre elle se bloque en
     * tete, sans rien tenir, et la suppression de la reservation passe. Dans
     * l'ordre inverse elle tient deja la reservation, et la suppression bute
     * sur `lock_timeout`, plus court que la detection d'interblocage.
     */
    const imitation = new Client({
      connectionString: inject(VARIABLE_URL_TEST),
    });
    await imitation.connect();

    try {
      const { rows } = await imitation.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );
      const pidImitation = rows[0]?.pid;

      await imitation.query("BEGIN");
      await imitation.query(
        "SELECT id FROM variante WHERE id = $1 FOR UPDATE",
        [varianteId],
      );

      const { double } = fournisseurDouble();
      const annulation = annulerCommandeEnAttente({
        commandeId,
        fournisseur: double,
      });

      // L'annulation est bloquee sur un verrou quand une autre session attend.
      let bloquee = false;

      for (let essai = 0; essai < 100 && !bloquee; essai += 1) {
        const attente = await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND pid <> $1`,
          [pidImitation],
        );

        bloquee = Number(attente.rows[0]?.n ?? "0") > 0;

        if (!bloquee) {
          await new Promise((resoudre) => setTimeout(resoudre, 50));
        }
      }

      expect(bloquee).toBe(true);

      let erreurImitation: unknown;

      try {
        await imitation.query("SET LOCAL lock_timeout = '500ms'");
        await imitation.query(
          "DELETE FROM reservation WHERE commande_id = $1",
          [commandeId],
        );
        await imitation.query(
          "UPDATE variante SET quantite_reservee = quantite_reservee - 1 WHERE id = $1",
          [varianteId],
        );
        await imitation.query("COMMIT");
      } catch (erreur) {
        erreurImitation = erreur;
        await imitation.query("ROLLBACK");
      }

      const issue = await annulation;

      expect(erreurImitation).toBeUndefined();
      expect(issue.statut).toBe("ANNULEE");

      // La reservation rendue par l'imitation ne l'est pas une seconde fois.
      expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });
    } finally {
      await imitation.end();
    }
  });

  it("n'annule pas une commande confirmee pendant l'expiration", async () => {
    const { commandeId, varianteId, session } = await commanderUnePiece();

    /*
     * LE WEBHOOK CONFIRME PENDANT L'APPEL D'EXPIRATION. Le double rend ensuite
     * `EXPIREE`, ce que Stripe ne ferait pas sur une session payee : c'est
     * voulu, pour eprouver la SECONDE ligne de defense, la garde sur le statut
     * dans la transaction, independamment de la reponse du prestataire.
     */
    const { double } = fournisseurDouble({
      async pendantExpiration() {
        await confirmerParWebhook(
          paiementReussi(commandeId, session as string),
        );
      },
    });

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    expect(issue).toEqual({ statut: "NON_ANNULABLE" });
    expect(await lireStatutCommande(commandeId)).toBe("CONFIRMEE");

    // LA PIECE EST VENDUE : sortie du physique, aucune reservation rendue.
    expect(await lireStock(varianteId)).toEqual({ physique: 0, reservee: 0 });
    expect(await compterMouvements(varianteId)).toBe(1);
    expect(await compterAnnulationsClient(commandeId)).toBe(0);
    expect(
      await compter(
        "SELECT count(*)::text AS n FROM alerte_critique WHERE type = 'PAIEMENT_SUR_COMMANDE_ANNULEE'",
        [],
      ),
    ).toBe(0);
  });

  it("renonce si une session est rattachee pendant l'expiration", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();

    /*
     * UN REESSAI DANS UN AUTRE ONGLET rattache une session neuve pendant que
     * l'annulation expire l'ancienne. Annuler laisserait cette session
     * payable trente minutes sur une commande annulee.
     */
    const { double } = fournisseurDouble({
      async pendantExpiration() {
        await client.query(
          `INSERT INTO paiement (id, commande_id, statut, montant_centimes, identifiant_fournisseur, cree_a)
           VALUES (gen_random_uuid(), $1, 'EN_ATTENTE', $2, $3, now())`,
          [commandeId, TOTAL_ATTENDU_CENTIMES, `cs_${randomUUID()}`],
        );
      },
    });

    const issue = await annulerCommandeEnAttente({
      commandeId,
      fournisseur: double,
    });

    expect(issue).toEqual({ statut: "REESSAYER" });
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });
  });
});

describe("demarrerPaiement apres une annulation concurrente", () => {
  it("expire la session qu'il vient de creer si la commande a ete annulee", async () => {
    const { commandeId } = await commanderUnePiece({
      identifiantSession: null,
    });
    const nouvelle = `cs_${randomUUID()}`;
    const expireesAuDemarrage: string[] = [];

    /*
     * L'ANNULATION PASSE PENDANT LA CREATION DE SESSION, donc entre la
     * reservation de la tentative et son rattachement. Le rattachement doit
     * alors constater la commande annulee et expirer la session neuve.
     */
    const demarrage: FournisseurPaiement = {
      async creerSession() {
        const { double } = fournisseurDouble();
        const annulation = await annulerCommandeEnAttente({
          commandeId,
          fournisseur: double,
        });

        expect(annulation.statut).toBe("ANNULEE");

        return {
          identifiant: nouvelle,
          url: "https://paiement.invalid/session",
        };
      },
      async expirerSession(identifiant) {
        expireesAuDemarrage.push(identifiant);

        return "EXPIREE";
      },
      async lireSession() {
        return { etat: "EXPIREE" };
      },
      async rembourser(): Promise<never> {
        throw new Error("rembourser n'a pas sa place ici");
      },
    };

    const issue = await demarrerPaiement({
      commandeId,
      fournisseur: demarrage,
      urlBase: "https://boutique.invalid",
    });

    expect(issue.statut).not.toBe("REDIRECTION");
    expect(expireesAuDemarrage).toContain(nouvelle);
    expect(await lireStatutCommande(commandeId)).toBe("ANNULEE");
  });
});

describe("lireCommandeEnAttente, le bandeau du volet 1", () => {
  it("rend le numero, la fin de reservation et la variante tenue", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();

    const enAttente = await lireCommandeEnAttente(commandeId);

    expect(enAttente?.varianteIds).toEqual([varianteId]);
    expect(enAttente?.numero).toMatch(/^C-/);
    expect(enAttente?.reserveeJusqua.getTime()).toBeGreaterThan(Date.now());
  });

  it("se tait quand la reservation a expire", async () => {
    const { commandeId } = await commanderUnePiece();

    /*
     * LA PIECE N'EST PLUS TENUE, meme avant le passage de la liberation :
     * promettre « reservee jusqu'a » serait faux.
     */
    await client.query(
      "UPDATE reservation SET expire_a = now() - interval '1 second' WHERE commande_id = $1",
      [commandeId],
    );

    expect(await lireCommandeEnAttente(commandeId)).toBeNull();
  });

  it("se tait sur une commande payee, annulee ou inconnue", async () => {
    const payee = await commanderUnePiece();
    await confirmerParWebhook(
      paiementReussi(payee.commandeId, payee.session as string),
    );

    const annulee = await commanderUnePiece();
    const { double } = fournisseurDouble();
    await annulerCommandeEnAttente({
      commandeId: annulee.commandeId,
      fournisseur: double,
    });

    expect(await lireCommandeEnAttente(payee.commandeId)).toBeNull();
    expect(await lireCommandeEnAttente(annulee.commandeId)).toBeNull();
    expect(await lireCommandeEnAttente(randomUUID())).toBeNull();
  });
});
