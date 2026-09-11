/**
 * STATISTIQUES DE L'ACTIVITÉ, LS-64. `STATISTIQUES.md` fait foi.
 *
 * CE QUE CETTE SUITE PROUVE AVANT TOUT : le fuseau. Une vente conclue le
 * 3 juillet à 00 h 30 heure française est stockée au 2 juillet 22 h 30 UTC. Un
 * regroupement fait en UTC la rangerait au 2 juillet, et le total du jour serait
 * faux pour l'exploitante comme pour l'e-reporting de LS-35.
 *
 * LES DATES SONT ÉCRITES EN UTC EXPLICITE dans les fixtures, jamais construites
 * par `new Date("2026-07-03 00:30")`, qui prendrait le fuseau du serveur : un
 * test juste sur ma machine et faux en intégration continue serait pire qu'une
 * absence de test.
 *
 * TOUT PASSE PAR LES SERVICES POUR LES COMMANDES, jamais par un `INSERT` :
 * reproduire la mécanique à la main testerait la reproduction, piège rencontré
 * le 25 août 2026. Les DATES, elles, se posent en SQL : `confirmeA` est écrit
 * par la transaction de paiement, et la déplacer est le seul moyen de fabriquer
 * une vente d'hier.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagée entre fichiers.
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
let lireStatistiques: typeof import("@/services/statistiques").lireStatistiques;
let panierMoyen: typeof import("@/services/statistiques").panierMoyen;

const ADRESSE = {
  ligne1: "1 rue de Test",
  codePostal: "75001",
  ville: "TESTVILLE",
  pays: "FR" as const,
};

const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 749,
  seuilFranchiseCentimes: 3900,
};

const PRIX_VARIANTE_CENTIMES = 2000;

/**
 * L'INSTANT DE RÉFÉRENCE DE TOUTE LA SUITE, un 3 juillet à midi heure de Paris.
 *
 * JUILLET ET NON JANVIER, ET C'EST TOUT L'OBJET : en heure d'ÉTÉ, Paris est à
 * UTC+2. Un test écrit en janvier passerait sur un décalage d'une heure et
 * laisserait le défaut d'été entier.
 */
const MAINTENANT = new Date("2026-07-03T10:00:00.000Z");

/** Le 3 juillet à 00 h 30 heure de Paris, soit le 2 juillet 22 h 30 UTC. */
const MINUIT_TRENTE_A_PARIS = new Date("2026-07-02T22:30:00.000Z");

/** Le 2 juillet à 23 h 30 heure de Paris, soit le 2 juillet 21 h 30 UTC. */
const VEILLE_A_PARIS = new Date("2026-07-02T21:30:00.000Z");

function saisieCommande(email: string) {
  return {
    nomClient: "TEST Camille Dupont",
    email,
    telephone: null,
    adresse: ADRESSE,
    mode: "DOMICILE" as const,
    pointRetrait: null,
  };
}

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
 * Passe une commande, la paie, et DÉPLACE sa date de confirmation.
 *
 * LE DÉPLACEMENT EST INDISPENSABLE ET NE SE CONTOURNE PAS. `confirmeA` est
 * écrit par la transaction de paiement, donc toujours à l'instant du test :
 * sans ce geste, toutes les ventes tomberaient aujourd'hui et aucun test de
 * frontière de période ne prouverait quoi que ce soit.
 */
async function venteWebA(
  confirmeA: Date,
  email = "client-stats@exemple.fr",
): Promise<{ commandeId: string; totalCentimes: number }> {
  const { varianteId } = await creerVarianteEnStock(client);

  await client.query("UPDATE variante SET prix_centimes = $1 WHERE id = $2", [
    PRIX_VARIANTE_CENTIMES,
    varianteId,
  ]);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: saisieCommande(email),
    configuration: CONFIGURATION,
  });

  const { rows } = await client.query<{ total_centimes: number }>(
    "SELECT total_centimes FROM commande WHERE id = $1",
    [issue.commandeId],
  );

  const evenement: EvenementPaiement = {
    identifiant: `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId: issue.commandeId,
    identifiantSession: `cs_test_${issue.commandeId.slice(0, 8)}`,
    montantCentimes: rows[0]!.total_centimes,
    montantRembourseCentimes: 0,
    charge: { source: "test" },
  };

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
  });

  await client.query(
    "UPDATE paiement SET confirme_a = $1 WHERE commande_id = $2",
    [confirmeA, issue.commandeId],
  );

  return {
    commandeId: issue.commandeId,
    totalCentimes: rows[0]!.total_centimes,
  };
}

/**
 * Écrit une vente de marché à une date donnée.
 *
 * `quantite` EST NÉGATIVE, le mouvement SORTANT du stock. C'est le signe qui
 * porte le sens, et une somme naïve rendrait un chiffre d'affaires négatif.
 */
async function venteExterneA(
  creeA: Date,
  prixUnitaireCentimes: number,
  quantite = 1,
): Promise<string> {
  const { varianteId } = await creerVarianteEnStock(client);

  await client.query(
    `INSERT INTO mouvement_stock
       (id, variante_id, type, quantite, prix_unitaire_fige_centimes, origine, cree_a)
     VALUES (gen_random_uuid(), $1, 'VENTE_EXTERNE'::"TypeMouvementStock",
             $2, $3, 'ADMIN'::"OrigineEcriture", $4)`,
    [varianteId, -quantite, prixUnitaireCentimes, creeA],
  );

  return varianteId;
}

/** Émet un avoir sur la facture d'une commande, à une date donnée. */
async function avoirA(
  commandeId: string,
  montantCentimes: number,
  emisA: Date,
): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM facture WHERE commande_id = $1",
    [commandeId],
  );

  /*
   * `instantane_legal` EST OBLIGATOIRE, LS-49 : un avoir est un document légal
   * au même titre qu'une facture, invariant 4, et il porte son propre
   * instantané pour qu'une correction du catalogue ne change pas le contenu
   * d'un document déjà émis. La contrainte l'a rappelé à ce test, qui
   * l'ignorait.
   *
   * LE CONTENU EST MINIMAL ET N'EST PAS LU PAR LES STATISTIQUES, qui ne
   * regardent que `montantCentimes` et `emisA`. Y écrire un instantané réaliste
   * ferait croire que le calcul en dépend.
   */
  await client.query(
    `INSERT INTO avoir
       (id, facture_id, numero, montant_centimes, motif, instantane_legal, emis_a)
     VALUES (gen_random_uuid(), $1, $2, $3, 'Test', $4::jsonb, $5)`,
    [
      rows[0]!.id,
      `A-TEST-${randomUUID().slice(0, 8)}`,
      montantCentimes,
      JSON.stringify({ version: "test" }),
      emisA,
    ],
  );
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.NEXT_PUBLIC_SITE_URL ??= "https://test.invalid";
  process.env.FACTURE_RAISON_SOCIALE ??= "TEST Lune et Soleil";
  process.env.FACTURE_SIRET ??= "12345678901234";
  process.env.FACTURE_ADRESSE ??= "1 rue de Test, 75001 TESTVILLE";
  process.env.FACTURE_EMAIL_CONTACT ??= "test-emetteur@example.invalid";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ lireStatistiques, panierMoyen } = await import("@/services/statistiques"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  /*
   * L'ORDRE SUIT LES CLÉS ÉTRANGÈRES, toutes en `RESTRICT` sur ce domaine. Une
   * table effacée trop tard fait échouer le nettoyage et pollue les tests
   * SUIVANTS plutôt que le test courant, ce qui rend le défaut difficile à
   * situer. `jeton_acces` manquait, et la contrainte l'a dit.
   */
  await client.query("DELETE FROM avoir");
  await client.query("DELETE FROM facture");
  await client.query("DELETE FROM jeton_acces");
  await client.query("DELETE FROM envoi_en_attente");
  await client.query("DELETE FROM journal_email");
  await client.query("DELETE FROM mouvement_stock");
  await client.query("DELETE FROM reservation");
  await client.query("DELETE FROM paiement");
  await client.query("DELETE FROM historique_statut");
  await client.query("DELETE FROM evenement_fournisseur");
  await client.query("DELETE FROM ligne_commande");
  await client.query("DELETE FROM commande");
});

describe("le fuseau, critère 2", () => {
  it("compte une vente de 00 h 30 heure française au bon jour", async () => {
    await venteWebA(MINUIT_TRENTE_A_PARIS);

    const stats = await lireStatistiques("jour", MAINTENANT);

    /*
     * LE CŒUR DE LA STORY. Cette vente est stockée au 2 juillet 22 h 30 UTC :
     * un regroupement en UTC la rangerait la veille, et le total du 3 juillet
     * serait faux. Un décalage fixe d'une heure écrit en dur passerait ce test
     * en été et le raterait en hiver.
     */
    expect(stats.commandesPayees).toBe(1);
    expect(stats.brutWebCentimes).toBeGreaterThan(0);
  });

  it("n'inclut pas une vente de la veille à 23 h 30 heure française", async () => {
    await venteWebA(VEILLE_A_PARIS);

    const stats = await lireStatistiques("jour", MAINTENANT);

    /*
     * LE SENS INVERSE, ET IL COMPTE AUTANT. Un test qui ne vérifie que
     * l'inclusion passerait sur une requête qui prend TOUT : c'est le motif
     * « valeurs qui coïncident », où un test de refus cesse d'exercer son refus.
     */
    expect(stats.commandesPayees).toBe(0);
    expect(stats.brutWebCentimes).toBe(0);
  });

  it("range les deux ventes au bon jour de la courbe", async () => {
    await venteWebA(MINUIT_TRENTE_A_PARIS);
    await venteWebA(VEILLE_A_PARIS, "autre-client@exemple.fr");

    const stats = await lireStatistiques("mois", MAINTENANT);

    const deux = stats.evolution.find((point) => point.jour === "2026-07-02");
    const trois = stats.evolution.find((point) => point.jour === "2026-07-03");

    expect(deux?.brutCentimes).toBeGreaterThan(0);
    expect(trois?.brutCentimes).toBeGreaterThan(0);
    expect(deux?.brutCentimes).toBe(trois?.brutCentimes);
  });
});

describe("ce qui compte comme une vente, critère 6", () => {
  it("ne compte ni une commande abandonnée ni un paiement échoué", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    /*
     * UNE COMMANDE SANS PAIEMENT CONFIRMÉ, l'état d'un panier abandonné au
     * tunnel. Elle existe en base, `EN_ATTENTE_PAIEMENT`, et ne doit apparaître
     * dans aucun agrégat.
     */
    await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: saisieCommande("abandon@exemple.fr"),
      configuration: CONFIGURATION,
    });

    const stats = await lireStatistiques("jour", MAINTENANT);

    expect(stats.commandesPayees).toBe(0);
    expect(stats.brutCentimes).toBe(0);
    expect(stats.bijouxVendus).toBe(0);
  });
});

describe("les remboursements, critères 3 et 4", () => {
  it("impute l'avoir à sa date d'émission, pas à celle de la vente", async () => {
    const vente = await venteWebA(new Date("2026-06-28T10:00:00.000Z"));
    await avoirA(vente.commandeId, 1000, new Date("2026-07-04T10:00:00.000Z"));

    const juin = await lireStatistiques(
      "mois",
      new Date("2026-06-30T10:00:00.000Z"),
    );
    const juillet = await lireStatistiques(
      "mois",
      new Date("2026-07-31T10:00:00.000Z"),
    );

    /*
     * LE MOIS DE LA VENTE N'EST PAS MODIFIÉ. Imputer le remboursement à la
     * vente changerait rétroactivement le net de juin, déjà consulté et, dès
     * septembre 2027, déjà transmis à l'administration. Un chiffre publié qui
     * change tout seul est pire qu'un chiffre imparfait.
     */
    expect(juin.remboursementsCentimes).toBe(0);
    expect(juin.brutWebCentimes).toBe(vente.totalCentimes);
    expect(juin.netCentimes).toBe(vente.totalCentimes);

    expect(juillet.remboursementsCentimes).toBe(1000);
  });

  it("additionne deux avoirs successifs sur la même facture", async () => {
    const vente = await venteWebA(MINUIT_TRENTE_A_PARIS);

    await avoirA(vente.commandeId, 500, MAINTENANT);
    await avoirA(vente.commandeId, 300, MAINTENANT);

    const stats = await lireStatistiques("jour", MAINTENANT);

    expect(stats.remboursementsCentimes).toBe(800);
  });

  it("laisse le net devenir négatif sans le borner, critère 5 du document", async () => {
    const vente = await venteWebA(new Date("2026-06-28T10:00:00.000Z"));
    await avoirA(vente.commandeId, 5000, MAINTENANT);

    const stats = await lireStatistiques("jour", MAINTENANT);

    /*
     * LA RÉALITÉ COMPTABLE DU MOIS, que l'affichage ne doit ni masquer ni
     * borner à zéro. Le brut du jour est nul, la vente datant de juin, et
     * l'avoir de 50 € tombe aujourd'hui.
     */
    expect(stats.brutCentimes).toBe(0);
    expect(stats.netCentimes).toBe(-5000);
  });

  it("ne diminue jamais le brut d'un remboursement, critère 3", async () => {
    const vente = await venteWebA(MINUIT_TRENTE_A_PARIS);
    await avoirA(vente.commandeId, 700, MAINTENANT);

    const stats = await lireStatistiques("jour", MAINTENANT);

    expect(stats.brutWebCentimes).toBe(vente.totalCentimes);
    expect(stats.netCentimes).toBe(vente.totalCentimes - 700);
  });
});

describe("les deux canaux, critère 7", () => {
  it("inclut les ventes externes dans le brut de la période", async () => {
    await venteWebA(MINUIT_TRENTE_A_PARIS);
    await venteExterneA(MAINTENANT, 3500);

    const stats = await lireStatistiques("jour", MAINTENANT);

    expect(stats.brutExterneCentimes).toBe(3500);
    expect(stats.brutCentimes).toBe(
      stats.brutWebCentimes + stats.brutExterneCentimes,
    );
  });

  it("compte les bijoux des deux canaux", async () => {
    await venteWebA(MINUIT_TRENTE_A_PARIS);
    await venteExterneA(MAINTENANT, 3500, 2);

    const stats = await lireStatistiques("jour", MAINTENANT);

    expect(stats.bijouxVendus).toBe(3);
  });

  it("ne compte pas une vente de marché dans le panier moyen web", async () => {
    const vente = await venteWebA(MINUIT_TRENTE_A_PARIS);
    await venteExterneA(MAINTENANT, 9900);

    const stats = await lireStatistiques("jour", MAINTENANT);

    /*
     * UNE VENTE DE MARCHÉ N'EST PAS UNE COMMANDE. L'inclure produirait un
     * panier moyen sans signification, et l'écart est ici de 99 € sur une seule
     * commande : le test le rendrait visible.
     */
    expect(stats.panierMoyenWebCentimes).toBe(vente.totalCentimes);
  });
});

describe("les prix figés, critère 5", () => {
  it("ne change aucun montant historique quand le catalogue change", async () => {
    const vente = await venteWebA(MINUIT_TRENTE_A_PARIS);

    const avant = await lireStatistiques("jour", MAINTENANT);

    /*
     * LE PRIX DU CATALOGUE TRIPLE. Règle S13 : aucun calcul ne lit
     * `Variante.prixCentimes`, sans quoi le chiffre d'affaires changerait
     * chaque fois que l'exploitante révise ses prix.
     */
    await client.query("UPDATE variante SET prix_centimes = prix_centimes * 3");

    const apres = await lireStatistiques("jour", MAINTENANT);

    expect(apres.brutWebCentimes).toBe(avant.brutWebCentimes);
    expect(apres.brutWebCentimes).toBe(vente.totalCentimes);
  });
});

describe("les palmarès et l'état vide, critère 10", () => {
  it("annonce une période vide plutôt que des zéros muets", async () => {
    const stats = await lireStatistiques("jour", MAINTENANT);

    expect(stats.periodeVide).toBe(true);
    expect(stats.panierMoyenWebCentimes).toBeNull();
  });

  it("ne présente pas comme vide une période qui n'a que des remboursements", async () => {
    const vente = await venteWebA(new Date("2026-06-28T10:00:00.000Z"));
    await avoirA(vente.commandeId, 1000, MAINTENANT);

    const stats = await lireStatistiques("jour", MAINTENANT);

    /*
     * UN MOIS SANS VENTE MAIS AVEC UN REMBOURSEMENT N'EST PAS VIDE : il porte
     * un net négatif, qui est précisément ce que l'exploitante doit voir.
     */
    expect(stats.periodeVide).toBe(false);
    expect(stats.netCentimes).toBe(-1000);
  });

  it("classe les variantes par quantité vendue, deux canaux confondus", async () => {
    await venteWebA(MINUIT_TRENTE_A_PARIS);
    const varianteMarche = await venteExterneA(MAINTENANT, 3500, 4);

    const stats = await lireStatistiques("jour", MAINTENANT);

    expect(stats.meilleuresVentes[0]?.varianteId).toBe(varianteMarche);
    expect(stats.meilleuresVentes[0]?.quantite).toBe(4);
  });

  it("ne présente pas comme invendue une variante écoulée sur un marché", async () => {
    const varianteMarche = await venteExterneA(MAINTENANT, 3500);

    const stats = await lireStatistiques("jour", MAINTENANT);

    const invendues = stats.variantesInvendues.map(
      (variante) => variante.varianteId,
    );

    /*
     * NE REGARDER QUE LES LIGNES DE COMMANDE présenterait comme invendue une
     * pièce écoulée sur un marché, ce qui est le cas le plus courant au
     * démarrage de cette boutique.
     */
    expect(invendues).not.toContain(varianteMarche);
  });
});

describe("le panier moyen, invariant 1", () => {
  it("rend null et non zéro quand aucune commande n'est payée", () => {
    expect(panierMoyen(0, 0)).toBeNull();
    expect(panierMoyen(5000, 0)).toBeNull();
  });

  it("divise en centimes entiers, sans flottant", () => {
    /*
     * 10 000 centimes pour 3 commandes font 3333,33… : le quotient est TRONQUÉ
     * à 3333 centimes. Un flottant réintroduirait le décimal que l'invariant 1
     * refuse, sur une valeur qui finit dans un tableau de bord.
     */
    expect(panierMoyen(10_000, 3)).toBe(3333);
    expect(Number.isInteger(panierMoyen(10_000, 3))).toBe(true);
  });
});
