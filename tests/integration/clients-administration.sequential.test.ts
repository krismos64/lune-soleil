/**
 * Consultation du fichier client par l'exploitante, LS-185, traitement T11.
 *
 * POURQUOI CE FICHIER EXISTE EN PLUS DU TEST DE BOUT EN BOUT. Celui-la mesure
 * la garde de role, la recherche et le rendu, sur une base ou aucun client ne
 * porte d'echec de connexion ni de commande : ses assertions sur l'agregation
 * et sur le filtre des connexions y seraient vertes sans rien prouver.
 *
 * MESURE, ET NON SUPPOSE. Une mutation retirant `where: { issue: "REUSSITE" }`
 * a laisse les douze tests de bout en bout au vert : le filtre n'etait couvert
 * par rien. C'est le motif « cible de test inexistante », et ce fichier pose
 * les donnees qui le rendent detectable.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let listerClientsAdministration: typeof import("@/services/administration-clients").listerClientsAdministration;

/**
 * Ecrit un compte client directement.
 *
 * PAR UNE INSTRUCTION ET NON PAR BETTER AUTH, ET C'EST ASSUME. Le sujet de ce
 * fichier est la LECTURE : passer par l'inscription reelle ferait dependre
 * chaque cas d'un plafond de debit et d'un envoi d'email, pour poser une ligne
 * dont seules quatre colonnes comptent ici. `inscription-client.sequential`
 * couvre le chemin d'inscription.
 */
async function creerCompte(options: {
  email: string;
  nom: string | null;
  emailVerifie?: boolean;
}): Promise<{ id: string }> {
  const id = randomUUID();

  await client.query(
    `INSERT INTO utilisateur (id, email, nom, email_verifie, role, cree_a, mis_a_jour_a)
     VALUES ($1, $2, $3, $4, 'CLIENT', now(), now())`,
    [id, options.email, options.nom, options.emailVerifie ?? true],
  );

  return { id };
}

/** Ecrit une tentative de connexion, reussie ou non. */
async function poserConnexion(
  utilisateurId: string,
  issue: "REUSSITE" | "ECHEC",
  quand: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO journal_connexion (id, utilisateur_id, email_tente, issue,
                                    moyen, adresse_ip, agent_utilisateur, cree_a)
     VALUES ($1, $2, 'test@example.invalid', $3, 'MOT_DE_PASSE', NULL, NULL, $4)`,
    [randomUUID(), utilisateurId, issue, quand],
  );
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ listerClientsAdministration } =
    await import("@/services/administration-clients"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE journal_connexion, session, compte, verification, passkey,
              intention_remboursement, avoir, facture, paiement,
              evenement_fournisseur, historique_statut, mouvement_stock,
              reservation, ligne_commande, commande, adresse_carnet,
              envoi_en_attente, journal_email, alerte_critique, compteur_numero,
              variante, produit, categorie, utilisateur CASCADE`,
  );
});

describe("listerClientsAdministration, sans recherche", () => {
  it("rend une liste vide quand aucun compte n'existe", async () => {
    const vue = await listerClientsAdministration();

    expect(vue.clients).toEqual([]);
    expect(vue.limiteAtteinte).toBe(false);
  });

  /*
   * LES DATES SONT POSEES EXPLICITEMENT, ET C'EST LE TEST QUI L'A IMPOSE.
   *
   * Une premiere version creait les deux comptes a la suite et attendait
   * l'ordre d'insertion inverse. Elle echouait une fois sur deux :
   * `cree_a` est un `Timestamptz(3)`, donc a la MILLISECONDE, et deux `INSERT`
   * consecutifs tombent souvent dans la meme. Le tri devient alors indetermine,
   * PostgreSQL ne garantissant aucun ordre entre lignes ex aequo.
   *
   * Motif « assertion qui suppose un ordre », deja en fiche sur ce depot : un
   * test qui nomme un gagnant sans que rien ne le designe est instable, et son
   * echec accuse le code au lieu du test.
   */
  it("rend les comptes du plus recent au plus ancien", async () => {
    const ancien = await creerCompte({
      email: "premier@example.invalid",
      nom: "TEST Premier",
    });
    const recent = await creerCompte({
      email: "second@example.invalid",
      nom: "TEST Second",
    });

    await client.query(`UPDATE utilisateur SET cree_a = $2 WHERE id = $1`, [
      ancien.id,
      new Date("2026-01-01T10:00:00Z"),
    ]);
    await client.query(`UPDATE utilisateur SET cree_a = $2 WHERE id = $1`, [
      recent.id,
      new Date("2026-06-01T10:00:00Z"),
    ]);

    const vue = await listerClientsAdministration();

    expect(vue.clients.map((compte) => compte.email)).toEqual([
      "second@example.invalid",
      "premier@example.invalid",
    ]);
  });

  /*
   * `nom` EST NULLABLE, et c'est un cas nominal : l'inscription ne l'exige pas
   * par tous les chemins. L'ecran affiche alors l'adresse a sa place, et la
   * lecture doit donc rendre `null` plutot qu'une chaine vide, qui empecherait
   * l'appelant de distinguer les deux.
   */
  it("rend un nom nul sans le remplacer", async () => {
    await creerCompte({ email: "sans-nom@example.invalid", nom: null });

    const vue = await listerClientsAdministration();

    expect(vue.clients[0]?.nom).toBeNull();
  });
});

describe("listerClientsAdministration, derniere connexion", () => {
  /*
   * LE TEST QUE LA SUITE DE BOUT EN BOUT NE POUVAIT PAS FAIRE. Une mutation
   * retirant `where: { issue: "REUSSITE" }` y laissait les douze tests au vert,
   * faute de compte portant un echec de connexion.
   */
  it("ignore un echec de connexion, meme plus recent qu'une reussite", async () => {
    const { id } = await creerCompte({
      email: "actif@example.invalid",
      nom: "TEST Actif",
    });

    const reussite = new Date("2026-07-01T10:00:00Z");
    const echecPlusRecent = new Date("2026-08-01T10:00:00Z");

    await poserConnexion(id, "REUSSITE", reussite);
    await poserConnexion(id, "ECHEC", echecPlusRecent);

    const vue = await listerClientsAdministration();

    /*
     * L'ECHEC EST PLUS RECENT, donc un tri sans filtre le remonterait en
     * premier : c'est ce qui rend cette mutation detectable. Compter un echec
     * comme une connexion ferait apparaitre actif un compte dont quelqu'un
     * essaie justement de forcer l'acces.
     */
    expect(vue.clients[0]?.derniereConnexion?.toISOString()).toBe(
      reussite.toISOString(),
    );
  });

  it("rend null quand le compte ne s'est jamais connecte avec succes", async () => {
    const { id } = await creerCompte({
      email: "jamais@example.invalid",
      nom: "TEST Jamais",
    });

    await poserConnexion(id, "ECHEC", new Date("2026-08-01T10:00:00Z"));

    const vue = await listerClientsAdministration();

    expect(vue.clients[0]?.derniereConnexion).toBeNull();
  });
});

describe("listerClientsAdministration, recherche", () => {
  /*
   * LA RECHERCHE LIBRE EST UN ECART ASSUME A ADR-027, arbitrage de Christophe
   * du 5 septembre 2026, trace dans `.claude/familles-sans-action.txt` et dans
   * le traitement T11. Ces tests mesurent ce qui a ete decide.
   */
  it("trouve par fragment de nom, sans tenir compte de la casse", async () => {
    await creerCompte({ email: "a@example.invalid", nom: "TEST Marie Dupont" });
    await creerCompte({ email: "b@example.invalid", nom: "TEST Paul Martin" });

    const vue = await listerClientsAdministration({ terme: "dupont" });

    expect(vue.clients).toHaveLength(1);
    expect(vue.clients[0]?.email).toBe("a@example.invalid");
  });

  it("trouve aussi par fragment d'adresse email", async () => {
    await creerCompte({ email: "marie@example.invalid", nom: "TEST Marie" });
    await creerCompte({ email: "paul@example.invalid", nom: "TEST Paul" });

    const vue = await listerClientsAdministration({ terme: "PAUL@" });

    expect(vue.clients).toHaveLength(1);
    expect(vue.clients[0]?.email).toBe("paul@example.invalid");
  });

  /*
   * UN COMPTE SANS NOM RESTE TROUVABLE PAR SON ADRESSE. Le `OR` porte sur les
   * deux colonnes, et `nom` etant nullable, une recherche qui ne viserait que
   * lui rendrait ce compte introuvable pour toujours.
   */
  it("trouve un compte sans nom par son adresse", async () => {
    await creerCompte({ email: "anonyme@example.invalid", nom: null });

    const vue = await listerClientsAdministration({ terme: "anonyme" });

    expect(vue.clients).toHaveLength(1);
  });

  it("rend une liste vide quand rien ne correspond", async () => {
    await creerCompte({ email: "a@example.invalid", nom: "TEST Marie" });

    const vue = await listerClientsAdministration({ terme: "zzz-introuvable" });

    expect(vue.clients).toEqual([]);
  });

  /*
   * LE TERME N'EST JAMAIS INTERPRETE. Prisma le passe en parametre lie, jamais
   * en concatenation : ce test le constate sur une chaine qui detruirait la
   * table si la requete etait construite par assemblage de texte. Il rougirait
   * en levant, pas en rendant un mauvais resultat.
   */
  it("traite comme du texte un terme qui ressemble a une injection", async () => {
    await creerCompte({ email: "a@example.invalid", nom: "TEST Marie" });

    const vue = await listerClientsAdministration({
      terme: "'; DROP TABLE utilisateur; --",
    });

    expect(vue.clients).toEqual([]);

    const { rows } = await client.query(
      `SELECT count(*)::int AS total FROM utilisateur`,
    );

    expect(rows[0].total).toBe(1);
  });
});

describe("listerClientsAdministration, activite commerciale", () => {
  /*
   * FINALITE 3 DU TRAITEMENT T11, interet legitime et non execution du contrat.
   * C'est elle qui justifie ces deux champs, et les distinguer est ce qui rend
   * l'ecran defendable si l'interet legitime etait conteste.
   */
  it("compte les commandes et somme leurs montants", async () => {
    const { id } = await creerCompte({
      email: "acheteur@example.invalid",
      nom: "TEST Acheteur",
    });

    for (const [rang, total] of [1500, 2500].entries()) {
      await client.query(
        `INSERT INTO commande (
           id, numero, email_normalise, nom_client, utilisateur_id, statut,
           mode_livraison, adresse_livraison, adresse_facturation,
           sous_total_centimes, frais_port_centimes, montant_taxe_centimes,
           total_centimes, cgv_acceptees_a, cgv_version, cree_a
         )
         VALUES ($1, $2, 'acheteur@example.invalid', 'TEST Acheteur', $3,
                 'CONFIRMEE', 'DOMICILE', '{}'::jsonb, '{}'::jsonb, $4, 0, 0,
                 $4, now(), 'test', now())`,
        [randomUUID(), `C-TEST-185-${rang}`, id, total],
      );
    }

    const vue = await listerClientsAdministration();

    expect(vue.clients[0]?.nombreCommandes).toBe(2);

    /*
     * EN CENTIMES ENTIERS, invariant 1 : aucun flottant n'entre dans un calcul
     * monetaire, et l'agregation se fait sur des entiers du premier au dernier
     * maillon.
     */
    expect(vue.clients[0]?.totalCentimes).toBe(4000);
  });

  it("rend zero et zero sur un compte sans commande", async () => {
    await creerCompte({ email: "neuf@example.invalid", nom: "TEST Neuf" });

    const vue = await listerClientsAdministration();

    expect(vue.clients[0]?.nombreCommandes).toBe(0);
    expect(vue.clients[0]?.totalCentimes).toBe(0);
  });

  /*
   * UNE COMMANDE DISSOCIEE NE COMPTE PLUS, ET C'EST STRUCTUREL. La suppression
   * de compte, LS-95, met `utilisateurId` a nul et renseigne `dissocieA` : la
   * commande survit pour l'obligation comptable, mais plus aucun compte ne la
   * porte. Le compte du titulaire ayant disparu avec, ce test verifie surtout
   * qu'une commande orpheline ne se rattache a personne d'autre.
   */
  it("ne rattache a personne une commande dissociee", async () => {
    await creerCompte({ email: "temoin@example.invalid", nom: "TEST Temoin" });

    await client.query(
      `INSERT INTO commande (
         id, numero, email_normalise, nom_client, utilisateur_id, statut,
         mode_livraison, adresse_livraison, adresse_facturation,
         sous_total_centimes, frais_port_centimes, montant_taxe_centimes,
         total_centimes, dissocie_a, cgv_acceptees_a, cgv_version, cree_a
       )
       VALUES ($1, 'C-TEST-185-ORPHELINE', 'parti@example.invalid',
               'TEST Parti', NULL, 'CONFIRMEE', 'DOMICILE', '{}'::jsonb,
               '{}'::jsonb, 9900, 0, 0, 9900, now(), now(), 'test', now())`,
      [randomUUID()],
    );

    const vue = await listerClientsAdministration();

    expect(vue.clients).toHaveLength(1);
    expect(vue.clients[0]?.nombreCommandes).toBe(0);
    expect(vue.clients[0]?.totalCentimes).toBe(0);
  });
});
