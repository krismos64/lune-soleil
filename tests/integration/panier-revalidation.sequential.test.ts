/**
 * Revalidation du panier sur base reelle, LS-114.
 *
 * CES TESTS SONT ECRITS AVANT L'INTERFACE. Ce qu'ils portent est invisible a
 * l'ecran tant qu'on ne fabrique pas l'ecart : un prix qui bouge entre l'ajout
 * et l'affichage, une piece archivee pendant que le panier dort, une quantite
 * devenue indisponible.
 *
 * ILS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique en
 * SQL, lecon de LS-50. Le SQL prepare l'etat et constate, rien de plus.
 *
 * LE PANIER N'ECRIT RIEN. Aucun test ne verifie d'ecriture, il n'y en a pas :
 * la reservation appartient a LS-117.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let panier: typeof import("@/services/panier");

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  panier = await import("@/services/panier");
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query("TRUNCATE produit, categorie, media CASCADE");
});

type OptionsVariante = {
  statutProduit?: "BROUILLON" | "ACTIF" | "ARCHIVE";
  prixCentimes?: number;
  quantitePhysique?: number;
  quantiteReservee?: number;
  venteWebActivee?: boolean;
  varianteArchivee?: boolean;
};

/** Cree un produit d'une variante et rend l'identifiant de la VARIANTE. */
async function creerVariante(
  nom: string,
  options: OptionsVariante = {},
): Promise<string> {
  const {
    statutProduit = "ACTIF",
    prixCentimes = 4900,
    quantitePhysique = 3,
    quantiteReservee = 0,
    venteWebActivee = true,
    varianteArchivee = false,
  } = options;

  const categorieId = randomUUID();
  await client.query(
    `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
     VALUES ($1, $2, $3, (SELECT coalesce(max(ordre), 0) + 1 FROM categorie), now())`,
    [categorieId, `Cat ${nom}`, `cat-${categorieId.slice(0, 8)}`],
  );

  const produitId = randomUUID();
  const varianteId = randomUUID();
  const suffixe = produitId.slice(0, 8);

  await client.query(
    `INSERT INTO produit (id, categorie_id, nom, slug, statut, publie_a, cree_a, modifie_a)
     VALUES ($1, $2, $3, $4, $5, now(), now(), now())`,
    [produitId, categorieId, nom, `produit-${suffixe}`, statutProduit],
  );

  await client.query(
    `INSERT INTO variante (
       id, produit_id, reference, libelle, prix_centimes,
       quantite_physique, quantite_reservee, vente_web_activee, archivee_a, cree_a
     )
     VALUES ($1, $2, $3, 'Déclinaison', $4, $5, $6, $7, $8, now())`,
    [
      varianteId,
      produitId,
      `REF-${suffixe.toUpperCase()}`,
      prixCentimes,
      quantitePhysique,
      quantiteReservee,
      venteWebActivee,
      varianteArchivee ? new Date() : null,
    ],
  );

  return varianteId;
}

describe("le prix vient de la base, jamais du cookie", () => {
  it("recalcule le total au prix actuel", async () => {
    const varianteId = await creerVariante("Collier", { prixCentimes: 3200 });

    const resultat = await panier.revalider([{ varianteId, quantite: 2 }]);

    expect(resultat.lignes[0]?.prixUnitaireCentimes).toBe(3200);
    expect(resultat.totalArticlesCentimes).toBe(6400);
    expect(resultat.nombreArticles).toBe(2);
  });

  it("suit une hausse de prix survenue apres l'ajout", async () => {
    const varianteId = await creerVariante("Bracelet", { prixCentimes: 2100 });

    // Le visiteur a vu 2100 a l'ajout, l'administratrice corrige a 2600.
    await client.query(
      "UPDATE variante SET prix_centimes = 2600 WHERE id = $1",
      [varianteId],
    );

    const resultat = await panier.revalider(
      [{ varianteId, quantite: 1 }],
      2100,
    );

    expect(resultat.totalArticlesCentimes).toBe(2600);
    /*
     * `aChange` DECLENCHE LA CONFIRMATION du parcours 1. Sans ce drapeau, le
     * visiteur paierait un montant qu'il n'a jamais vu affiche.
     */
    expect(resultat.aChange).toBe(true);
  });

  it("ne signale aucun changement quand le total presente correspond", async () => {
    const varianteId = await creerVariante("Boucles", { prixCentimes: 2400 });

    const resultat = await panier.revalider(
      [{ varianteId, quantite: 2 }],
      4800,
    );

    expect(resultat.aChange).toBe(false);
  });

  it("calcule en centimes entiers, sans flottant", async () => {
    const varianteId = await creerVariante("Piece", { prixCentimes: 3333 });

    const resultat = await panier.revalider([{ varianteId, quantite: 3 }]);

    // Invariant 1 : 33,33 EUR x 3 vaut exactement 99,99 EUR, pas 99,98999...
    expect(resultat.totalArticlesCentimes).toBe(9999);
    expect(Number.isInteger(resultat.totalArticlesCentimes)).toBe(true);
  });
});

describe("lignes qui ne peuvent plus etre commandees, critere 7", () => {
  it("signale une variante archivee sans vider le panier", async () => {
    const vivante = await creerVariante("Vivante", { prixCentimes: 1000 });
    const archivee = await creerVariante("Archivee", {
      prixCentimes: 2000,
      varianteArchivee: true,
    });

    const resultat = await panier.revalider([
      { varianteId: vivante, quantite: 1 },
      { varianteId: archivee, quantite: 1 },
    ]);

    /*
     * LES DEUX LIGNES SONT RENDUES. Omettre l'archivee la ferait disparaitre du
     * panier sans explication, defaut que le critere 7 previent explicitement.
     */
    expect(resultat.lignes).toHaveLength(2);
    expect(resultat.lignes[1]?.motif).toBe("PLUS_VENDABLE");
    // Seule la ligne vivante compte dans le total.
    expect(resultat.totalArticlesCentimes).toBe(1000);
  });

  it("signale un produit repasse en brouillon", async () => {
    const varianteId = await creerVariante("Retiree", {
      statutProduit: "BROUILLON",
    });

    const resultat = await panier.revalider([{ varianteId, quantite: 1 }]);

    expect(resultat.lignes[0]?.motif).toBe("PLUS_VENDABLE");
    expect(resultat.aChange).toBe(true);
  });

  it("annonce EPUISE et non PLUS_VENDABLE sur une piece deja reservee", async () => {
    const varianteId = await creerVariante("Derniere", {
      quantitePhysique: 1,
      quantiteReservee: 1,
    });

    const resultat = await panier.revalider([{ varianteId, quantite: 1 }]);

    /*
     * LA DISTINCTION COMPTE POUR LE VISITEUR : « épuisé » laisse espérer un
     * retour, « retiré de la vente » non. Une piece reservee par un paiement en
     * cours est epuisee, pas retiree.
     */
    expect(resultat.lignes[0]?.motif).toBe("EPUISE");
  });

  it("ramene la quantite au disponible plutot que de rejeter la ligne", async () => {
    const varianteId = await creerVariante("Deux restants", {
      prixCentimes: 1500,
      quantitePhysique: 2,
    });

    const resultat = await panier.revalider([{ varianteId, quantite: 5 }]);

    expect(resultat.lignes[0]?.quantite).toBe(2);
    expect(resultat.lignes[0]?.quantiteDemandee).toBe(5);
    expect(resultat.lignes[0]?.motif).toBe("QUANTITE_REDUITE");
    expect(resultat.totalArticlesCentimes).toBe(3000);
  });

  it("signale une variante introuvable sans lever", async () => {
    const resultat = await panier.revalider([
      { varianteId: randomUUID(), quantite: 1 },
    ]);

    expect(resultat.lignes[0]?.motif).toBe("VARIANTE_INTROUVABLE");
    expect(resultat.totalArticlesCentimes).toBe(0);
  });
});

describe("cas limites", () => {
  it("rend un panier vide sans interroger la base", async () => {
    const resultat = await panier.revalider([]);

    expect(resultat.lignes).toEqual([]);
    expect(resultat.totalArticlesCentimes).toBe(0);
    expect(resultat.aChange).toBe(false);
  });

  it("compte les articles sans requete", () => {
    expect(
      panier.compterArticles([
        { varianteId: randomUUID(), quantite: 2 },
        { varianteId: randomUUID(), quantite: 3 },
      ]),
    ).toBe(5);
  });
});

describe("ce que l'ecran rend d'une ligne incommandable, LS-114", () => {
  it("ramene la quantite a zero, ce qui retire le selecteur", async () => {
    const varianteId = await creerVariante("Epuisee", {
      quantitePhysique: 1,
      quantiteReservee: 1,
    });

    const resultat = await panier.revalider([{ varianteId, quantite: 1 }]);

    /*
     * `quantite: 0` COMMANDE LE RENDU DE L'ECRAN. Le selecteur de quantite ne
     * propose que 1 a 20 : sur une ligne a zero, React retombait sur la
     * premiere option et AFFICHAIT « 1 » sous le message « Cette piece est
     * epuisee ». Un visiteur pouvait croire qu'un exemplaire lui etait reserve.
     *
     * L'ecran affiche desormais « Aucun exemplaire » quand cette valeur est
     * nulle. Ce test verrouille la DONNEE dont depend ce choix.
     *
     * LE RENDU LUI-MEME N'EST PAS COUVERT PAR UN TEST DE BOUT EN BOUT, et c'est
     * assume : le cas ne s'atteint pas par le parcours normal, le bouton
     * d'ajout etant desactive sur une piece epuisee. Injecter un cookie signe
     * dans Playwright n'a pas abouti, le serveur `next start` le rejetant alors
     * que le meme cookie est accepte en developpement, cause non trouvee. Le
     * comportement a ete verifie a la main sur le rendu reel.
     */
    expect(resultat.lignes[0]?.quantite).toBe(0);
    expect(resultat.lignes[0]?.motif).toBe("EPUISE");
    expect(resultat.totalArticlesCentimes).toBe(0);
  });
});
