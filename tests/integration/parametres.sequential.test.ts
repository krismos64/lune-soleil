/**
 * PARAMÈTRES COMMERCIAUX EN BASE, LS-98 et ADR-043.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE, ET CE QU'AUCUN AUTRE TEST NE COUVRAIT.
 *
 * Les vingt-et-un fichiers d'intégration qui passent par `passerCommande` lui
 * INJECTENT tous leur configuration, `configuration: CONFIGURATION`. C'est bon
 * pour leur isolation, et cela signifie qu'aucun d'eux ne traverse
 * `resoudreConfigurationLivraison` : le chemin qui lit réellement la base en
 * production n'était exercé par rien.
 *
 * C'est le motif « fonction testée jamais appelée », déjà en fiche sur ce
 * dépôt : les tests d'un code mort sont identiques à ceux d'un code vivant.
 *
 * CE FICHIER N'INJECTE DONC AUCUNE CONFIGURATION, délibérément, et c'est sa
 * seule différence avec ses voisins. Une commande y est passée comme en
 * production, la base fournissant les tarifs.
 * ------------------------------------------------------------------
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagée entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let lireParametresBoutique: typeof import("@/services/parametres").lireParametresBoutique;
let enregistrerParametres: typeof import("@/services/parametres").enregistrerParametres;
let resoudreConfigurationLivraison: typeof import("@/services/parametres").resoudreConfigurationLivraison;

const ADRESSE = {
  ligne1: "1 rue de Test",
  codePostal: "75001",
  ville: "TESTVILLE",
  pays: "FR" as const,
};

/** Les valeurs d'ADR-035, celles que la migration amorce. */
const TARIF_RELAIS = 410;
const TARIF_DOMICILE = 749;
const SEUIL_FRANCHISE = 3900;

/** Sous le seuil : le port est dû dans tous les modes. */
const PRIX_SOUS_SEUIL = 2000;

function saisieCommande(
  email: string,
  mode: "DOMICILE" | "POINT_RELAIS" = "DOMICILE",
) {
  return {
    nomClient: "TEST Camille Dupont",
    email,
    telephone: null,
    adresse: ADRESSE,
    mode,
    pointRetrait:
      mode === "POINT_RELAIS"
        ? {
            identifiant: "FR-TEST-0098",
            nom: "TEST Relais du centre",
            ligne1: ADRESSE.ligne1,
            codePostal: ADRESSE.codePostal,
            ville: ADRESSE.ville,
          }
        : null,
  };
}

/** Les champs obligatoires d'une écriture, tous à leur valeur d'amorçage. */
function parametresValides(surcharge: Record<string, unknown> = {}) {
  return {
    tarifRelaisCentimes: TARIF_RELAIS,
    tarifDomicileCentimes: TARIF_DOMICILE,
    seuilFranchiseCentimes: SEUIL_FRANCHISE,
    seuilStockFaible: 1,
    emailAlertes: "alertes@exemple.invalid",
    alerteCommandePayee: true,
    alertePaiementAnnule: true,
    alerteStockFaible: true,
    alerteMessageRecu: true,
    alerteAvisAModerer: true,
    ...surcharge,
  };
}

/**
 * Cree une variante au prix voulu.
 *
 * `creerVarianteEnStock` FIGE LE PRIX A 4900 CENTIMES, au-dessus du seuil de
 * franchise : l'employer telle quelle rendrait tout panier eligible a la
 * gratuite, et les tests de tarif ne mesureraient jamais un port facture.
 *
 * LE PRIX EST DONC POSE PAR SQL APRES COUP, plutot que d'elargir l'aide
 * partagee : son en-tete annonce « minimal au sens strict », et lui ajouter un
 * parametre pour un seul fichier irait contre cette regle.
 */
async function varianteAuPrix(prixCentimes: number) {
  const contexte = await creerVarianteEnStock(client, { quantitePhysique: 1 });

  await client.query("UPDATE variante SET prix_centimes = $1 WHERE id = $2", [
    prixCentimes,
    contexte.varianteId,
  ]);

  return contexte;
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
  ({
    lireParametresBoutique,
    enregistrerParametres,
    resoudreConfigurationLivraison,
  } = await import("@/services/parametres"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query("DELETE FROM reservation");
  await client.query("DELETE FROM ligne_commande");
  await client.query("DELETE FROM commande");
  await client.query("DELETE FROM variante");
  await client.query("DELETE FROM produit");
  await client.query("DELETE FROM categorie");
  await client.query("DELETE FROM compteur_numero");

  /*
   * LES PARAMÈTRES SONT REMIS À LEUR VALEUR D'AMORÇAGE, jamais supprimés.
   *
   * Les effacer ferait échouer les fichiers SUIVANTS de la base partagée, qui
   * passeraient alors par un chemin sans configuration. L'ordre d'exécution
   * décidant qui rougit, le diagnostic porterait sur un fichier autre que celui
   * qui a causé le défaut : c'est exactement l'échec intermittent rencontré le
   * 11 septembre 2026 sur `compteur_numero`.
   */
  await client.query(
    `UPDATE parametre_boutique
        SET tarif_relais_centimes = $1,
            tarif_domicile_centimes = $2,
            seuil_franchise_centimes = $3,
            seuil_stock_faible = 1
      WHERE id = true`,
    [TARIF_RELAIS, TARIF_DOMICILE, SEUIL_FRANCHISE],
  );
});

describe("amorçage par la migration", () => {
  /*
   * LA MIGRATION AMORCE LA LIGNE, ADR-043 décision 6, et ce test le prouve sur
   * une base créée par `migrate deploy` et non par `db push`.
   *
   * SANS CET AMORÇAGE, une boutique fraîchement déployée facturerait un port
   * introuvable dès sa première commande. Le défaut ne serait pas visible au
   * démarrage, seulement à la première vente.
   */
  it("la base migrée porte une ligne de paramètres aux valeurs d'ADR-035", async () => {
    const parametres = await lireParametresBoutique();

    expect(parametres.tarifRelaisCentimes).toBe(TARIF_RELAIS);
    expect(parametres.tarifDomicileCentimes).toBe(TARIF_DOMICILE);
    expect(parametres.seuilFranchiseCentimes).toBe(SEUIL_FRANCHISE);
  });

  /*
   * LA LIGNE EST UNIQUE, ET LA BASE LE GARANTIT. Le contrôle applicatif n'existe
   * pas : c'est `chk_parametre_ligne_unique` qui refuse, et ce test vérifie que
   * la garantie vient bien de là plutôt que d'un hasard de lecture.
   */
  it("une seconde ligne de paramètres est refusée par la base", async () => {
    await expect(
      client.query(
        `INSERT INTO parametre_boutique
           (id, tarif_relais_centimes, tarif_domicile_centimes,
            seuil_stock_faible, email_alertes, modifie_a)
         VALUES (false, 410, 749, 1, 'x@exemple.invalid', now())`,
      ),
    ).rejects.toThrow(/chk_parametre_ligne_unique/);
  });
});

describe("resoudreConfigurationLivraison", () => {
  it("projette les valeurs de la base", async () => {
    const configuration = await resoudreConfigurationLivraison();

    expect(configuration).toEqual({
      relaisCentimes: TARIF_RELAIS,
      domicileCentimes: TARIF_DOMICILE,
      seuilFranchiseCentimes: SEUIL_FRANCHISE,
    });
  });

  /*
   * UN CHANGEMENT EN BASE EST VU SANS REDÉMARRAGE, et c'est l'objet entier
   * d'ADR-043.
   *
   * CE TEST ATTRAPE UNE MISE EN CACHE EN MODULE. Une configuration figée à
   * l'import resterait à sa première valeur, et le défaut serait invisible en
   * développement où le processus redémarre à chaque modification. Il ne se
   * verrait qu'en production, sur un seuil changé qui ne prend pas effet.
   */
  it("voit un changement de tarif sans redémarrage", async () => {
    await client.query(
      "UPDATE parametre_boutique SET tarif_relais_centimes = 590 WHERE id = true",
    );

    const configuration = await resoudreConfigurationLivraison();

    expect(configuration.relaisCentimes).toBe(590);
  });
});

describe("enregistrerParametres", () => {
  it("écrit les valeurs et les relit", async () => {
    const issue = await enregistrerParametres(
      parametresValides({ seuilStockFaible: 3, alerteStockFaible: false }),
    );

    expect(issue.statut).toBe("ENREGISTRE");

    const relus = await lireParametresBoutique();

    expect(relus.seuilStockFaible).toBe(3);
    expect(relus.alerteStockFaible).toBe(false);
  });

  /*
   * `null` DÉSACTIVE LA FRANCHISE, ET ZÉRO NE L'EST PAS.
   *
   * Les deux valeurs traversent la validation Zod, le repository et la base sans
   * se confondre. Une implémentation par `?? null` ou par un test de vérité les
   * aurait fusionnées, et une franchise universelle d'opération commerciale
   * serait devenue une franchise désactivée en silence.
   */
  it("distingue une franchise désactivée d'un seuil à zéro", async () => {
    await enregistrerParametres(
      parametresValides({ seuilFranchiseCentimes: null }),
    );
    expect((await lireParametresBoutique()).seuilFranchiseCentimes).toBeNull();

    await enregistrerParametres(
      parametresValides({ seuilFranchiseCentimes: 0 }),
    );
    expect((await lireParametresBoutique()).seuilFranchiseCentimes).toBe(0);
  });

  /*
   * LE REFUS MÉTIER D'ADR-043, un seuil sous le coût du port lui-même.
   *
   * IL REND UNE VALEUR ET NE LÈVE PAS : c'est un refus métier, pas une panne, et
   * l'écran doit pouvoir l'afficher sans passer par une frontière d'erreur.
   */
  it("refuse un seuil de franchise inférieur au tarif relais", async () => {
    const issue = await enregistrerParametres(
      parametresValides({ seuilFranchiseCentimes: TARIF_RELAIS - 1 }),
    );

    expect(issue.statut).toBe("REFUSE_SEUIL_SOUS_TARIF");

    // RIEN N'A ÉTÉ ÉCRIT. Un refus qui écrirait quand même serait pire qu'un
    // refus absent : l'écran annoncerait une erreur sur une valeur enregistrée.
    expect((await lireParametresBoutique()).seuilFranchiseCentimes).toBe(
      SEUIL_FRANCHISE,
    );
  });

  it.each([
    ["un tarif décimal", { tarifRelaisCentimes: 4.1 }],
    ["un tarif négatif", { tarifRelaisCentimes: -410 }],
    ["un seuil de stock nul", { seuilStockFaible: 0 }],
    ["une adresse d'alerte mal formée", { emailAlertes: "pas-une-adresse" }],
  ])("refuse %s", async (_libelle, surcharge) => {
    await expect(
      enregistrerParametres(parametresValides(surcharge)),
    ).rejects.toThrow();
  });
});

describe("le tarif appliqué à une commande vient de la base", () => {
  /*
   * ------------------------------------------------------------------
   * LE TEST CENTRAL DE CE FICHIER, ET LE SEUL DU DÉPÔT DANS CE CAS.
   *
   * AUCUNE CONFIGURATION N'EST INJECTÉE à `passerCommande`, contrairement aux
   * vingt-et-un autres fichiers d'intégration : c'est ce qui fait traverser
   * `resoudreConfigurationLivraison`, donc le chemin réellement servi.
   * ------------------------------------------------------------------
   */
  it("facture le tarif de la base, sans configuration injectée", async () => {
    const variante = await varianteAuPrix(PRIX_SOUS_SEUIL);

    const issue = await passerCommande({
      lignesCookie: [{ varianteId: variante.varianteId, quantite: 1 }],
      saisie: saisieCommande(`ls98-${randomUUID()}@exemple.test`),
    });

    /*
     * LE SERVICE REND LE TOTAL, et l'asserter ICI vaut mieux que de le relire :
     * c'est ce nombre que la page de paiement présente au client. Un écart
     * entre lui et la ligne écrite serait invisible à une lecture seule.
     */
    expect(issue.totalCentimes).toBe(PRIX_SOUS_SEUIL + TARIF_DOMICILE);

    const { rows } = await client.query<{
      frais: number;
      total: number;
    }>(
      `SELECT frais_port_centimes AS frais, total_centimes AS total
         FROM commande ORDER BY cree_a DESC LIMIT 1`,
    );

    expect(rows[0]?.frais).toBe(TARIF_DOMICILE);
    expect(rows[0]?.total).toBe(PRIX_SOUS_SEUIL + TARIF_DOMICILE);
  });

  /*
   * UN TARIF CHANGÉ S'APPLIQUE À LA COMMANDE SUIVANTE, et c'est l'objet
   * d'ADR-043 vu du bout de la chaîne : l'exploitante change son tarif, la vente
   * suivante le porte, sans redéploiement.
   */
  it("applique un tarif modifié à la commande suivante", async () => {
    await client.query(
      "UPDATE parametre_boutique SET tarif_domicile_centimes = 899 WHERE id = true",
    );

    const variante = await varianteAuPrix(PRIX_SOUS_SEUIL);

    await passerCommande({
      lignesCookie: [{ varianteId: variante.varianteId, quantite: 1 }],
      saisie: saisieCommande(`ls98-${randomUUID()}@exemple.test`),
    });

    const { rows } = await client.query<{ frais: number }>(
      `SELECT frais_port_centimes AS frais
         FROM commande ORDER BY cree_a DESC LIMIT 1`,
    );

    expect(rows[0]?.frais).toBe(899);
  });

  /*
   * ------------------------------------------------------------------
   * L'INVARIANT 3, ET C'EST LE CRITÈRE 3 DE LS-98.
   *
   * « Une commande passée conserve le tarif et le seuil en vigueur au moment de
   * l'achat, prouvé par un test. »
   *
   * CE TEST EST LA RAISON POUR LAQUELLE ADR-043 N'HISTORISE AUCUN PARAMÈTRE :
   * `Commande.fraisPortCentimes` porte déjà le montant figé, donc un historique
   * serait une seconde source de vérité pour une question à laquelle la commande
   * répond déjà.
   * ------------------------------------------------------------------
   */
  it("ne réécrit jamais une commande passée quand le tarif change", async () => {
    const variante = await varianteAuPrix(PRIX_SOUS_SEUIL);

    await passerCommande({
      lignesCookie: [{ varianteId: variante.varianteId, quantite: 1 }],
      saisie: saisieCommande(`ls98-${randomUUID()}@exemple.test`),
    });

    const avant = await client.query<{ frais: number; total: number }>(
      `SELECT frais_port_centimes AS frais, total_centimes AS total
         FROM commande ORDER BY cree_a DESC LIMIT 1`,
    );

    // Le tarif TRIPLE après la commande, écart qu'aucun arrondi ne masquerait.
    await client.query(
      "UPDATE parametre_boutique SET tarif_domicile_centimes = 2247 WHERE id = true",
    );

    const apres = await client.query<{ frais: number; total: number }>(
      `SELECT frais_port_centimes AS frais, total_centimes AS total
         FROM commande ORDER BY cree_a DESC LIMIT 1`,
    );

    expect(apres.rows[0]?.frais).toBe(avant.rows[0]?.frais);
    expect(apres.rows[0]?.total).toBe(avant.rows[0]?.total);
    expect(apres.rows[0]?.frais).toBe(TARIF_DOMICILE);
  });

  /*
   * LA FRANCHISE VIENT DE LA BASE AUSSI, et elle reste RÉSERVÉE aux modes en
   * relais, ADR-035. Ce test le vérifie dans les deux sens sur la même valeur de
   * panier : offerte en relais, due au domicile.
   *
   * UN TEST QUI N'EXERCERAIT QUE LE RELAIS resterait vert si la réserve
   * disparaissait de `calculerFraisPort`, ce qui offrirait un port de 7,49 EUR
   * qu'une commande de 40 EUR ne finance pas.
   */
  it("applique la franchise en relais et jamais au domicile", async () => {
    const enRelais = await varianteAuPrix(SEUIL_FRANCHISE);

    await passerCommande({
      lignesCookie: [{ varianteId: enRelais.varianteId, quantite: 1 }],
      saisie: saisieCommande(
        `ls98-${randomUUID()}@exemple.test`,
        "POINT_RELAIS",
      ),
    });

    const relais = await client.query<{ frais: number }>(
      `SELECT frais_port_centimes AS frais
         FROM commande ORDER BY cree_a DESC LIMIT 1`,
    );

    expect(relais.rows[0]?.frais).toBe(0);

    const aDomicile = await varianteAuPrix(SEUIL_FRANCHISE);

    await passerCommande({
      lignesCookie: [{ varianteId: aDomicile.varianteId, quantite: 1 }],
      saisie: saisieCommande(`ls98-${randomUUID()}@exemple.test`),
    });

    const domicile = await client.query<{ frais: number }>(
      `SELECT frais_port_centimes AS frais
         FROM commande ORDER BY cree_a DESC LIMIT 1`,
    );

    expect(domicile.rows[0]?.frais).toBe(TARIF_DOMICILE);
  });
});
