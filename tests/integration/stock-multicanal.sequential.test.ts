/**
 * Stock multicanal, sur base reelle. LS-106, parcours 2.
 *
 * CES TESTS SONT ECRITS AVANT LE SERVICE, exigence du plan directeur sur le
 * stock. Ils portent sur ce qu'aucun ecran ne montrerait :
 *
 *   - un MOUVEMENT FANTOME cree par une simple suspension de vente web, qui
 *     fausserait l'inventaire sans que rien ne le signale
 *   - une vente externe qui ecraserait la reservation d'un client en train de
 *     payer, la faille que le cahier des charges identifie nommement
 *   - une correction qui MODIFIERAIT la ligne d'origine au lieu d'ajouter un
 *     mouvement compensateur, regle S4
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique
 * en SQL, lecon de LS-50. Le SQL prepare l'etat et constate, rien de plus.
 *
 * AUCUNE DONNEE DU PROTOTYPE, interdit du projet. Noms neutres et inventes.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import { creerCommande, creerVarianteEnStock } from "../aide/donnees-test";

let client: Client;
let stock: typeof import("@/services/stock-multicanal");

/** Identifiant de l'administratrice qui agit dans ces tests, S9. */
let acteurId: string;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  stock = await import("@/services/stock-multicanal");
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE produit, categorie, mouvement_stock, reservation, commande, utilisateur, journal_audit CASCADE",
  );
});

/*
 * L'ACTRICE SE RECREE AVANT CHAQUE TEST, le `TRUNCATE` de `afterEach` vidant la
 * table `utilisateur`. La creer une seule fois en `beforeAll` laisserait une
 * cle etrangere morte des le deuxieme test.
 */
beforeEach(async () => {
  acteurId = await creerActrice();
});

/** Cree l'administratrice qui agit, S9 exigeant un acteur identifie. */
async function creerActrice(): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO utilisateur (id, email, email_verifie, role, cree_a)
     VALUES ($1, $2, true, 'ADMINISTRATRICE', now())`,
    [id, `admin-${id.slice(0, 8)}@example.invalid`],
  );
  return id;
}

/** Compte les mouvements de stock d'une variante. */
async function compterMouvements(varianteId: string): Promise<number> {
  const r = await client.query(
    `SELECT count(*)::int AS n FROM mouvement_stock WHERE variante_id = $1`,
    [varianteId],
  );
  return r.rows[0].n;
}

/** Lit les quantites d'une variante. */
async function lireQuantites(
  varianteId: string,
): Promise<{ physique: number; reservee: number; venteWeb: boolean }> {
  const r = await client.query(
    `SELECT quantite_physique, quantite_reservee, vente_web_activee
       FROM variante WHERE id = $1`,
    [varianteId],
  );
  return {
    physique: r.rows[0].quantite_physique,
    reservee: r.rows[0].quantite_reservee,
    venteWeb: r.rows[0].vente_web_activee,
  };
}

/** Pose une reservation active sur une variante, avec sa commande. */
async function poserReservation(
  varianteId: string,
  commandeId: string,
  quantite = 1,
): Promise<void> {
  await client.query(
    `UPDATE variante SET quantite_reservee = quantite_reservee + $2 WHERE id = $1`,
    [varianteId, quantite],
  );
  await client.query(
    `INSERT INTO reservation (id, variante_id, commande_id, quantite, expire_a, cree_a)
     VALUES (gen_random_uuid(), $1, $2, $3, now() + interval '30 minutes', now())`,
    [varianteId, commandeId, quantite],
  );
}

describe("suspendre la vente web ne touche pas au stock, invariant 6", () => {
  /*
   * LE TEST QUI PORTE L'INVARIANT 6, et le critere 2 de la story. Disponibilite
   * web et quantite physique sont deux notions distinctes : confondre les deux
   * creerait des mouvements fantomes qui fausseraient l'inventaire sans que
   * personne ne comprenne d'ou ils viennent.
   *
   * IL COMPTE LES MOUVEMENTS AVANT ET APRES, et non seulement apres : partir de
   * zero et constater zero ne distingue pas « aucun mouvement cree » de « la
   * fonction n'a rien fait du tout ».
   */
  it("ne cree aucun mouvement de stock a la suspension", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 5,
    });
    const avant = await compterMouvements(varianteId);

    await stock.suspendreVenteWeb({ varianteId, acteurId });

    expect(await compterMouvements(varianteId)).toBe(avant);
    const q = await lireQuantites(varianteId);
    expect(q.physique).toBe(5);
    expect(q.venteWeb).toBe(false);
  });

  /*
   * LA TRACE VA AU JOURNAL D'AUDIT, PAS AU JOURNAL DES MOUVEMENTS, et les deux
   * tests se lisent ensemble : le precedent prouve qu'aucune quantite ne bouge,
   * celui-ci que l'action est tout de meme tracee. Sans le second, « aucun
   * mouvement » pourrait se satisfaire d'une bascule qui ne laisse rien du tout,
   * ce que le parcours 2 refuse a son etape 1.
   */
  it("ecrit une entree au journal d'audit, jamais un mouvement de stock", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 5,
    });

    await stock.suspendreVenteWeb({ varianteId, acteurId });

    const audit = await client.query(
      `SELECT action, type_cible, id_cible, acteur_id, detail
         FROM journal_audit WHERE id_cible = $1`,
      [varianteId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      action: "SUSPENSION_VENTE_WEB",
      type_cible: "Variante",
      acteur_id: acteurId,
      detail: { venteWebActivee: false },
    });

    // Et la reactivation se distingue de la suspension dans le journal.
    await stock.reactiverVenteWeb({ varianteId, acteurId });
    const apres = await client.query(
      `SELECT action FROM journal_audit WHERE id_cible = $1 ORDER BY cree_a`,
      [varianteId],
    );
    expect(apres.rows.map((l: { action: string }) => l.action)).toEqual([
      "SUSPENSION_VENTE_WEB",
      "REACTIVATION_VENTE_WEB",
    ]);
  });

  it("ne cree aucun mouvement non plus a la reactivation", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 5,
      venteWebActivee: false,
    });
    const avant = await compterMouvements(varianteId);

    await stock.reactiverVenteWeb({ varianteId, acteurId });

    expect(await compterMouvements(varianteId)).toBe(avant);
    const q = await lireQuantites(varianteId);
    expect(q.physique).toBe(5);
    expect(q.venteWeb).toBe(true);
  });
});

describe("la vente externe, parcours 2", () => {
  it("decremente le physique, historise le mouvement et fige le prix", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 3,
    });

    await stock.enregistrerVenteExterne({
      varianteId,
      quantite: 1,
      prixUnitaireEuros: "42,00",
      canal: "Marché de Pau",
      acteurId,
    });

    const q = await lireQuantites(varianteId);
    expect(q.physique).toBe(2);
    // La reservation web n'est jamais touchee par une vente physique.
    expect(q.reservee).toBe(0);

    const r = await client.query(
      `SELECT type, quantite, canal, prix_unitaire_fige_centimes, origine, acteur_id
         FROM mouvement_stock WHERE variante_id = $1`,
      [varianteId],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      type: "VENTE_EXTERNE",
      canal: "Marché de Pau",
      prix_unitaire_fige_centimes: 4200,
      origine: "ADMIN",
      acteur_id: acteurId,
    });
  });

  /*
   * LA FAILLE QUE LE CAHIER DES CHARGES IDENTIFIE NOMMEMENT. Un client paie en
   * ligne pendant que la meme piece se vend sur un stand : sans cette garde, la
   * vente externe passerait et le client paierait une piece qui n'existe plus.
   *
   * LE REFUS N'ECRIT RIEN DU TOUT, ni mouvement ni decrementation : le parcours 2
   * exige « aucune ecriture », et un mouvement ecrit avant le refus laisserait
   * une trace d'une vente qui n'a pas eu lieu.
   */
  it("refuse la vente externe tant qu'une reservation active existe", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const commandeId = await creerCommande(client);
    await poserReservation(varianteId, commandeId, 1);

    const resultat = await stock.enregistrerVenteExterne({
      varianteId,
      quantite: 1,
      prixUnitaireEuros: "42,00",
      canal: "Marché de Pau",
      acteurId,
    });

    expect(resultat.refus).toBe("RESERVATION_ACTIVE");
    expect(await compterMouvements(varianteId)).toBe(0);
    const q = await lireQuantites(varianteId);
    expect(q.physique).toBe(1);
    expect(q.reservee).toBe(1);
  });

  it("refuse quand le stock physique est deja a zero", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 0,
    });

    const resultat = await stock.enregistrerVenteExterne({
      varianteId,
      quantite: 1,
      prixUnitaireEuros: "42,00",
      canal: "Marché de Pau",
      acteurId,
    });

    expect(resultat.refus).toBe("STOCK_INSUFFISANT");
    expect(await compterMouvements(varianteId)).toBe(0);
  });

  /*
   * UNE VENTE EXTERNE RESTE POSSIBLE SUR UNE VARIANTE HORS VENTE WEB, et c'est
   * meme le cas NOMINAL du parcours 2 : on suspend la vente web AVANT le marche,
   * puis on vend en main propre. Une garde sur `vente_web_activee` interdirait
   * exactement le scenario que la story existe pour servir.
   */
  it("autorise la vente externe sur une variante retiree de la vente web", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 2,
      venteWebActivee: false,
    });

    const resultat = await stock.enregistrerVenteExterne({
      varianteId,
      quantite: 1,
      prixUnitaireEuros: "39,00",
      canal: "Marché de Pau",
      acteurId,
    });

    expect(resultat.refus).toBeUndefined();
    expect((await lireQuantites(varianteId)).physique).toBe(1);
  });
});

describe("une correction ajoute, elle ne modifie jamais, regle S4", () => {
  /*
   * LE JOURNAL EST UN HISTORIQUE, PAS UN ETAT MODIFIABLE. Corriger en place
   * effacerait la trace d'une erreur, et le stock reconstruit depuis le journal
   * ne correspondrait plus au stock reel. Deux lignes racontent ce qui s'est
   * passe ; une ligne corrigee raconte une fiction.
   */
  it("compense une vente externe erronee par un mouvement inverse", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 3,
    });

    const vente = await stock.enregistrerVenteExterne({
      varianteId,
      quantite: 1,
      prixUnitaireEuros: "42,00",
      canal: "Marché de Pau",
      acteurId,
    });
    expect(vente.mouvementId).toBeDefined();

    await stock.corrigerMouvement({
      mouvementId: vente.mouvementId!,
      motif: "Saisie erronée, pièce non vendue",
      acteurId,
    });

    // LE MOUVEMENT D'ORIGINE EST INTACT, c'est tout l'enjeu de S4.
    const origine = await client.query(
      `SELECT type, quantite, prix_unitaire_fige_centimes
         FROM mouvement_stock WHERE id = $1`,
      [vente.mouvementId],
    );
    expect(origine.rows[0]).toMatchObject({
      type: "VENTE_EXTERNE",
      quantite: -1,
      prix_unitaire_fige_centimes: 4200,
    });

    // Et une SECONDE ligne porte la correction.
    expect(await compterMouvements(varianteId)).toBe(2);
    // Le stock revient a son etat d'avant la vente.
    expect((await lireQuantites(varianteId)).physique).toBe(3);
  });

  it("refuse de compenser deux fois le meme mouvement", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 3,
    });

    const vente = await stock.enregistrerVenteExterne({
      varianteId,
      quantite: 1,
      prixUnitaireEuros: "42,00",
      canal: "Marché de Pau",
      acteurId,
    });

    await stock.corrigerMouvement({
      mouvementId: vente.mouvementId!,
      motif: "Saisie erronée",
      acteurId,
    });

    const seconde = await stock.corrigerMouvement({
      mouvementId: vente.mouvementId!,
      motif: "Deuxième tentative",
      acteurId,
    });

    expect(seconde.refus).toBe("DEJA_COMPENSE");
    // Le stock n'est pas remonte une seconde fois.
    expect((await lireQuantites(varianteId)).physique).toBe(3);
    expect(await compterMouvements(varianteId)).toBe(2);
  });
});

describe("l'ajustement d'inventaire", () => {
  it("ecrit un mouvement signe et applique l'ecart", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 5,
    });

    await stock.ajusterInventaire({
      varianteId,
      quantiteConstatee: 3,
      motif: "Inventaire du 18 août, deux pièces manquantes",
      acteurId,
    });

    expect((await lireQuantites(varianteId)).physique).toBe(3);

    const r = await client.query(
      `SELECT type, quantite, motif FROM mouvement_stock WHERE variante_id = $1`,
      [varianteId],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ type: "AJUSTEMENT", quantite: -2 });
  });

  /*
   * UN AJUSTEMENT SANS ECART N'ECRIT RIEN. Compter et retrouver le meme nombre
   * est le cas le PLUS FREQUENT d'un inventaire : ecrire un mouvement a zero
   * noierait les vrais ecarts dans du bruit, et le journal doit rester lisible.
   */
  it("n'ecrit aucun mouvement quand la quantite constatee est la meme", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 5,
    });

    const resultat = await stock.ajusterInventaire({
      varianteId,
      quantiteConstatee: 5,
      motif: "Inventaire conforme",
      acteurId,
    });

    expect(resultat.sansEcart).toBe(true);
    expect(await compterMouvements(varianteId)).toBe(0);
  });
});
