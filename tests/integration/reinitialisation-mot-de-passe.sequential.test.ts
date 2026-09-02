/**
 * Reinitialisation du mot de passe, LS-55. Zone critique : autorisation.
 *
 * POURQUOI CETTE STORY EST SEPAREE DE L'INSCRIPTION, et sa description le dit :
 * c'est la surface d'attaque la plus exposee d'un site marchand. Un jeton
 * rejouable, une reponse qui revele l'existence d'un compte ou une session
 * survivante apres reprise en main sont trois failles distinctes, et chacune se
 * teste ici sur la vraie base.
 *
 * CES TESTS APPELLENT LES VRAIS POINTS D'ENTREE, `auth.api.*`, jamais une
 * reproduction de leur mecanique.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let creerAuth: typeof import("@/lib/auth").creerAuth;
let auth: typeof import("@/lib/auth").auth;

const MOT_DE_PASSE = "phrase-de-passe1";
const NOUVEAU_MOT_DE_PASSE = "nouvelle-phrase1";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ creerAuth, auth } = await import("@/lib/auth"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE session, compte, verification, passkey, rate_limit, utilisateur CASCADE",
  );
});

/**
 * Instance dont l'envoyeur capture les liens, seul moyen d'obtenir le jeton.
 *
 * IL N'EST PAS LU EN BASE, et c'est le point qui a corrige un test faux en
 * LS-54 : Better Auth 1.6 encode le jeton de verification dans un JWT signe. Le
 * jeton de reinitialisation, lui, transite par l'URL du message : le capturer a
 * l'envoi est donc la seule facon de suivre le parcours reel du client.
 */
async function authAvecLiens(liens: string[]) {
  return creerAuth({
    envoyer: async (message) => {
      const lien = message.variables.lien;
      if (lien !== undefined) {
        liens.push(lien);
      }
    },
  });
}

/**
 * Extrait le jeton du lien recu, comme le ferait le navigateur du client.
 *
 * LE JETON EST DANS LE CHEMIN, PAS EN PARAMETRE, et les deux flux different :
 *
 *   verification    /api/auth/verify-email?token=<JWT signe>
 *   reinitialisation /api/auth/reset-password/<jeton>?callbackURL=...
 *
 * Mesure sur la base ephemere le 2 septembre 2026. Un extracteur ecrit par
 * analogie avec la verification rend une chaine vide, et le test echoue alors
 * en accusant « Invalid token » : la cause designee est le jeton, la vraie
 * cause est l'extraction.
 *
 * L'AUTRE DIFFERENCE COMPTE AUTANT : ce jeton EST persiste, ligne
 * `verification` d'identifiant `reset-password:<jeton>`, la ou celui de
 * verification vit entierement dans son JWT. C'est ce qui rend l'usage unique
 * observable en base.
 */
function jetonDe(lien: string): string {
  const chemin = new URL(lien).pathname;
  return chemin.slice(chemin.lastIndexOf("/") + 1);
}

async function creerCompte(email: string) {
  await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE, name: "Client de test" },
  });
}

async function demanderReinitialisation(email: string, liens: string[]) {
  const instance = await authAvecLiens(liens);
  return instance.api.requestPasswordReset({
    body: { email, redirectTo: "/compte/nouveau-mot-de-passe" },
  });
}

describe("la demande ne revele jamais l'existence d'un compte, critere 2", () => {
  it("rend la meme reponse pour une adresse connue et une inconnue", async () => {
    await creerCompte("connue@exemple.fr");

    const liensConnue: string[] = [];
    const reponseConnue = await demanderReinitialisation(
      "connue@exemple.fr",
      liensConnue,
    );

    const liensInconnue: string[] = [];
    const reponseInconnue = await demanderReinitialisation(
      "jamais-vue@exemple.fr",
      liensInconnue,
    );

    /*
     * LES DEUX REPONSES SONT IDENTIQUES, c'est ce qui ferme l'enumeration.
     * Comparer les objets entiers plutot qu'un champ : un statut ajoute plus
     * tard a l'une des deux branches serait attrape ici.
     */
    expect(reponseInconnue).toEqual(reponseConnue);

    /*
     * ET L'ENVOI, LUI, DIFFERE : un message part pour l'adresse connue, aucun
     * pour l'inconnue. Sans cette seconde assertion, une implementation qui
     * n'enverrait JAMAIS rien passerait le test tout en cassant la
     * fonctionnalite.
     */
    expect(liensConnue).toHaveLength(1);
    expect(liensInconnue).toHaveLength(0);
  });
});

describe("le jeton est a usage unique et borne, criteres 1 et 5", () => {
  it("refuse le rejeu d'un jeton deja consomme", async () => {
    await creerCompte("rejeu@exemple.fr");

    const liens: string[] = [];
    await demanderReinitialisation("rejeu@exemple.fr", liens);
    const jeton = jetonDe(liens[0]!);
    expect(jeton).not.toBe("");

    // PREMIER USAGE : il doit reussir, sans quoi le refus du second ne
    // prouverait rien.
    await auth.api.resetPassword({
      body: { newPassword: NOUVEAU_MOT_DE_PASSE, token: jeton },
    });

    // SECOND USAGE DU MEME JETON : refuse. C'est le test negatif du critere 5.
    await expect(
      auth.api.resetPassword({
        body: { newPassword: "encore-une-phrase1", token: jeton },
      }),
    ).rejects.toThrow();

    /*
     * L'ETAT FINAL CONFIRME QUE LE REJEU N'A RIEN ECRIT : le mot de passe est
     * celui du premier usage. Sans cette verification, un refus qui aurait
     * quand meme modifie le compte passerait.
     */
    const connexion = await auth.api.signInEmail({
      body: { email: "rejeu@exemple.fr", password: NOUVEAU_MOT_DE_PASSE },
      asResponse: true,
    });
    expect(connexion.headers.get("set-cookie")).toContain("session");
  });

  it("refuse un jeton forge", async () => {
    await creerCompte("forge@exemple.fr");

    await expect(
      auth.api.resetPassword({
        body: {
          newPassword: NOUVEAU_MOT_DE_PASSE,
          token: "jeton-invente-de-toutes-pieces",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("la reinitialisation invalide les sessions actives, critere 3", () => {
  it("ferme une session ouverte avant le changement", async () => {
    await creerCompte("compromis@exemple.fr");

    // UNE SESSION EST OUVERTE AVANT, c'est le scenario reel : le compte est
    // compromis, l'intrus y est connecte, le proprietaire reprend la main.
    const connexion = await auth.api.signInEmail({
      body: { email: "compromis@exemple.fr", password: MOT_DE_PASSE },
      asResponse: true,
    });
    const enTetes = new Headers({
      cookie: connexion.headers.get("set-cookie")!,
    });

    // L'ETAT DE DEPART EST VERIFIE plutot que suppose : sans cela le test
    // passerait aussi bien sur une session qui n'a jamais existe.
    expect(await auth.api.getSession({ headers: enTetes })).not.toBeNull();

    const liens: string[] = [];
    await demanderReinitialisation("compromis@exemple.fr", liens);

    await auth.api.resetPassword({
      body: { newPassword: NOUVEAU_MOT_DE_PASSE, token: jetonDe(liens[0]!) },
    });

    /*
     * LA SESSION DE L'INTRUS EST MORTE. Sans
     * `revokeSessionsOnPasswordReset`, elle survivrait jusqu'a son expiration
     * naturelle, vingt-quatre heures : reprendre la main sur son compte ne
     * mettrait pas dehors celui qui s'y trouve, ce qui vide la manœuvre de son
     * sens.
     */
    expect(await auth.api.getSession({ headers: enTetes })).toBeNull();
  });

  it("l'ancien mot de passe ne fonctionne plus", async () => {
    await creerCompte("ancien@exemple.fr");

    const liens: string[] = [];
    await demanderReinitialisation("ancien@exemple.fr", liens);
    await auth.api.resetPassword({
      body: { newPassword: NOUVEAU_MOT_DE_PASSE, token: jetonDe(liens[0]!) },
    });

    await expect(
      auth.api.signInEmail({
        body: { email: "ancien@exemple.fr", password: MOT_DE_PASSE },
      }),
    ).rejects.toThrow();
  });
});

describe("le nouveau mot de passe subit les memes regles, critere 6 de LS-54", () => {
  it("refuse quinze caracteres a la reinitialisation", async () => {
    await creerCompte("court@exemple.fr");

    const liens: string[] = [];
    await demanderReinitialisation("court@exemple.fr", liens);

    /*
     * LA BORNE DES SEIZE CARACTERES VAUT AUSSI ICI, ADR-023. Une
     * reinitialisation qui accepterait un mot de passe plus court ouvrirait un
     * contournement complet de la regle : il suffirait de « oublier » son mot
     * de passe pour en choisir un faible.
     */
    await expect(
      auth.api.resetPassword({
        body: { newPassword: "phrase-de-passe", token: jetonDe(liens[0]!) },
      }),
    ).rejects.toThrow();
  });
});

describe("aucun jeton ni mot de passe n'entre en base, critere 6", () => {
  it("ne stocke le nouveau mot de passe qu'en forme hachee", async () => {
    await creerCompte("hachage@exemple.fr");

    const liens: string[] = [];
    await demanderReinitialisation("hachage@exemple.fr", liens);
    await auth.api.resetPassword({
      body: { newPassword: NOUVEAU_MOT_DE_PASSE, token: jetonDe(liens[0]!) },
    });

    const { rows } = await client.query(
      "SELECT password FROM compte WHERE password IS NOT NULL",
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const ligne of rows) {
      /*
       * LA VALEUR EN CLAIR N'APPARAIT NULLE PART. Chercher son ABSENCE plutot
       * que la presence d'un prefixe de hachage : un format qui changerait
       * resterait juste, alors qu'un mot de passe en clair serait attrape quel
       * que soit le format retenu.
       */
      expect(ligne.password).not.toContain(NOUVEAU_MOT_DE_PASSE);
      expect(ligne.password.length).toBeGreaterThan(20);
    }
  });
});
