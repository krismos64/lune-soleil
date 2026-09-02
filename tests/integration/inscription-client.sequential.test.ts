/**
 * Inscription et connexion d'un client, LS-54. Zone critique : autorisation.
 *
 * CE QUE CE FICHIER COUVRE ET QUE `authentification.sequential.test.ts` NE
 * COUVRE PAS. Celui-la eprouve le socle pose par LS-70, longueurs de mot de
 * passe, unicite de l'administration, derivation du role. Celui-ci eprouve le
 * PARCOURS CLIENT que LS-54 livre : l'etat de verification produit a
 * l'inscription, et le fait qu'un compte non verifie se connecte quand meme.
 *
 * LE CRITERE 3 EST LE CŒUR DE CE FICHIER, et il porte un arbitrage de
 * Christophe du 2 septembre 2026 : `requireEmailVerification` reste `false`, un
 * compte non verifie PEUT se connecter. La verification conditionne le
 * rattachement des commandes du parcours 6, jamais l'acces au compte.
 *
 * SANS CE TEST, ACTIVER LE DRAPEAU PLUS TARD PASSERAIT INAPERCU : tous les
 * autres tests continueraient de passer, et le critere 3 serait viole en
 * silence.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let auth: typeof import("@/lib/auth").auth;

/** Seize caracteres, la longueur imposee a tous les comptes, ADR-023. */
const MOT_DE_PASSE = "phrase-de-passe1";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE session, compte, verification, passkey, utilisateur CASCADE",
  );
});

async function inscrire(email: string) {
  return auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE, name: "Client de test" },
  });
}

/**
 * Instance dont l'envoyeur capture le lien au lieu de l'ecrire au journal.
 *
 * `creerAuth` prend l'envoyeur en premier parametre, ce qui evite de toucher a
 * l'instance partagee du module.
 */
async function authAvecLiensObserves(liens: string[]) {
  const { creerAuth } = await import("@/lib/auth");

  return creerAuth({
    envoyer: async (message) => {
      const lien = message.variables.lien;
      if (lien !== undefined) {
        liens.push(lien);
      }
    },
  });
}

describe("inscription d'un client, LS-54", () => {
  it("cree le compte avec le role CLIENT, critere 1", async () => {
    await inscrire("nouveau@exemple.fr");

    const { rows } = await client.query(
      "SELECT role, email_verifie FROM utilisateur WHERE email = $1",
      ["nouveau@exemple.fr"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("CLIENT");

    // L'ADRESSE N'EST PAS VERIFIEE A LA CREATION, et c'est ce qui rend le
    // parcours de verification necessaire. Un `true` ici viderait de son sens
    // la condition du parcours 6.
    expect(rows[0].email_verifie).toBe(false);
  });

  it("produit un jeton de verification a duree limitee, critere 2", async () => {
    const liens: string[] = [];
    const instance = await authAvecLiensObserves(liens);

    await instance.api.signUpEmail({
      body: {
        email: "jeton@exemple.fr",
        password: MOT_DE_PASSE,
        name: "Client de test",
      },
    });

    expect(liens).toHaveLength(1);

    /*
     * LE JETON EST UN JWT SIGNE, PAS UNE LIGNE EN BASE, et cette distinction
     * a coute un test faux. La table `verification` reste VIDE apres une
     * inscription : Better Auth 1.6 encode l'echeance dans le jeton lui-meme,
     * mesure sur la base ephemere le 2 septembre 2026.
     *
     * Un test qui lisait `verification` echouait donc en accusant un envoi
     * absent, alors que le lien partait correctement. Chercher la preuve au
     * mauvais endroit produit un rouge qui designe la mauvaise cause.
     *
     * LA DUREE SE LIT DONC DANS LA CHARGE DU JETON, `exp` moins `iat`.
     */
    const jeton = new URL(liens[0]!).searchParams.get("token");
    expect(jeton).not.toBeNull();

    const charge = JSON.parse(
      Buffer.from(jeton!.split(".")[1]!, "base64url").toString("utf8"),
    ) as { iat: number; exp: number; email: string };

    // L'ADRESSE VISEE EST DANS LE JETON : sans cette assertion, un jeton
    // valide emis pour quelqu'un d'autre passerait le test.
    expect(charge.email).toBe("jeton@exemple.fr");

    /*
     * BORNEE DES DEUX COTES. Une seule borne laisserait passer une echeance
     * absurde : « superieure a zero » accepterait dix ans, « inferieure a
     * deux heures » accepterait un jeton deja expire.
     *
     * Une heure est le defaut de Better Auth, verifie via Context7 sur la
     * version 1.6.23. Il est ECRIT ICI plutot que suppose : le jour ou la
     * configuration le changera, ce test dira lequel des deux a bouge.
     */
    const dureeSecondes = charge.exp - charge.iat;
    expect(dureeSecondes).toBeGreaterThan(0);
    expect(dureeSecondes).toBeLessThanOrEqual(60 * 60);
  });

  it("refuse une adresse deja utilisee", async () => {
    await inscrire("doublon@exemple.fr");

    await expect(inscrire("doublon@exemple.fr")).rejects.toThrow();

    const { rows } = await client.query(
      "SELECT count(*)::int AS total FROM utilisateur WHERE email = $1",
      ["doublon@exemple.fr"],
    );
    expect(rows[0].total).toBe(1);
  });
});

describe("un compte non verifie se connecte, critere 3", () => {
  it("ouvre une session malgre email_verifie a false", async () => {
    await inscrire("non-verifie@exemple.fr");

    // L'ETAT DE DEPART EST VERIFIE PLUTOT QUE SUPPOSE : sans cela, le test
    // passerait aussi bien sur un compte deja verifie, donc sans rien prouver.
    const avant = await client.query(
      "SELECT email_verifie FROM utilisateur WHERE email = $1",
      ["non-verifie@exemple.fr"],
    );
    expect(avant.rows[0].email_verifie).toBe(false);

    const reponse = await auth.api.signInEmail({
      body: { email: "non-verifie@exemple.fr", password: MOT_DE_PASSE },
      asResponse: true,
    });

    /*
     * LE COOKIE EST LA PREUVE, pas le code de statut. Better Auth rend 200 sur
     * plusieurs chemins ; seule la presence d'un cookie de session dit qu'une
     * session a reellement ete ouverte.
     *
     * SI `requireEmailVerification` PASSAIT A `true`, cette assertion tomberait
     * et l'arbitrage du 2 septembre serait rouvert explicitement plutot qu'en
     * silence.
     */
    expect(reponse.headers.get("set-cookie")).toContain("session");
  });
});

describe("elevation de privilege par le formulaire, critere 5", () => {
  it("ignore un role ADMINISTRATRICE force au corps de l'inscription", async () => {
    /*
     * LE CHEMIN COMPTE AUTANT QUE LE RESULTAT. Un role reste `CLIENT` aussi
     * bien parce que le filtrage a fonctionne que parce que rien n'a ete tente :
     * le corps porte donc reellement la valeur interdite, et c'est `input:
     * false` de la regle E11 qui l'ecarte.
     */
    await auth.api.signUpEmail({
      body: {
        email: "eleve@exemple.fr",
        password: MOT_DE_PASSE,
        name: "Tentative",
        role: "ADMINISTRATRICE",
      } as never,
    });

    const { rows } = await client.query(
      "SELECT role FROM utilisateur WHERE email = $1",
      ["eleve@exemple.fr"],
    );

    expect(rows[0].role).toBe("CLIENT");
  });
});

describe("validation des entrees cote serveur, critere 6", () => {
  it("refuse une adresse malformee", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: "pas-une-adresse", password: MOT_DE_PASSE, name: "X" },
      }),
    ).rejects.toThrow();

    const { rows } = await client.query(
      "SELECT count(*)::int AS total FROM utilisateur",
    );
    expect(rows[0].total).toBe(0);
  });

  it("refuse un mot de passe de quinze caracteres", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: "court@exemple.fr",
          // Quinze caracteres, un seul de moins que la borne d'ADR-023.
          password: "phrase-de-passe",
          name: "X",
        },
      }),
    ).rejects.toThrow();

    const { rows } = await client.query(
      "SELECT count(*)::int AS total FROM utilisateur",
    );
    expect(rows[0].total).toBe(0);
  });
});
