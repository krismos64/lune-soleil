/**
 * Promotion de catalogue, ADR-051, LS-319.
 *
 * ÉCRIT AVANT LE SERVICE, exigence du plan directeur en zone critique : ce
 * fichier dit ce que la promotion doit garantir sur le prix encaissé.
 *
 * VERIFIER UNE IDENTITÉ ET NON UNE CARDINALITÉ : chaque cas nomme le prix
 * attendu, au centime, et la variante qui le porte.
 *
 * SUFFIXE `.sequential` : la promotion active est un état GLOBAL de la base
 * (une seule à la fois), chaque cas la remet à zéro.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let promotion: typeof import("@/services/promotion");
let lib: typeof import("@/lib/promotion");
let commande: typeof import("@/services/commande");
let variante: typeof import("@/services/variante");

const SAISIE_DOMICILE = {
  nomClient: "TEST Camille Dupont",
  email: "test@example.invalid",
  telephone: "0600000000",
  adresse: {
    ligne1: "1 rue de Test",
    codePostal: "75001",
    ville: "TESTVILLE",
    pays: "FR" as const,
  },
  mode: "DOMICILE" as const,
  pointRetrait: null,
};

const SAISIE_RELAIS = {
  ...SAISIE_DOMICILE,
  mode: "POINT_RELAIS" as const,
  pointRetrait: {
    identifiant: "TEST-RELAIS-01",
    nom: "TEST Relais",
    ligne1: "1 rue du Relais",
    codePostal: "75001",
    ville: "TESTVILLE",
  },
};

/** Seuil de franchise à 39 €, relais à 4,10 € : la configuration réelle. */
const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 749,
  seuilFranchiseCentimes: 3900,
};

/** Une variante en vente depuis `jours` jours, au prix demandé. */
async function varianteAgee(
  jours: number,
  prixCentimes = 4900,
  quantitePhysique = 1,
): Promise<string> {
  const { varianteId } = await creerVarianteEnStock(client, {
    quantitePhysique,
  });
  await client.query(
    `UPDATE variante SET cree_a = now() - make_interval(days => $2),
                         prix_centimes = $3
      WHERE id = $1`,
    [varianteId, jours, prixCentimes],
  );
  return varianteId;
}

async function lignesDeLaCommande(commandeId: string) {
  const { rows } = await client.query(
    `SELECT variante_id, prix_fige_centimes, prix_reference_fige_centimes,
            promotion_id
       FROM ligne_commande WHERE commande_id = $1`,
    [commandeId],
  );
  return rows as {
    variante_id: string;
    prix_fige_centimes: number;
    prix_reference_fige_centimes: number | null;
    promotion_id: string | null;
  }[];
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;
  client = new Client({ connectionString: url });
  await client.connect();
  promotion = await import("@/services/promotion");
  lib = await import("@/lib/promotion");
  commande = await import("@/services/commande");
  variante = await import("@/services/variante");
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE reservation, facture, paiement, evenement_fournisseur, ligne_commande, commande, historique_prix_variante, promotion, variante, produit, categorie, compteur_numero CASCADE",
  );
});

describe("prix de vente, invariant 1", () => {
  it("réduit de 30 % au centime inférieur, en entiers", () => {
    expect(lib.prixDeVente(1200, 30)).toBe(840);
    expect(lib.prixDeVente(2999, 30)).toBe(2099);
    expect(lib.prixDeVente(4900, 30)).toBe(3430);
    expect(lib.prixDeVente(1, 30)).toBe(0);
    expect(lib.prixDeVente(0, 30)).toBe(0);
  });

  it("la promotion Black Week vaut 30 %, écrite dans le code", () => {
    expect(lib.PROMOTIONS.BLACK_WEEK.taux).toBe(30);
  });
});

describe("activation et désactivation", () => {
  it("active une promotion, une seule à la fois, et la désactive", async () => {
    const active = await promotion.activerPromotion({
      code: "BLACK_WEEK",
      acteurId: null,
    });
    expect(active.taux).toBe(30);

    await expect(
      promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null }),
    ).rejects.toMatchObject({ name: "PromotionDejaActiveError" });

    expect(await promotion.desactiverPromotion({ acteurId: null })).toBe(true);
    // Désactiver sans promotion active ne change rien.
    expect(await promotion.desactiverPromotion({ acteurId: null })).toBe(false);

    const { rows } = await client.query(
      "SELECT active, desactivee_a IS NOT NULL AS desactivee FROM promotion",
    );
    expect(rows).toEqual([{ active: false, desactivee: true }]);
  });

  it("refuse un code que le code n'écrit pas", async () => {
    await expect(
      promotion.activerPromotion({ code: "SOLDES", acteurId: null }),
    ).rejects.toMatchObject({ name: "EntreeInvalideError" });
  });

  it("réactive dans les 24 heures, arbitrage 2 d'ADR-051", async () => {
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    await promotion.desactiverPromotion({ acteurId: null });
    await client.query(
      "UPDATE promotion SET active_depuis = now() - interval '3 days', desactivee_a = now() - interval '23 hours'",
    );
    await expect(
      promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null }),
    ).resolves.toMatchObject({ code: "BLACK_WEEK" });
  });

  it("refuse au-delà de 24 heures, pendant trente jours", async () => {
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    await promotion.desactiverPromotion({ acteurId: null });
    await client.query(
      "UPDATE promotion SET active_depuis = now() - interval '10 days', desactivee_a = now() - interval '25 hours'",
    );
    await expect(
      promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null }),
    ).rejects.toMatchObject({ name: "PromotionEnCarenceError" });

    await client.query(
      "UPDATE promotion SET active_depuis = now() - interval '40 days', desactivee_a = now() - interval '31 days'",
    );
    await expect(
      promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null }),
    ).resolves.toMatchObject({ code: "BLACK_WEEK" });
  });
});

describe("éligibilité par variante, arbitrage 1 d'ADR-051", () => {
  it("une pièce de trente jours au moins, au prix inchangé, est éligible", async () => {
    const ancienne = await varianteAgee(40);
    const recente = await varianteAgee(10);
    const modifiee = await varianteAgee(60);
    await client.query(
      `INSERT INTO historique_prix_variante
         (id, variante_id, ancien_prix_centimes, nouveau_prix_centimes, modifie_a)
       VALUES (gen_random_uuid(), $1, 5900, 4900, now() - interval '5 days')`,
      [modifiee],
    );
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });

    const enVigueur = await promotion.lirePromotionEnVigueur();
    expect(enVigueur).not.toBeNull();
    expect(enVigueur!.variantesEligibles.has(ancienne)).toBe(true);
    expect(enVigueur!.variantesEligibles.has(recente)).toBe(false);
    expect(enVigueur!.variantesEligibles.has(modifiee)).toBe(false);
    // Une pièce exclue suffit : l'annonce ne dit plus « toute la boutique ».
    expect(enVigueur!.toutLeCatalogue).toBe(false);
  });

  it("toute la boutique quand chaque pièce en vente est éligible", async () => {
    await varianteAgee(40);
    await varianteAgee(45);
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    expect((await promotion.lirePromotionEnVigueur())!.toutLeCatalogue).toBe(
      true,
    );
  });

  it("sans promotion active, rien n'est en vigueur", async () => {
    await varianteAgee(40);
    expect(await promotion.lirePromotionEnVigueur()).toBeNull();
  });
});

describe("le prix figé sur la commande", () => {
  it("fige le prix réduit, le prix de référence et la promotion", async () => {
    const eligible = await varianteAgee(40, 4900);
    const exclue = await varianteAgee(5, 1200);
    const active = await promotion.activerPromotion({
      code: "BLACK_WEEK",
      acteurId: null,
    });

    const issue = await commande.passerCommande({
      lignesCookie: [
        { varianteId: eligible, quantite: 1 },
        { varianteId: exclue, quantite: 1 },
      ],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const lignes = await lignesDeLaCommande(issue.commandeId);
    const parVariante = new Map(lignes.map((l) => [l.variante_id, l]));
    expect(parVariante.get(eligible)).toEqual({
      variante_id: eligible,
      prix_fige_centimes: 3430,
      prix_reference_fige_centimes: 4900,
      promotion_id: active.id,
    });
    expect(parVariante.get(exclue)).toEqual({
      variante_id: exclue,
      prix_fige_centimes: 1200,
      prix_reference_fige_centimes: null,
      promotion_id: null,
    });

    const { rows } = await client.query(
      "SELECT sous_total_centimes, frais_port_centimes, total_centimes FROM commande WHERE id = $1",
      [issue.commandeId],
    );
    // 3430 + 1200, port domicile entier : le port n'est jamais réduit.
    expect(rows[0]).toEqual({
      sous_total_centimes: 4630,
      frais_port_centimes: 749,
      total_centimes: 5379,
    });
  });

  /*
   * LE PANIER ET LA COMMANDE CALCULENT LE MÊME MONTANT : le sous-total
   * affiché au récapitulatif vient de `revalider`, et `passerCommande` le
   * confronte au sous-total figé. Un écart d'un centime refuserait toute
   * commande sous promotion, `SousTotalChangeError`.
   */
  it("le total du panier sous promotion est celui que la commande fige", async () => {
    const eligible = await varianteAgee(40, 2999);
    const exclue = await varianteAgee(5, 1200);
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    const { revalider } = await import("@/services/panier");
    const lignesCookie = [
      { varianteId: eligible, quantite: 1 },
      { varianteId: exclue, quantite: 1 },
    ];
    const panier = await revalider(lignesCookie);
    // 2999 réduit au centime inférieur, 2099, plus 1200 non réduit.
    expect(panier.totalArticlesCentimes).toBe(3299);
    expect(
      panier.lignes.map((l) => [
        l.prixUnitaireCentimes,
        l.prixReferenceCentimes,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [2099, 2999],
        [1200, null],
      ]),
    );
    await expect(
      commande.passerCommande({
        lignesCookie,
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
        sousTotalPresenteCentimes: panier.totalArticlesCentimes,
      }),
    ).resolves.toMatchObject({ totalCentimes: 3299 + 749 });
  });

  it("la franchise se juge sur le montant réduit", async () => {
    // 4900 passe le seuil de 39 € ; réduit à 3430, il ne le passe plus.
    const eligible = await varianteAgee(40, 4900);
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    const issue = await commande.passerCommande({
      lignesCookie: [{ varianteId: eligible, quantite: 1 }],
      saisie: SAISIE_RELAIS,
      configuration: CONFIGURATION,
    });
    const { rows } = await client.query(
      "SELECT sous_total_centimes, frais_port_centimes FROM commande WHERE id = $1",
      [issue.commandeId],
    );
    expect(rows[0]).toEqual({
      sous_total_centimes: 3430,
      frais_port_centimes: 410,
    });
  });

  it("sans promotion, ni référence ni promotion sur la ligne", async () => {
    const piece = await varianteAgee(40, 4900);
    const issue = await commande.passerCommande({
      lignesCookie: [{ varianteId: piece, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });
    expect(await lignesDeLaCommande(issue.commandeId)).toEqual([
      {
        variante_id: piece,
        prix_fige_centimes: 4900,
        prix_reference_fige_centimes: null,
        promotion_id: null,
      },
    ]);
  });

  it("une désactivation après le récapitulatif fait relire le montant", async () => {
    const eligible = await varianteAgee(40, 4900);
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    // Le client a lu 3430 au récapitulatif ; la promotion est coupée avant
    // son clic.
    await promotion.desactiverPromotion({ acteurId: null });
    await expect(
      commande.passerCommande({
        lignesCookie: [{ varianteId: eligible, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
        sousTotalPresenteCentimes: 3430,
      }),
    ).rejects.toMatchObject({ name: "SousTotalChangeError" });
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM commande",
    );
    expect(rows[0].n).toBe(0);
  });

  /*
   * LA BASCULE ENTRE LA COMMANDE ET LE PAIEMENT, critère 7 de LS-319 : une
   * commande passée sous promotion se paie à son prix figé, même si la
   * promotion est coupée avant le démarrage du paiement. Le prestataire
   * reçoit le prix de la commande, jamais le prix catalogue du moment.
   *
   * Remplace un premier test qui désactivait la promotion APRÈS que les
   * lignes étaient figées, par `apresReservation` : une implémentation qui
   * relisait la promotion ligne par ligne le passait aussi. Il ne prouvait
   * rien.
   */
  it("une promotion coupée avant le paiement n'en change pas le montant", async () => {
    const eligible = await varianteAgee(40, 4900);
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    const issue = await commande.passerCommande({
      lignesCookie: [{ varianteId: eligible, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });
    await promotion.desactiverPromotion({ acteurId: null });

    const demandes: { lignes: readonly { prixUnitaireCentimes: number }[] }[] =
      [];
    const { demarrerPaiement } = await import("@/services/paiement");
    await demarrerPaiement({
      commandeId: issue.commandeId,
      fournisseur: {
        async creerSession(demande) {
          demandes.push(demande);
          return {
            identifiant: `cs_test_${issue.commandeId.slice(0, 8)}`,
            url: "https://paiement.example.invalid/1",
          };
        },
        async expirerSession() {
          return "EXPIREE";
        },
        async rembourser(): Promise<never> {
          throw new Error("rembourser n'a pas sa place ici");
        },
        async lireSession(): Promise<never> {
          throw new Error("lireSession n'a pas sa place ici");
        },
      },
    });

    // La pièce à 34,30 €, puis le port domicile entier à 7,49 €.
    expect(demandes[0]?.lignes.map((l) => l.prixUnitaireCentimes)).toEqual([
      3430, 749,
    ]);
  });
});

describe("la facture, arbitrage 3 d'ADR-051", () => {
  /*
   * PAR LE CHEMIN RÉEL, le webhook signé : la facture s'émet dans sa
   * transaction, depuis les lignes qu'il sélectionne. Appeler
   * `emettreFacture` directement laisserait passer un oubli de sélection.
   */
  it("une ligne réduite porte sa réduction dans l'instantané, version 3", async () => {
    const eligible = await varianteAgee(40, 4900);
    const exclue = await varianteAgee(5, 1200);
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    const issue = await commande.passerCommande({
      lignesCookie: [
        { varianteId: eligible, quantite: 1 },
        { varianteId: exclue, quantite: 1 },
      ],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const { traiterEvenementPaiement } =
      await import("@/services/webhook-paiement");
    const evenement = {
      identifiant: `evt_${issue.commandeId}`,
      type: "PAIEMENT_REUSSI" as const,
      commandeId: issue.commandeId,
      identifiantSession: `cs_${issue.commandeId.slice(0, 8)}`,
      montantCentimes: issue.totalCentimes,
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

    const { rows } = await client.query(
      "SELECT instantane_legal FROM facture WHERE commande_id = $1",
      [issue.commandeId],
    );
    const instantane = rows[0]?.instantane_legal as {
      version: number;
      lignes: { prixUnitaireCentimes: number; reduction?: unknown }[];
    };
    expect(instantane.version).toBe(3);
    expect(
      instantane.lignes.map((l) => [l.prixUnitaireCentimes, l.reduction]),
    ).toEqual(
      expect.arrayContaining([
        [
          3430,
          { prixReferenceCentimes: 4900, libelle: "Black Week", taux: 30 },
        ],
        [1200, null],
      ]),
    );
  });
});

describe("prix gelés sous promotion, historique des prix", () => {
  it("un changement de prix hors promotion écrit l'historique", async () => {
    const piece = await varianteAgee(40, 4900);
    const { rows: avant } = await client.query(
      "SELECT reference, libelle FROM variante WHERE id = $1",
      [piece],
    );
    await variante.modifierVariante({
      id: piece,
      reference: avant[0].reference,
      libelle: avant[0].libelle,
      prixEuros: "39,00",
      dimensions: null,
      quantitePhysique: 1,
    });
    const { rows } = await client.query(
      "SELECT ancien_prix_centimes, nouveau_prix_centimes FROM historique_prix_variante WHERE variante_id = $1",
      [piece],
    );
    expect(rows).toEqual([
      { ancien_prix_centimes: 4900, nouveau_prix_centimes: 3900 },
    ]);
  });

  it("un changement de prix sous promotion est refusé, rien ne change", async () => {
    const piece = await varianteAgee(40, 4900);
    const { rows: avant } = await client.query(
      "SELECT reference, libelle FROM variante WHERE id = $1",
      [piece],
    );
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    await expect(
      variante.modifierVariante({
        id: piece,
        reference: avant[0].reference,
        libelle: avant[0].libelle,
        prixEuros: "39,00",
        dimensions: null,
        quantitePhysique: 1,
      }),
    ).rejects.toMatchObject({ name: "PrixGelesSousPromotionError" });
    const { rows } = await client.query(
      "SELECT prix_centimes FROM variante WHERE id = $1",
      [piece],
    );
    expect(rows[0].prix_centimes).toBe(4900);
  });

  it("un prix en masse sous promotion est refusé", async () => {
    const { varianteId, produitId } = await creerVarianteEnStock(client);
    await promotion.activerPromotion({ code: "BLACK_WEEK", acteurId: null });
    await expect(
      variante.appliquerPrixProduits({
        produitIds: [produitId],
        varianteIds: [varianteId],
        prixEuros: "20",
      }),
    ).rejects.toMatchObject({ name: "PrixGelesSousPromotionError" });
  });

  it("un prix en masse hors promotion écrit l'historique de chaque variante", async () => {
    const { varianteId, produitId } = await creerVarianteEnStock(client);
    await variante.appliquerPrixProduits({
      produitIds: [produitId],
      varianteIds: [varianteId],
      prixEuros: "20",
    });
    const { rows } = await client.query(
      "SELECT ancien_prix_centimes, nouveau_prix_centimes FROM historique_prix_variante WHERE variante_id = $1",
      [varianteId],
    );
    expect(rows).toEqual([
      { ancien_prix_centimes: 4900, nouveau_prix_centimes: 2000 },
    ]);
  });
});
