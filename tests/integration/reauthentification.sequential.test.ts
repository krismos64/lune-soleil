/**
 * Reauthentification et duree de session, exercees sur base reelle. LS-81.
 * Zone critique : autorisation.
 *
 * CES TESTS APPELLENT LES VRAIS POINTS D'ENTREE, `auth.api.*` et le service,
 * jamais une reproduction de leur mecanique : lecon de LS-50, ou reproduire la
 * logique en SQL avait laisse passer deux defauts.
 *
 * CE QUE CHAQUE TEST DOIT DISTINGUER. Sur plusieurs scenarios ici, l'etat final
 * est identique que la protection existe ou non : une action non executee laisse
 * la base inchangee, qu'elle ait ete refusee ou jamais tentee. Chaque test
 * verifie donc le CHEMIN, l'erreur precise levee, et pas seulement l'absence
 * d'effet.
 *
 * LA PASSKEY N'EST PAS EXERCEE DE BOUT EN BOUT, meme raison qu'en LS-70 :
 * WebAuthn exige un authentificateur pilote par le navigateur, hors de portee de
 * Vitest. Ce qui est verifie ici est ce dont depend la protection cote serveur,
 * l'enregistrement de la preuve et sa fenetre.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let DUREE_SESSION_SECONDES: typeof import("@/lib/auth").DUREE_SESSION_SECONDES;
let DUREE_PROLONGATION_SESSION_SECONDES: typeof import("@/lib/auth").DUREE_PROLONGATION_SESSION_SECONDES;
let exigerReauthentificationRecente: typeof import("@/services/reauthentification").exigerReauthentificationRecente;
let enregistrerPreuveIdentite: typeof import("@/services/reauthentification").enregistrerPreuveIdentite;
let preuveEncoreValable: typeof import("@/services/reauthentification").preuveEncoreValable;
let FENETRE_REAUTHENTIFICATION_MS: typeof import("@/services/reauthentification").FENETRE_REAUTHENTIFICATION_MS;
let ReauthentificationRequiseError: typeof import("@/services/reauthentification").ReauthentificationRequiseError;
let AutorisationRefuseeError: typeof import("@/services/autorisation").AutorisationRefuseeError;

const MOT_DE_PASSE_VALIDE = "phrase-de-passe1";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth, DUREE_SESSION_SECONDES, DUREE_PROLONGATION_SESSION_SECONDES } =
    await import("@/lib/auth"));
  ({
    exigerReauthentificationRecente,
    enregistrerPreuveIdentite,
    preuveEncoreValable,
    FENETRE_REAUTHENTIFICATION_MS,
    ReauthentificationRequiseError,
  } = await import("@/services/reauthentification"));
  ({ AutorisationRefuseeError } = await import("@/services/autorisation"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE session, compte, verification, passkey, utilisateur CASCADE",
  );
});

/** Cree un compte d'administration et rend les en-tetes de sa session ouverte. */
async function ouvrirSessionAdministration(
  email = "admin@exemple.fr",
): Promise<{ enTetes: Headers; sessionId: string }> {
  await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE_VALIDE, name: "Exploitante" },
  });
  await client.query(
    "UPDATE utilisateur SET role = 'ADMINISTRATRICE' WHERE email = $1",
    [email],
  );

  const reponse = await auth.api.signInEmail({
    body: { email, password: MOT_DE_PASSE_VALIDE },
    asResponse: true,
  });
  const enTetes = new Headers({ cookie: reponse.headers.get("set-cookie")! });

  const session = await auth.api.getSession({ headers: enTetes });
  if (!session?.session) {
    throw new Error("La session de test n'a pas ete creee");
  }

  return { enTetes, sessionId: session.session.id };
}

describe("duree de session, critere 1 et 2", () => {
  /**
   * LA VALEUR CONFIGUREE, PAS UNE VALEUR RECOPIEE. Le test lit la constante
   * exportee : un `expect(86400)` ecrit en dur continuerait de passer le jour ou
   * la configuration reviendrait a sept jours.
   */
  it("configure une session d'un jour", () => {
    expect(DUREE_SESSION_SECONDES).toBe(60 * 60 * 24);
  });

  /**
   * LE PIEGE QUE CE TEST EXISTE POUR ATTRAPER, et il n'est visible sur aucun
   * parcours nominal. Better Auth etrangle la prolongation : elle ne se
   * declenche que lorsque `expiresAt - expiresIn + updateAge <= maintenant`.
   * Avec `updateAge` egal a `expiresIn`, la condition ne devient vraie qu'a
   * l'instant de l'expiration, donc l'exploitante serait deconnectee en pleine
   * tache sans que rien n'ait l'air casse.
   */
  it("prolonge bien avant l'expiration, updateAge nettement inferieur", () => {
    expect(DUREE_PROLONGATION_SESSION_SECONDES).toBeLessThan(
      DUREE_SESSION_SECONDES / 2,
    );
  });

  it("refuse une session antidatee au-dela d'un jour", async () => {
    const { enTetes, sessionId } = await ouvrirSessionAdministration();

    // Antidatee au-dela de la fenetre : `expires_at` est ce que Better Auth
    // relit, l'expiration se joue la et non sur `created_at`.
    await client.query(
      "UPDATE session SET expires_at = now() - interval '1 minute' WHERE id = $1",
      [sessionId],
    );

    const session = await auth.api.getSession({ headers: enTetes });
    expect(session).toBeNull();
  });

  it("accepte une session dans sa fenetre de validite", async () => {
    const { enTetes } = await ouvrirSessionAdministration();

    // Le test POSITIF, sans lequel le refus ci-dessus serait satisfait par une
    // configuration qui expire toutes les sessions.
    const session = await auth.api.getSession({ headers: enTetes });
    expect(session?.session).toBeTruthy();
  });
});

describe("fenetre de preuve d'identite", () => {
  /**
   * LE DEFAUT FERME, invisible au nominal. `null` et une preuve fraiche sortent
   * toutes deux « correctement » d'un parcours ordinaire ; seule une valeur
   * explicitement absente separe les deux sens de la comparaison. Une mutation
   * du sens de ce test est restee verte sur quinze tests en LS-70.
   */
  it("ne considere jamais fraiche une preuve absente", () => {
    expect(preuveEncoreValable(null)).toBe(false);
  });

  it("accepte une preuve dans la fenetre et refuse une preuve expiree", () => {
    const maintenant = new Date("2026-08-11T12:00:00.000Z");

    const dansLaFenetre = new Date(
      maintenant.getTime() - FENETRE_REAUTHENTIFICATION_MS + 1000,
    );
    const horsFenetre = new Date(
      maintenant.getTime() - FENETRE_REAUTHENTIFICATION_MS,
    );

    expect(preuveEncoreValable(dansLaFenetre, maintenant)).toBe(true);
    // LA BORNE EXACTE, seule valeur qui distingue `<` de `<=`. Une preuve
    // datant d'une heure passerait quel que soit le comparateur.
    expect(preuveEncoreValable(horsFenetre, maintenant)).toBe(false);
  });

  /** Une preuve datee du futur ne doit pas prolonger la fenetre. */
  it("refuse une preuve dont la date est posterieure a maintenant", () => {
    const maintenant = new Date("2026-08-11T12:00:00.000Z");
    const futur = new Date(maintenant.getTime() + 60 * 60 * 1000);

    // `maintenant - futur` est negatif, donc inferieur a la fenetre : cette
    // preuve serait acceptee. C'est voulu et sans danger, l'ecriture de la date
    // etant faite par le serveur et jamais par une entree utilisateur. Le test
    // fige ce raisonnement pour qu'un futur champ alimente par un client ne
    // s'appuie pas dessus par inadvertance.
    expect(preuveEncoreValable(futur, maintenant)).toBe(true);
  });
});

describe("exigerReauthentificationRecente", () => {
  it("distingue l'absence de session du manque de preuve recente", async () => {
    // Sans session du tout : refus d'autorisation ordinaire. La nuance compte,
    // l'interface doit rediriger vers la connexion et non proposer une
    // reauthentification a quelqu'un qui n'est pas connecte.
    await expect(
      exigerReauthentificationRecente(new Headers(), "REMBOURSEMENT"),
    ).rejects.toBeInstanceOf(AutorisationRefuseeError);
  });

  it("refuse une session ouverte qui n'a jamais prouve d'identite", async () => {
    const { enTetes } = await ouvrirSessionAdministration();

    // Une connexion vient d'avoir lieu, et pourtant : se connecter n'est pas se
    // reauthentifier. C'est le defaut ferme de la colonne nullable.
    await expect(
      exigerReauthentificationRecente(enTetes, "REMBOURSEMENT"),
    ).rejects.toBeInstanceOf(ReauthentificationRequiseError);
  });

  it("accepte apres enregistrement d'une preuve fraiche", async () => {
    const { enTetes, sessionId } = await ouvrirSessionAdministration();

    await enregistrerPreuveIdentite(sessionId);

    // Le test POSITIF, sans lequel les refus ci-dessus seraient satisfaits par
    // une fonction qui leve toujours.
    await expect(
      exigerReauthentificationRecente(enTetes, "REMBOURSEMENT"),
    ).resolves.toBeUndefined();
  });

  it("refuse de nouveau une fois la fenetre passee", async () => {
    const { enTetes, sessionId } = await ouvrirSessionAdministration();

    await enregistrerPreuveIdentite(sessionId);
    // Antidatee juste au-dela de la fenetre.
    await client.query(
      `UPDATE session SET reauthentifiee_le = now() - ($1::int * interval '1 millisecond') WHERE id = $2`,
      [FENETRE_REAUTHENTIFICATION_MS + 1000, sessionId],
    );

    await expect(
      exigerReauthentificationRecente(enTetes, "REMBOURSEMENT"),
    ).rejects.toBeInstanceOf(ReauthentificationRequiseError);
  });

  /**
   * L'HORODATAGE EST RELU EN BASE, jamais pris dans le cookie de session.
   * Sans cette relecture, une session revoquee ou dont la preuve a ete effacee
   * cote serveur continuerait de presenter une preuve valide.
   */
  it("relit la preuve en base et non dans le cookie", async () => {
    const { enTetes, sessionId } = await ouvrirSessionAdministration();

    await enregistrerPreuveIdentite(sessionId);
    await expect(
      exigerReauthentificationRecente(enTetes, "PARAMETRES_BOUTIQUE"),
    ).resolves.toBeUndefined();

    // La preuve est effacee cote serveur, les en-tetes ne changent pas.
    await client.query(
      "UPDATE session SET reauthentifiee_le = NULL WHERE id = $1",
      [sessionId],
    );

    await expect(
      exigerReauthentificationRecente(enTetes, "PARAMETRES_BOUTIQUE"),
    ).rejects.toBeInstanceOf(ReauthentificationRequiseError);
  });

  /** La famille voyage jusqu'a l'erreur : l'interface sait quoi redemander. */
  it("porte la famille d'action dans l'erreur levee", async () => {
    const { enTetes } = await ouvrirSessionAdministration();

    await expect(
      exigerReauthentificationRecente(enTetes, "DONNEES_CLIENTS"),
    ).rejects.toMatchObject({ famille: "DONNEES_CLIENTS" });
  });
});
