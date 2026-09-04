/**
 * COMPTAGES DU TABLEAU DE BORD ET DES PASTILLES, LS-181.
 *
 * ECRIT AVANT L'ECRAN. Ces nombres seront lus d'un coup d'oeil, sans que rien
 * ne les recoupe : une pastille fausse ne se voit pas, contrairement a une
 * liste fausse dont l'exploitante constate qu'il manque une ligne. Un comptage
 * qui ment est donc un defaut silencieux, et c'est ce qui justifie d'ecrire ces
 * tests avant le rendu.
 *
 * LE DEFAUT QUE CE FICHIER VISE EN PREMIER : LA MULTIPLICATION CROISEE. Huit
 * agregats dans une requete se comptent faux si une jointure multiplie les
 * lignes, chaque comptage etant alors multiplie par le cardinal des autres.
 * Le piege ne se voit JAMAIS sur un jeu de donnees ou chaque table porte une
 * seule ligne : il faut plusieurs lignes dans au moins deux tables pour que
 * l'erreur apparaisse, et c'est exactement ce que monte le premier test.
 *
 * Motif deja rencontre sur ce depot sous « compter ne verifie pas le contenu »
 * et « numerateur et denominateur apparies ».
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import type { EvenementPaiement } from "@/integrations/stripe/evenements";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let lireComptages: typeof import("@/services/tableau-bord").lireComptages;
let SEUIL_STOCK_FAIBLE: typeof import("@/services/tableau-bord").SEUIL_STOCK_FAIBLE;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;

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

async function commanderUnePiece(): Promise<{
  commandeId: string;
  varianteId: string;
}> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  return { commandeId: issue.commandeId, varianteId };
}

/** Confirme par le chemin reel, LS-119 : la commande passe en CONFIRMEE. */
async function confirmer(commandeId: string): Promise<void> {
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
}

/** Force un statut de commande, pour monter un etat sans jouer le parcours. */
async function forcerStatut(commandeId: string, statut: string): Promise<void> {
  await client.query("UPDATE commande SET statut = $2 WHERE id = $1", [
    commandeId,
    statut,
  ]);
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ lireComptages, SEUIL_STOCK_FAIBLE } =
    await import("@/services/tableau-bord"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE alerte_critique, historique_statut, mouvement_stock,
     evenement_fournisseur, paiement, reservation, ligne_commande, commande,
     variante, produit, categorie, compteur_numero, message CASCADE`,
  );
});

describe("lireComptages, independance des agregats", () => {
  /*
   * LE TEST QUI JUSTIFIE LE FICHIER. Trois commandes et deux messages : si les
   * agregats se croisaient, `messagesNonLus` vaudrait 6 au lieu de 2, et
   * `commandesEnCours` vaudrait 6 au lieu de 3. Avec une seule ligne par table,
   * 1 x 1 vaut 1 et le defaut resterait invisible.
   */
  it("ne multiplie pas les comptages entre eux", async () => {
    const a = await commanderUnePiece();
    const b = await commanderUnePiece();
    const c = await commanderUnePiece();

    await confirmer(a.commandeId);
    await confirmer(b.commandeId);
    await confirmer(c.commandeId);

    for (const sujet of ["TEST premier", "TEST second"]) {
      await client.query(
        `INSERT INTO message (id, nom, email, sujet, corps, statut, cree_a)
         VALUES ($1, 'TEST Personne', 'contact@example.invalid', $2,
                 'TEST corps du message', 'NOUVEAU', now())`,
        [randomUUID(), sujet],
      );
    }

    const comptages = await lireComptages();

    expect(comptages.commandesEnCours).toBe(3);
    expect(comptages.commandesAPreparer).toBe(3);
    expect(comptages.messagesNonLus).toBe(2);
  });
});

describe("lireComptages, les etats de commande", () => {
  it("separe ce qui reste a preparer de ce qui attend le transporteur", async () => {
    const aPreparer = await commanderUnePiece();
    const prete = await commanderUnePiece();
    const enTransit = await commanderUnePiece();

    await confirmer(aPreparer.commandeId);
    await confirmer(prete.commandeId);
    await confirmer(enTransit.commandeId);

    await forcerStatut(prete.commandeId, "EN_PREPARATION");
    await forcerStatut(enTransit.commandeId, "EXPEDIEE");

    const comptages = await lireComptages();

    expect(comptages.commandesAPreparer).toBe(1);
    expect(comptages.commandesPretesAExpedier).toBe(1);
    expect(comptages.expeditionsEnTransit).toBe(1);

    /*
     * LA PASTILLE DE LA RUBRIQUE REUNIT LES DEUX PREMIERS ETATS, et pas le
     * troisieme : ce qui est chez le transporteur ne demande plus de geste.
     */
    expect(comptages.commandesEnCours).toBe(2);
  });

  /*
   * UNE COMMANDE NON PAYEE N'EST PAS UN TRAVAIL A FAIRE. Elle existe en base
   * des le tunnel, avant tout paiement : la compter ferait afficher une
   * pastille pour des paniers abandonnes, et l'exploitante chercherait des
   * commandes qui n'existent pas commercialement. Invariant 5.
   */
  it("ignore une commande en attente de paiement", async () => {
    await commanderUnePiece();

    const comptages = await lireComptages();

    expect(comptages.commandesAPreparer).toBe(0);
    expect(comptages.commandesEnCours).toBe(0);
  });
});

describe("lireComptages, le stock", () => {
  it("compte le disponible et non le physique", async () => {
    /*
     * DEUX PIECES PHYSIQUES DONT UNE RESERVEE : le disponible vaut 1, donc au
     * seuil. Compter le physique rendrait 2 et la variante passerait pour
     * confortable alors qu'il ne reste qu'une piece vendable. Invariant 6.
     */
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 2,
    });

    await client.query(
      "UPDATE variante SET quantite_reservee = 1 WHERE id = $1",
      [varianteId],
    );

    const comptages = await lireComptages();

    expect(SEUIL_STOCK_FAIBLE).toBe(1);
    expect(comptages.variantesStockFaible).toBe(1);
    expect(comptages.variantesIndisponibles).toBe(0);
  });

  it("distingue l'indisponible du seulement faible", async () => {
    await creerVarianteEnStock(client, { quantitePhysique: 0 });
    await creerVarianteEnStock(client, { quantitePhysique: 1 });
    await creerVarianteEnStock(client, { quantitePhysique: 5 });

    const comptages = await lireComptages();

    /* Les deux premieres sont sous le seuil, la troisieme non. */
    expect(comptages.variantesStockFaible).toBe(2);
    expect(comptages.variantesIndisponibles).toBe(1);
  });

  /*
   * UNE VARIANTE ARCHIVEE N'EST PAS EN RUPTURE, elle n'est plus vendue. C13.
   * L'inclure ferait grossir l'alerte a chaque piece retiree du commerce, et
   * l'alerte finirait ignoree parce que toujours haute.
   */
  it("exclut les variantes archivees", async () => {
    await creerVarianteEnStock(client, {
      quantitePhysique: 0,
      archivee: true,
    });

    const comptages = await lireComptages();

    expect(comptages.variantesStockFaible).toBe(0);
    expect(comptages.variantesIndisponibles).toBe(0);
  });
});

describe("lireComptages, l'encaisse du jour", () => {
  it("additionne la vente web et la vente de marche", async () => {
    const payee = await commanderUnePiece();
    await confirmer(payee.commandeId);

    /*
     * UNE VENTE DE MARCHE, ecrite comme le service la produit : quantite
     * NEGATIVE, prix fige sur la ligne. Le montant des marches manquait aux
     * statistiques, fiche « statistiques et vente externe » : un chiffre du
     * jour qui n'additionnerait que le web serait faux les jours de marche,
     * c'est-a-dire ceux ou il compte le plus.
     */
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 3,
    });

    await client.query(
      `INSERT INTO mouvement_stock
         (id, variante_id, type, quantite, canal,
          prix_unitaire_fige_centimes, origine, cree_a)
       VALUES ($1, $2, 'VENTE_EXTERNE', -2, 'TEST marche', 1500,
               'ADMIN', now())`,
      [randomUUID(), varianteId],
    );

    const comptages = await lireComptages();

    /* 49,00 € encaisses en ligne, plus deux pieces a 15,00 € sur le stand. */
    expect(comptages.encaisseDuJourCentimes).toBe(
      TOTAL_ATTENDU_CENTIMES + 3000,
    );
  });

  it("retranche un remboursement du jour", async () => {
    const payee = await commanderUnePiece();
    await confirmer(payee.commandeId);

    await client.query(
      `UPDATE paiement
          SET statut = 'PARTIELLEMENT_REMBOURSE',
              montant_rembourse_centimes = 1000
        WHERE commande_id = $1`,
      [payee.commandeId],
    );

    const comptages = await lireComptages();

    expect(comptages.encaisseDuJourCentimes).toBe(
      TOTAL_ATTENDU_CENTIMES - 1000,
    );
  });

  /*
   * LA RECETTE SE DATE SUR LE PAIEMENT, PAS SUR LA COMMANDE. Une commande
   * d'hier payee aujourd'hui appartient a aujourd'hui, et l'inverse aussi :
   * ce test monte le cas ou les deux dates different, seul moment ou l'erreur
   * se voit.
   */
  it("ecarte un paiement confirme un autre jour", async () => {
    const payee = await commanderUnePiece();
    await confirmer(payee.commandeId);

    await client.query(
      `UPDATE paiement
          SET confirme_a = now() - interval '2 days'
        WHERE commande_id = $1`,
      [payee.commandeId],
    );

    const comptages = await lireComptages();

    expect(comptages.encaisseDuJourCentimes).toBe(0);
  });

  it("rend zero et non null quand rien n'a ete encaisse", async () => {
    const comptages = await lireComptages();

    /*
     * `sum` RETOURNE `NULL` SUR UN ENSEMBLE VIDE, pas zero. Sans le
     * `coalesce`, l'ecran afficherait « null € » le matin avant la premiere
     * vente, c'est-a-dire tous les jours a l'ouverture.
     */
    expect(comptages.encaisseDuJourCentimes).toBe(0);
  });
});
