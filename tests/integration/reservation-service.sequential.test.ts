/**
 * Le SERVICE de reservation, exerce sur base reelle, LS-50.
 *
 * POURQUOI CE FICHIER EXISTE, et pourquoi son absence a laisse passer deux
 * defauts. `reservation-panier.sequential` prouve qu'un motif SQL trie evite le
 * cycle, en reproduisant la mecanique du service en SQL direct. C'est vrai et
 * utile, et cela ne prouve rien sur le code reellement execute : la reproduction
 * faisait un `ROLLBACK` explicite et lisait `erreur.code` directement, deux
 * points sur lesquels le service differait, et ce sont exactement les deux qui
 * etaient faux.
 *
 * Les deux defauts, trouves par une revue critique le 31 juillet 2026 :
 *
 * 1. LE REFUS PARTIEL VALIDAIT LA TRANSACTION. `$transaction` valide des que la
 *    fonction rend une valeur et n'annule que si elle leve ; le service sortait
 *    par un `return`. La piece disponible d'un panier refuse restait reservee
 *    trente minutes pour une commande jamais payee.
 * 2. LA DETECTION D'INTERBLOCAGE RATAIT LE CODE REEL. Une requete brute echoue
 *    en `P2010`, le `40P01` etant enterre dans la cause de l'adaptateur. Le
 *    rejeu ne se declenchait donc jamais par le seul chemin qu'il emprunte.
 *
 * Les deux etaient invisibles depuis un double de test, qui valide la constante
 * contre elle-meme, et depuis une reproduction SQL, qui n'execute pas le service.
 * CES TESTS APPELLENT `reserverPanier`.
 */
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerCommande, creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import { SQL_RESERVER } from "../aide/reservation-sql";

let client: Client;
let pool: Pool;
let reserverPanier: typeof import("@/services/reservation").reserverPanier;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  // Le service lit `DATABASE_URL` a l'evaluation du module `@/lib/prisma`,
  // d'ou l'import differe : le renseigner apres coup n'aurait aucun effet.
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();
  pool = new Pool({ connectionString: url, max: 5 });

  ({ reserverPanier } = await import("@/services/reservation"));
});

afterAll(async () => {
  await client.end();
  await pool.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE reservation, commande, variante, produit, categorie CASCADE",
  );
});

async function lireEtat(varianteId: string) {
  const { rows } = await client.query<{
    quantite_physique: number;
    quantite_reservee: number;
    lignes: string;
  }>(
    `SELECT v.quantite_physique, v.quantite_reservee,
            (SELECT count(*) FROM reservation r WHERE r.variante_id = v.id) AS lignes
     FROM variante v WHERE v.id = $1`,
    [varianteId],
  );
  const ligne = rows[0];
  if (!ligne) throw new Error(`Variante ${varianteId} introuvable`);
  return {
    physique: Number(ligne.quantite_physique),
    reservee: Number(ligne.quantite_reservee),
    lignes: Number(ligne.lignes),
  };
}

/**
 * Cree une variante disponible et une epuisee, en garantissant que la
 * DISPONIBLE porte l'identifiant le plus PETIT.
 *
 * Sans cette garantie le test ne teste rien : le tri traite les variantes par
 * identifiant croissant, donc si l'epuisee vient en premier, le refus tombe
 * avant qu'aucune reservation n'ait ete ecrite et le rollback n'a rien a defaire.
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
  throw new Error("Impossible d'engendrer un couple d'identifiants ordonne");
}

describe("service de reservation, sur base reelle", () => {
  it("reserve toutes les lignes d'un panier disponible", async () => {
    const premiere = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const seconde = await creerVarianteEnStock(client, { quantitePhysique: 1 });
    const commandeId = await creerCommande(client);

    const issue = await reserverPanier(
      [
        { varianteId: seconde.varianteId, quantite: 1 },
        { varianteId: premiere.varianteId, quantite: 1 },
      ],
      commandeId,
    );

    expect(issue).toEqual({ statut: "SERVI" });
    for (const varianteId of [premiere.varianteId, seconde.varianteId]) {
      const etat = await lireEtat(varianteId);
      expect(etat.reservee).toBe(1);
      expect(etat.lignes).toBe(1);
    }
  });

  /**
   * LE TEST DU DEFAUT 1. Il rougit sur la version qui sortait par un `return` :
   * `expected 1 to be +0`, la piece disponible restant reservee.
   *
   * L'assertion porte sur l'etat de la piece DISPONIBLE, pas sur l'issue rendue.
   * L'issue etait deja correcte avant la correction, `REFUSE` avec la bonne
   * variante nommee : c'est l'ecriture en base qui ne l'etait pas. Verifier
   * l'issue seule aurait laisse le defaut passer.
   */
  it("annule toute la transaction quand une ligne est indisponible", async () => {
    const { disponible, epuisee } = await creerCoupleOrdonne();
    const commandeId = await creerCommande(client);

    const issue = await reserverPanier(
      [
        { varianteId: disponible, quantite: 1 },
        { varianteId: epuisee, quantite: 1 },
      ],
      commandeId,
    );

    expect(issue).toEqual({ statut: "REFUSE", varianteRefusee: epuisee });

    // LE POINT DECISIF : la piece disponible est INTACTE, pas gelee trente
    // minutes pour une commande qui ne sera jamais payee. ADR-024.
    const etat = await lireEtat(disponible);
    expect(etat.reservee).toBe(0);
    expect(etat.lignes).toBe(0);
    expect(etat.physique).toBe(1);
  });

  /**
   * LE TEST DU DEFAUT 2, contre un interblocage REEL et non simule.
   *
   * Une transaction adverse prend les verrous dans l'ordre inverse, sans trier :
   * elle joue le role d'une vente externe ou d'une liberation d'expirees, les
   * chemins que le tri ne couvre pas. Le service doit conclure par un resultat
   * metier apres rejeu, jamais remonter une erreur brute de requete.
   *
   * Il rougit sur la version qui ne testait que `40P01` et `P2034` : l'erreur
   * remontait alors en `PrismaClientKnownRequestError` de code `P2010`.
   */
  it("rejoue sur interblocage reel et conclut sans erreur brute", async () => {
    const a = await creerVarianteEnStock(client, { quantitePhysique: 1 });
    const b = await creerVarianteEnStock(client, { quantitePhysique: 1 });
    const ordonnees = [a.varianteId, b.varianteId].sort();
    const petite = ordonnees[0]!;
    const grande = ordonnees[1]!;
    const commandeService = await creerCommande(client);
    const commandeAdverse = await creerCommande(client);

    const adversaire = (async () => {
      const connexion = await pool.connect();
      try {
        await connexion.query("BEGIN");
        await connexion.query(SQL_RESERVER, [grande, commandeAdverse, 1, "30"]);
        // Laisse au service le temps de prendre le verrou oppose : sans cette
        // pause, l'une des deux transactions finit avant que l'autre commence
        // et aucun cycle ne se forme.
        await new Promise((resoudre) => setTimeout(resoudre, 400));
        await connexion.query(SQL_RESERVER, [petite, commandeAdverse, 1, "30"]);
        await connexion.query("COMMIT");
      } catch {
        await connexion.query("ROLLBACK").catch(() => undefined);
      } finally {
        connexion.release();
      }
    })();

    await new Promise((resoudre) => setTimeout(resoudre, 100));

    const issue = await reserverPanier(
      [
        { varianteId: grande, quantite: 1 },
        { varianteId: petite, quantite: 1 },
      ],
      commandeService,
    );
    await adversaire;

    // Un resultat metier, quel qu'il soit : le service a conclu au lieu de
    // laisser fuir un `P2010`. Les deux issues sont legitimes selon qui gagne
    // la course, seule l'erreur brute ne l'est pas.
    expect(["SERVI", "REFUSE"]).toContain(issue.statut);

    // L'invariant tient quoi qu'il arrive, sur les deux pieces.
    for (const varianteId of [petite, grande]) {
      const etat = await lireEtat(varianteId);
      expect(etat.reservee).toBeLessThanOrEqual(etat.physique);
      expect(etat.lignes).toBeLessThanOrEqual(1);
    }
  });

  /**
   * La garde locale, en attendant le socle Zod de LS-71. Une quantite invalide
   * doit etre refusee AVANT d'atteindre PostgreSQL, qui la rendrait en erreur
   * brute donc en page d'erreur serveur.
   */
  it.each([0, -1, 1.5])(
    "refuse une quantite invalide, %s",
    async (quantite) => {
      const variante = await creerVarianteEnStock(client, {
        quantitePhysique: 1,
      });
      const commandeId = await creerCommande(client);

      await expect(
        reserverPanier(
          [{ varianteId: variante.varianteId, quantite }],
          commandeId,
        ),
      ).rejects.toBeInstanceOf(TypeError);

      expect((await lireEtat(variante.varianteId)).reservee).toBe(0);
    },
  );
});
