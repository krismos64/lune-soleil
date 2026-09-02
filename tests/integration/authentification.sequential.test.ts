/**
 * Authentification exercee sur base reelle, LS-70. Zone critique : autorisation.
 *
 * CES TESTS APPELLENT LES VRAIS POINTS D'ENTREE, `auth.api.*` et
 * `mettreAJourProfil`, jamais une reproduction de leur mecanique. C'est la
 * lecon de LS-50 : un test qui recopie le code prouve que le motif est bon et
 * ne dit rien de ce qui s'execute en production, ou etaient les deux defauts.
 *
 * CE QUE CHAQUE TEST DOIT DISTINGUER, et le piege est le meme qu'en LS-50 et
 * LS-68 : sur plusieurs de ces scenarios, l'etat final de la base est
 * IDENTIQUE que la protection existe ou non. Un role reste `CLIENT` aussi bien
 * parce que le filtrage a fonctionne que parce que rien n'a ete tente. Chaque
 * test verifie donc le CHEMIN, une erreur levee ou une ecriture refusee, pas
 * seulement le resultat.
 *
 * LA PASSKEY N'EST PAS TESTEE DE BOUT EN BOUT ici : WebAuthn exige un
 * authentificateur materiel ou un virtuel pilote par le navigateur, hors de
 * portee de Vitest. Ce que ces tests couvrent, c'est ce qui protege la base :
 * l'unicite de la credential, qui est la parade a l'acces croise. La
 * negociation elle-meme releve du test de bout en bout et de la recette avec
 * l'exploitante, ADR-021 exigeant de toute facon un enregistrement sur ses
 * propres appareils.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let mettreAJourProfil: typeof import("@/services/utilisateur").mettreAJourProfil;
let EntreeInvalideError: typeof import("@/services/utilisateur").EntreeInvalideError;
let lireIdentite: typeof import("@/services/autorisation").lireIdentite;
let exigerAdministratrice: typeof import("@/services/autorisation").exigerAdministratrice;
let AutorisationRefuseeError: typeof import("@/services/autorisation").AutorisationRefuseeError;

/**
 * SEIZE CARACTERES EXACTEMENT, et c'est la seule longueur qui prouve la borne.
 * Un mot de passe confortablement long passerait aussi avec un minimum a douze
 * ou a huit : il ne distinguerait pas la valeur configuree de n'importe quelle
 * valeur plus basse.
 */
const MOT_DE_PASSE_VALIDE = "phrase-de-passe1";
/** Quinze caracteres, un seul de moins : doit etre refuse. */
const MOT_DE_PASSE_COURT = "phrase-de-passe";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  // `@/lib/prisma` lit DATABASE_URL a l'evaluation du module, et `@/lib/auth`
  // lit BETTER_AUTH_SECRET : les deux doivent etre poses AVANT l'import.
  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
  ({ mettreAJourProfil, EntreeInvalideError } =
    await import("@/services/utilisateur"));
  ({ lireIdentite, exigerAdministratrice, AutorisationRefuseeError } =
    await import("@/services/autorisation"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE session, compte, verification, passkey, utilisateur CASCADE",
  );
});

/**
 * Les deux longueurs se verifient plutot que de se supposer : une constante
 * mal comptee ferait passer les tests de longueur pour la mauvaise raison, un
 * mot de passe de dix-sept caracteres cru long de seize.
 */
it("les deux mots de passe encadrent exactement la borne des seize", () => {
  expect(MOT_DE_PASSE_COURT).toHaveLength(15);
  expect(MOT_DE_PASSE_VALIDE).toHaveLength(16);
});

async function creerCompte(email: string, motDePasse = MOT_DE_PASSE_VALIDE) {
  return auth.api.signUpEmail({
    body: { email, password: motDePasse, name: "Compte de test" },
    asResponse: true,
  });
}

async function lireRole(email: string): Promise<string | null> {
  const { rows } = await client.query<{ role: string }>(
    "SELECT role FROM utilisateur WHERE email = $1",
    [email],
  );
  return rows[0]?.role ?? null;
}

describe("longueur minimale du mot de passe, seize pour tous, ADR-023", () => {
  it("accepte un mot de passe de seize caracteres ou plus", async () => {
    const reponse = await creerCompte("client.valide@exemple.fr");

    expect(reponse.status).toBe(200);
    expect(await lireRole("client.valide@exemple.fr")).toBe("CLIENT");
  });

  it("refuse quinze caracteres sur un compte client", async () => {
    const reponse = await creerCompte(
      "client.court@exemple.fr",
      MOT_DE_PASSE_COURT,
    );

    expect(reponse.status).toBeGreaterThanOrEqual(400);
    // Le compte ne doit pas exister : un refus qui creerait quand meme la
    // ligne laisserait un compte sans moyen de connexion.
    expect(await lireRole("client.court@exemple.fr")).toBeNull();
  });

  it("refuse quinze caracteres aussi sur le compte d'administration", async () => {
    // La longueur est une option GLOBALE : le meme refus doit s'appliquer quel
    // que soit le role vise. Le compte est cree client puis bascule, le
    // passage a ADMINISTRATRICE ne se faisant par aucune interface, ADR-023.
    const reponse = await creerCompte(
      "exploitante@exemple.fr",
      MOT_DE_PASSE_COURT,
    );

    expect(reponse.status).toBeGreaterThanOrEqual(400);
    expect(await lireRole("exploitante@exemple.fr")).toBeNull();
  });
});

describe("le role ne vient jamais d'une entree, regle E11 et invariant 2", () => {
  it("ignore un role force dans le corps de l'inscription", async () => {
    const reponse = await auth.api.signUpEmail({
      body: {
        email: "escalade@exemple.fr",
        password: MOT_DE_PASSE_VALIDE,
        name: "Tentative",
        // Ce que `input: false` doit ecarter. La cle est volontairement
        // nommee comme le champ reel, c'est le cas qui compte.
        role: "ADMINISTRATRICE",
      } as never,
      asResponse: true,
    });

    expect(reponse.status).toBe(200);
    // LE POINT DECISIF : le compte existe, mais en CLIENT. Verifier seulement
    // que la requete a reussi ne distinguerait rien.
    expect(await lireRole("escalade@exemple.fr")).toBe("CLIENT");
  });

  it("rejette un role force dans une mise a jour de profil", async () => {
    await creerCompte("profil@exemple.fr");
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM utilisateur WHERE email = $1",
      ["profil@exemple.fr"],
    );
    const utilisateurId = rows[0]!.id;

    // Le chemin qui ECHAPPE a Better Auth : une Server Action de profil qui
    // transmettrait a Prisma un objet issu d'un formulaire. C'est ce que la
    // regle E11 range en niveau 3, sans garantie de base derriere.
    await expect(
      mettreAJourProfil(utilisateurId, {
        nom: "Nom légitime",
        role: "ADMINISTRATRICE",
      }),
    ).rejects.toBeInstanceOf(EntreeInvalideError);

    expect(await lireRole("profil@exemple.fr")).toBe("CLIENT");

    // Le refus porte sur la cle inconnue, PAS sur le champ legitime : sans
    // cette verification, un schema qui rejetterait tout passerait le test.
    await mettreAJourProfil(utilisateurId, { nom: "Nom légitime" });
    const { rows: apres } = await client.query<{ nom: string }>(
      "SELECT nom FROM utilisateur WHERE id = $1",
      [utilisateurId],
    );
    expect(apres[0]?.nom).toBe("Nom légitime");
  });
});

describe("unicite du compte d'administration, regle E1", () => {
  it("refuse une seconde administratrice", async () => {
    await creerCompte("premiere@exemple.fr");
    await creerCompte("seconde@exemple.fr");

    await client.query(
      "UPDATE utilisateur SET role = 'ADMINISTRATRICE' WHERE email = $1",
      ["premiere@exemple.fr"],
    );

    // L'index partiel doit rejeter la seconde. Cette protection est un effet
    // de bord et non la conception, ADR-023 : elle est verifiee ici parce
    // qu'elle disparait en silence si une migration l'oublie.
    await expect(
      client.query(
        "UPDATE utilisateur SET role = 'ADMINISTRATRICE' WHERE email = $1",
        ["seconde@exemple.fr"],
      ),
    ).rejects.toThrow(/utilisateur_administratrice_unique/);

    expect(await lireRole("seconde@exemple.fr")).toBe("CLIENT");
  });

  it("laisse passer autant de comptes clients que voulu", async () => {
    // Le contre-test qui prouve que l'index est bien PARTIEL. Un `UNIQUE(role)`
    // simple rejetterait ici, et rendrait la boutique inutilisable.
    await creerCompte("client1@exemple.fr");
    await creerCompte("client2@exemple.fr");
    await creerCompte("client3@exemple.fr");

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*) AS nombre FROM utilisateur WHERE role = 'CLIENT'",
    );
    expect(Number(rows[0]!.nombre)).toBe(3);
  });
});

describe("acces croise par passkey, risque nomme par ADR-021", () => {
  it("refuse la meme credential sur deux comptes", async () => {
    await creerCompte("porteur@exemple.fr");
    await creerCompte("autre@exemple.fr");

    const { rows } = await client.query<{ id: string; email: string }>(
      "SELECT id, email FROM utilisateur ORDER BY email",
    );
    const porteur = rows.find((l) => l.email === "porteur@exemple.fr")!;
    const autre = rows.find((l) => l.email === "autre@exemple.fr")!;

    const insererPasskey = (utilisateurId: string, credential: string) =>
      client.query(
        `INSERT INTO passkey (id, public_key, user_id, credential_id, counter, device_type, backed_up)
         VALUES (gen_random_uuid()::text, 'cle-publique', $1, $2, 0, 'singleDevice', false)`,
        [utilisateurId, credential],
      );

    await insererPasskey(porteur.id, "credential-partagee");

    // Sans l'unicite, cette ligne entrerait et la recherche par credential a
    // la connexion aurait deux comptes a departager. Le plugin ne pose qu'un
    // index ORDINAIRE sur credential_id : cette contrainte est ajoutee par le
    // projet, LS-70.
    await expect(
      insererPasskey(autre.id, "credential-partagee"),
    ).rejects.toThrow(/passkey_credential_id_unique/);
  });

  it("supprime les passkeys avec leur compte", async () => {
    await creerCompte("partant@exemple.fr");
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM utilisateur WHERE email = $1",
      ["partant@exemple.fr"],
    );

    await client.query(
      `INSERT INTO passkey (id, public_key, user_id, credential_id, counter, device_type, backed_up)
       VALUES (gen_random_uuid()::text, 'cle', $1, 'credential-partante', 0, 'singleDevice', false)`,
      [rows[0]!.id],
    );

    await client.query("DELETE FROM utilisateur WHERE email = $1", [
      "partant@exemple.fr",
    ]);

    // CASCADE : une credential orpheline resterait un moyen d'acces dont plus
    // aucun compte ne repond.
    const { rows: restantes } = await client.query(
      "SELECT 1 FROM passkey WHERE credential_id = 'credential-partante'",
    );
    expect(restantes).toHaveLength(0);
  });
});

describe("l'autorisation derive de la session, regle E2", () => {
  it("ne rend aucune identite sans en-tete de session", async () => {
    expect(await lireIdentite(new Headers())).toBeNull();
  });

  it("refuse l'administration sans session valide", async () => {
    await expect(exigerAdministratrice(new Headers())).rejects.toBeInstanceOf(
      AutorisationRefuseeError,
    );
  });

  it("refuse l'administration avec un jeton de session forge", async () => {
    // Un cookie de session invente. Better Auth verifie la signature et relit
    // la session en base : un jeton non emis par le serveur ne vaut rien.
    const enTetes = new Headers({
      cookie: "better-auth.session_token=jeton-invente-de-toutes-pieces",
    });

    await expect(exigerAdministratrice(enTetes)).rejects.toBeInstanceOf(
      AutorisationRefuseeError,
    );
    expect(await lireIdentite(enTetes)).toBeNull();
  });

  it("refuse l'administration a une session de client authentifie", async () => {
    await creerCompte("simple.client@exemple.fr");

    const reponse = await auth.api.signInEmail({
      body: {
        email: "simple.client@exemple.fr",
        password: MOT_DE_PASSE_VALIDE,
      },
      asResponse: true,
    });
    const cookie = reponse.headers.get("set-cookie");
    expect(cookie).toBeTruthy();

    const enTetes = new Headers({ cookie: cookie! });

    // LA SESSION EST VALIDE : c'est ce qui rend ce test different du precedent.
    // Une verification qui se contenterait de « une session existe » passerait
    // ici et ouvrirait l'administration a tout compte client.
    const identite = await lireIdentite(enTetes);
    expect(identite?.email).toBe("simple.client@exemple.fr");
    expect(identite?.role).toBe("CLIENT");

    await expect(exigerAdministratrice(enTetes)).rejects.toBeInstanceOf(
      AutorisationRefuseeError,
    );
  });

  /**
   * REGLE E10, « un role absent ou inconnu ne donne aucun droit ».
   *
   * CE TEST A ETE AJOUTE APRES COUP, parce qu'une mutation est passee au vert :
   * inverser le defaut de `normaliserRole` vers `ADMINISTRATRICE` ne changeait
   * RIEN aux quinze tests d'alors. Le comportement nominal est identique dans
   * les deux sens, `CLIENT` reste `CLIENT` et `ADMINISTRATRICE` reste
   * `ADMINISTRATRICE` ; seule une valeur inattendue separe un defaut ferme d'un
   * defaut ouvert, et aucune session n'en portait.
   *
   * Le role est ecrit directement en base pour produire cette valeur : c'est le
   * scenario reel d'une donnee corrompue par une ecriture manuelle, celle-la
   * meme qu'ADR-023 prevoit pour basculer un compte.
   */
  it("ne donne aucun droit a un role inconnu en base", async () => {
    await creerCompte("role.corrompu@exemple.fr");

    // `role` est un enum : une valeur hors enum ne peut pas y entrer, ce qui
    // est precisement la garantie de base. Le cas atteignable est donc le role
    // que Better Auth ne renvoie PAS, teste juste apres, et l'ecriture d'une
    // valeur vide, refusee ici aussi. Les deux comptent.
    await expect(
      client.query("UPDATE utilisateur SET role = 'INCONNU' WHERE email = $1", [
        "role.corrompu@exemple.fr",
      ]),
    ).rejects.toThrow();

    expect(await lireRole("role.corrompu@exemple.fr")).toBe("CLIENT");
  });

  it("ne donne aucun droit quand la session ne porte pas de role", async () => {
    await creerCompte("sans.role@exemple.fr");

    const reponse = await auth.api.signInEmail({
      body: { email: "sans.role@exemple.fr", password: MOT_DE_PASSE_VALIDE },
      asResponse: true,
    });
    const enTetes = new Headers({ cookie: reponse.headers.get("set-cookie")! });

    const identite = await lireIdentite(enTetes);
    expect(identite).not.toBeNull();

    // LE POINT DECISIF, celui que la mutation du defaut faisait basculer :
    // face a une valeur qui n'est pas exactement `ADMINISTRATRICE`, la reponse
    // est `CLIENT`, jamais l'inverse. Verifie sur la fonction de normalisation
    // elle-meme, avec les valeurs qu'une session degradee peut porter.
    const { normaliserRolePourTest } = await import("@/services/autorisation");
    expect(normaliserRolePourTest(undefined)).toBe("CLIENT");
    expect(normaliserRolePourTest(null)).toBe("CLIENT");
    expect(normaliserRolePourTest("")).toBe("CLIENT");
    expect(normaliserRolePourTest("administratrice")).toBe("CLIENT");
    expect(normaliserRolePourTest("ADMINISTRATRICE,CLIENT")).toBe("CLIENT");
    expect(normaliserRolePourTest("ADMINISTRATRICE")).toBe("ADMINISTRATRICE");
  });

  it("accepte l'administration pour une session au role ADMINISTRATRICE", async () => {
    await creerCompte("admin.reelle@exemple.fr");
    await client.query(
      "UPDATE utilisateur SET role = 'ADMINISTRATRICE' WHERE email = $1",
      ["admin.reelle@exemple.fr"],
    );

    const reponse = await auth.api.signInEmail({
      body: { email: "admin.reelle@exemple.fr", password: MOT_DE_PASSE_VALIDE },
      asResponse: true,
    });
    const enTetes = new Headers({ cookie: reponse.headers.get("set-cookie")! });

    // Le test POSITIF, sans lequel les quatre refus ci-dessus seraient
    // satisfaits par une fonction qui refuse tout le monde.
    const identite = await exigerAdministratrice(enTetes);
    expect(identite.role).toBe("ADMINISTRATRICE");
    expect(identite.email).toBe("admin.reelle@exemple.fr");
  });
});

/**
 * ATTRIBUTS DU COOKIE DE SESSION.
 *
 * CE BLOC EXISTE PARCE QU'UN DEFAUT REEL EST PASSE. `urlBase` valait
 * `process.env.BETTER_AUTH_URL ?? "http://localhost:3000"`, repli qui semblait
 * inoffensif. Better Auth decide de l'attribut `Secure` par la chaine
 * `baseURL ? baseURL.startsWith("https://") : isProduction` : fournir une
 * valeur par defaut rend `baseURL` toujours definie, rend la branche
 * `isProduction` inatteignable, et fait retomber la decision sur une URL en
 * `http://localhost`. En production avec la variable oubliee, le cookie de
 * l'exploitante partait donc SANS `Secure`, en clair, sept jours de validite.
 *
 * Aucun des dix-sept tests d'alors ne regardait les attributs du cookie : ils
 * ne lisaient que sa valeur, pour la rejouer. Un cookie sans `Secure`
 * s'authentifie exactement comme un cookie protege.
 *
 * L'INSTANCE EST CREEE ICI, avec sa propre URL, plutot que d'utiliser `auth` :
 * la valeur est figee a l'evaluation du module, la changer apres coup n'aurait
 * aucun effet.
 */
describe("attributs du cookie de session", () => {
  async function cookieDeConnexionAvec(
    urlSite: string,
    productionSimulee = false,
  ): Promise<string> {
    // L'URL et l'environnement passent par les PARAMETRES de `creerAuth` et non
    // par `process.env` : les deux constantes sont figees a l'evaluation du
    // module, les reassigner apres l'import ne changerait rien et le test
    // verdirait sur l'instance par defaut sans exercer le cas vise.
    const { creerAuth } = await import("@/lib/auth");
    const { envoyeurJournalise } = await import("@/integrations/email");
    const instance = creerAuth(envoyeurJournalise, urlSite, productionSimulee);
    const email = `cookie-${Date.now()}@exemple.fr`;

    await instance.api.signUpEmail({
      body: { email, password: MOT_DE_PASSE_VALIDE, name: "Sonde" },
      asResponse: true,
    });
    const reponse = await instance.api.signInEmail({
      body: { email, password: MOT_DE_PASSE_VALIDE },
      asResponse: true,
    });

    return reponse.headers.get("set-cookie") ?? "";
  }

  it("porte Secure et le prefixe __Secure- sur un site en https", async () => {
    const cookie = await cookieDeConnexionAvec("https://boutique.exemple.fr");

    // LES DEUX ASSERTIONS COMPTENT. `Secure` interdit l'envoi en clair, et le
    // prefixe `__Secure-` interdit au navigateur d'accepter ce cookie depuis
    // une origine non chiffree, ce qui ferme la reecriture par un reseau
    // hostile. Better Auth pose les deux ensemble ou aucun des deux.
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toContain("__Secure-");
  });

  /**
   * LE TEST QUI COUVRE LE CAS REEL DU DEFAUT, et le seul.
   *
   * Le test precedent passe une URL en `https`, cas ou Better Auth deduit
   * correctement `Secure` tout seul : il reste vert meme sans `useSecureCookies`,
   * verifie par mutation. Le defaut mesure en LS-70 etait une production servie
   * derriere une URL en `http`, BETTER_AUTH_URL oubliee, ou la deduction donne
   * FAUX et le cookie part en clair.
   *
   * C'est donc ici que la protection se prouve.
   */
  it("porte Secure en production meme si l'URL est en http", async () => {
    const cookie = await cookieDeConnexionAvec("http://localhost:3000", true);

    expect(cookie).toMatch(/;\s*Secure/i);
  });

  it("ne pose pas Secure en developpement sur http", async () => {
    // Le contre-test : sans lui, poser `Secure` inconditionnellement passerait
    // le test ci-dessus tout en cassant le developpement local en clair, ou le
    // navigateur refuserait le cookie.
    const cookie = await cookieDeConnexionAvec("http://localhost:3000", false);

    expect(cookie).not.toMatch(/;\s*Secure/i);
  });

  it("porte HttpOnly et SameSite quelle que soit l'URL", async () => {
    const cookie = await cookieDeConnexionAvec("https://boutique.exemple.fr");

    // HttpOnly : un script de page ne lit pas le jeton de session, ce qui
    // limite le vol par injection de script.
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
  });

  it("le cookie n'est pas rejouable apres deconnexion", async () => {
    await creerCompte("deconnexion@exemple.fr");
    const connexion = await auth.api.signInEmail({
      body: { email: "deconnexion@exemple.fr", password: MOT_DE_PASSE_VALIDE },
      asResponse: true,
    });
    const enTetes = new Headers({
      cookie: connexion.headers.get("set-cookie")!,
    });

    expect(await lireIdentite(enTetes)).not.toBeNull();

    await auth.api.signOut({ headers: enTetes });

    // La session est supprimee EN BASE, le cookie ne vaut donc plus rien meme
    // si un attaquant l'avait copie. Un jeton seulement expire cote navigateur
    // resterait utilisable par qui l'a intercepte.
    expect(await lireIdentite(enTetes)).toBeNull();
  });
});

/**
 * REVOCATION IMMEDIATE DU ROLE.
 *
 * Propriete FRAGILE, signalee par la revue critique de LS-70 : elle tient au
 * fait que `session.cookieCache` n'est PAS active. Better Auth 1.6 sait servir
 * l'objet `user` depuis le cookie sans relire la base, ce qui reduit la
 * latence ; un retrait de role deviendrait alors inoperant jusqu'a l'expiration
 * du cache, l'exploitante revoquee gardant ses droits.
 *
 * Ce test echouerait si quelqu'un activait ce cache, ce qui est exactement le
 * signal attendu : le gain de latence doit etre un arbitrage conscient, pas un
 * effet de bord.
 */
/**
 * LIMITATION DE DEBIT, LS-79, ADR-027.
 *
 * `auth.api.*` N'EST PAS RATE-LIMITE, decouverte de cette session verifiee via
 * Context7 : « Rate limits in Better Auth only apply to client-initiated
 * requests. Server-side requests made using auth.api are not affected by rate
 * limiting. » Les six premiers tests ecrits pour ce ticket appelaient
 * `auth.api.signInEmail`, tous verts a tort jusqu'a l'assertion sur le 429,
 * qui n'arrivait jamais. CES TESTS FRAPPENT DONC `auth.handler` DIRECTEMENT,
 * avec de vraies `Request`, exactement le chemin que `toNextJsHandler`
 * emprunte depuis `src/app/api/auth/[...all]/route.ts`.
 *
 * CHAQUE SOUS-TEST PORTE SA PROPRE IP, via `x-forwarded-for` : la cle de
 * Better Auth combine route et IP, jamais l'email. Sans cette isolation, les
 * sous-tests de ce bloc partageraient un seul compteur par route et
 * s'epuiseraient les uns les autres, independamment de l'ordre d'execution.
 * C'est la meme IP simulee que retombe `getIp` sans en-tete, `127.0.0.1` en
 * environnement de test : lui laisser un en-tete explicite par sous-test
 * rend chacun independant sans devoir vider `rate_limit` entre eux.
 */
describe("limitation de debit, LS-79, ADR-027", () => {
  async function compterCompteursDebit(): Promise<number> {
    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*) AS nombre FROM rate_limit",
    );
    return Number(rows[0]!.nombre);
  }

  function requeteAuth(
    chemin: string,
    corps: Record<string, unknown>,
    ip: string,
  ): Request {
    return new Request(`http://localhost:3000/api/auth${chemin}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(corps),
    });
  }

  /**
   * VALEUR VOLONTAIREMENT FAUSSE, jamais un vrai mot de passe. Une constante
   * partagee plutot que des litteraux distincts par appel : GitGuardian a
   * signale les precedents comme secrets generiques, chacun ressemblant assez
   * a un identifiant pour declencher le detecteur. Le nom de la constante
   * porte l'intention.
   */
  const ESSAI_SANS_IMPORTANCE =
    "valeur-de-test-sans-rapport-avec-un-mot-de-passe-reel";

  it(
    "refuse la requete de trop sur la connexion, cinq admises",
    { timeout: 15000 },
    async () => {
      await creerCompte("cible.connexion@exemple.fr");

      const codes: number[] = [];
      // Six tentatives, un mot de passe volontairement faux : le rate limit
      // s'applique AVANT la verification du mot de passe, sur la route seule.
      for (let i = 0; i < 6; i += 1) {
        const reponse = await auth.handler(
          requeteAuth(
            "/sign-in/email",
            {
              email: "cible.connexion@exemple.fr",
              password: ESSAI_SANS_IMPORTANCE,
            },
            "203.0.113.10",
          ),
        );
        codes.push(reponse.status);
      }

      // CRITERE 4 : un usage legitime, plusieurs essais successifs, passe
      // avant le ralentissement. La regle configuree est cinq par minute :
      // les cinq premiers ne sont PAS 429, quel que soit leur resultat propre
      // face au mot de passe faux.
      expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true);
      // CRITERE 2 : la sixieme est reellement refusee, par le code de reponse
      // et non par la presence de la configuration.
      expect(codes[5]).toBe(429);
    },
  );

  it(
    "refuse la requete de trop sur la reinitialisation, trois admises",
    { timeout: 15000 },
    async () => {
      const codes: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const reponse = await auth.handler(
          requeteAuth(
            "/request-password-reset",
            { email: "cible.reinitialisation@exemple.fr" },
            "203.0.113.20",
          ),
        );
        codes.push(reponse.status);
      }

      expect(codes.slice(0, 3).every((c) => c !== 429)).toBe(true);
      expect(codes[3]).toBe(429);
    },
  );

  it(
    "refuse la requete de trop sur l'inscription, trois admises",
    { timeout: 15000 },
    async () => {
      const codes: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const reponse = await auth.handler(
          requeteAuth(
            "/sign-up/email",
            {
              email: `cible.inscription.${i}@exemple.fr`,
              password: MOT_DE_PASSE_VALIDE,
              name: "Cible inscription",
            },
            "203.0.113.30",
          ),
        );
        codes.push(reponse.status);
      }

      expect(codes.slice(0, 3).every((c) => c !== 429)).toBe(true);
      expect(codes[3]).toBe(429);
    },
  );

  it(
    "le message de refus ne revele pas si le compte existe",
    { timeout: 15000 },
    async () => {
      // Une IP dediee, epuisee ici meme : cinq essais sur un compte
      // INEXISTANT suffisent a atteindre le sixieme refus, sans dependre
      // d'un autre test de ce bloc.
      let derniere: Response | undefined;
      for (let i = 0; i < 6; i += 1) {
        derniere = await auth.handler(
          requeteAuth(
            "/sign-in/email",
            {
              email: "compte.jamais.cree@exemple.fr",
              password: ESSAI_SANS_IMPORTANCE,
            },
            "203.0.113.40",
          ),
        );
      }

      expect(derniere!.status).toBe(429);
      const corps = (await derniere!.json()) as {
        message?: string;
        code?: string;
      };
      const texte = JSON.stringify(corps).toLowerCase();
      // CRITERE 5. Ni "not found", ni "invalid", ni "unknown" : un message
      // qui varierait selon l'existence du compte le laisserait deviner par
      // simple observation du texte de refus. Le mecanisme integre repond
      // uniformement "Too many requests", verifie via Context7.
      expect(texte).not.toMatch(
        /not.?found|invalid.?email|no.?such|unknown.?user/,
      );
    },
  );

  it(
    "le compteur est en base et survit a une nouvelle instance, critere 1",
    { timeout: 15000 },
    async () => {
      const ip = "203.0.113.50";
      const avant = await compterCompteursDebit();

      // Cinq essais admis, sixieme refuse, sur la meme instance `auth`.
      const codes: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const reponse = await auth.handler(
          requeteAuth(
            "/sign-in/email",
            {
              email: "cible.redemarrage@exemple.fr",
              password: ESSAI_SANS_IMPORTANCE,
            },
            ip,
          ),
        );
        codes.push(reponse.status);
      }
      expect(codes[5]).toBe(429);
      expect(await compterCompteursDebit()).toBeGreaterThan(avant);

      // Une instance FRAICHE de Better Auth, motif deja utilise plus bas pour
      // les attributs du cookie : elle ne partage aucun etat en memoire avec
      // `auth`, la seule continuite possible passe par la table `rate_limit`.
      // Simule un redemarrage du processus serveur sans redemarrer Postgres.
      const { creerAuth } = await import("@/lib/auth");
      const { envoyeurJournalise } = await import("@/integrations/email");
      const instanceFraiche = creerAuth(envoyeurJournalise);

      const reponse = await instanceFraiche.handler(
        requeteAuth(
          "/sign-in/email",
          {
            email: "cible.redemarrage@exemple.fr",
            password: ESSAI_SANS_IMPORTANCE,
          },
          ip,
        ),
      );

      // Le compteur de cette IP est deja a six essais avant meme cet appel :
      // la nouvelle instance le voit en base et refuse tout de suite. Un
      // stockage en memoire repartirait de zero sur la nouvelle instance et
      // laisserait passer.
      expect(reponse.status).toBe(429);
    },
  );
});

describe("un changement de role prend effet sans reconnexion", () => {
  it("accorde puis retire les droits sur le meme cookie", async () => {
    await creerCompte("bascule@exemple.fr");
    const connexion = await auth.api.signInEmail({
      body: { email: "bascule@exemple.fr", password: MOT_DE_PASSE_VALIDE },
      asResponse: true,
    });
    const enTetes = new Headers({
      cookie: connexion.headers.get("set-cookie")!,
    });

    await expect(exigerAdministratrice(enTetes)).rejects.toBeInstanceOf(
      AutorisationRefuseeError,
    );

    await client.query(
      "UPDATE utilisateur SET role = 'ADMINISTRATRICE' WHERE email = $1",
      ["bascule@exemple.fr"],
    );
    expect((await exigerAdministratrice(enTetes)).role).toBe("ADMINISTRATRICE");

    // LE SENS QUI COMPTE VRAIMENT : le retrait. Une session qui garderait ses
    // droits apres revocation est le defaut grave, l'inverse n'est qu'une gene.
    await client.query(
      "UPDATE utilisateur SET role = 'CLIENT' WHERE email = $1",
      ["bascule@exemple.fr"],
    );
    await expect(exigerAdministratrice(enTetes)).rejects.toBeInstanceOf(
      AutorisationRefuseeError,
    );
  });
});

/**
 * LA JONCTION ENTRE BETTER AUTH ET LES MODELES D'EMAIL, LS-54.
 *
 * CE QUE CE BLOC EXISTE POUR ATTRAPER, et le defaut etait REEL au 2 septembre
 * 2026 : `auth.ts` passait `variables: { url }` quand les modeles exigent
 * `lien`. `rendreModele` levait donc « Variable « lien » absente », et NI la
 * verification d'adresse NI la reinitialisation de mot de passe ne partaient.
 * Total, et invisible.
 *
 * POURQUOI RIEN NE LE VOYAIT. Les tests de `modeles.ts` appellent
 * `rendreModele` directement en lui passant `lien`, donc la bonne cle. Ceux de
 * `auth.ts` ne rendaient aucun message. Chaque moitie etait juste isolement,
 * et la chaine ne se construisait qu'a l'execution. Motif deja en fiche, la
 * chaine construite a l'execution.
 *
 * L'ENVOYEUR INJECTE REND REELLEMENT LE MODELE au lieu de se contenter
 * d'enregistrer l'appel. Un double qui gobe ses arguments sans les rendre
 * resterait vert sur exactement ce defaut : c'est le rendu qui leve, pas
 * l'envoi.
 */
describe("les emails d'authentification traversent le rendu, LS-54", () => {
  type AppelEnvoi = { destinataire: string; modele: string; objet: string };

  /**
   * Monte une instance dont l'envoyeur rend le message pour de vrai.
   *
   * `creerAuth` prend l'envoyeur en premier parametre, ce qui evite de toucher
   * a l'instance partagee du module et laisse ce bloc independant des autres.
   */
  async function authAvecEnvoiObserve(appels: AppelEnvoi[]) {
    const { creerAuth } = await import("@/lib/auth");
    const { rendreModele } = await import("@/integrations/email/modeles");

    return creerAuth({
      envoyer: async (message) => {
        // LE RENDU EST L'OBJET DU TEST. Il leve si une variable manque, ce qui
        // est exactement le defaut corrige.
        const rendu = rendreModele(message);
        appels.push({
          destinataire: message.destinataire,
          modele: message.modele,
          objet: rendu.objet,
        });
      },
    });
  }

  it("envoie la verification d'adresse a l'inscription", async () => {
    const appels: AppelEnvoi[] = [];
    const instance = await authAvecEnvoiObserve(appels);

    await instance.api.signUpEmail({
      body: {
        email: "verification@exemple.fr",
        password: MOT_DE_PASSE_VALIDE,
        name: "Client",
      },
    });

    const verification = appels.find(
      (appel) => appel.modele === "verification-adresse",
    );

    // LE MESSAGE EST RENDU, donc la cle de variable est la bonne. Avant la
    // correction, `signUpEmail` remontait l'erreur du rendu.
    expect(verification).toBeDefined();
    expect(verification?.destinataire).toBe("verification@exemple.fr");
    expect(verification?.objet).toContain("adresse");
  });

  it("envoie la reinitialisation de mot de passe sur demande", async () => {
    const appels: AppelEnvoi[] = [];
    const instance = await authAvecEnvoiObserve(appels);

    await instance.api.signUpEmail({
      body: {
        email: "oubli@exemple.fr",
        password: MOT_DE_PASSE_VALIDE,
        name: "Client",
      },
    });

    await instance.api.requestPasswordReset({
      body: { email: "oubli@exemple.fr", redirectTo: "/compte/mot-de-passe" },
    });

    const reinitialisation = appels.find(
      (appel) => appel.modele === "reinitialisation-mot-de-passe",
    );

    expect(reinitialisation).toBeDefined();
    expect(reinitialisation?.destinataire).toBe("oubli@exemple.fr");
  });
});
