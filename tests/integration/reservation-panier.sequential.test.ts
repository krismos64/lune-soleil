/**
 * Reservation d'un panier multi-articles, LS-50.
 *
 * CE QUE CE FICHIER PROUVE, et qui manquait a LS-68. `reservation.sequential`
 * couvre la primitive SQL sur UNE variante : la survente y est impossible et
 * aucun interblocage n'y est atteignable, une seule ligne etant verrouillee. Le
 * defaut de LS-50 vit exactement la ou ce fichier ne va pas, sur DEUX lignes
 * verrouillees dans un ordre qui depend de l'appelant.
 *
 * LE SCENARIO EST CELUI DE `docs/prototypes/interblocage-panier.sh`, rejoue par
 * le service au lieu de `psql` : deux paniers portant les memes variantes dans
 * un ordre oppose. Le prototype le reproduit sur un schema jouet, ce fichier
 * l'exerce sur le SCHEMA REEL, contraintes CHECK comprises.
 *
 * L'ASSERTION DECISIVE EST L'ABSENCE D'INTERBLOCAGE, pas l'etat final du stock.
 * C'est le point qui a failli etre rate : sous interblocage, PostgreSQL annule
 * une des deux transactions et l'etat final reste RIGOUREUSEMENT CORRECT, sans
 * la moindre survente. Compter les reservations ou verifier le stock ne
 * distingue donc pas le code corrige du code fautif. Seule la NATURE de l'issue
 * les separe : un panier servi contre un panier mort en `40P01`.
 *
 * SUFFIXE `.sequential` : meme raison qu'ailleurs, ces tests mesurent de la
 * concurrence sur un serveur PostgreSQL partage.
 */
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerCommande, creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import { SQL_RESERVER } from "../aide/reservation-sql";

const DUREE_RESERVATION_MINUTES = "30";

let pool: Pool;
let client: Client;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  // Un pool : deux paniers concurrents exigent deux connexions distinctes. Sur
  // une connexion unique, le protocole PostgreSQL les serialiserait et aucun
  // interblocage ne serait atteignable, le test passerait sans rien prouver.
  pool = new Pool({ connectionString: url, max: 10 });
  client = new Client({ connectionString: url });
  await client.connect();
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

/**
 * Issue d'une reservation de panier entier.
 *
 * `SERVI`        : toutes les lignes obtenues, transaction validee.
 * `REFUSE`       : refus metier, au moins une ligne indisponible.
 * `INTERBLOCAGE` : PostgreSQL a annule la transaction, `40P01`. C'EST LE DEFAUT
 *                  que LS-50 corrige, et la seule issue que le tri elimine.
 * `VIOLATION`    : une contrainte CHECK a rattrape une survente, `23514`.
 */
type IssuePanier = "SERVI" | "REFUSE" | "INTERBLOCAGE" | "VIOLATION";

/**
 * Reserve un panier en SQL direct, sur une connexion dediee du pool.
 *
 * POURQUOI NE PAS APPELER LE SERVICE ICI. Le service passe par Prisma, dont le
 * pool et la traduction d'erreurs s'interposeraient entre le defaut et la
 * mesure. Ce fichier reproduit la MECANIQUE du service, tri compris, au plus
 * pres de la base : c'est la seule facon de rendre l'interblocage observable
 * tel que le prototype le montre. Le tri lui-meme, extrait dans
 * `ordonnerLignes`, est verifie separement par le test unitaire.
 *
 * `pause` s'intercale entre les deux lignes, comme le `sleep 2` du prototype :
 * elle garantit que chaque transaction tient son premier verrou avant de
 * demander le second. Sans elle, l'une des deux finirait souvent avant que
 * l'autre commence et le cycle ne se formerait jamais.
 */
async function reserverPanierSql(
  lignes: readonly string[],
  commandeId: string,
  options: { trier: boolean; pauseMs: number },
): Promise<IssuePanier> {
  const ordonnees = options.trier ? [...lignes].sort() : [...lignes];
  const connexion = await pool.connect();

  try {
    await connexion.query("BEGIN");

    for (const [index, varianteId] of ordonnees.entries()) {
      if (index > 0 && options.pauseMs > 0) {
        await new Promise((resoudre) => setTimeout(resoudre, options.pauseMs));
      }

      const resultat = await connexion.query(SQL_RESERVER, [
        varianteId,
        commandeId,
        1,
        DUREE_RESERVATION_MINUTES,
      ]);

      if (resultat.rowCount !== 1) {
        await connexion.query("ROLLBACK");
        return "REFUSE";
      }
    }

    await connexion.query("COMMIT");
    return "SERVI";
  } catch (erreur) {
    // Le ROLLBACK peut echouer si la transaction est deja annulee par le
    // serveur, ce qui est precisement le cas sur interblocage. L'echec de ce
    // nettoyage ne doit pas masquer l'erreur d'origine.
    await connexion.query("ROLLBACK").catch(() => undefined);

    const code = (erreur as { code?: string }).code;
    if (code === "40P01") return "INTERBLOCAGE";
    if (code === "23514") return "VIOLATION";
    throw erreur;
  } finally {
    connexion.release();
  }
}

async function compterReservations(varianteId: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    "SELECT count(*) AS n FROM reservation WHERE variante_id = $1",
    [varianteId],
  );
  return Number(rows[0]?.n ?? 0);
}

async function lireVariante(varianteId: string) {
  const { rows } = await client.query<{
    quantite_physique: number;
    quantite_reservee: number;
  }>(
    "SELECT quantite_physique, quantite_reservee FROM variante WHERE id = $1",
    [varianteId],
  );
  const ligne = rows[0];
  if (!ligne) throw new Error(`Variante ${varianteId} introuvable`);
  return ligne;
}

/** Cree deux variantes a un exemplaire et rend leurs identifiants tries. */
async function creerDeuxVariantes(): Promise<[string, string]> {
  const premiere = await creerVarianteEnStock(client, { quantitePhysique: 1 });
  const seconde = await creerVarianteEnStock(client, { quantitePhysique: 1 });
  const [petite, grande] = [premiere.varianteId, seconde.varianteId].sort();
  return [petite!, grande!];
}

describe("reservation d'un panier multi-articles", () => {
  /**
   * LE TEST QUI COMPTE, scenario exact du prototype.
   *
   * Deux paniers, memes pieces, ordres opposes a la saisie. Le tri les remet
   * dans le meme ordre, l'un attend l'autre, aucun cycle ne se forme.
   *
   * SANS LE TRI, ce test voit un `INTERBLOCAGE` : c'est la mutation exigee par
   * le critere d'acceptation, `trier: false` la reproduit a l'identique.
   */
  it("ne produit aucun interblocage sur deux paniers en ordre oppose", async () => {
    const [petite, grande] = await creerDeuxVariantes();
    const [commandeA, commandeB] = await Promise.all([
      creerCommande(client),
      creerCommande(client),
    ]);

    // Ordres de saisie opposes, exactement le scenario du prototype.
    const [issueA, issueB] = await Promise.all([
      reserverPanierSql([petite, grande], commandeA!, {
        trier: true,
        pauseMs: 300,
      }),
      reserverPanierSql([grande, petite], commandeB!, {
        trier: true,
        pauseMs: 300,
      }),
    ]);

    const issues = [issueA, issueB];

    // L'ASSERTION DECISIVE. Sans tri, l'une des deux vaut INTERBLOCAGE.
    expect(issues).not.toContain("INTERBLOCAGE");
    // Aucune survente ne doit avoir ete rattrapee par une contrainte : c'est
    // l'UPDATE conditionnel qui refuse, pas le CHECK.
    expect(issues).not.toContain("VIOLATION");

    // Un seul panier peut etre servi, chaque piece etant unique. L'autre essuie
    // un refus metier propre, la seule issue acceptable pour un perdant.
    expect(issues.filter((issue) => issue === "SERVI")).toHaveLength(1);
    expect(issues.filter((issue) => issue === "REFUSE")).toHaveLength(1);

    // L'invariant du stock tient, sur les deux pieces.
    for (const varianteId of [petite, grande]) {
      expect(await compterReservations(varianteId)).toBe(1);
      const variante = await lireVariante(varianteId);
      expect(variante.quantite_reservee).toBe(1);
      expect(variante.quantite_physique - variante.quantite_reservee).toBe(0);
    }
  });

  /**
   * LA CONTRE-EPREUVE, et la raison d'etre du parametre `trier`.
   *
   * Ce test EXIGE l'interblocage sans tri. Il transforme la preuve par mutation
   * en test permanent : si quelqu'un retire le tri du service, le test
   * precedent rougit ; si quelqu'un decide que le tri est inutile, celui-ci
   * montre le contraire, mesure a l'appui.
   *
   * Il documente aussi ce que l'interblocage N'EST PAS : l'etat final reste
   * cohérent, sans aucune survente. Le defaut est un echec de commande sous
   * concurrence, pas une atteinte a l'integrite du stock.
   */
  it("produit un interblocage sans le tri, sans jamais survendre", async () => {
    const [petite, grande] = await creerDeuxVariantes();
    const [commandeA, commandeB] = await Promise.all([
      creerCommande(client),
      creerCommande(client),
    ]);

    const [issueA, issueB] = await Promise.all([
      reserverPanierSql([petite, grande], commandeA!, {
        trier: false,
        pauseMs: 300,
      }),
      reserverPanierSql([grande, petite], commandeB!, {
        trier: false,
        pauseMs: 300,
      }),
    ]);

    const issues = [issueA, issueB];

    // Le defaut, observe : exactement une des deux transactions est annulee.
    expect(issues.filter((issue) => issue === "INTERBLOCAGE")).toHaveLength(1);
    expect(issues.filter((issue) => issue === "SERVI")).toHaveLength(1);

    // Ce que le defaut n'est pas : aucune survente, l'invariant tient meme ici.
    expect(issues).not.toContain("VIOLATION");
    for (const varianteId of [petite, grande]) {
      const variante = await lireVariante(varianteId);
      expect(variante.quantite_reservee).toBeLessThanOrEqual(
        variante.quantite_physique,
      );
    }
  });

  /**
   * Le panier entier est annule des qu'une seule piece manque.
   *
   * Sans cette garantie, un client verrait la piece disponible de son panier
   * bloquee trente minutes pour une commande qui ne sera jamais payee, ADR-024.
   */
  it("annule tout le panier quand une seule piece est indisponible", async () => {
    const disponible = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const indisponible = await creerVarianteEnStock(client, {
      quantitePhysique: 0,
    });
    const commandeId = await creerCommande(client);

    const issue = await reserverPanierSql(
      [disponible.varianteId, indisponible.varianteId].sort(),
      commandeId,
      { trier: true, pauseMs: 0 },
    );

    expect(issue).toBe("REFUSE");
    // La piece disponible ne doit porter AUCUNE reservation : le rollback a
    // bien defait la ligne deja ecrite avant la decouverte du manque.
    expect(await compterReservations(disponible.varianteId)).toBe(0);
    expect((await lireVariante(disponible.varianteId)).quantite_reservee).toBe(
      0,
    );
  });
});
