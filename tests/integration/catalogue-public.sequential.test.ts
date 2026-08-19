/**
 * Catalogue public, sur base reelle. LS-104.
 *
 * CES TESTS SONT ECRITS AVANT L'INTERFACE, la disponibilite touchant le stock.
 * Ils portent sur ce qu'aucun rendu ne montrerait :
 *
 *   - un BROUILLON ou un ARCHIVE qui fuirait dans le catalogue, c'est-a-dire du
 *     travail en cours et des prix non arretes exposes publiquement
 *   - la disponibilite calculee sur la seule quantite physique, qui promettrait
 *     un bijou deja reserve par un paiement en cours
 *   - le tri des nouveautes, invisible tant qu'on ne compare pas deux dates
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique
 * en SQL, lecon de LS-50. Le SQL prepare l'etat et constate, rien de plus.
 *
 * AUCUNE DONNEE DU PROTOTYPE, interdit du projet : ni Alba, ni Eclipse, ni les
 * prix de la demonstration. Les noms sont neutres et inventes ici.
 */
import { randomUUID } from "node:crypto";

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
  await client.query("TRUNCATE produit, categorie, media CASCADE");
});

type OptionsProduit = {
  statut?: "BROUILLON" | "ACTIF" | "ARCHIVE";
  publieA?: Date | null;
  quantitePhysique?: number;
  quantiteReservee?: number;
  venteWebActivee?: boolean;
  varianteArchivee?: boolean;
  prixCentimes?: number;
  avecMedia?: boolean;
  categorieId?: string;
};

/** Cree une categorie et rend son identifiant. */
async function creerCategorie(nom: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
     VALUES ($1, $2, $3, (SELECT coalesce(max(ordre), 0) + 1 FROM categorie), now())`,
    [id, nom, nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")],
  );
  return id;
}

/**
 * Cree un produit avec une variante, et rend son identifiant.
 *
 * Les valeurs par defaut decrivent le cas NOMINAL, un produit publie et
 * vendable : chaque test ne surcharge que ce qu'il exerce, ce qui rend visible
 * en une ligne ce qu'il teste vraiment.
 */
async function creerProduit(
  nom: string,
  options: OptionsProduit = {},
): Promise<string> {
  const {
    statut = "ACTIF",
    publieA = new Date(),
    quantitePhysique = 3,
    quantiteReservee = 0,
    venteWebActivee = true,
    varianteArchivee = false,
    prixCentimes = 4900,
    avecMedia = false,
    categorieId,
  } = options;

  const idCategorie = categorieId ?? (await creerCategorie(`Cat ${nom}`));
  const produitId = randomUUID();
  const suffixe = produitId.slice(0, 8);

  await client.query(
    `INSERT INTO produit (id, categorie_id, nom, slug, statut, publie_a, cree_a, modifie_a)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
    [produitId, idCategorie, nom, `produit-${suffixe}`, statut, publieA],
  );

  await client.query(
    `INSERT INTO variante (
       id, produit_id, reference, libelle, prix_centimes,
       quantite_physique, quantite_reservee, vente_web_activee, archivee_a, cree_a
     )
     VALUES ($1, $2, $3, 'Déclinaison', $4, $5, $6, $7, $8, now())`,
    [
      randomUUID(),
      produitId,
      `REF-${suffixe.toUpperCase()}`,
      prixCentimes,
      quantitePhysique,
      quantiteReservee,
      venteWebActivee,
      varianteArchivee ? new Date() : null,
    ],
  );

  if (avecMedia) {
    await client.query(
      `INSERT INTO media (id, produit_id, chemin, texte_alternatif, ordre, statut_traitement, cree_a)
       VALUES ($1, $2, $3, 'Vue de face', 1, 'TRAITE', now())`,
      [randomUUID(), produitId, `produits/${produitId}/`],
    );
  }

  return produitId;
}

describe("ce qui sort du catalogue public", () => {
  it("rend un produit actif avec son prix et sa categorie", async () => {
    await creerProduit("Bague simple", { prixCentimes: 3200 });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits).toHaveLength(1);
    expect(produits[0]).toMatchObject({
      nom: "Bague simple",
      prixCentimes: 3200,
      disponibilite: "EN_STOCK",
    });
  });

  /*
   * LE TEST QUI COMPTE LE PLUS DE CE FICHIER. Un brouillon porte un travail en
   * cours et des prix non arretes : le laisser fuir publierait ce que
   * l'exploitante n'a pas decide de publier.
   */
  it("ne rend jamais un produit BROUILLON ni ARCHIVE", async () => {
    await creerProduit("Brouillon en cours", { statut: "BROUILLON" });
    await creerProduit("Piece retiree", { statut: "ARCHIVE" });
    await creerProduit("Piece en vente");

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits.map((p) => p.nom)).toEqual(["Piece en vente"]);
  });

  it("ne rend pas un produit dont la seule variante est archivee", async () => {
    await creerProduit("Sans declinaison vivante", { varianteArchivee: true });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits).toEqual([]);
  });

  /*
   * LA VENTE WEB DESACTIVEE DONNE « EPUISE », ELLE NE FAIT PAS DISPARAITRE.
   *
   * LA PREMIERE VERSION DE CE TEST ENTERINAIT L'INVERSE, et la revue de LS-104 a
   * releve l'ecart : la table des etats de `frontend-design.md` donne « vente web
   * desactivee » comme condition de l'etat `Epuise`, au meme titre que la
   * quantite nulle, jamais comme cause de disparition.
   *
   * L'ENJEU N'EST PAS COSMETIQUE. Une piece partie sur un marche sortait du
   * catalogue, perdait son adresse publique et son referencement, et revenait
   * plus tard sous une URL que plus personne n'avait en favori. C'est aussi ce
   * que dit l'invariant 6 : suspendre la vente web et retirer du catalogue sont
   * deux gestes distincts.
   */
  it("annonce EPUISE pour un produit dont la vente web est desactivee", async () => {
    await creerProduit("Reserve au marche", {
      venteWebActivee: false,
      // Le stock PHYSIQUE reste plein : c'est bien la vente web qui decide.
      quantitePhysique: 5,
    });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits).toHaveLength(1);
    expect(produits[0]).toMatchObject({
      nom: "Reserve au marche",
      disponibilite: "EPUISE",
    });
  });

  /*
   * DEUX VARIANTES, UNE SEULE EN VENTE WEB : le produit reste vendable par
   * celle-la. Ce cas separe « la vente web contribue zero » de « le produit
   * disparait », que la premiere version confondait.
   */
  it("compte la seule variante en vente web quand l'autre en est retiree", async () => {
    const produitId = await creerProduit("Deux declinaisons", {
      quantitePhysique: 2,
      venteWebActivee: false,
    });

    await client.query(
      `INSERT INTO variante (
         id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a
       )
       VALUES ($1, $2, 'REF-WEB', 'En ligne', 5900, 1, 0, true, now())`,
      [randomUUID(), produitId],
    );

    const { produits } = await catalogue.lireCataloguePublic();

    // Une seule piece disponible, celle qui est en vente web.
    expect(produits[0]?.disponibilite).toBe("DERNIERE_PIECE");
  });

  it("rend le media principal, ordre 1, quand il existe", async () => {
    await creerProduit("Avec photo", { avecMedia: true });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits[0]?.mediaTexteAlternatif).toBe("Vue de face");
    expect(produits[0]?.mediaChemin).not.toBeNull();
  });

  it("rend un produit sans photo plutot que de le faire disparaitre", async () => {
    await creerProduit("Sans photo", { avecMedia: false });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits).toHaveLength(1);
    expect(produits[0]?.mediaChemin).toBeNull();
  });
});

describe("les trois etats de disponibilite", () => {
  it("annonce EN_STOCK au-dela d'une piece", async () => {
    await creerProduit("Plusieurs pieces", { quantitePhysique: 4 });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits[0]?.disponibilite).toBe("EN_STOCK");
  });

  it("annonce DERNIERE_PIECE a exactement une", async () => {
    await creerProduit("Piece unique", { quantitePhysique: 1 });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits[0]?.disponibilite).toBe("DERNIERE_PIECE");
  });

  it("annonce EPUISE a zero", async () => {
    await creerProduit("Plus rien", { quantitePhysique: 0 });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits[0]?.disponibilite).toBe("EPUISE");
  });

  /*
   * LA RESERVATION COMPTE, ET C'EST LE CAS QU'UN CALCUL NAIF RATE. Deux pieces
   * physiques dont une reservee par un paiement en cours : la boutique n'en a
   * qu'une a vendre. Afficher « en stock » promettrait un bijou deja engage.
   */
  it("deduit les reservations actives, deux pieces dont une reservee", async () => {
    await creerProduit("Une deja reservee", {
      quantitePhysique: 2,
      quantiteReservee: 1,
    });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits[0]?.disponibilite).toBe("DERNIERE_PIECE");
  });

  it("annonce EPUISE quand tout le stock est reserve", async () => {
    await creerProduit("Tout reserve", {
      quantitePhysique: 2,
      quantiteReservee: 2,
    });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits[0]?.disponibilite).toBe("EPUISE");
  });

  /*
   * AUCUNE QUANTITE EXACTE NE SORT DU SERVICE. La verifier ici plutot qu'a
   * l'ecran ferme le chemin a la racine : ce qui n'est pas rendu ne peut pas
   * fuiter dans le HTML.
   *
   * L'ASSERTION PORTE SUR LES CLES, ET NON SUR LE CHIFFRE. Une premiere version
   * cherchait « 7 » dans le JSON rendu et echouait sur les UUID, qui en
   * contiennent : elle aurait aussi passe au vert pour une quantite de 3, ce qui
   * ne prouve rien. Ce qui compte est qu'aucun CHAMP ne porte une quantite,
   * quelle que soit sa valeur.
   */
  it("ne rend aucun champ de quantite", async () => {
    await creerProduit("Sept pieces", { quantitePhysique: 7 });

    const { produits } = await catalogue.lireCataloguePublic();
    const cles = Object.keys(produits[0] ?? {});

    expect(cles).not.toContain("quantitePhysique");
    expect(cles).not.toContain("quantiteDisponible");
    expect(cles).not.toContain("quantiteReservee");
    // Aucune cle ne porte le mot, quelle qu'en soit la forme.
    expect(cles.filter((cle) => /quantite/i.test(cle))).toEqual([]);
  });
});

describe("filtrage par categorie et tri", () => {
  it("filtre sur le slug de categorie", async () => {
    const bagues = await creerCategorie("Bagues");
    const colliers = await creerCategorie("Colliers");
    await creerProduit("Une bague", { categorieId: bagues });
    await creerProduit("Un collier", { categorieId: colliers });

    const { produits, categorieRetenue } =
      await catalogue.lireCataloguePublic("bagues");

    expect(produits.map((p) => p.nom)).toEqual(["Une bague"]);
    expect(categorieRetenue?.slug).toBe("bagues");
    // LE NOM REMONTE AVEC, et c'est ce qui permet a l'ecran de NOMMER la
    // categorie filtree, y compris quand elle est vide.
    expect(categorieRetenue?.nom).toBe("Bagues");
  });

  /*
   * UN SLUG INCONNU NE LEVE PAS. Une URL partagee apres qu'une categorie a ete
   * renommee doit montrer la boutique, pas une erreur : le visiteur n'a rien
   * fait de mal. C'est aussi ce qui evite d'en faire un moyen de deviner les
   * categories existantes par la difference entre deux reponses.
   */
  it("ignore un slug de categorie inconnu et rend tout", async () => {
    await creerProduit("Toujours visible");

    const { produits, categorieRetenue } = await catalogue.lireCataloguePublic(
      "categorie-qui-n-existe-pas",
    );

    expect(produits).toHaveLength(1);
    expect(categorieRetenue).toBeNull();
  });

  it("trie par publieA decroissant, la nouveaute en tete", async () => {
    await creerProduit("Ancienne", {
      publieA: new Date("2026-01-15T10:00:00Z"),
    });
    await creerProduit("Recente", {
      publieA: new Date("2026-08-01T10:00:00Z"),
    });
    await creerProduit("Intermediaire", {
      publieA: new Date("2026-05-01T10:00:00Z"),
    });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits.map((p) => p.nom)).toEqual([
      "Recente",
      "Intermediaire",
      "Ancienne",
    ]);
  });

  /*
   * LES CATEGORIES PROPOSEES SONT CELLES QUI PORTENT DU PUBLIE. Offrir un filtre
   * qui ne rend rien fabrique l'etat vide au lieu de l'eviter.
   */
  it("ne propose pas une categorie sans produit publie", async () => {
    const vide = await creerCategorie("Categorie vide");
    const pleine = await creerCategorie("Categorie pleine");
    await creerProduit("Un produit", { categorieId: pleine });
    await creerProduit("Un brouillon", {
      categorieId: vide,
      statut: "BROUILLON",
    });

    const { categories } = await catalogue.lireCataloguePublic();

    expect(categories.map((c) => c.nom)).toEqual(["Categorie pleine"]);
  });

  /*
   * LA BARRE DE FILTRES RESTE COMPLETE SOUS FILTRE, sans quoi on ne pourrait
   * plus changer de categorie qu'en editant l'URL a la main.
   */
  it("rend toutes les categories publiees meme sous filtre", async () => {
    const bagues = await creerCategorie("Bagues");
    const colliers = await creerCategorie("Colliers");
    await creerProduit("Une bague", { categorieId: bagues });
    await creerProduit("Un collier", { categorieId: colliers });

    const { categories } = await catalogue.lireCataloguePublic("bagues");

    expect(categories).toHaveLength(2);
  });

  /*
   * L'ETAT VIDE DEMANDE UNE CATEGORIE QUI EXISTE PUBLIQUEMENT, et la premiere
   * version de ce test l'ignorait : elle filtrait sur une categorie sans aucun
   * produit publie, donc absente de `listerCategoriesPubliees`, donc traitee
   * comme un slug inconnu et ignoree. Elle rendait le catalogue entier et
   * echouait, en accusant le code d'un defaut qui n'existait pas.
   *
   * L'ETAT VIDE REEL s'obtient donc autrement : une categorie qui porte du
   * publie, dont on epuise le contenu. Ici la seule piece de la categorie est
   * archivee, ce qui la retire du catalogue sans retirer la categorie du filtre.
   */
  it("rend une liste vide sans lever quand un filtre ne donne rien", async () => {
    const bagues = await creerCategorie("Bagues");
    // Deux produits dans la meme categorie : l'un la rend proposable au filtre,
    // l'autre est celui qu'on cherchera apres l'avoir rendu invendable.
    await creerProduit("Une bague vendable", { categorieId: bagues });
    const retiree = await creerProduit("Une bague retiree", {
      categorieId: bagues,
    });

    /*
     * LES DEUX PRODUITS SORTENT PAR L'ARCHIVAGE, seul geste qui retire du
     * catalogue depuis la correction de la vente web. Couper la vente web les y
     * laisserait, affiches « Epuise », ce qui est le comportement voulu mais ne
     * produit pas l'etat vide qu'on cherche ici.
     */
    await client.query(
      "UPDATE produit SET statut = 'ARCHIVE' WHERE id = $1 OR nom = 'Une bague vendable'",
      [retiree],
    );

    const { produits, categorieRetenue } =
      await catalogue.lireCataloguePublic("bagues");

    expect(produits).toEqual([]);
    // LE FILTRE RESTE RETENU malgre l'absence de resultat : l'ecran doit pouvoir
    // dire « aucun resultat dans Bagues » et proposer de l'effacer.
    expect(categorieRetenue?.slug).toBe("bagues");
    // LE NOM REMONTE AVEC, et c'est ce qui permet a l'ecran de NOMMER la
    // categorie filtree, y compris quand elle est vide.
    expect(categorieRetenue?.nom).toBe("Bagues");
  });
});

/**
 * Ce que l'accueil ajoute au catalogue, LS-122.
 *
 * L'ACCUEIL APPELLE LE MEME SERVICE que le catalogue : le filtrage des
 * BROUILLON et des ARCHIVE lui est donc acquis, teste plus haut. Ce bloc ne
 * reteste pas cela, il exerce ce qui est PROPRE a l'accueil : la coupe aux
 * quatre plus recents.
 *
 * LA COUPE VIT DANS LA PAGE ET NON DANS LE SERVICE. Ces tests verifient donc
 * l'invariant dont la page depend, « le service rend deja trie par date de
 * publication decroissante », plutot que de reproduire le `slice` : si ce tri
 * changeait un jour, la page prendrait quatre produits arbitraires sans que
 * rien ne rougisse.
 */
describe("ce dont l'accueil depend, LS-122", () => {
  it("rend les produits du plus recemment publie au plus ancien", async () => {
    const categorieId = await creerCategorie("Colliers accueil");

    await creerProduit("Publie il y a trois jours", {
      categorieId,
      publieA: new Date("2026-08-16T10:00:00Z"),
    });
    await creerProduit("Publie hier", {
      categorieId,
      publieA: new Date("2026-08-18T10:00:00Z"),
    });
    await creerProduit("Publie il y a une semaine", {
      categorieId,
      publieA: new Date("2026-08-12T10:00:00Z"),
    });

    const { produits } = await catalogue.lireCataloguePublic();

    expect(produits.map((p) => p.nom)).toEqual([
      "Publie hier",
      "Publie il y a trois jours",
      "Publie il y a une semaine",
    ]);
  });

  it("place un produit sans date de publication apres les autres", async () => {
    const categorieId = await creerCategorie("Bracelets accueil");

    await creerProduit("Sans date", { categorieId, publieA: null });
    await creerProduit("Avec date ancienne", {
      categorieId,
      publieA: new Date("2020-01-01T10:00:00Z"),
    });

    const { produits } = await catalogue.lireCataloguePublic();

    /*
     * `NULLS LAST` DANS LA REQUETE : un produit publie sans que `publie_a` soit
     * renseigne ne doit pas prendre la tete des nouveautes de l'accueil. Sans
     * cette clause PostgreSQL classe les NULL en premier sur un tri descendant.
     */
    expect(produits.map((p) => p.nom)).toEqual([
      "Avec date ancienne",
      "Sans date",
    ]);
  });

  it("rend plus de quatre produits, la coupe appartenant a l'accueil", async () => {
    const categorieId = await creerCategorie("Boucles accueil");

    for (let index = 0; index < 6; index += 1) {
      await creerProduit(`Piece ${index}`, {
        categorieId,
        publieA: new Date(Date.UTC(2026, 7, index + 1)),
      });
    }

    const { produits } = await catalogue.lireCataloguePublic();

    /*
     * LE SERVICE NE PLAFONNE RIEN, `frontend-design.md` l'interdit. L'accueil
     * coupe a quatre a l'affichage, le catalogue les montre tous : un `LIMIT`
     * pose ici casserait le catalogue en silence.
     */
    expect(produits).toHaveLength(6);
    expect(produits.slice(0, 4).map((p) => p.nom)).toEqual([
      "Piece 5",
      "Piece 4",
      "Piece 3",
      "Piece 2",
    ]);
  });
});
