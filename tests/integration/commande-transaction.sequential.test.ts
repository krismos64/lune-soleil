/**
 * LA TRANSACTION UNIQUE DE L'ETAPE 4, LS-117 et ADR-024.
 *
 * ECRIT AVANT LE SERVICE, exigence du plan directeur en zone critique. Ce
 * fichier dit ce que `passerCommande` doit garantir, pas ce qu'elle fait.
 *
 * CE QUE LE TEST PHARE DE LS-116 NE POUVAIT PAS PROUVER, et c'est la raison
 * d'etre de ce fichier. Dans `jalon-piece-unique`, les commandes sont inserees
 * par `creerCommande` HORS de la transaction du service : elles survivent au
 * refus quoi qu'il arrive. Ce que ce service garantissait etait l'inverse,
 * aucune RESERVATION orpheline. La commande orpheline ne devient verifiable
 * qu'ici, ou la creation de commande entre dans la transaction.
 *
 * VERIFIER UNE IDENTITE ET NON UNE CARDINALITE, piege mesure le 25 aout 2026.
 * Compter les lignes vaut souvent 1 par construction : ces tests nomment la
 * commande attendue, le prix attendu, la variante attendue.
 *
 * SUFFIXE `.sequential` : ces tests mesurent de la concurrence sur un serveur
 * PostgreSQL partage.
 */
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let pool: Pool;
let passerCommande: typeof import("@/services/commande").passerCommande;
let CommandeRefuseeError: typeof import("@/services/commande").CommandeRefuseeError;

/** Saisie minimale d'un client, mode DOMICILE, aucun point de retrait. */
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

/** Configuration tarifaire figee, pour ne dependre d'aucune variable. */
const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 499,
  seuilFranchiseCentimes: 3900,
};

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  // Le service lit `DATABASE_URL` a l'evaluation du module `@/lib/prisma`,
  // d'ou l'import differe : le renseigner apres coup n'aurait aucun effet.
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();
  pool = new Pool({ connectionString: url, max: 5 });

  ({ passerCommande, CommandeRefuseeError } =
    await import("@/services/commande"));
});

afterAll(async () => {
  await client.end();
  await pool.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE reservation, ligne_commande, commande, variante, produit, categorie, compteur_numero CASCADE",
  );
});

describe("concurrence sur la derniere piece", () => {
  /*
   * LE JALON QUI COMPTE, porte sur le chemin de PRODUCTION.
   *
   * `jalon-piece-unique.sequential.test.ts` prouve la meme propriete sur
   * `reserverPanier`, qui etait le chemin applicatif au moment de LS-116. Depuis
   * LS-117, `passerCommande` est le seul point d'entree reel : un jalon qui ne
   * s'exerce que sur l'ancien service prouverait une propriete d'un code que
   * personne n'appelle. Motif « fonction testee jamais appelee », deja rencontre
   * sur ce projet.
   *
   * DEUX ACHETEURS, UN EXEMPLAIRE. Un seul repart avec, l'autre lit un refus
   * nommant la piece, et le stock ne devient jamais negatif.
   */
  it("un seul acheteur obtient la piece, l'autre est refuse", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });

    const commander = () =>
      passerCommande({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
      });

    const issues = await Promise.allSettled([commander(), commander()]);

    const servis = issues.filter((issue) => issue.status === "fulfilled");
    const refuses = issues.filter(
      (issue) =>
        issue.status === "rejected" &&
        issue.reason instanceof CommandeRefuseeError,
    );

    expect(servis).toHaveLength(1);
    expect(refuses).toHaveLength(1);

    /*
     * L'IDENTITE ET NON LE COMPTE, piege du 25 aout 2026 : compter les
     * reservations vaut 1 par construction des qu'une seule subsiste. Il faut
     * verifier que la reservation porte la commande GAGNANTE, sans quoi la piece
     * partirait sur la commande perdante et resterait immobilisee trente minutes
     * pour un achat que personne ne paiera.
     */
    const gagnante = servis[0] as PromiseFulfilledResult<{
      commandeId: string;
    }>;

    const { rows: reservations } = await client.query(
      "SELECT commande_id FROM reservation",
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0].commande_id).toBe(gagnante.value.commandeId);

    // UNE SEULE COMMANDE SUBSISTE : le refus a annule la sienne entierement.
    const { rows: commandes } = await client.query("SELECT id FROM commande");
    expect(commandes).toHaveLength(1);
    expect(commandes[0].id).toBe(gagnante.value.commandeId);

    // LE STOCK N'EST JAMAIS NEGATIF, et la survente n'a pas eu lieu.
    const { rows: variantes } = await client.query(
      "SELECT quantite_physique, quantite_reservee FROM variante WHERE id = $1",
      [varianteId],
    );
    expect(variantes[0].quantite_reservee).toBe(1);
    expect(variantes[0].quantite_physique).toBe(1);
  });
});

/**
 * L'annee telle que PostgreSQL la voit, LS-117.
 *
 * ELLE NE VIENT PAS DE `new Date()`, et la nuance est le defaut corrige par la
 * revue critique : le service derive l'annee de `now()` cote base, regle de
 * `database.md`. Comparer a l'horloge de Node ferait echouer ce test au passage
 * d'annee sur une machine decalee, pour une raison sans rapport avec le code.
 */
async function anneePostgres(): Promise<number> {
  const { rows } = await client.query(
    "SELECT EXTRACT(YEAR FROM now())::int AS annee",
  );

  return rows[0].annee;
}

/** Lit une commande par son identifiant, ou `null`. */
async function lireCommande(commandeId: string) {
  const { rows } = await client.query(
    `SELECT numero, statut, nom_client, email_normalise, telephone,
            adresse_livraison, mode_livraison, point_relais_id,
            sous_total_centimes, frais_port_centimes, total_centimes,
            montant_taxe_centimes, cgv_acceptees_a, cgv_version
       FROM commande WHERE id = $1`,
    [commandeId],
  );

  return rows[0] ?? null;
}

describe("chemin nominal", () => {
  it("ecrit commande, ligne et reservation ensemble", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const commande = await lireCommande(issue.commandeId);
    expect(commande).not.toBeNull();
    expect(commande.statut).toBe("EN_ATTENTE_PAIEMENT");

    /*
     * L'IDENTITE ET NON LE COMPTE. Une reservation existe : encore faut-il
     * qu'elle porte CETTE commande et CETTE variante. Le piege du 25 aout est
     * qu'un `count(*)` vaut 1 des qu'une seule ligne subsiste, quelle qu'elle
     * soit.
     */
    const { rows: reservations } = await client.query(
      "SELECT variante_id, commande_id, quantite FROM reservation",
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0].commande_id).toBe(issue.commandeId);
    expect(reservations[0].variante_id).toBe(varianteId);

    const { rows: lignes } = await client.query(
      "SELECT commande_id, variante_id, quantite FROM ligne_commande",
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0].commande_id).toBe(issue.commandeId);
    expect(lignes[0].variante_id).toBe(varianteId);

    const { rows: variantes } = await client.query(
      "SELECT quantite_reservee FROM variante WHERE id = $1",
      [varianteId],
    );
    expect(variantes[0].quantite_reservee).toBe(1);
  });

  it("horodate l'acceptation des CGV et fige leur version", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    const avant = new Date();
    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const commande = await lireCommande(issue.commandeId);
    expect(commande.cgv_acceptees_a.getTime()).toBeGreaterThanOrEqual(
      avant.getTime() - 1000,
    );
    expect(commande.cgv_version).toBeTruthy();
  });

  it("pose une expiration de reservation a trente minutes", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const { rows } = await client.query(
      "SELECT expire_a, cree_a FROM reservation",
    );
    const ecartMinutes =
      (rows[0].expire_a.getTime() - rows[0].cree_a.getTime()) / 60000;

    expect(ecartMinutes).toBeCloseTo(30, 1);
  });
});

describe("numerotation, ADR-031", () => {
  it("numerote la premiere commande de l'annee a 0001", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const commande = await lireCommande(issue.commandeId);
    const annee = await anneePostgres();

    expect(commande.numero).toBe(`C-${annee}-0001`);
  });

  it("incremente sans trou sur trois commandes", async () => {
    const numeros: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const { varianteId } = await creerVarianteEnStock(client);
      const issue = await passerCommande({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
      });
      const commande = await lireCommande(issue.commandeId);
      numeros.push(commande.numero);
    }

    const annee = await anneePostgres();
    expect(numeros).toEqual([
      `C-${annee}-0001`,
      `C-${annee}-0002`,
      `C-${annee}-0003`,
    ]);
  });

  /*
   * LE MOTIF D'AVOIR ECARTE UNE `SEQUENCE`, ADR-031. Une transaction annulee
   * doit rendre son numero : sur un catalogue de pieces uniques le refus est
   * frequent, et une sequence creerait un trou a chacun.
   */
  it("rend le numero quand la transaction est annulee", async () => {
    const { varianteId: epuisee } = await creerVarianteEnStock(client, {
      quantitePhysique: 0,
    });

    await expect(
      passerCommande({
        lignesCookie: [{ varianteId: epuisee, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
      }),
    ).rejects.toBeInstanceOf(CommandeRefuseeError);

    const { varianteId: disponible } = await creerVarianteEnStock(client);
    const issue = await passerCommande({
      lignesCookie: [{ varianteId: disponible, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const commande = await lireCommande(issue.commandeId);
    const annee = await anneePostgres();

    // 0001 et non 0002 : le refus n'a consomme aucun numero.
    expect(commande.numero).toBe(`C-${annee}-0001`);
  });
});

describe("figement, invariant 3", () => {
  it("copie prix, libelles et reference sur la ligne", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const { rows } = await client.query(
      `SELECT reference_figee, libelle_produit_fige, libelle_variante_fige,
              prix_fige_centimes
         FROM ligne_commande WHERE commande_id = $1`,
      [issue.commandeId],
    );

    expect(rows[0].libelle_produit_fige).toBe("TEST Produit");
    expect(rows[0].libelle_variante_fige).toBe("TEST Variante");
    expect(rows[0].prix_fige_centimes).toBe(4900);
    expect(rows[0].reference_figee).toMatch(/^TEST-/);
  });

  /*
   * LE CRITERE 5 DE LA STORY, et la preuve de l'invariant 3. Une revision de
   * prix la semaine suivante ne doit rien changer a une commande passee.
   */
  it("ne change pas quand le catalogue change apres la commande", async () => {
    const { varianteId, produitId } = await creerVarianteEnStock(client);

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    await client.query(
      `UPDATE variante SET prix_centimes = 9900, libelle = 'TEST Renommee',
                           reference = 'TEST-NOUVELLE'
         WHERE id = $1`,
      [varianteId],
    );
    await client.query(
      "UPDATE produit SET nom = 'TEST Renomme' WHERE id = $1",
      [produitId],
    );

    const { rows } = await client.query(
      `SELECT reference_figee, libelle_produit_fige, libelle_variante_fige,
              prix_fige_centimes
         FROM ligne_commande WHERE commande_id = $1`,
      [issue.commandeId],
    );

    expect(rows[0].prix_fige_centimes).toBe(4900);
    expect(rows[0].libelle_produit_fige).toBe("TEST Produit");
    expect(rows[0].libelle_variante_fige).toBe("TEST Variante");
    expect(rows[0].reference_figee).not.toBe("TEST-NOUVELLE");

    /*
     * LIVRAISON OFFERTE, et le total vaut donc le seul sous-total : 4900
     * centimes depassent le seuil de franchise de 3900. La premiere version de
     * cette assertion ajoutait les 499 centimes du domicile, attente fausse que
     * le service a corrigee.
     */
    const commande = await lireCommande(issue.commandeId);
    expect(commande.frais_port_centimes).toBe(0);
    expect(commande.total_centimes).toBe(4900);
  });

  /*
   * LE VERROU FERME LA FENETRE ENTRE LECTURE ET RESERVATION, correction du
   * 25 aout 2026 relevee par `ls-critical-reviewer`.
   *
   * SANS `FOR UPDATE`, une revision de prix validee entre le `SELECT` et
   * l'`UPDATE` de reservation fait figer l'ANCIEN prix sur une commande ecrite
   * APRES la revision : `READ COMMITTED` donne a chaque instruction la version
   * validee a son propre instant.
   *
   * LE TEST FORCE L'ENTRELACEMENT plutot que d'esperer le rencontrer. Une
   * transaction concurrente detient la ligne et modifie le prix ; la commande
   * l'attend sur le verrou, et doit donc lire le prix NOUVEAU. Sans verrou elle
   * lirait l'ancien sans attendre, ce que la mutation demontre.
   */
  it("fige le prix a jour quand une revision est validee pendant la commande", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    const concurrent = new Client({
      connectionString: inject(VARIABLE_URL_TEST),
    });
    await concurrent.connect();

    try {
      await concurrent.query("BEGIN");
      await concurrent.query(
        "UPDATE variante SET prix_centimes = 5900 WHERE id = $1",
        [varianteId],
      );

      // La commande demarre pendant que la revision est EN COURS, non validee.
      const enCours = passerCommande({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
      });

      // Laisser la commande atteindre le verrou et s'y bloquer.
      await new Promise((suite) => setTimeout(suite, 250));
      await concurrent.query("COMMIT");

      const issue = await enCours;
      const { rows } = await client.query(
        "SELECT prix_fige_centimes FROM ligne_commande WHERE commande_id = $1",
        [issue.commandeId],
      );

      // LE PRIX NOUVEAU, 5900 : la commande a attendu la revision et lu apres
      // elle. Sans verrou, elle aurait fige 4900, un prix deja revoke.
      expect(rows[0].prix_fige_centimes).toBe(5900);

      const commande = await lireCommande(issue.commandeId);
      expect(commande.sous_total_centimes).toBe(5900);
    } finally {
      await concurrent.end();
    }
  });

  /*
   * LES MONTANTS VIENNENT DU SERVEUR, jamais du navigateur. 4900 centimes
   * passent sous le seuil de franchise de 3900 ? Non : 4900 le depasse, donc
   * la livraison est offerte. Le test le verifie explicitement plutot que de
   * recopier le resultat du service.
   */
  it("fige les frais de port calcules par le serveur", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      // Seuil releve au-dessus du prix : la livraison n'est plus offerte.
      configuration: { ...CONFIGURATION, seuilFranchiseCentimes: 100000 },
    });

    const commande = await lireCommande(issue.commandeId);

    expect(commande.sous_total_centimes).toBe(4900);
    expect(commande.frais_port_centimes).toBe(499);
    expect(commande.total_centimes).toBe(5399);
    expect(commande.montant_taxe_centimes).toBe(0);
  });

  it("fige le mode et l'adresse de livraison", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const commande = await lireCommande(issue.commandeId);

    expect(commande.mode_livraison).toBe("DOMICILE");
    expect(commande.point_relais_id).toBeNull();
    expect(commande.adresse_livraison.ligne1).toBe("1 rue de Test");
    expect(commande.adresse_livraison.ville).toBe("TESTVILLE");
    expect(commande.nom_client).toBe("TEST Camille Dupont");
  });

  it("fige le point de retrait avec son adresse, ADR-025", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: {
        ...SAISIE_DOMICILE,
        mode: "POINT_RELAIS" as const,
        pointRetrait: {
          identifiant: "TEST-REL-001",
          nom: "TEST Relais du Centre",
          ligne1: "5 place de Test",
          codePostal: "75002",
          ville: "TESTVILLE",
        },
      },
      configuration: CONFIGURATION,
    });

    const { rows } = await client.query(
      "SELECT point_relais_id, point_relais_adresse FROM commande WHERE id = $1",
      [issue.commandeId],
    );

    expect(rows[0].point_relais_id).toBe("TEST-REL-001");
    // LE LIBELLE ET L'ADRESSE SONT COPIES, pas seulement l'identifiant : un
    // point qui ferme rendrait sinon illisible une commande passee.
    expect(rows[0].point_relais_adresse.nom).toBe("TEST Relais du Centre");
    expect(rows[0].point_relais_adresse.ligne1).toBe("5 place de Test");
  });
});

describe("refus de stock, aucune ecriture partielle", () => {
  /*
   * LE CRITERE QUE LS-116 NE POUVAIT PAS PROUVER. La commande est desormais
   * creee DANS la transaction : un refus ne doit en laisser AUCUNE.
   */
  it("ne laisse aucune commande orpheline", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 0,
    });

    await expect(
      passerCommande({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
      }),
    ).rejects.toBeInstanceOf(CommandeRefuseeError);

    const { rows: commandes } = await client.query("SELECT id FROM commande");
    const { rows: lignes } = await client.query(
      "SELECT id FROM ligne_commande",
    );
    const { rows: reservations } = await client.query(
      "SELECT id FROM reservation",
    );

    expect(commandes).toHaveLength(0);
    expect(lignes).toHaveLength(0);
    expect(reservations).toHaveLength(0);
  });

  it("laisse quantite_reservee intacte", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 0,
    });

    await expect(
      passerCommande({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
      }),
    ).rejects.toBeInstanceOf(CommandeRefuseeError);

    const { rows } = await client.query(
      "SELECT quantite_reservee FROM variante WHERE id = $1",
      [varianteId],
    );
    expect(rows[0].quantite_reservee).toBe(0);
  });

  /*
   * LE REFUS NOMME LA PIECE, critere 3 : l'ecran doit signaler LA ligne
   * concernee, pas afficher une erreur generique. Un panier de deux pieces dont
   * une seule est epuisee le prouve mieux qu'un panier d'une piece.
   */
  it("nomme la variante refusee et n'ecrit rien de l'autre ligne", async () => {
    const couple = await creerCoupleOrdonne();

    const erreur = await passerCommande({
      lignesCookie: [
        { varianteId: couple.disponible, quantite: 1 },
        { varianteId: couple.epuisee, quantite: 1 },
      ],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    }).catch((cause: unknown) => cause);

    expect(erreur).toBeInstanceOf(CommandeRefuseeError);
    expect(
      (erreur as InstanceType<typeof CommandeRefuseeError>).varianteRefusee,
    ).toBe(couple.epuisee);

    // LA PIECE DISPONIBLE N'EST PAS IMMOBILISEE. C'est le defaut mesure en
    // LS-71 : un refus partiel qui validait la transaction gelait trente
    // minutes une piece pour une commande jamais payee.
    const { rows } = await client.query(
      "SELECT quantite_reservee FROM variante WHERE id = $1",
      [couple.disponible],
    );
    expect(rows[0].quantite_reservee).toBe(0);

    const { rows: commandes } = await client.query("SELECT id FROM commande");
    expect(commandes).toHaveLength(0);
  });
});

describe("panne au milieu de la transaction", () => {
  /*
   * LE CRITERE 9, et la cible de la mutation du critere 11.
   *
   * LA PANNE EST INJECTEE APRES LA RESERVATION, jamais avant : c'est le seul
   * moment ou une ecriture partielle est possible. Injectee avant, la
   * transaction n'aurait rien ecrit et le test resterait vert meme si la
   * reservation vivait hors transaction, ce qui ne prouverait rien.
   *
   * ELLE PASSE PAR UN CROCHET DU SERVICE plutot que par une coupure de
   * connexion : couper le socket laisse PostgreSQL annuler de son cote, ce qui
   * est le comportement a prouver, mais rend le test dependant du delai de
   * detection. Le crochet leve a un point nomme, deterministe.
   */
  it("ne laisse aucune ecriture, ni commande ni reservation", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });

    const panne = new Error("panne simulee apres la reservation");

    await expect(
      passerCommande({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
        apresReservation: () => {
          throw panne;
        },
      }),
    ).rejects.toThrow(panne);

    const { rows: commandes } = await client.query("SELECT id FROM commande");
    const { rows: lignes } = await client.query(
      "SELECT id FROM ligne_commande",
    );
    const { rows: reservations } = await client.query(
      "SELECT id FROM reservation",
    );

    expect(commandes).toHaveLength(0);
    expect(lignes).toHaveLength(0);
    expect(reservations).toHaveLength(0);
  });

  /*
   * LE STOCK EST RENDU, et c'est l'assertion qui rougit si la reservation
   * sort de la transaction. `quantite_reservee` a 1 apres une panne signifie
   * une piece immobilisee trente minutes pour une commande qui n'existe pas :
   * l'incident exact qu'ADR-024 supprime.
   */
  it("laisse quantite_reservee a zero", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });

    await expect(
      passerCommande({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
        apresReservation: () => {
          throw new Error("panne simulee apres la reservation");
        },
      }),
    ).rejects.toThrow();

    const { rows } = await client.query(
      "SELECT quantite_reservee FROM variante WHERE id = $1",
      [varianteId],
    );

    expect(rows[0].quantite_reservee).toBe(0);
  });

  /*
   * LA PIECE RESTE ACHETABLE APRES LA PANNE. C'est la formulation metier du
   * meme fait, et celle que le client constate : il reessaie et la commande
   * passe, au lieu de lire « cette piece vient d'etre vendue » alors qu'il est
   * seul a la vouloir.
   */
  it("laisse la piece achetable a la tentative suivante", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });

    await expect(
      passerCommande({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: SAISIE_DOMICILE,
        configuration: CONFIGURATION,
        apresReservation: () => {
          throw new Error("panne simulee apres la reservation");
        },
      }),
    ).rejects.toThrow();

    const issue = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const commande = await lireCommande(issue.commandeId);
    expect(commande).not.toBeNull();
    expect(commande.statut).toBe("EN_ATTENTE_PAIEMENT");
  });
});

/**
 * Cree une variante disponible et une epuisee, DANS CET ORDRE d'identifiant.
 *
 * SANS CETTE GARANTIE LE TEST DE ROLLBACK NE TESTE RIEN. `ordonnerLignes` trie
 * par identifiant croissant : quand l'epuisee passe la premiere, le refus tombe
 * AVANT qu'aucune reservation ne soit ecrite, et le rollback n'a rien a
 * defaire. Mesure le 25 aout 2026 sur 40 couples, l'ordre voulu ne sort que 15
 * fois.
 *
 * Le meme outil existe dans `jalon-piece-unique` et
 * `reservation-service.sequential`, avec le meme commentaire. Le recopier
 * plutot que de l'extraire garde chaque fichier de test lisible seul, ce que le
 * projet prefere pour les tests.
 */
async function creerCoupleOrdonne() {
  for (let essai = 0; essai < 20; essai += 1) {
    const disponible = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const epuisee = await creerVarianteEnStock(client, { quantitePhysique: 0 });

    if (disponible.varianteId < epuisee.varianteId) {
      return { disponible: disponible.varianteId, epuisee: epuisee.varianteId };
    }

    await client.query("TRUNCATE variante, produit, categorie CASCADE");
  }

  throw new Error("aucun couple ordonne obtenu en 20 essais");
}
