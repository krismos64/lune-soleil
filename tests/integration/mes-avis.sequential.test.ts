/**
 * « MES AVIS », L'ECRAN DE LISTE DE L'ESPACE CLIENT. LS-221, parcours 7.
 *
 * ------------------------------------------------------------------
 * CE QUE CE FICHIER PROUVE, ET LE TEST QUI COMPTE EST LE NEGATIF.
 *
 * `listerMesAvis` ne prend QU'UN identifiant d'utilisateur, remis par l'ecran
 * qui le tient de la session. Le cas nominal, « je vois mes avis », ne dit rien
 * de la garantie : une fonction qui rendrait TOUS les avis du depot le passerait
 * sans difficulte, un compte de test n'ayant qu'un voisin.
 *
 * C'EST DONC LE CAS « je ne vois PAS ceux d'autrui » QUI PORTE L'INVARIANT 2, et
 * il est ecrit avec deux comptes reels et deux avis reels.
 * ------------------------------------------------------------------
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let listerMesAvis: typeof import("@/services/avis").listerMesAvis;
let auth: typeof import("@/lib/auth").auth;

const MOT_DE_PASSE = "Mot2Passe-Test-LS221-Suffisamment-Long";

/** Cree un compte client et rend son identifiant. */
async function creerClient(): Promise<string> {
  const email = `ls221-${randomUUID()}@exemple.test`;

  await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE, name: "Client Test" },
  });

  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM utilisateur WHERE email = $1",
    [email],
  );

  const utilisateur = rows[0];

  if (utilisateur === undefined) {
    throw new Error("le compte de test n'a pas ete cree");
  }

  return utilisateur.id;
}

/**
 * Ecrit un avis directement en base, pour un utilisateur donne.
 *
 * L'ECRITURE EST EN SQL ET NON PAR `deposerAvis`, deliberement : ce chemin-la
 * exige une invitation, une livraison constatee et un jeton valide, gardes que
 * `avis.sequential.test.ts` eprouve deja. Les rejouer ici allongerait chaque cas
 * sans rien prouver de plus sur la LECTURE, seul objet de ce fichier.
 */
async function ecrireAvisPour(
  utilisateurId: string,
  options: { statut?: string; note?: number; commentaire?: string } = {},
): Promise<{ avisId: string; numeroCommande: string }> {
  const {
    statut = "PUBLIE",
    note = 5,
    commentaire = "Tres beau travail",
  } = options;

  const { varianteId } = await creerVarianteEnStock(client);
  const commandeId = randomUUID();
  const ligneId = randomUUID();
  const avisId = randomUUID();
  const numero = `C-2026-${Math.floor(Math.random() * 9000 + 1000)}`;

  await client.query(
    `INSERT INTO commande (
       id, numero, statut, email_normalise, nom_client, total_centimes,
       sous_total_centimes, frais_port_centimes, mode_livraison,
       adresse_livraison, adresse_facturation, cgv_acceptees_a, cgv_version,
       cree_a
     ) VALUES ($1, $2, 'LIVREE', $3, 'TEST Client', 4900, 4900, 0, 'DOMICILE',
       $4, $4, now(), 'v1', now())`,
    [
      commandeId,
      numero,
      `ls221-${randomUUID()}@exemple.test`,
      JSON.stringify({
        ligne1: "1 rue de Test",
        codePostal: "75001",
        ville: "TESTVILLE",
        pays: "FR",
      }),
    ],
  );

  await client.query(
    `INSERT INTO ligne_commande (
       id, commande_id, variante_id, reference_figee, libelle_produit_fige,
       libelle_variante_fige, prix_fige_centimes, quantite
     ) VALUES ($1, $2, $3, 'REF-TEST', 'Bracelet de test',
       'Taille unique', 4900, 1)`,
    [ligneId, commandeId, varianteId],
  );

  await client.query(
    `INSERT INTO avis (
       id, ligne_commande_id, utilisateur_id, note, commentaire, statut,
       experience_a, depose_a, publie_a
     ) VALUES ($1, $2, $3, $4, $5, $6::"StatutAvis", now(), now(),
       CASE WHEN $6 = 'PUBLIE' THEN now() ELSE NULL END)`,
    [avisId, ligneId, utilisateurId, note, commentaire, statut],
  );

  return { avisId, numeroCommande: numero };
}

beforeAll(async () => {
  process.env[VARIABLE_URL_TEST] = inject("DATABASE_URL_TEST");
  process.env.DATABASE_URL = inject("DATABASE_URL_TEST");

  client = new Client({ connectionString: inject("DATABASE_URL_TEST") });
  await client.connect();

  ({ listerMesAvis } = await import("@/services/avis"));
  ({ auth } = await import("@/lib/auth"));
});

afterEach(async () => {
  await client.query("DELETE FROM avis");
});

afterAll(async () => {
  await client.end();
});

describe("listerMesAvis, la garde d'identite, LS-221", () => {
  /**
   * LE TEST NEGATIF DE SECURITE, critere 3, ET C'EST LE SEUL QUI PORTE
   * L'INVARIANT 2. Une fonction qui rendrait tous les avis du depot passerait
   * le cas nominal sans difficulte : c'est l'absence de l'avis du voisin qui
   * prouve le filtre.
   */
  it("ne rend QUE les avis du compte demande", async () => {
    const moi = await creerClient();
    const autre = await creerClient();

    const { avisId: monAvis } = await ecrireAvisPour(moi);
    const { avisId: sonAvis } = await ecrireAvisPour(autre);

    const mesAvis = await listerMesAvis(moi);
    const identifiants = mesAvis.map((avis) => avis.id);

    expect(identifiants).toContain(monAvis);
    expect(identifiants).not.toContain(sonAvis);
  });

  it("rend une liste vide pour un compte sans aucun avis", async () => {
    /*
     * L'ETAT VIDE EST L'ETAT NORMAL d'un compte neuf, l'invitation ne partant
     * qu'apres une livraison REELLEMENT constatee. Il doit rendre une liste, et
     * non lever.
     */
    const client = await creerClient();

    expect(await listerMesAvis(client)).toEqual([]);
  });

  it("ne rend rien pour un identifiant qui n'existe pas", async () => {
    /*
     * UN IDENTIFIANT INCONNU NE LEVE PAS ET NE REND RIEN. Lever ferait de cette
     * fonction un oracle d'existence de compte pour qui saurait l'atteindre.
     */
    expect(await listerMesAvis(randomUUID())).toEqual([]);
  });
});

describe("listerMesAvis, ce que l'auteur voit de ses avis, LS-221", () => {
  it("montre un avis publie avec sa date de publication", async () => {
    const moi = await creerClient();
    const { numeroCommande } = await ecrireAvisPour(moi, { statut: "PUBLIE" });

    const [avis] = await listerMesAvis(moi);

    expect(avis?.etat).toBe("PUBLIE");
    expect(avis?.publieA).not.toBeNull();
    expect(avis?.numeroCommande).toBe(numeroCommande);
    expect(avis?.produitNom).toBe("Bracelet de test");
  });

  it("distingue un avis en attente d'un avis publie, critere 2", async () => {
    /*
     * R4 INTERDIT LA VISIBILITE AU PUBLIC, PAS A SON AUTEUR. Un avis `DEPOSE`
     * n'apparait sur aucune fiche produit, et son auteur doit pourtant savoir
     * qu'il est bien arrive : sans cela il le redepose, ou croit l'avoir perdu.
     */
    const moi = await creerClient();
    await ecrireAvisPour(moi, { statut: "DEPOSE" });

    const [avis] = await listerMesAvis(moi);

    expect(avis?.etat).toBe("EN_ATTENTE");
    expect(avis?.publieA).toBeNull();
  });

  it("fond REFUSE et RETIRE en un seul etat non retenu", async () => {
    /*
     * LA DISTINCTION INTERESSE LA MODERATION, PAS L'AUTEUR. Les deux signifient
     * pour lui que son texte ne paraitra pas ; nommer le retrait APRES
     * publication ferait comprendre que l'avis a ete depublie, information
     * exacte mais qui appelle une explication que l'ecran ne peut pas donner.
     */
    const moi = await creerClient();
    await ecrireAvisPour(moi, { statut: "REFUSE" });

    const [refuse] = await listerMesAvis(moi);
    expect(refuse?.etat).toBe("NON_RETENU");

    await client.query("DELETE FROM avis");
    await ecrireAvisPour(moi, { statut: "RETIRE" });

    const [retire] = await listerMesAvis(moi);
    expect(retire?.etat).toBe("NON_RETENU");
  });

  it("ne rend jamais le motif de decision, regle R5", async () => {
    /*
     * `motifDecision` EST ECRIT PAR L'EXPLOITANTE POUR ELLE-MEME. Le publier a
     * l'auteur exposerait la moderation, et un texte redige en interne se lit
     * mal quand il s'adresse soudain a quelqu'un.
     *
     * L'ASSERTION PORTE SUR LES CLES DE L'OBJET RENDU, et non sur une valeur :
     * c'est l'ABSENCE du champ qui garantit qu'aucun ecran ne pourra l'afficher
     * par inadvertance.
     */
    const moi = await creerClient();
    const { avisId } = await ecrireAvisPour(moi, { statut: "REFUSE" });

    await client.query("UPDATE avis SET motif_decision = $1 WHERE id = $2", [
      "Propos hors sujet, note incoherente avec le texte",
      avisId,
    ]);

    const [avis] = await listerMesAvis(moi);

    expect(avis).toBeDefined();
    expect(Object.keys(avis ?? {})).not.toContain("motifDecision");
    expect(JSON.stringify(avis)).not.toContain("hors sujet");
  });

  it("porte le libelle FIGE du produit, jamais le catalogue actuel", async () => {
    /*
     * INVARIANT 3. Un produit renomme ou retire du catalogue ne doit pas changer
     * ce que le client relit de son propre avis : le libelle vient de la ligne
     * de commande, figee a l'achat.
     */
    const moi = await creerClient();
    await ecrireAvisPour(moi);

    await client.query("UPDATE produit SET nom = 'Nom change apres coup'");

    const [avis] = await listerMesAvis(moi);

    expect(avis?.produitNom).toBe("Bracelet de test");
  });

  it("rend le plus recent en premier", async () => {
    const moi = await creerClient();

    const premier = await ecrireAvisPour(moi, { commentaire: "Le premier" });
    await client.query(
      "UPDATE avis SET depose_a = now() - interval '2 days' WHERE id = $1",
      [premier.avisId],
    );

    const second = await ecrireAvisPour(moi, { commentaire: "Le second" });

    const mesAvis = await listerMesAvis(moi);

    expect(mesAvis[0]?.id).toBe(second.avisId);
    expect(mesAvis[1]?.id).toBe(premier.avisId);
  });
});
