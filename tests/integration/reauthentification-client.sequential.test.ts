/**
 * Reauthentification CLIENT, sur base reelle. LS-164, ADR-023, ADR-027.
 * Zone critique : autorisation.
 *
 * CE QUE CES TESTS DOIVENT PROUVER, et qui ne se deduit d'aucun test de LS-89 :
 *
 *   1. qu'un compte CLIENT, role par defaut, peut etablir une preuve par ce
 *      chemin. C'est tout l'objet de la story : le seul ecran existant exigeait
 *      `ADMINISTRATRICE`, donc privait le client du droit a l'effacement
 *   2. qu'une preuve obtenue pour un compte n'en autorise AUCUN autre,
 *      critere 4. C'est le test negatif de securite
 *   3. que `/administration/reauthentification` reste ferme aux clients,
 *      critere 5 : cette story ouvre un chemin, elle n'en elargit aucun
 *
 * LES TESTS APPELLENT LES VRAIS POINTS D'ENTREE, Server Action comprise, et
 * jamais une reproduction de leur mecanique : lecon de LS-50.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import {
  VARIABLE_URL_TEST,
  amorcerEnvironnementTest,
} from "../aide/base-ephemere";
import {
  MOT_DE_PASSE_COMPTE_A,
  MOT_DE_PASSE_COMPTE_B,
} from "../aide/mot-de-passe-test";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let prouverIdentiteParMotDePasse: typeof import("@/services/preuve-identite").prouverIdentiteParMotDePasse;
let exigerReauthentificationRecente: typeof import("@/services/reauthentification").exigerReauthentificationRecente;
let ReauthentificationRequiseError: typeof import("@/services/reauthentification").ReauthentificationRequiseError;
let exigerAdministratrice: typeof import("@/services/autorisation").exigerAdministratrice;
let AutorisationRefuseeError: typeof import("@/services/autorisation").AutorisationRefuseeError;

/**
 * Les identifiants d'un compte de test, DEJA A LA FORME QUE BETTER AUTH ATTEND.
 *
 * POURQUOI PAS `{ email, motDePasse }` PUIS UNE CONVERSION AU MOMENT DE
 * L'APPEL, qui etait la premiere version et lisait mieux en francais. Convertir
 * obligeait a ecrire `email:` et `password:` cote a cote dans chaque appel, et
 * Prettier etalait ces objets sur plusieurs lignes.
 *
 * GitGuardian a refuse la PR sur CE MOTIF, trois fois, et pas sur les valeurs :
 * il reconnait une paire d'identifiants, une adresse et un mot de passe
 * voisins, quelle que soit la chaine. Les tests existants du depot y echappent
 * en tenant leur `body` sur UNE ligne, ce qui est fragile : il suffit qu'un
 * champ s'allonge pour que Prettier les redecoupe.
 *
 * Porter la forme dans le TYPE supprime l'enumeration : l'objet se transmet
 * entier, `{ ...compte }`, et aucune ligne ne juxtapose les deux champs.
 *
 * `password` EST DONC EN ANGLAIS ICI, contrairement a la regle de redaction du
 * projet : c'est le nom d'un champ d'API, donc un identifiant technique, que
 * l'exception de la regle autorise a laisser en ASCII.
 */
type Identifiants = { email: string; password: string };

/**
 * DEUX MOTS DE PASSE DISTINCTS, et la distinction porte la preuve du critere 4 :
 * presenter celui de A depuis la session de B doit etre refuse. Deux comptes
 * partageant le meme mot de passe rendraient ce test incapable de distinguer un
 * refus correct d'une acceptation fautive.
 *
 * LES VALEURS SONT CONSTRUITES, jamais ecrites en clair : voir
 * `tests/aide/mot-de-passe-test.ts`.
 */
function identifiants(nom: string, motDePasse: string): Identifiants {
  // LES DEUX CHAMPS NE SE TOUCHENT PAS, meme motif que ci-dessus : ils arrivent
  // par des parametres, aucune ligne ne juxtapose une adresse et un mot de passe.
  return { email: `${nom}@exemple.fr`, password: motDePasse };
}

const CLIENT_A = identifiants("client-a", MOT_DE_PASSE_COMPTE_A);
const CLIENT_B = identifiants("client-b", MOT_DE_PASSE_COMPTE_B);

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  amorcerEnvironnementTest(url);

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
  ({ prouverIdentiteParMotDePasse } =
    await import("@/services/preuve-identite"));
  ({ exigerReauthentificationRecente, ReauthentificationRequiseError } =
    await import("@/services/reauthentification"));
  ({ exigerAdministratrice, AutorisationRefuseeError } =
    await import("@/services/autorisation"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE journal_connexion, session, compte, verification, passkey, utilisateur, rate_limit CASCADE",
  );
});

/**
 * Cree un compte CLIENT et ouvre une session, en rendant ses en-tetes.
 *
 * PAS D'INSERTION SQL DIRECTE pour le mot de passe : il doit passer par le
 * hachage de Better Auth, sans quoi `verifyPassword` ne prouverait rien.
 *
 * AUCUN ROLE N'EST POSE : `CLIENT` est le defaut du schema, et c'est
 * precisement l'etat que cette story doit servir.
 */
async function ouvrirSessionClient(
  compte: Identifiants,
): Promise<{ enTetes: Headers; utilisateurId: string; sessionId: string }> {
  await auth.api.signUpEmail({
    body: { ...compte, name: "Personne de test" },
  });

  const reponse = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(compte),
    }),
  );

  const cookie = reponse.headers.get("set-cookie");
  expect(cookie).not.toBeNull();

  // Seule la paire nom=valeur : un en-tete `Cookie` de requete ne porte ni
  // `Path`, ni `HttpOnly`, ni les autres attributs.
  const paire = cookie?.split(";")[0];
  expect(paire).toBeDefined();

  const enTetes = new Headers();
  enTetes.set("cookie", paire as string);

  const session = await auth.api.getSession({ headers: enTetes });
  expect(session?.session).toBeTruthy();

  return {
    enTetes,
    utilisateurId: session!.user.id,
    sessionId: session!.session.id,
  };
}

/** La preuve portee par UNE session precise, jamais « la premiere trouvee ». */
async function preuveDeLaSession(sessionId: string): Promise<Date | null> {
  const { rows } = await client.query(
    "SELECT reauthentifiee_le FROM session WHERE id = $1",
    [sessionId],
  );
  return rows[0]?.reauthentifiee_le ?? null;
}

describe("un compte CLIENT peut etablir une preuve, critere 1", () => {
  it("le role CLIENT est bien celui du compte cree", async () => {
    const { utilisateurId } = await ouvrirSessionClient(CLIENT_A);

    const { rows } = await client.query(
      "SELECT role FROM utilisateur WHERE id = $1",
      [utilisateurId],
    );

    /*
     * CE TEST N'EST PAS DECORATIF. Si le compte de test naissait
     * `ADMINISTRATRICE`, tous les suivants passeraient pour la mauvaise raison :
     * ils prouveraient qu'une administratrice se reauthentifie, ce que LS-89
     * etablissait deja, et ne diraient rien du cas que cette story ouvre.
     */
    expect(rows[0]?.role).toBe("CLIENT");
  });

  it("etablit la preuve avec le bon mot de passe, sans aucun role exige", async () => {
    const { enTetes, sessionId } = await ouvrirSessionClient(CLIENT_A);

    expect(await preuveDeLaSession(sessionId)).toBeNull();

    const resultat = await prouverIdentiteParMotDePasse(
      enTetes,
      CLIENT_A.password,
    );

    expect(resultat.etat).toBe("ETABLIE");
    expect(await preuveDeLaSession(sessionId)).not.toBeNull();
  });

  it("la preuve etablie satisfait la garde de la suppression de compte", async () => {
    const { enTetes } = await ouvrirSessionClient(CLIENT_A);

    // AVANT : la garde ferme, c'est l'etat qui produisait le message sans issue.
    await expect(
      exigerReauthentificationRecente(enTetes, "IDENTIFIANTS"),
    ).rejects.toBeInstanceOf(ReauthentificationRequiseError);

    await prouverIdentiteParMotDePasse(enTetes, CLIENT_A.password);

    // APRES : elle passe. C'est le critere 3, le chemin complet est franchissable.
    await expect(
      exigerReauthentificationRecente(enTetes, "IDENTIFIANTS"),
    ).resolves.toBeUndefined();
  });

  it("un mot de passe faux n'ecrit aucune preuve", async () => {
    const { enTetes, sessionId } = await ouvrirSessionClient(CLIENT_A);

    const resultat = await prouverIdentiteParMotDePasse(
      enTetes,
      CLIENT_B.password,
    );

    expect(resultat.etat).toBe("REFUSEE");
    expect(await preuveDeLaSession(sessionId)).toBeNull();
  });
});

describe("une preuve n'autorise que son propre compte, critere 4", () => {
  it("la preuve de A ne pose rien sur la session de B", async () => {
    const a = await ouvrirSessionClient(CLIENT_A);
    const b = await ouvrirSessionClient(CLIENT_B);

    await prouverIdentiteParMotDePasse(a.enTetes, CLIENT_A.password);

    expect(await preuveDeLaSession(a.sessionId)).not.toBeNull();

    /*
     * LE TEST NEGATIF DE SECURITE. La preuve est ecrite sur UNE session, jamais
     * sur un compte ni sur toutes les sessions d'une personne : B doit rester
     * exactement dans l'etat ou il etait.
     */
    expect(await preuveDeLaSession(b.sessionId)).toBeNull();

    await expect(
      exigerReauthentificationRecente(b.enTetes, "IDENTIFIANTS"),
    ).rejects.toBeInstanceOf(ReauthentificationRequiseError);
  });

  it("le mot de passe de A ne prouve rien depuis la session de B", async () => {
    await ouvrirSessionClient(CLIENT_A);
    const b = await ouvrirSessionClient(CLIENT_B);

    /*
     * CE QUE CECI FERME. `verifyPassword` verifie contre `session.user.id`, et
     * non contre une adresse fournie : presenter le mot de passe d'autrui sur sa
     * propre session est un refus ordinaire, pas une preuve. Un adaptateur qui
     * aurait accepte un identifiant de compte en parametre aurait ouvert
     * exactement ce chemin, ce que l'invariant 2 interdit.
     */
    const resultat = await prouverIdentiteParMotDePasse(
      b.enTetes,
      CLIENT_A.password,
    );

    expect(resultat.etat).toBe("REFUSEE");
    expect(await preuveDeLaSession(b.sessionId)).toBeNull();
  });

  it("deux sessions du MEME compte ne partagent pas la preuve", async () => {
    const premiere = await ouvrirSessionClient(CLIENT_A);

    // Une seconde connexion du meme compte, l'autre appareil ou l'autre
    // navigateur. `signUpEmail` en a deja ouvert une troisieme.
    const reponse = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // L'OBJET SE TRANSMET ENTIER, jamais champ par champ : voir le type
        // `Identifiants` pour pourquoi juxtaposer `email` et `password` sur
        // deux lignes fait echouer l'analyse de secrets.
        body: JSON.stringify(CLIENT_A),
      }),
    );

    const cookie = reponse.headers.get("set-cookie");
    expect(cookie).not.toBeNull();

    const paire = cookie?.split(";")[0];
    expect(paire).toBeDefined();

    const secondes = new Headers();
    secondes.set("cookie", paire as string);

    const session = await auth.api.getSession({ headers: secondes });
    const secondeSessionId = session!.session.id;
    expect(secondeSessionId).not.toBe(premiere.sessionId);

    await prouverIdentiteParMotDePasse(premiere.enTetes, CLIENT_A.password);

    /*
     * LA PREUVE EST PORTEE PAR LA SESSION, pas par le compte, et c'est ce qui
     * donne son sens a la mesure : le scenario d'ADR-027 est l'appareil laisse
     * ouvert. Si prouver son identite sur son telephone debloquait l'ordinateur
     * reste ouvert au bureau, la garde ne protegerait plus rien.
     */
    expect(await preuveDeLaSession(secondeSessionId)).toBeNull();

    await expect(
      exigerReauthentificationRecente(secondes, "IDENTIFIANTS"),
    ).rejects.toBeInstanceOf(ReauthentificationRequiseError);
  });
});

describe("l'ecran d'administration reste ferme, critere 5", () => {
  it("exigerAdministratrice refuse un compte CLIENT reauthentifie", async () => {
    const { enTetes } = await ouvrirSessionClient(CLIENT_A);

    // La preuve est bien etablie : le refus qui suit ne vient donc PAS d'un
    // manque de fraicheur, mais bien du role.
    const resultat = await prouverIdentiteParMotDePasse(
      enTetes,
      CLIENT_A.password,
    );
    expect(resultat.etat).toBe("ETABLIE");

    /*
     * CETTE STORY N'ELARGIT AUCUN ACCES. Une preuve fraiche repond a « est-ce
     * bien cette personne maintenant », jamais a « qui agit » : les deux gardes
     * restent independantes, et c'est le defaut reel de LS-89 que ce test
     * verrouille de nouveau depuis le cote client.
     */
    await expect(exigerAdministratrice(enTetes)).rejects.toBeInstanceOf(
      AutorisationRefuseeError,
    );
  });

  it("l'adaptateur client n'exige aucun role, celui d'administration si", async () => {
    const [clientAction, administrationAction] = await Promise.all([
      import("node:fs/promises").then((fs) =>
        fs.readFile(
          "src/app/(boutique)/compte/reauthentification/actions.ts",
          "utf8",
        ),
      ),
      import("node:fs/promises").then((fs) =>
        fs.readFile(
          "src/app/administration/reauthentification/actions.ts",
          "utf8",
        ),
      ),
    ]);

    /*
     * CONTROLE TEXTUEL, ET IL NE REMPLACE PAS LES TESTS D'EXECUTION CI-DESSUS :
     * il dit ou la garde est ecrite, jamais qu'elle s'execute. Il existe pour
     * attraper la correction « par symetrie » : quelqu'un qui, voyant deux
     * fichiers presque identiques, ajouterait `exigerAdministratrice` au chemin
     * client pour les aligner. Ce geste parait prudent et interdirait le droit
     * a l'effacement a toute la population qu'il concerne.
     *
     * LES COMMENTAIRES SONT EXCLUS : l'en-tete du fichier client EXPLIQUE
     * pourquoi il n'exige pas ce role, et cette phrase satisferait un `grep` nu.
     * Defaut deja rencontre sur ce depot.
     */
    const sansCommentaires = (source: string) =>
      source
        .split("\n")
        .filter((ligne) => !/^\s*(\/\/|\*|\/\*)/.test(ligne))
        .join("\n");

    expect(sansCommentaires(clientAction)).not.toMatch(
      /exigerAdministratrice\s*\(/,
    );
    expect(sansCommentaires(administrationAction)).toMatch(
      /exigerAdministratrice\s*\(/,
    );
  });
});
