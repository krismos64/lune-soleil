/**
 * Enregistrer ou retirer une passkey exige une preuve d'identite recente,
 * sur base reelle. LS-295, ADR-027 decision 3. Zone critique : autorisation.
 *
 * LES REQUETES PASSENT PAR `auth.handler`, avec une vraie `Request` vers
 * `/api/auth/passkey/*` : c'est la route HTTP que le navigateur appelle, et le
 * critere 1 exige qu'elle soit gardee, pas seulement l'ecran.
 *
 * AUCUNE ATTESTATION WEBAUTHN N'EST FABRIQUEE, meme limite qu'en LS-70 et
 * LS-294. Ce qui se mesure ici est le CHEMIN de chaque refus, et chaque cas
 * negatif a un temoin positif qui distingue la garde de son absence :
 *
 *   - `generate-register-options` rend 200 et un defi quand la garde laisse
 *     passer, 403 quand elle refuse ;
 *   - `verify-registration` et `delete-passkey` echouent de toute facon sans
 *     attestation ni passkey reelle, mais en 400 ou 404, jamais en 403. Un 403
 *     portant le code de la garde ne peut donc venir que d'elle.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let FENETRE_REAUTHENTIFICATION_MS: typeof import("@/services/reauthentification").FENETRE_REAUTHENTIFICATION_MS;
let CODE_PREUVE_REQUISE: typeof import("@/lib/hook-preuve-passkey").CODE_PREUVE_REQUISE;
let CODE_ROLE_INSUFFISANT: typeof import("@/lib/hook-preuve-passkey").CODE_ROLE_INSUFFISANT;

const MOT_DE_PASSE = "phrase-de-passe1";
const ORIGINE = "http://localhost:3000";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= ORIGINE;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
  ({ FENETRE_REAUTHENTIFICATION_MS } =
    await import("@/services/reauthentification"));
  ({ CODE_PREUVE_REQUISE, CODE_ROLE_INSUFFISANT } =
    await import("@/lib/hook-preuve-passkey"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE journal_connexion, session, compte, verification, passkey, utilisateur, rate_limit, compteur_limitation CASCADE",
  );
});

type SessionOuverte = { cookie: string; sessionId: string };

/** Ouvre une session par la vraie route de connexion, et rend son cookie. */
async function ouvrirSession(
  email: string,
  role: "CLIENT" | "ADMINISTRATRICE",
): Promise<SessionOuverte> {
  await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE, name: "Titulaire" },
  });
  if (role === "ADMINISTRATRICE") {
    await client.query(
      "UPDATE utilisateur SET role = 'ADMINISTRATRICE' WHERE email = $1",
      [email],
    );
  }

  const reponse = await auth.api.signInEmail({
    body: { email, password: MOT_DE_PASSE },
    asResponse: true,
  });
  const cookie = reponse.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) {
    throw new Error("La connexion de test n'a pose aucun cookie");
  }

  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  if (!session?.session) {
    throw new Error("La session de test n'a pas ete creee");
  }

  return { cookie, sessionId: session.session.id };
}

/** Pose une preuve vieille de `ageMs` sur la session, ou l'efface. */
async function poserPreuve(sessionId: string, ageMs: number | null) {
  if (ageMs === null) {
    await client.query(
      "UPDATE session SET reauthentifiee_le = NULL WHERE id = $1",
      [sessionId],
    );
    return;
  }
  await client.query(
    "UPDATE session SET reauthentifiee_le = now() - ($1::int * interval '1 millisecond') WHERE id = $2",
    [ageMs, sessionId],
  );
}

async function appeler(
  chemin: string,
  cookie: string,
  corps?: Record<string, unknown>,
): Promise<{ statut: number; json: Record<string, unknown> | null }> {
  const reponse = await auth.handler(
    new Request(`${ORIGINE}/api/auth${chemin}`, {
      method: corps ? "POST" : "GET",
      headers: {
        cookie,
        origin: ORIGINE,
        ...(corps ? { "content-type": "application/json" } : {}),
      },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    }),
  );
  const texte = await reponse.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = texte ? (JSON.parse(texte) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { statut: reponse.status, json };
}

const OPTIONS = "/passkey/generate-register-options";
const VERIFICATION = "/passkey/verify-registration";
const RETRAIT = "/passkey/delete-passkey";

/** Une preuve ancienne d'une minute, bien dans la fenetre. */
const PREUVE_RECENTE_MS = 60_000;

describe("enregistrement d'une passkey, criteres 1 et 4", () => {
  it("refuse a l'administration sans preuve d'identite", async () => {
    const { cookie } = await ouvrirSession(
      "admin@exemple.fr",
      "ADMINISTRATRICE",
    );

    const { statut, json } = await appeler(OPTIONS, cookie);

    expect(statut).toBe(403);
    expect(json?.code).toBe(CODE_PREUVE_REQUISE);
  });

  /**
   * LE CAS DU TICKET : une session ouverte depuis des heures, moins de
   * vingt-quatre, que `freshSessionMiddleware` laissait passer. La preuve
   * a expire d'une seconde.
   */
  it("refuse quand la preuve a depasse la fenetre de quinze minutes", async () => {
    const { cookie, sessionId } = await ouvrirSession(
      "admin@exemple.fr",
      "ADMINISTRATRICE",
    );
    await poserPreuve(sessionId, FENETRE_REAUTHENTIFICATION_MS + 1_000);

    const { statut, json } = await appeler(OPTIONS, cookie);

    expect(statut).toBe(403);
    expect(json?.code).toBe(CODE_PREUVE_REQUISE);
  });

  /** Le temoin positif : sans lui, un 403 partout passerait pour une garde. */
  it("accepte une preuve recente et rend un defi", async () => {
    const { cookie, sessionId } = await ouvrirSession(
      "admin@exemple.fr",
      "ADMINISTRATRICE",
    );
    await poserPreuve(sessionId, PREUVE_RECENTE_MS);

    const { statut, json } = await appeler(OPTIONS, cookie);

    expect(statut).toBe(200);
    expect(typeof json?.challenge).toBe("string");
  });

  /**
   * LA PREUVE APPARTIENT A LA SESSION, PAS AU COMPTE. Une preuve etablie sur
   * la session de l'exploitante ne doit rien ouvrir a une autre session du
   * meme compte, celle d'un cookie vole.
   */
  it("ignore la preuve posee sur une autre session du meme compte", async () => {
    const proprietaire = await ouvrirSession(
      "admin@exemple.fr",
      "ADMINISTRATRICE",
    );
    await poserPreuve(proprietaire.sessionId, PREUVE_RECENTE_MS);

    const reponse = await auth.api.signInEmail({
      body: { email: "admin@exemple.fr", password: MOT_DE_PASSE },
      asResponse: true,
    });
    const autre = reponse.headers.get("set-cookie")?.split(";")[0] ?? "";

    const { statut, json } = await appeler(OPTIONS, autre);

    expect(statut).toBe(403);
    expect(json?.code).toBe(CODE_PREUVE_REQUISE);
  });

  it("garde aussi la seconde etape, la verification", async () => {
    const { cookie, sessionId } = await ouvrirSession(
      "admin@exemple.fr",
      "ADMINISTRATRICE",
    );
    const corps = { response: { id: "x", rawId: "x", type: "public-key" } };

    const refuse = await appeler(VERIFICATION, cookie, corps);
    expect(refuse.statut).toBe(403);
    expect(refuse.json?.code).toBe(CODE_PREUVE_REQUISE);

    // Avec la preuve, la garde laisse passer : la route echoue ensuite sur
    // l'attestation absente, par son propre refus et non par la garde.
    await poserPreuve(sessionId, PREUVE_RECENTE_MS);
    const passe = await appeler(VERIFICATION, cookie, corps);
    expect(passe.statut).not.toBe(403);
    expect(passe.json?.code).not.toBe(CODE_PREUVE_REQUISE);
  });
});

describe("session de client, critere 2", () => {
  /**
   * MEME AVEC UNE PREUVE RECENTE, le client a pu l'etablir sur son propre
   * mot de passe, `/compte/reauthentification`. Le refus porte sur le role.
   */
  it("refuse l'enregistrement a un client, preuve recente comprise", async () => {
    const { cookie, sessionId } = await ouvrirSession(
      "client@exemple.fr",
      "CLIENT",
    );
    await poserPreuve(sessionId, PREUVE_RECENTE_MS);

    const { statut, json } = await appeler(OPTIONS, cookie);

    expect(statut).toBe(403);
    expect(json?.code).toBe(CODE_ROLE_INSUFFISANT);
  });
});

describe("retrait d'une passkey", () => {
  it("refuse sans preuve, laisse passer avec", async () => {
    const { cookie, sessionId } = await ouvrirSession(
      "admin@exemple.fr",
      "ADMINISTRATRICE",
    );
    const corps = { id: "passkey-inexistante" };

    const refuse = await appeler(RETRAIT, cookie, corps);
    expect(refuse.statut).toBe(403);
    expect(refuse.json?.code).toBe(CODE_PREUVE_REQUISE);

    await poserPreuve(sessionId, PREUVE_RECENTE_MS);
    const passe = await appeler(RETRAIT, cookie, corps);
    expect(passe.statut).not.toBe(403);
  });
});

describe("ce que la garde ne touche pas", () => {
  it("laisse la route repondre 401 sans session", async () => {
    const { statut } = await appeler(OPTIONS, "");

    expect(statut).toBe(401);
  });

  it("laisse la liste des passkeys sans preuve", async () => {
    const { cookie } = await ouvrirSession(
      "admin@exemple.fr",
      "ADMINISTRATRICE",
    );

    const { statut } = await appeler("/passkey/list-user-passkeys", cookie);

    expect(statut).toBe(200);
  });
});
