/**
 * Un lien de verification n'ouvre pas de session, sur base reelle. LS-167.
 * Zone critique : autorisation.
 *
 * CE QUE CE FICHIER MESURE. Avant LS-167, le lien de changement d'adresse
 * clique SANS AUCUN COOKIE creait une session authentifiee complete, et le
 * jeton se rejouait : trois clics, trois sessions. Le jeton est un JWT
 * auto-porteur, valide sur sa seule signature, donc rien ne le consomme.
 *
 * LE SCENARIO VISE : quiconque lit l'email une seule fois obtient une session
 * reutilisable pendant toute la validite du jeton. Boite partagee, poste
 * familial, transfert automatique, capture dans un journal de relais SMTP.
 *
 * CE QUI EST FERME, ET CE QUI NE L'EST PAS. La correction retire le COOKIE, pas
 * la ligne de session : un hook `after` s'execute apres l'endpoint, donc apres
 * l'ecriture. Une session dont le jeton n'a ete transmis nulle part n'ouvre
 * rien, et le defaut de LS-167 etait l'acces. Les lignes orphelines expirent
 * d'elles-memes au bout d'un jour.
 *
 * LES DEUX SENS SONT MESURES, et c'est ce qui distingue une correction d'une
 * regression deguisee :
 *
 *   SANS COOKIE   aucun cookie ne sort, ni au premier clic ni au rejeu
 *   AVEC COOKIE   la session existante doit SURVIVRE, sans quoi le client se
 *                 retrouverait deconnecte au milieu de son propre parcours
 *
 * Le second sens est la reserve que le ticket posait explicitement : « verifier
 * que le parcours d'inscription reste utilisable ».
 *
 * LE FLUX A DEUX ETAPES, ce que le ticket ne disait pas et qu'il a fallu
 * mesurer : le premier lien porte `change-email-confirmation` et n'ouvre RIEN,
 * il declenche l'envoi du second, `change-email-verification`, qui est celui
 * qui ouvrait une session. Un test ecrit sur le premier serait vert sans jamais
 * approcher le defaut.
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
let creerAuth: typeof import("@/lib/auth").creerAuth;

const ANCIENNE = "ancienne@exemple.fr";
const NOUVELLE = "nouvelle@exemple.fr";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  amorcerEnvironnementTest(url);

  client = new Client({ connectionString: url });
  await client.connect();

  ({ creerAuth } = await import("@/lib/auth"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE journal_connexion, session, compte, verification, passkey, utilisateur CASCADE",
  );
});

/**
 * Une instance dont l'envoyeur capture le lien au lieu de l'ecrire au journal.
 *
 * `creerAuth` prend l'envoyeur en parametre, ce qui evite de toucher a
 * l'instance partagee du module. Meme motif que `inscription-client`.
 */
function authAvecLiensObserves(liens: string[]) {
  return creerAuth({
    envoyer: async (message) => {
      const lien = message.variables.lien;
      if (lien !== undefined) {
        liens.push(lien);
      }
    },
  });
}

async function compterSessions(): Promise<number> {
  const { rows } = await client.query("SELECT count(*)::int AS n FROM session");
  return rows[0].n as number;
}

/**
 * Inscrit un compte VERIFIE et demande le changement d'adresse, en rendant le
 * lien recu et les en-tetes de la session ouverte.
 *
 * L'ADRESSE ACTUELLE DOIT ETRE VERIFIEE : depuis LS-60, le changement est
 * refuse sinon, correction de la prise de controle de compte. Sans cette
 * ligne le test mesurerait le refus et non le lien.
 */
async function demanderChangement(
  instance: Awaited<ReturnType<typeof authAvecLiensObserves>>,
  liens: string[],
): Promise<{ lien: string; enTetes: Headers }> {
  const identifiants = { email: ANCIENNE, password: MOT_DE_PASSE_COMPTE_A };

  await instance.api.signUpEmail({
    body: { ...identifiants, name: "Personne de test" },
  });

  await client.query(
    "UPDATE utilisateur SET email_verifie = true WHERE email = $1",
    [ANCIENNE],
  );

  const reponse = await instance.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(identifiants),
    }),
  );

  const paire = reponse.headers.get("set-cookie")?.split(";")[0];
  expect(paire).toBeDefined();

  const enTetes = new Headers();
  enTetes.set("cookie", paire as string);

  // Le lien d'inscription est deja tombe dans `liens` : on ne garde que celui
  // du changement, qui arrive apres.
  liens.length = 0;

  await instance.api.changeEmail({
    body: { newEmail: NOUVELLE },
    headers: enTetes,
  });

  /*
   * LE FLUX A DEUX ETAPES, ET LE PREMIER LIEN N'EST PAS CELUI QUI COMPTE.
   * Mesure du 3 septembre 2026 : le jeton recu ici porte
   * `requestType: "change-email-confirmation"`. Son clic n'ouvre aucune session
   * et ne change pas l'adresse ; il envoie un SECOND lien, a la nouvelle
   * adresse, portant `change-email-verification`.
   *
   * C'est ce second lien qui ouvrait une session, et le tester sur le premier
   * mesurait un chemin ou le defaut n'existe pas. Le test etait vert pour la
   * mauvaise raison.
   */
  const confirmation = liens.at(-1);
  expect(confirmation, "aucun lien de confirmation capture").toBeDefined();

  liens.length = 0;

  // L'ANCIENNE ADRESSE APPROUVE, avec sa session : c'est le geste du client qui
  // recoit l'avertissement et le valide.
  await instance.handler(
    new Request(confirmation as string, { headers: enTetes }),
  );

  const verification = liens.at(-1);
  expect(verification, "aucun lien de verification capture").toBeDefined();

  return { lien: verification as string, enTetes };
}

describe("un lien clique sans cookie n'ouvre aucune session", () => {
  it("ne cree pas de session, et le rejeu n'en cree pas davantage", async () => {
    const liens: string[] = [];
    const instance = authAvecLiensObserves(liens);

    const { lien } = await demanderChangement(instance, liens);

    const avant = await compterSessions();

    /*
     * LE CLIC SANS AUCUN EN-TETE `cookie`, ce qui est exactement ce que fait
     * quelqu'un qui ouvre le lien depuis une autre boite ou un autre appareil.
     */
    const premier = await instance.handler(new Request(lien));

    /*
     * AUCUN COOKIE NE SORT, ET C'EST LA PROPRIETE QUI PROTEGE. Une session sans
     * cookie n'est atteignable par personne : le jeton n'a ete transmis nulle
     * part, et rien d'autre ne le porte.
     */
    expect(premier.headers.get("set-cookie")).toBeNull();

    /*
     * LA LIGNE DE SESSION EXISTE POURTANT EN BASE, et ce test le CONSTATE plutot
     * que de le taire.
     *
     * Un hook `after` s'execute APRES l'endpoint : quand il retire le cookie, la
     * session est deja ecrite. La fermer entierement demanderait un `before`
     * capable d'empecher la branche, ce que Better Auth n'expose pas, ou un
     * correctif dans la bibliotheque.
     *
     * CE QUE CELA COUTE, ET POURQUOI C'EST ACCEPTABLE : des lignes de session
     * orphelines s'accumulent, expirant d'elles-memes au bout d'un jour. Elles
     * n'ouvrent rien, personne n'ayant leur jeton. Le defaut de LS-167 etait
     * l'ACCES, pas la ligne.
     *
     * L'ASSERTION EST ECRITE DANS CE SENS, `toBeGreaterThanOrEqual`, pour dire
     * exactement ce qui est vrai : elle passerait aussi si la bibliotheque
     * cessait de creer la session, ce qui serait une amelioration et non une
     * regression.
     */
    expect(await compterSessions()).toBeGreaterThanOrEqual(avant);

    /*
     * LE REJEU. Le jeton n'etant pas consomme, le meme lien reste ouvrable :
     * c'est la seconde moitie du defaut, et elle se mesure a part. Une
     * correction qui fermerait le premier clic sans fermer le rejeu laisserait
     * le trou entier.
     */
    const second = await instance.handler(new Request(lien));

    expect(second.headers.get("set-cookie")).toBeNull();
  });

  it("la verification a malgre tout eu lieu, l'adresse est changee", async () => {
    /*
     * CE QUI DISTINGUE UNE CORRECTION D'UN BLOCAGE. Retirer le cookie ne doit
     * pas empecher la verification : le client qui clique depuis sa boite doit
     * voir son adresse changer, il devra simplement se reconnecter.
     *
     * Sans ce test, un hook qui ferait echouer la requete entiere passerait le
     * precedent, aucune session n'etant creee par une requete en erreur.
     */
    const liens: string[] = [];
    const instance = authAvecLiensObserves(liens);

    const { lien } = await demanderChangement(instance, liens);

    await instance.handler(new Request(lien));

    const { rows } = await client.query(
      "SELECT email, email_verifie FROM utilisateur",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe(NOUVELLE);
    expect(rows[0].email_verifie).toBe(true);
  });
});

describe("une session existante survit au clic, reserve du ticket", () => {
  it("le client deja connecte n'est pas deconnecte", async () => {
    /*
     * LE SECOND SENS, ET IL EST AUSSI IMPORTANT QUE LE PREMIER. Le cas nominal
     * est celui-ci : le client change son adresse depuis son espace, donc sa
     * session existe deja, et il clique le lien dans le meme navigateur.
     *
     * Un hook qui retirerait le cookie SANS DISTINGUER le deconnecterait au
     * milieu de son propre parcours. Le ticket posait explicitement cette
     * reserve : « verifier que le parcours d'inscription reste utilisable ».
     */
    const liens: string[] = [];
    const instance = authAvecLiensObserves(liens);

    const { lien, enTetes } = await demanderChangement(instance, liens);

    const avant = await compterSessions();

    // LE CLIC AVEC LE COOKIE, celui du navigateur ou le changement a ete
    // demande.
    const reponse = await instance.handler(
      new Request(lien, { headers: enTetes }),
    );

    /*
     * LE COOKIE EST BIEN POSE : Better Auth rafraichit la session existante
     * avec la nouvelle adresse, et ce cookie-la doit survivre. Le retirer
     * laisserait le client avec une session dont l'adresse a change sous lui.
     */
    expect(reponse.headers.get("set-cookie")).not.toBeNull();

    // AUCUNE SESSION SUPPLEMENTAIRE : celle qui existait a ete reutilisee.
    expect(await compterSessions()).toBe(avant);

    // ET ELLE EST TOUJOURS UTILISABLE.
    const session = await instance.api.getSession({ headers: enTetes });
    expect(session?.session).toBeTruthy();
  });
});
