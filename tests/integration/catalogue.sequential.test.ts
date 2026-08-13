/**
 * Catalogue, categories et creation de produit, sur base reelle. LS-99.
 *
 * CES TESTS SONT ECRITS AVANT LE SERVICE, et ils portent sur les deux endroits
 * ou la base peut dire non a du code qui a l'air juste :
 *
 *   C24  l'ordre d'affichage est unique, sous contrainte DIFFERABLE. Le
 *        reordonnancement echange des rangs, ce qu'une contrainte ordinaire
 *        rejetterait des la premiere mise a jour. Un code qui « marche » en
 *        deplacant une seule categorie casse des qu'on en permute deux.
 *   C26  une categorie portant un produit ne se supprime pas, RESTRICT. Le
 *        service doit rendre un refus explicite, jamais laisser remonter une
 *        violation de cle etrangere jusqu'a l'ecran.
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique
 * en SQL : lecon de LS-50, ou reproduire la mecanique avait laisse passer deux
 * defauts. Le SQL n'apparait ici que pour preparer un etat ou constater un
 * resultat.
 *
 * AUCUNE DONNEE DU PROTOTYPE. Les noms employes sont neutres et inventes pour
 * ces tests : ni Boucles, ni Colliers, ni Eclipse.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let catalogue: typeof import("@/services/catalogue");

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  catalogue = await import("@/services/catalogue");
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query("TRUNCATE produit, categorie CASCADE");
});

/** Rangs actuels, du premier au dernier, sous forme lisible. */
async function ordreActuel(): Promise<string[]> {
  const { rows } = await client.query(
    "SELECT nom FROM categorie ORDER BY ordre ASC",
  );
  return rows.map((r) => r.nom as string);
}

async function rangDe(nom: string): Promise<number> {
  const { rows } = await client.query(
    "SELECT ordre FROM categorie WHERE nom = $1",
    [nom],
  );
  return rows[0].ordre as number;
}

describe("creation de categorie", () => {
  it("cree une categorie avec son slug derive et le rang suivant", async () => {
    const premiere = await catalogue.creerCategorie({ nom: "Pierres claires" });
    const seconde = await catalogue.creerCategorie({ nom: "Métal brossé" });

    expect(premiere).toMatchObject({ slug: "pierres-claires", ordre: 1 });
    // LE RANG SUIVANT, ET NON 1 A NOUVEAU. Un rang recalcule a 1 heurterait
    // C24 des la deuxieme creation.
    expect(seconde).toMatchObject({ slug: "metal-brosse", ordre: 2 });
  });

  /**
   * LE PREMIER RANG EST 1 ET NON 0, C24. Un `count()` employe comme rang
   * donnerait 0 sur une base vide et heurterait `chk_categorie_ordre_positif`,
   * defaut qui ne se voit QUE sur la toute premiere creation.
   */
  it("attribue le rang 1 a la premiere categorie d'une base vide", async () => {
    const seule = await catalogue.creerCategorie({ nom: "Première" });
    expect(seule.ordre).toBe(1);
  });

  /**
   * LE RANG SUIVANT SE CALCULE SUR LE MAXIMUM, PAS SUR LE NOMBRE. Apres une
   * suppression au milieu, les deux divergent : trois categories aux rangs
   * 1, 2, 3, la deuxieme supprimee, un `count() + 1` rendrait 3, deja pris.
   */
  it("calcule le rang suivant sur le maximum et non sur le nombre", async () => {
    await catalogue.creerCategorie({ nom: "Une" });
    const deux = await catalogue.creerCategorie({ nom: "Deux" });
    await catalogue.creerCategorie({ nom: "Trois" });

    await catalogue.supprimerCategorie(deux.id);

    const quatre = await catalogue.creerCategorie({ nom: "Quatre" });
    expect(quatre.ordre).toBe(4);
  });

  it("refuse un slug deja pris, C3, sans laisser remonter l'erreur Prisma", async () => {
    await catalogue.creerCategorie({ nom: "Pierres claires" });

    // Meme slug engendre, nom different : c'est le cas realiste, pas le doublon
    // exact que l'interface previendrait deja.
    await expect(
      catalogue.creerCategorie({ nom: "PIERRES CLAIRES" }),
    ).rejects.toThrow(catalogue.SlugDejaPrisError);
  });

  it("refuse un nom vide avant d'atteindre la base", async () => {
    await expect(catalogue.creerCategorie({ nom: "   " })).rejects.toThrow();
    expect(await ordreActuel()).toEqual([]);
  });
});

describe("renommage de categorie", () => {
  it("change le nom et NE TOUCHE PAS au slug", async () => {
    const creee = await catalogue.creerCategorie({ nom: "Pierres claires" });

    await catalogue.renommerCategorie({ id: creee.id, nom: "Pierres pâles" });

    const { rows } = await client.query(
      "SELECT nom, slug FROM categorie WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].nom).toBe("Pierres pâles");
    // LE SLUG SURVIT AU RENOMMAGE. Le recalculer casserait tous les liens
    // entrants de la categorie, sans redirection pour les rattraper.
    expect(rows[0].slug).toBe("pierres-claires");
  });

  it("refuse un identifiant inconnu sans rien modifier", async () => {
    await catalogue.creerCategorie({ nom: "Une" });

    await expect(
      catalogue.renommerCategorie({
        id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        nom: "Autre",
      }),
    ).rejects.toThrow(catalogue.CategorieIntrouvableError);

    expect(await ordreActuel()).toEqual(["Une"]);
  });
});

describe("reordonnancement, C24 et contrainte differable", () => {
  /**
   * LE TEST CENTRAL DE LA STORY. Permuter deux rangs viole l'unicite entre les
   * deux ecritures : sans transaction ET sans contrainte differable, la
   * premiere mise a jour est rejetee.
   *
   * Rendre la contrainte non differable fait rougir ce test, ce qui a ete
   * verifie par mutation sur verifier-schema.sh.
   */
  it("permute deux categories voisines", async () => {
    const une = await catalogue.creerCategorie({ nom: "Une" });
    const deux = await catalogue.creerCategorie({ nom: "Deux" });

    await catalogue.reordonnerCategories([deux.id, une.id]);

    expect(await ordreActuel()).toEqual(["Deux", "Une"]);
    expect(await rangDe("Deux")).toBe(1);
    expect(await rangDe("Une")).toBe(2);
  });

  /**
   * L'INVERSION COMPLETE est le cas ou chaque rang entre en conflit avec un
   * autre pendant l'ecriture. Une implementation qui echapperait au probleme
   * par chance sur deux elements ne passe pas celui-ci.
   */
  it("inverse entierement une liste de quatre categories", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    const b = await catalogue.creerCategorie({ nom: "B" });
    const c = await catalogue.creerCategorie({ nom: "C" });
    const d = await catalogue.creerCategorie({ nom: "D" });

    await catalogue.reordonnerCategories([d.id, c.id, b.id, a.id]);

    expect(await ordreActuel()).toEqual(["D", "C", "B", "A"]);
    expect(await rangDe("D")).toBe(1);
    expect(await rangDe("A")).toBe(4);
  });

  /**
   * UNE LISTE INCOMPLETE EST REFUSEE. L'accepter reecrirait les rangs 1..n sur
   * un sous-ensemble, en collision avec les rangs des categories omises : la
   * contrainte leverait au COMMIT avec un message illisible. Le refus explicite
   * arrive avant, et il est verifiable.
   */
  it("refuse une liste qui n'est pas exhaustive", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    await catalogue.creerCategorie({ nom: "B" });

    await expect(catalogue.reordonnerCategories([a.id])).rejects.toThrow(
      catalogue.OrdreIncompletError,
    );

    // L'ETAT N'A PAS BOUGE, et c'est la moitie du critere : un refus qui
    // laisserait des rangs a demi ecrits serait pire que pas de refus du tout.
    expect(await ordreActuel()).toEqual(["A", "B"]);
    expect(await rangDe("A")).toBe(1);
    expect(await rangDe("B")).toBe(2);
  });

  it("refuse un identifiant inconnu et laisse l'ordre intact", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    const b = await catalogue.creerCategorie({ nom: "B" });

    await expect(
      catalogue.reordonnerCategories([
        a.id,
        "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      ]),
    ).rejects.toThrow();

    expect(await rangDe("A")).toBe(1);
    expect(await rangDe("B")).toBe(2);
    expect(b.ordre).toBe(2);
  });
});

describe("suppression de categorie, C26 et RESTRICT", () => {
  it("supprime une categorie vide", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    await catalogue.creerCategorie({ nom: "B" });

    await catalogue.supprimerCategorie(a.id);

    expect(await ordreActuel()).toEqual(["B"]);
  });

  /**
   * C26, LE REFUS QUI DOIT ETRE EXPLICITE. La cle etrangere en RESTRICT bloque
   * de toute facon : ce que ce test exige, c'est que le service TRADUISE ce
   * refus en une erreur nommee, avec le nombre de produits concernes, pour que
   * l'ecran l'explique au lieu d'afficher une violation de contrainte.
   */
  it("refuse de supprimer une categorie portant un produit, et dit combien", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    await catalogue.creerProduit({ nom: "Pièce une", categorieId: a.id });
    await catalogue.creerProduit({ nom: "Pièce deux", categorieId: a.id });

    await expect(catalogue.supprimerCategorie(a.id)).rejects.toMatchObject({
      name: "CategorieNonVideError",
      nombreProduits: 2,
    });

    // LA CATEGORIE EST TOUJOURS LA. Un refus qui aurait quand meme supprime,
    // ou supprime les produits en cascade, serait le defaut que C26 existe pour
    // interdire.
    expect(await ordreActuel()).toEqual(["A"]);
    const { rows } = await client.query("SELECT count(*)::int AS n FROM produit");
    expect(rows[0].n).toBe(2);
  });

  /**
   * UN PRODUIT ARCHIVE COMPTE TOUJOURS. Un filtre `archiveA IS NULL` glisse
   * dans le comptage ferait annoncer « categorie vide » avant que la cle
   * etrangere ne rejette la suppression : le service promettrait un succes que
   * la base refuse.
   */
  it("compte aussi les produits archives", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    const p = await catalogue.creerProduit({
      nom: "Pièce une",
      categorieId: a.id,
    });
    await client.query(
      "UPDATE produit SET statut = 'ARCHIVE', archive_a = now() WHERE id = $1",
      [p.id],
    );

    await expect(catalogue.supprimerCategorie(a.id)).rejects.toMatchObject({
      name: "CategorieNonVideError",
      nombreProduits: 1,
    });
  });

  it("refuse une categorie inconnue", async () => {
    await expect(
      catalogue.supprimerCategorie("3f2504e0-4f89-41d3-9a0c-0305e82c3301"),
    ).rejects.toThrow(catalogue.CategorieIntrouvableError);
  });
});

describe("creation de produit", () => {
  it("cree un produit en BROUILLON, rattache a sa categorie", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });

    const produit = await catalogue.creerProduit({
      nom: "Collier de l'aube",
      categorieId: a.id,
    });

    expect(produit).toMatchObject({
      slug: "collier-de-l-aube",
      categorieId: a.id,
    });

    const { rows } = await client.query(
      "SELECT statut, publie_a, archive_a FROM produit WHERE id = $1",
      [produit.id],
    );
    // BROUILLON, ET LES DEUX DATES NULLES. Un produit cree publie serait
    // visible sans variante ni media, ce que C1 et C7 interdisent.
    expect(rows[0].statut).toBe("BROUILLON");
    expect(rows[0].publie_a).toBeNull();
    expect(rows[0].archive_a).toBeNull();
  });

  /**
   * UNE CATEGORIE INEXISTANTE EST UN REFUS METIER, pas une panne. La cle
   * etrangere la rejette : le service doit la traduire, sinon l'ecran affiche
   * une erreur Prisma a l'administratrice.
   */
  it("refuse un rattachement a une categorie inexistante", async () => {
    await expect(
      catalogue.creerProduit({
        nom: "Collier",
        categorieId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      }),
    ).rejects.toThrow(catalogue.CategorieIntrouvableError);

    const { rows } = await client.query("SELECT count(*)::int AS n FROM produit");
    expect(rows[0].n).toBe(0);
  });

  it("refuse un slug de produit deja pris, C3", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    await catalogue.creerProduit({ nom: "Collier de l'aube", categorieId: a.id });

    await expect(
      catalogue.creerProduit({ nom: "COLLIER DE L'AUBE", categorieId: a.id }),
    ).rejects.toThrow(catalogue.SlugDejaPrisError);
  });
});

describe("lecture des categories", () => {
  it("rend les categories dans l'ordre de la boutique, avec leur compte de produits", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    const b = await catalogue.creerCategorie({ nom: "B" });
    await catalogue.creerProduit({ nom: "Pièce une", categorieId: b.id });

    await catalogue.reordonnerCategories([b.id, a.id]);

    const liste = await catalogue.listerCategories();

    // L'ORDRE VIENT DE `ordre`, jamais du nom ni de la date de creation.
    expect(liste.map((c) => c.nom)).toEqual(["B", "A"]);
    // LE COMPTE SERT L'ECRAN, qui doit expliquer pourquoi une suppression est
    // refusee AVANT que l'administratrice ne la tente.
    expect(liste).toHaveLength(2);
    expect(liste[0]?.nombreProduits).toBe(1);
    expect(liste[1]?.nombreProduits).toBe(0);
  });

  it("rend une liste vide sur une base sans categorie", async () => {
    expect(await catalogue.listerCategories()).toEqual([]);
  });
});
