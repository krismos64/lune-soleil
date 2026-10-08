/**
 * L'état du stock du tableau de bord, LS-228 critère 5.
 *
 * MESURÉ PAR DIFFÉRENCE, et c'est une contrainte de la base partagée : les
 * fichiers `.sequential` s'y succèdent sans l'isoler, et une assertion sur un
 * total global dépendrait de ce que les voisins ont laissé. Chaque cas lit
 * l'état, pose ses propres variantes, relit, et ne juge que l'écart.
 */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let lireEtatStock: typeof import("@/services/tableau-bord").lireEtatStock;
const produitsCrees: string[] = [];
const categoriesCreees: string[] = [];

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ lireEtatStock } = await import("@/services/tableau-bord"));
});

afterAll(async () => {
  if (produitsCrees.length > 0) {
    await client.query(
      "DELETE FROM variante WHERE produit_id = ANY($1::text[])",
      [produitsCrees],
    );
    await client.query("DELETE FROM produit WHERE id = ANY($1::text[])", [
      produitsCrees,
    ]);
    await client.query("DELETE FROM categorie WHERE id = ANY($1::text[])", [
      categoriesCreees,
    ]);
  }
  await client.end();
});

async function variante(
  options: Parameters<typeof creerVarianteEnStock>[1],
  reservees = 0,
) {
  const contexte = await creerVarianteEnStock(client, options);
  produitsCrees.push(contexte.produitId);
  categoriesCreees.push(contexte.categorieId);
  if (reservees > 0) {
    await client.query(
      "UPDATE variante SET quantite_reservee = $2 WHERE id = $1",
      [contexte.varianteId, reservees],
    );
  }
  return contexte;
}

describe("lireEtatStock, LS-228", () => {
  it("additionne physiques et réservées, et borne le disponible variante par variante", async () => {
    const avant = await lireEtatStock();

    await variante({ quantitePhysique: 3 }, 1);
    // Vente web suspendue : la pièce reste disponible pour l'atelier,
    // invariant 6.
    await variante({ quantitePhysique: 2, venteWebActivee: false });

    const apres = await lireEtatStock();

    expect(apres.variantes - avant.variantes).toBe(2);
    expect(apres.physiques - avant.physiques).toBe(5);
    expect(apres.reservees - avant.reservees).toBe(1);
    expect(apres.disponibles - avant.disponibles).toBe(4);
  });

  it("ignore les variantes archivées et celles d'un produit retiré de l'espace", async () => {
    const avant = await lireEtatStock();

    await variante({ quantitePhysique: 4, archivee: true });
    const retire = await variante({ quantitePhysique: 6 });
    await client.query(
      "UPDATE produit SET statut = 'ARCHIVE', archive_a = now(), retire_a = now() WHERE id = $1",
      [retire.produitId],
    );

    const apres = await lireEtatStock();

    expect(apres).toEqual(avant);
  });
});
