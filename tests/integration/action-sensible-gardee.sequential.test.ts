/**
 * Le branchement de la garde sur les actions sensibles reelles. LS-81 critere 3,
 * LS-89 critere 2. Zone critique : autorisation.
 *
 * CE QUE CETTE SUITE PROUVE, ET POURQUOI ELLE NE POUVAIT PAS EXISTER AVANT.
 * LS-81 a livre le mecanisme, LS-89 l'ecran, et tous deux ont ete testes sur
 * `exigerReauthentificationRecente` prise isolement. Aucune ACTION ne
 * l'appelait : le depot n'en portait aucune de sensible. LS-95 a fait naitre la
 * premiere, `supprimerMonCompte`, et c'est elle qui est exercee ici.
 *
 * « VERIFIE ACTION PAR ACTION ET NON PAR LA PRESENCE D'UN APPEL », exigence
 * ecrite dans les deux tickets. La nuance est tout l'objet de ce fichier.
 * `scripts/verifier-actions-sensibles.sh` prouve que le texte de l'appel figure
 * dans le corps de la fonction marquee ; c'est une propriete du FICHIER. Il ne
 * dit rien de ce qui se passe a l'execution : un appel place apres l'effet, ou
 * dont l'exception serait rattrapee sur place, le satisferait mot pour mot en
 * laissant le trou entier.
 *
 * MESURE AVANT ECRITURE, le 13 aout 2026 : la garde retiree du corps de
 * `supprimerMonCompte`, les neuf tests de `suppression-compte` restaient VERTS.
 * La seule action sensible du depot pouvait donc perdre sa protection sans
 * qu'aucun test ne rougisse. C'est le trou que ce fichier ferme.
 *
 * CHAQUE TEST REGARDE L'ETAT DE LA BASE, jamais seulement l'erreur levee. Un
 * refus et une panne laissent le meme etat final, « rien ne s'est passe » : ne
 * verifier que l'exception laisserait passer une garde qui leve APRES avoir
 * supprime. L'ordre des deux gestes est precisement ce qui doit etre prouve.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let supprimerMonCompte: typeof import("@/services/suppression-compte").supprimerMonCompte;
let enregistrerPreuveIdentite: typeof import("@/services/reauthentification").enregistrerPreuveIdentite;
let FENETRE_REAUTHENTIFICATION_MS: typeof import("@/services/reauthentification").FENETRE_REAUTHENTIFICATION_MS;
let ReauthentificationRequiseError: typeof import("@/services/reauthentification").ReauthentificationRequiseError;

const MOT_DE_PASSE_VALIDE = "phrase-de-passe1";
const EMAIL = "client@exemple.fr";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
  ({ supprimerMonCompte } = await import("@/services/suppression-compte"));
  ({
    enregistrerPreuveIdentite,
    FENETRE_REAUTHENTIFICATION_MS,
    ReauthentificationRequiseError,
  } = await import("@/services/reauthentification"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE journal_connexion, session, compte, verification, passkey,
              adresse_carnet, ligne_commande, commande, utilisateur CASCADE`,
  );
});

/**
 * Ouvre une session client reelle et rend ses en-tetes.
 *
 * UN COMPTE `CLIENT` ET NON `ADMINISTRATRICE` : la suppression de compte est une
 * action de l'espace client, c'est le role qui l'exerce reellement.
 */
async function ouvrirSessionClient(
  email = EMAIL,
): Promise<{ enTetes: Headers; sessionId: string; utilisateurId: string }> {
  await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE_VALIDE, name: "Client Test" },
  });

  const reponse = await auth.api.signInEmail({
    body: { email, password: MOT_DE_PASSE_VALIDE },
    asResponse: true,
  });
  const enTetes = new Headers({ cookie: reponse.headers.get("set-cookie")! });

  const session = await auth.api.getSession({ headers: enTetes });
  if (!session?.session) {
    throw new Error("La session de test n'a pas ete creee");
  }

  return {
    enTetes,
    sessionId: session.session.id,
    utilisateurId: session.user.id,
  };
}

async function compterUtilisateurs(): Promise<number> {
  const { rows } = await client.query(
    "SELECT count(*)::int AS n FROM utilisateur",
  );
  return rows[0].n as number;
}

describe("supprimerMonCompte, famille IDENTIFIANTS", () => {
  /**
   * LE TEST CENTRAL DE CE FICHIER, celui qui rougit si la garde disparait.
   *
   * La session est valide et le compte existe : tout est reuni pour que la
   * suppression aboutisse, SAUF la preuve d'identite recente. C'est le scenario
   * exact d'ADR-027, l'ordinateur laisse ouvert.
   */
  it("refuse la suppression sans preuve d'identite recente", async () => {
    const { enTetes, utilisateurId } = await ouvrirSessionClient();

    await expect(supprimerMonCompte(enTetes)).rejects.toBeInstanceOf(
      ReauthentificationRequiseError,
    );

    // L'ERREUR NE SUFFIT PAS : une garde qui leverait apres avoir supprime
    // produirait la meme exception. C'est la survie du compte qui prouve que
    // le refus precede l'effet.
    expect(await compterUtilisateurs()).toBe(1);
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM utilisateur WHERE id = $1",
      [utilisateurId],
    );
    expect(rows[0].n).toBe(1);
  });

  /**
   * LE PENDANT POSITIF, sans lequel le test precedent serait satisfait par une
   * fonction qui refuse TOUT. Une garde bloquee en position fermee protege
   * parfaitement et rend le droit a l'effacement inexerçable, article 17.
   */
  it("accepte la suppression apres une preuve fraiche", async () => {
    const { enTetes, sessionId } = await ouvrirSessionClient();

    await enregistrerPreuveIdentite(sessionId);

    const resultat = await supprimerMonCompte(enTetes);

    expect(resultat.etat).toBe("SUPPRIME");
    expect(await compterUtilisateurs()).toBe(0);
  });

  /**
   * LA FENETRE S'APPLIQUE A L'ACTION, et non seulement au service isole.
   *
   * La preuve existe, elle est simplement trop ancienne. Sans ce cas, une garde
   * qui se contenterait de tester la PRESENCE de `reauthentifieeLe` passerait :
   * c'est le defaut `preuveEncoreValable(null)` inverse de LS-81, transpose au
   * point d'entree.
   */
  it("refuse une preuve depassant la fenetre de validite", async () => {
    const { enTetes, sessionId } = await ouvrirSessionClient();

    const troisSecondesDeTrop = new Date(
      Date.now() - FENETRE_REAUTHENTIFICATION_MS - 3_000,
    );
    await enregistrerPreuveIdentite(sessionId, troisSecondesDeTrop);

    await expect(supprimerMonCompte(enTetes)).rejects.toBeInstanceOf(
      ReauthentificationRequiseError,
    );
    expect(await compterUtilisateurs()).toBe(1);
  });

  /**
   * LA PREUVE EST PORTEE PAR LA SESSION, pas par le compte.
   *
   * Deux sessions du meme compte, une seule a prouve l'identite. L'autre ne doit
   * rien pouvoir. Sans ce cas, une garde qui chercherait la preuve la plus
   * recente du COMPTE passerait, et un ordinateur laisse ouvert emprunterait la
   * preuve etablie ailleurs, ce qui est exactement le scenario vise.
   */
  it("n'emprunte pas la preuve d'une autre session du meme compte", async () => {
    const premiere = await ouvrirSessionClient();

    const reponse = await auth.api.signInEmail({
      body: { email: EMAIL, password: MOT_DE_PASSE_VALIDE },
      asResponse: true,
    });
    const enTetesSeconde = new Headers({
      cookie: reponse.headers.get("set-cookie")!,
    });
    const seconde = await auth.api.getSession({ headers: enTetesSeconde });

    // La preuve est etablie sur la PREMIERE session uniquement.
    await enregistrerPreuveIdentite(premiere.sessionId);
    expect(seconde?.session.id).not.toBe(premiere.sessionId);

    await expect(supprimerMonCompte(enTetesSeconde)).rejects.toBeInstanceOf(
      ReauthentificationRequiseError,
    );
    expect(await compterUtilisateurs()).toBe(1);
  });

  /**
   * SANS SESSION, LE REFUS EST D'UNE AUTRE NATURE et le code le distingue :
   * `SESSION_ABSENTE` plutot qu'une exception de fraicheur. L'interface doit
   * proposer de se reconnecter, pas de se reauthentifier.
   */
  it("distingue l'absence de session du manque de preuve", async () => {
    const resultat = await supprimerMonCompte(new Headers());

    expect(resultat.etat).toBe("SESSION_ABSENTE");
  });
});
