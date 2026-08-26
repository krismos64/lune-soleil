/**
 * LA SESSION DE PAIEMENT SE CREE APRES LE COMMIT, LS-118 et ADR-024, avec les
 * trois contraintes d'ADR-032 : expiration de la session precedente, clef
 * d'idempotence par commande ET tentative, `expires_at` aligne sur la
 * reservation.
 *
 * ECRIT AVANT LE SERVICE, exigence du plan directeur en zone critique. Ce
 * fichier dit ce que `demarrerPaiement` doit garantir, pas ce qu'il fait.
 *
 * LE TEST DECISIF EST LA PANNE DU PRESTATAIRE, critere 4 : la commande et ses
 * reservations doivent survivre a l'echec de creation de session. C'est lui que
 * la mutation du critere 9 doit faire rougir : la creation de session deplacee
 * DANS la transaction de `passerCommande`, une panne du prestataire efface la
 * commande par rollback, et l'assertion d'existence echoue.
 *
 * VERIFIER UNE IDENTITE ET NON UNE CARDINALITE, piege mesure le 25 aout 2026 :
 * ces tests nomment la commande attendue, le montant attendu, l'identifiant de
 * session attendu, plutot que de compter des lignes.
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
  DemandeSessionPaiement,
  FournisseurPaiement,
  IssueExpirationSession,
} from "@/integrations/stripe/fournisseur";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let demarrerPaiement: typeof import("@/services/paiement").demarrerPaiement;
let passerCommandeEtDemarrerPaiement: typeof import("@/services/paiement").passerCommandeEtDemarrerPaiement;
let PrestatairePaiementIndisponibleError: typeof import("@/integrations/stripe/fournisseur").PrestatairePaiementIndisponibleError;

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

/**
 * Total attendu de la commande de test : une variante a 4900 centimes, sous le
 * seuil de franchise a 3900 ? Non : 4900 >= 3900, la livraison est OFFERTE.
 * Le total attendu est donc 4900, et ce commentaire existe parce que la
 * premiere lecture se trompe volontiers.
 */
const TOTAL_ATTENDU_CENTIMES = 4900;

/**
 * Double du prestataire, configurable par cas.
 *
 * IL ENREGISTRE CE QU'ON LUI DEMANDE : les assertions portent sur les demandes
 * recues, pas seulement sur l'etat final, parce que la clef d'idempotence et
 * l'`expires_at` ne laissent aucune autre trace observable.
 */
function fournisseurDouble(
  options: {
    creationEnPanne?: boolean;
    expirationEnPanne?: boolean;
    issueExpiration?: IssueExpirationSession;
    /**
     * Latence de l'appel reseau, en millisecondes.
     *
     * SANS ELLE, LE TEST DE CONCURRENCE NE PROUVE RIEN. Un double qui rend
     * immediatement ne laisse jamais deux appels s'entrelacer : la fenetre que
     * le verrou de commande ferme ne s'ouvre pas, et retirer ce verrou laisse
     * la suite verte. Mesure le 26 aout 2026, la mutation restait invisible.
     *
     * Elle n'est pas une temporisation de confort : elle represente
     * l'aller-retour reel chez le prestataire, seul moment ou la fenetre
     * existe en production.
     */
    latenceMs?: number;
  } = {},
) {
  const demandes: DemandeSessionPaiement[] = [];
  const expirations: string[] = [];

  async function attendre(): Promise<void> {
    if (options.latenceMs !== undefined) {
      await new Promise((resoudre) => setTimeout(resoudre, options.latenceMs));
    }
  }

  const double: FournisseurPaiement = {
    async creerSession(demande) {
      await attendre();

      if (options.creationEnPanne === true) {
        throw new PrestatairePaiementIndisponibleError("panne simulee");
      }

      demandes.push(demande);

      return {
        identifiant: `cs_test_${demandes.length}_${demande.commandeId.slice(0, 8)}`,
        url: `https://paiement.example.invalid/${demandes.length}`,
      };
    },
    async expirerSession(identifiant) {
      await attendre();

      if (options.expirationEnPanne === true) {
        throw new PrestatairePaiementIndisponibleError("panne simulee");
      }

      expirations.push(identifiant);

      return options.issueExpiration ?? "EXPIREE";
    },
  };

  return { double, demandes, expirations };
}

/** Ecrit une commande reelle par le service, et rend son identifiant. */
async function commanderUnePiece(): Promise<string> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  return issue.commandeId;
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  // Les services lisent `DATABASE_URL` a l'evaluation du module `@/lib/prisma`,
  // d'ou les imports differes : le renseigner apres coup n'aurait aucun effet.
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ demarrerPaiement, passerCommandeEtDemarrerPaiement } =
    await import("@/services/paiement"));
  ({ PrestatairePaiementIndisponibleError } =
    await import("@/integrations/stripe/fournisseur"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE paiement, reservation, ligne_commande, commande, variante, produit, categorie, compteur_numero CASCADE",
  );
});

describe("demarrerPaiement, cas nominal", () => {
  it("cree la session et rattache son identifiant a la commande", async () => {
    const commandeId = await commanderUnePiece();
    const { double, demandes, expirations } = fournisseurDouble();

    const issue = await demarrerPaiement({ commandeId, fournisseur: double });

    expect(issue).toEqual({
      statut: "REDIRECTION",
      url: "https://paiement.example.invalid/1",
    });

    // Aucune session precedente : la prevention n'a rien a expirer.
    expect(expirations).toEqual([]);

    // L'identifiant de session est rattache a la commande, critere 6, par une
    // tentative de paiement EN_ATTENTE portant le montant de la commande.
    const { rows: paiements } = await client.query<{
      commande_id: string;
      statut: string;
      montant_centimes: number;
      identifiant_fournisseur: string | null;
    }>(
      "SELECT commande_id, statut, montant_centimes, identifiant_fournisseur FROM paiement",
    );

    expect(paiements).toEqual([
      {
        commande_id: commandeId,
        statut: "EN_ATTENTE",
        montant_centimes: TOTAL_ATTENDU_CENTIMES,
        identifiant_fournisseur: `cs_test_1_${commandeId.slice(0, 8)}`,
      },
    ]);

    // La demande au prestataire porte le montant du SERVEUR, invariant 1 et 2 :
    // la somme des lignes envoyees vaut exactement le total de la commande.
    const demande = demandes[0];

    expect(demande).toBeDefined();
    expect(demande?.commandeId).toBe(commandeId);

    const totalDemande = (demande?.lignes ?? []).reduce(
      (total, ligne) => total + ligne.prixUnitaireCentimes * ligne.quantite,
      0,
    );

    expect(totalDemande).toBe(TOTAL_ATTENDU_CENTIMES);
  });

  it("borne la session a 30 minutes et y prolonge la reservation", async () => {
    const commandeId = await commanderUnePiece();
    const { double, demandes } = fournisseurDouble();

    const avant = Date.now();
    await demarrerPaiement({ commandeId, fournisseur: double });
    const apres = Date.now();

    // `expires_at` vaut 30 minutes, ADR-032, borne basse de Stripe.
    const expireA = demandes[0]?.expireA.getTime() ?? 0;

    expect(expireA).toBeGreaterThanOrEqual(avant + 30 * 60 * 1000);
    expect(expireA).toBeLessThanOrEqual(apres + 30 * 60 * 1000);

    // La reservation est prolongee A l'expiration de la session, arbitrage du
    // 26 aout 2026 : une session ne survit jamais a sa reservation, et
    // l'assertion porte l'IDENTITE des deux instants, pas un encadrement.
    const { rows: reservations } = await client.query<{
      commande_id: string;
      expire_a: Date;
    }>("SELECT commande_id, expire_a FROM reservation");

    expect(reservations.map((ligne) => ligne.commande_id)).toEqual([
      commandeId,
    ]);
    expect(reservations[0]?.expire_a.getTime()).toBe(expireA);
  });
});

describe("passerCommandeEtDemarrerPaiement, le chemin de production", () => {
  it("ecrit la commande puis cree la session, dans cet ordre", async () => {
    const { varianteId } = await creerVarianteEnStock(client);
    const { double, demandes } = fournisseurDouble();

    const issue = await passerCommandeEtDemarrerPaiement({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
      fournisseur: double,
    });

    expect(issue.paiement).toEqual({
      statut: "REDIRECTION",
      url: "https://paiement.example.invalid/1",
    });
    expect(demandes[0]?.commandeId).toBe(issue.commande.commandeId);
    expect(demandes[0]?.numeroCommande).toBe(issue.commande.numero);
  });

  it("laisse la commande EN_ATTENTE_PAIEMENT avec ses reservations sur une panne du prestataire", async () => {
    const { varianteId } = await creerVarianteEnStock(client);
    const { double } = fournisseurDouble({ creationEnPanne: true });

    const issue = await passerCommandeEtDemarrerPaiement({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
      fournisseur: double,
    });

    expect(issue.paiement).toEqual({ statut: "PANNE" });

    /*
     * LE COEUR DU CRITERE 4, et la cible de la mutation du critere 9 : si la
     * creation de session entrait dans la transaction de `passerCommande`, la
     * panne du prestataire annulerait TOUT par rollback, et ces trois
     * assertions echoueraient, la commande ayant disparu.
     */
    const { rows: commandes } = await client.query<{
      id: string;
      statut: string;
    }>("SELECT id, statut FROM commande");

    expect(commandes).toEqual([
      { id: issue.commande.commandeId, statut: "EN_ATTENTE_PAIEMENT" },
    ]);

    const { rows: reservations } = await client.query<{ commande_id: string }>(
      "SELECT commande_id FROM reservation",
    );

    expect(reservations).toEqual([{ commande_id: issue.commande.commandeId }]);

    // Aucun identifiant de session n'est rattache, cas d'erreur du parcours 1.
    const { rows: paiements } = await client.query("SELECT id FROM paiement");

    expect(paiements).toEqual([]);
  });
});

describe("demarrerPaiement, une seule session ouverte par commande", () => {
  it("expire la session precedente avant d'en creer une nouvelle", async () => {
    const commandeId = await commanderUnePiece();
    const { double, demandes, expirations } = fournisseurDouble();

    await demarrerPaiement({ commandeId, fournisseur: double });
    const issue = await demarrerPaiement({ commandeId, fournisseur: double });

    expect(issue).toEqual({
      statut: "REDIRECTION",
      url: "https://paiement.example.invalid/2",
    });

    // La PREMIERE session, nommee par son identifiant, a ete expiree avant la
    // creation de la seconde. ADR-032, prevention.
    expect(expirations).toEqual([`cs_test_1_${commandeId.slice(0, 8)}`]);

    // La clef d'idempotence porte la commande ET la tentative, ADR-032 : deux
    // creations pour la meme commande portent deux clefs distinctes, sans quoi
    // Stripe rendrait une erreur, les parametres differant.
    const cles = demandes.map((demande) => demande.cleIdempotence);

    expect(cles).toHaveLength(2);
    expect(cles[0]).not.toBe(cles[1]);

    for (const cle of cles) {
      expect(cle).toContain(commandeId);
    }

    // Les DEUX tentatives restent en base, decision B : la trace n'est jamais
    // ecrasee.
    const { rows: paiements } = await client.query<{
      identifiant_fournisseur: string;
    }>("SELECT identifiant_fournisseur FROM paiement ORDER BY cree_a");
    const identifiants = paiements.map(
      (ligne) => ligne.identifiant_fournisseur,
    );

    expect(identifiants).toEqual([
      `cs_test_1_${commandeId.slice(0, 8)}`,
      `cs_test_2_${commandeId.slice(0, 8)}`,
    ]);
  });

  it("tolere une session precedente deja fermee, qui n'est pas une panne", async () => {
    const commandeId = await commanderUnePiece();
    const premiere = fournisseurDouble();

    await demarrerPaiement({ commandeId, fournisseur: premiere.double });

    // La session precedente est deja payee ou expiree chez le prestataire :
    // ADR-032, « son echec n'est pas une panne », la creation continue.
    const seconde = fournisseurDouble({ issueExpiration: "DEJA_FERMEE" });
    const issue = await demarrerPaiement({
      commandeId,
      fournisseur: seconde.double,
    });

    expect(issue.statut).toBe("REDIRECTION");
    expect(seconde.demandes).toHaveLength(1);
  });

  it("n'appelle pas la creation quand l'expiration est en panne", async () => {
    const commandeId = await commanderUnePiece();
    const premiere = fournisseurDouble();

    await demarrerPaiement({ commandeId, fournisseur: premiere.double });

    /*
     * PANNE RESEAU sur l'expiration : impossible de savoir si la premiere
     * session est encore payable. Creer quand meme ouvrirait exactement le
     * double encaissement qu'ADR-032 previent ; le service s'arrete.
     */
    const seconde = fournisseurDouble({ expirationEnPanne: true });
    const issue = await demarrerPaiement({
      commandeId,
      fournisseur: seconde.double,
    });

    expect(issue).toEqual({ statut: "PANNE" });
    expect(seconde.demandes).toEqual([]);

    // La seule tentative en base reste la premiere.
    const { rows: paiements } = await client.query("SELECT id FROM paiement");

    expect(paiements).toHaveLength(1);
  });
});

describe("demarrerPaiement, refus sans appel au prestataire", () => {
  it("refuse une reservation expiree, sans appel au prestataire", async () => {
    const commandeId = await commanderUnePiece();

    // La tache de liberation peut avoir rendu la piece au catalogue : creer
    // une session permettrait de payer une piece deja revendue, ADR-032.
    await client.query(
      "UPDATE reservation SET expire_a = now() - interval '1 minute' WHERE commande_id = $1",
      [commandeId],
    );

    const { double, demandes, expirations } = fournisseurDouble();
    const issue = await demarrerPaiement({ commandeId, fournisseur: double });

    expect(issue).toEqual({ statut: "RESERVATION_EXPIREE" });
    expect(demandes).toEqual([]);
    expect(expirations).toEqual([]);
  });

  it("refuse une commande deja encaissee, sans appel au prestataire", async () => {
    const commandeId = await commanderUnePiece();

    await client.query(
      `INSERT INTO paiement (id, commande_id, statut, montant_centimes, cree_a, confirme_a)
       VALUES ($1, $2, 'REUSSI', $3, now(), now())`,
      [randomUUID(), commandeId, TOTAL_ATTENDU_CENTIMES],
    );

    const { double, demandes } = fournisseurDouble();
    const issue = await demarrerPaiement({ commandeId, fournisseur: double });

    expect(issue).toEqual({ statut: "DEJA_PAYEE" });
    expect(demandes).toEqual([]);
  });

  it("refuse une commande inconnue, sans appel au prestataire", async () => {
    const { double, demandes } = fournisseurDouble();

    const issue = await demarrerPaiement({
      commandeId: randomUUID(),
      fournisseur: double,
    });

    expect(issue).toEqual({ statut: "INTROUVABLE" });
    expect(demandes).toEqual([]);
  });
});

/**
 * LES QUATRE DEFAUTS RELEVES PAR `ls-critical-reviewer` LE 26 AOUT 2026.
 *
 * Chacun laissait deux sessions payables coexister ou faisait payer une piece
 * repartie au catalogue. Ils sont ici pour que la correction ne se defasse pas.
 */
describe("demarrerPaiement, les quatre defauts de la revue critique", () => {
  it("refuse un panier dont UNE SEULE piece est encore reservee", async () => {
    // Deux pieces, deux reservations. La garde doit etre universelle : « au
    // moins une reservation active » ferait payer la piece deja liberee.
    const premiere = await creerVarianteEnStock(client);
    const seconde = await creerVarianteEnStock(client);

    const commande = await passerCommande({
      lignesCookie: [
        { varianteId: premiere.varianteId, quantite: 1 },
        { varianteId: seconde.varianteId, quantite: 1 },
      ],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    // La tache de liberation a traite UNE des deux lignes, pas l'autre.
    await client.query(
      "DELETE FROM reservation WHERE commande_id = $1 AND variante_id = $2",
      [commande.commandeId, premiere.varianteId],
    );

    const { double, demandes, expirations } = fournisseurDouble();
    const issue = await demarrerPaiement({
      commandeId: commande.commandeId,
      fournisseur: double,
    });

    expect(issue).toEqual({ statut: "RESERVATION_EXPIREE" });
    expect(demandes).toEqual([]);
    expect(expirations).toEqual([]);

    // Aucune tentative n'est laissee derriere le refus.
    const { rows: paiements } = await client.query("SELECT id FROM paiement");

    expect(paiements).toEqual([]);
  });

  it("prolonge TOUTES les lignes d'un panier multi-articles", async () => {
    const premiere = await creerVarianteEnStock(client);
    const seconde = await creerVarianteEnStock(client);

    const commande = await passerCommande({
      lignesCookie: [
        { varianteId: premiere.varianteId, quantite: 1 },
        { varianteId: seconde.varianteId, quantite: 1 },
      ],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const { double, demandes } = fournisseurDouble();
    await demarrerPaiement({
      commandeId: commande.commandeId,
      fournisseur: double,
    });

    const expireA = demandes[0]?.expireA.getTime() ?? 0;

    const { rows: reservations } = await client.query<{ expire_a: Date }>(
      "SELECT expire_a FROM reservation WHERE commande_id = $1",
      [commande.commandeId],
    );

    // LES DEUX portent l'instant de la session, pas seulement la premiere.
    expect(reservations).toHaveLength(2);
    expect(reservations.map((ligne) => ligne.expire_a.getTime())).toEqual([
      expireA,
      expireA,
    ]);
  });

  it("serialise deux demarrages concurrents : une seule session creee", async () => {
    const commandeId = await commanderUnePiece();

    /*
     * DEUX ONGLETS, exactement le scenario de la revue : sans verrou de ligne
     * sur la commande, les deux lisent « aucune session precedente » avant que
     * l'un n'ait ecrit la sienne, et deux sessions payables coexistent, aucune
     * n'ayant expire l'autre.
     *
     * LA LATENCE OUVRE LA FENETRE, et sans elle ce test ne prouve rien : un
     * double instantane ne laisse jamais les deux appels s'entrelacer.
     */
    const { double, demandes, expirations } = fournisseurDouble({
      latenceMs: 60,
    });

    const [premier, second] = await Promise.all([
      demarrerPaiement({ commandeId, fournisseur: double }),
      demarrerPaiement({ commandeId, fournisseur: double }),
    ]);

    expect(premier.statut).toBe("REDIRECTION");
    expect(second.statut).toBe("REDIRECTION");

    /*
     * DEUX SESSIONS SONT CREEES, ET C'EST CORRECT : deux clics produisent deux
     * paiements possibles. Ce que le verrou garantit est que la SECONDE a
     * EXPIRE la premiere, donc qu'une seule reste payable. C'est la propriete
     * d'ADR-032, et compter les sessions ne la mesurerait pas.
     *
     * L'ASSERTION PORTE L'IDENTITE DE LA SESSION EXPIREE, pas un compte : sans
     * verrou, `expirations` est VIDE, les deux appels n'ayant vu aucune session
     * precedente. Avec verrou, la premiere creee est nommement expiree.
     */
    expect(demandes).toHaveLength(2);
    expect(expirations).toEqual([`cs_test_1_${commandeId.slice(0, 8)}`]);
  });

  it("laisse la tentative tracee quand la creation reussit, jamais une session orpheline", async () => {
    const commandeId = await commanderUnePiece();
    const { double } = fournisseurDouble();

    await demarrerPaiement({ commandeId, fournisseur: double });

    /*
     * TOUTE SESSION CREEE EST TRACEE EN BASE, et c'est ce qui rend la prevention
     * d'ADR-032 atteignable au reessai. Avant correction, la tentative n'etait
     * ecrite qu'APRES l'appel reseau : une ecriture perdue laissait la session
     * ORPHELINE, payable trente minutes et inconnue de la base, donc jamais
     * expiree. La tentative est desormais reservee AVANT l'appel, et le
     * rattachement ne fait que la completer.
     */
    const { rows } = await client.query<{
      id: string;
      identifiant_fournisseur: string | null;
    }>(
      "SELECT id, identifiant_fournisseur FROM paiement WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.identifiant_fournisseur).toBe(
      `cs_test_1_${commandeId.slice(0, 8)}`,
    );
  });

  it("retire la tentative reservee quand la creation echoue", async () => {
    const commandeId = await commanderUnePiece();
    const { double } = fournisseurDouble({ creationEnPanne: true });

    const issue = await demarrerPaiement({ commandeId, fournisseur: double });

    expect(issue).toEqual({ statut: "PANNE" });

    /*
     * LE CAS D'ERREUR DU PARCOURS 1 EXIGE QU'AUCUN IDENTIFIANT NE SOIT
     * RATTACHE, et une tentative qui n'a jamais atteint le prestataire ne dit
     * rien au support : la reserver avant l'appel ne doit pas laisser de trace
     * derriere un echec.
     */
    const { rows } = await client.query(
      "SELECT id FROM paiement WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows).toEqual([]);
  });
});
