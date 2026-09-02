/**
 * Droits RGPD exerces depuis l'espace client, sur base reelle. LS-62.
 * Zone critique : donnees personnelles et autorisation.
 *
 * CE QUE CETTE SUITE AJOUTE A CELLE DE LS-95, qui couvre deja ce qui part et ce
 * qui reste a la suppression. LS-62 livre le CHEMIN par lequel une personne
 * exerce ces droits elle-meme, et trois proprietes n'etaient mesurees nulle
 * part :
 *
 *   1. l'export exige une preuve d'identite recente, `DONNEES_CLIENTS`. Cette
 *      famille etait en attente depuis LS-81, `exporterMesDonnees` est sa
 *      premiere action reelle
 *   2. l'export ne contient AUCUNE donnee d'un tiers, critere 2. La propriete
 *      tient par le `where` des requetes, ce qui ne se voit pas a la lecture
 *   3. une commande reellement dissociee par une suppression n'est plus
 *      rattachable, critere 5. LS-56 le prouve sur une commande FABRIQUEE
 *      dissociee : le chainon manquant est que la suppression produise bien cet
 *      etat, bout a bout
 *
 * LES TESTS APPELLENT LES VRAIS POINTS D'ENTREE, `exporterMesDonnees` et non
 * `exporterDonneesPersonnelles` : c'est le premier qui porte la garde, et
 * mesurer le second laisserait la garde hors de portee. Lecon de LS-50.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import {
  VARIABLE_URL_TEST,
  amorcerEnvironnementTest,
} from "../aide/base-ephemere";
import { MOT_DE_PASSE_COMPTE_A } from "../aide/mot-de-passe-test";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let exporterMesDonnees: typeof import("@/services/suppression-compte").exporterMesDonnees;
let supprimerCompte: typeof import("@/services/suppression-compte").supprimerCompte;
let prouverIdentiteParMotDePasse: typeof import("@/services/preuve-identite").prouverIdentiteParMotDePasse;
let ReauthentificationRequiseError: typeof import("@/services/reauthentification").ReauthentificationRequiseError;
let consulterCommandesRattachables: typeof import("@/services/rattachement-commandes").consulterCommandesRattachables;

/**
 * DEUX COMPTES, ET LE SECOND N'EST PAS DECORATIF : il porte les donnees de
 * tiers que le critere 2 interdit de voir sortir. Sans lui, l'assertion
 * « l'export ne contient rien d'autrui » passerait sur une base ou il n'y a
 * rien d'autrui a contenir, ce qui ne prouve rien.
 */
const PERSONNE = { nom: "personne-a", ville: "Pau" };
const TIERS = { nom: "personne-b", ville: "Bayonne" };

function adresse(nom: string) {
  return `${nom}@exemple.fr`;
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  amorcerEnvironnementTest(url);

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
  ({ exporterMesDonnees, supprimerCompte } =
    await import("@/services/suppression-compte"));
  ({ prouverIdentiteParMotDePasse } =
    await import("@/services/preuve-identite"));
  ({ ReauthentificationRequiseError } =
    await import("@/services/reauthentification"));
  ({ consulterCommandesRattachables } =
    await import("@/services/rattachement-commandes"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE journal_connexion, session, compte, verification, passkey,
              adresse_carnet, ligne_commande, commande, rate_limit,
              utilisateur CASCADE`,
  );
});

/**
 * Cree un compte par l'API et ouvre une session, en rendant ses en-tetes.
 *
 * PAS D'INSERTION SQL pour le mot de passe : il doit passer par le hachage de
 * Better Auth, sans quoi la preuve d'identite ne prouverait rien.
 */
async function ouvrirSession(nom: string): Promise<{
  enTetes: Headers;
  utilisateurId: string;
}> {
  const identifiants = { email: adresse(nom), password: MOT_DE_PASSE_COMPTE_A };

  await auth.api.signUpEmail({
    body: { ...identifiants, name: "Personne de test" },
  });

  const reponse = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(identifiants),
    }),
  );

  const cookie = reponse.headers.get("set-cookie");
  expect(cookie).not.toBeNull();

  const paire = cookie?.split(";")[0];
  expect(paire).toBeDefined();

  const enTetes = new Headers();
  enTetes.set("cookie", paire as string);

  const session = await auth.api.getSession({ headers: enTetes });
  expect(session?.session).toBeTruthy();

  return { enTetes, utilisateurId: session!.user.id };
}

/** Une adresse au carnet et une commande, de quoi remplir un export. */
async function poserDonnees(
  utilisateurId: string,
  compte: { nom: string; ville: string },
  numero: string,
): Promise<void> {
  await client.query(
    `INSERT INTO adresse_carnet (id, utilisateur_id, nom_complet, ligne1, code_postal, ville, pays)
     VALUES (gen_random_uuid()::text, $1, 'Personne de test', '1 rue du Test', '64000', $2, 'FR')`,
    [utilisateurId, compte.ville],
  );

  await client.query(
    `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                           adresse_livraison, adresse_facturation, sous_total_centimes,
                           mode_livraison, frais_port_centimes, total_centimes,
                           cgv_acceptees_a, cgv_version)
     VALUES (gen_random_uuid()::text, $3, $2, 'Personne de test', $1,
             '{}'::jsonb, '{}'::jsonb, 4500, 'DOMICILE', 499, 4999, now(), 'v1')`,
    [utilisateurId, adresse(compte.nom), numero],
  );
}

describe("l'export exige une preuve d'identite recente, critere 1", () => {
  it("refuse sur une session qui n'a rien prouve", async () => {
    const { enTetes } = await ouvrirSession(PERSONNE.nom);

    /*
     * C'EST L'ETAT NOMINAL, et c'est contre-intuitif : une personne qui arrive
     * sur son compte n'a JAMAIS de preuve recente, celle-ci ne s'obtenant qu'en
     * la demandant. Le refus est donc ce que tout le monde rencontre au premier
     * clic, pas un cas de bord.
     */
    await expect(exporterMesDonnees(enTetes)).rejects.toBeInstanceOf(
      ReauthentificationRequiseError,
    );
  });

  it("rend les donnees une fois l'identite prouvee", async () => {
    const { enTetes, utilisateurId } = await ouvrirSession(PERSONNE.nom);
    await poserDonnees(utilisateurId, PERSONNE, "C-2026-0001");

    await prouverIdentiteParMotDePasse(enTetes, MOT_DE_PASSE_COMPTE_A);

    const resultat = await exporterMesDonnees(enTetes);

    expect(resultat.etat).toBe("EXPORTE");

    if (resultat.etat !== "EXPORTE") {
      return;
    }

    expect(resultat.donnees.compte.email).toBe(adresse(PERSONNE.nom));
    expect(resultat.donnees.adresses).toHaveLength(1);
    expect(resultat.donnees.commandes).toHaveLength(1);
  });

  it("refuse sans session, sans rien exporter", async () => {
    const resultat = await exporterMesDonnees(new Headers());

    /*
     * `SESSION_ABSENTE` ET NON UNE EXCEPTION : l'adaptateur doit pouvoir
     * distinguer « reconnectez-vous » de « confirmez votre identite », les deux
     * gestes n'etant pas les memes.
     */
    expect(resultat.etat).toBe("SESSION_ABSENTE");
  });

  it("la famille declaree est bien DONNEES_CLIENTS", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/services/suppression-compte.ts", "utf8"),
    );

    /*
     * CONTROLE TEXTUEL, ET IL NE REMPLACE PAS LES TESTS CI-DESSUS : ceux-la
     * prouvent que la garde s'execute, celui-ci que la famille declaree est la
     * bonne. `verifier-actions-sensibles.sh` refuserait une famille inconnue,
     * jamais une famille EXISTANTE mais inadaptee : `IDENTIFIANTS` passerait son
     * controle sans que rien ne signale le glissement.
     *
     * L'ENJEU N'EST PAS COSMETIQUE. La famille est ce qui documente POURQUOI
     * l'action est gardee, et `.claude/familles-sans-action.txt` s'appuie sur
     * elle pour dire ce qui reste non protege.
     */
    expect(source).toMatch(
      /@sensible DONNEES_CLIENTS\s*\*\/\s*export async function exporterMesDonnees/,
    );
  });
});

describe("l'export ne contient aucune donnee d'un tiers, critere 2", () => {
  it("ignore les commandes et adresses d'un autre compte", async () => {
    const moi = await ouvrirSession(PERSONNE.nom);
    await poserDonnees(moi.utilisateurId, PERSONNE, "C-2026-0001");

    const autre = await ouvrirSession(TIERS.nom);
    await poserDonnees(autre.utilisateurId, TIERS, "C-2026-0002");

    await prouverIdentiteParMotDePasse(moi.enTetes, MOT_DE_PASSE_COMPTE_A);
    const resultat = await exporterMesDonnees(moi.enTetes);

    expect(resultat.etat).toBe("EXPORTE");

    if (resultat.etat !== "EXPORTE") {
      return;
    }

    /*
     * LE TEST PORTE SUR LE TEXTE ENTIER, et non sur les seuls tableaux. Un
     * `where` oublie sur un volet ajoute plus tard ferait entrer la donnee du
     * tiers sans qu'aucune assertion de cardinalite ne bouge, si ce volet
     * n'existe pas encore ici. Chercher l'adresse du tiers dans tout le document
     * couvre les volets futurs autant que les actuels.
     */
    const document = JSON.stringify(resultat.donnees);

    expect(document).toContain(adresse(PERSONNE.nom));
    expect(document).not.toContain(adresse(TIERS.nom));
    expect(document).not.toContain(TIERS.ville);
    expect(document).not.toContain("C-2026-0002");

    // Et la cardinalite, qui dit que l'export n'est pas simplement VIDE : sans
    // elle, un export ne rendant rien passerait les trois assertions ci-dessus.
    expect(resultat.donnees.commandes).toHaveLength(1);
    expect(resultat.donnees.adresses).toHaveLength(1);
  });

  it("ne fait sortir ni empreinte de mot de passe ni cle de passkey", async () => {
    const { enTetes } = await ouvrirSession(PERSONNE.nom);

    await prouverIdentiteParMotDePasse(enTetes, MOT_DE_PASSE_COMPTE_A);
    const resultat = await exporterMesDonnees(enTetes);

    if (resultat.etat !== "EXPORTE") {
      throw new Error("export attendu");
    }

    /*
     * L'EMPREINTE EST LUE EN BASE PUIS CHERCHEE DANS LE DOCUMENT, plutot que de
     * verifier l'absence d'une CLE nommee `password`. Un renommage de champ
     * ferait passer une assertion sur le nom, jamais celle-ci : c'est la VALEUR
     * qui ne doit pas sortir, quel que soit le nom qui la porte.
     */
    const { rows } = await client.query(
      "SELECT password FROM compte WHERE password IS NOT NULL",
    );
    expect(rows).toHaveLength(1);

    const empreinte = rows[0].password as string;
    expect(empreinte.length).toBeGreaterThan(20);

    expect(JSON.stringify(resultat.donnees)).not.toContain(empreinte);

    // L'EXISTENCE est rapportee, jamais la valeur : c'est ce que l'article 20
    // demande, une donnee reutilisable, et une empreinte n'en est pas une.
    expect(resultat.donnees.compte.aUnMotDePasse).toBe(true);
  });
});

describe("une commande dissociee n'est plus rattachable, critere 5", () => {
  it("bout a bout : suppression, puis nouveau compte de meme adresse", async () => {
    /*
     * LE CHAINON QUE LS-56 NE COUVRE PAS. Son test prouve qu'une commande
     * PORTANT `dissocie_a` est exclue du rattachement, sur une ligne fabriquee.
     * Celui-ci part de la vraie suppression : il prouve qu'elle PRODUIT cet
     * etat, et donc que les deux mecanismes se rejoignent.
     *
     * Sans lui, les deux moities pourraient etre vertes alors que la suppression
     * ne marque rien : LS-56 testerait un etat que rien ne produit.
     */
    const premier = await ouvrirSession(PERSONNE.nom);
    await poserDonnees(premier.utilisateurId, PERSONNE, "C-2026-0001");

    const suppression = await supprimerCompte(premier.utilisateurId);
    expect(suppression).toEqual({ etat: "SUPPRIME", commandesDissociees: 1 });

    /*
     * LA MEME ADRESSE EST REPRISE, ce qui est tout le scenario : une boite
     * email se recycle, se revend, ou la personne se readonne. Le nouveau
     * compte est un TIERS du point de vue des commandes passees.
     */
    const second = await ouvrirSession(PERSONNE.nom);
    expect(second.utilisateurId).not.toBe(premier.utilisateurId);

    await client.query(
      "UPDATE utilisateur SET email_verifie = true WHERE id = $1",
      [second.utilisateurId],
    );

    const rattachables = await consulterCommandesRattachables(
      second.utilisateurId,
      adresse(PERSONNE.nom),
    );

    /*
     * AUCUNE COMMANDE PROPOSEE. La commande satisfait pourtant DEUX des trois
     * conditions du parcours 6 : son `utilisateur_id` est nul et son email
     * correspond. Seul `dissocie_a` l'exclut, et c'est exactement ce que la
     * politique de cle etrangere ne sait pas ecrire.
     */
    expect(rattachables.etat).toBe("ELIGIBLES");

    if (rattachables.etat !== "ELIGIBLES") {
      return;
    }

    expect(rattachables.commandes).toHaveLength(0);
  });
});
