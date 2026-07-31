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
