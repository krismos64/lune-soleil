/**
 * Ralentissement par compte visé, exercé sur base réelle. LS-83, ADR-021
 * mesure 2, ADR-027. Zone critique : authentification.
 *
 * CE QUE CES TESTS PROUVENT ET QUE LE TEST UNITAIRE NE PEUT PAS. Celui-ci
 * vérifie la règle de délai, une arithmétique. Ici se prouvent les deux
 * propriétés qui dépendent de la base et qui portent toute la mesure : le
 * compteur suit la CIBLE et non l'origine, et une réussite l'efface.
 *
 * CES TESTS APPELLENT LE VRAI POINT D'ENTRÉE, `auth.handler` avec une vraie
 * `Request`, et non `auth.api.*`. La différence n'est pas cosmétique : LS-79 a
 * mesuré que `auth.api.*` court-circuite une partie de la chaîne, et six tests
 * y sont passés au vert sans rien exercer. Le hook qui ralentit vit dans cette
 * chaîne, et `auth.api.*` ne le déclenche pas.
 *
 * CE QUE CHAQUE TEST DOIT DISTINGUER. Sur tous les scénarios, la réponse HTTP
 * est identique que la protection existe ou non : un échec de connexion reste
 * un échec. Chaque test lit donc la LIGNE DE COMPTEUR en base, ou mesure le
 * temps réellement écoulé, jamais seulement que la connexion a échoué.
 *
 * AUCUNE ASSERTION NE PORTE SUR UN DÉLAI DE HUIT SECONDES. Un test qui dort
 * n'est pas un test qu'on relance : les scénarios restent sous le seuil de
 * ralentissement quand ils n'ont pas besoin de le franchir, et celui qui mesure
 * l'attente s'arrête au premier palier, cinq cents millisecondes.
 */
import { createHash } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let auth: typeof import("@/lib/auth").auth;

const MOT_DE_PASSE = "zorglub@cassiopee-1789";
const EMAIL_CIBLE = "cible@exemple.fr";

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
    "TRUNCATE journal_connexion, session, compte, verification, passkey, utilisateur, rate_limit, compteur_compte_vise CASCADE",
  );
});

/**
 * La clé que le service calcule, reconstruite ici pour lire la bonne ligne.
 *
 * ELLE EST RECOPIÉE ET NON IMPORTÉE, délibérément. `cleDe` n'est pas exportée,
 * et l'exporter pour ce test ferait passer l'assertion quelle que soit la
 * forme réelle de la clé, y compris si l'adresse cessait d'être hachée. Le test
 * doit échouer si le service se met à écrire une adresse en clair dans une
 * table du dépôt public, invariant 9.
 */
function cleAttendue(email: string): string {
  const empreinte = createHash("sha256")
    .update(email)
    .digest("hex")
    .slice(0, 32);

  return `compte-vise:${empreinte}`;
}

async function creerCompte(email: string) {
  await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE, name: "Essai" },
  });

  await client.query(
    "TRUNCATE journal_connexion, rate_limit, compteur_compte_vise",
  );
}

/**
 * Tente une connexion par le vrai chemin, depuis l'adresse IP demandée.
 *
 * L'ADRESSE IP EST UN PARAMÈTRE, ET C'EST LE CŒUR D'UN DES TESTS : la mesure
 * consiste précisément à varier l'origine en gardant la cible.
 */
async function tenterConnexion(
  email: string,
  motDePasse: string,
  adresseIp = "203.0.113.7",
) {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": adresseIp,
        "user-agent": "Navigateur-Essai/1.0",
      },
      body: JSON.stringify({ email, password: motDePasse }),
    }),
  );
}

/** Lit le compteur d'un compte visé, ou `null` s'il n'y en a aucun. */
async function lireCompteur(email: string): Promise<number | null> {
  const { rows } = await client.query<{ compte: number }>(
    "SELECT compte FROM compteur_compte_vise WHERE cle = $1",
    [cleAttendue(email)],
  );

  return rows[0] ? Number(rows[0].compte) : null;
}

describe("ralentissement par compte visé", () => {
  it("compte les échecs sur la cible, quelle que soit l'adresse d'origine", async () => {
    /*
     * LE TEST CENTRAL DE LA STORY, et l'écart exact qu'ADR-021 demandait de
     * fermer. La limitation intégrée de Better Auth compte par ADRESSE IP :
     * trois tentatives depuis trois adresses différentes ne l'approchent
     * jamais. Le compteur par compte, lui, doit les voir toutes les trois.
     *
     * SANS CETTE PROPRIÉTÉ, une campagne répartie sur un parc de machines
     * traverse la protection sans jamais la déclencher, et c'est la forme que
     * prend une attaque sérieuse.
     */
    await creerCompte(EMAIL_CIBLE);

    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe", "203.0.113.1");
    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe", "198.51.100.2");
    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe", "192.0.2.3");

    expect(await lireCompteur(EMAIL_CIBLE)).toBe(3);
  });

  it("n'écrit jamais l'adresse email en clair dans la table", async () => {
    /*
     * INVARIANT 9, ET LE DÉPÔT EST PUBLIC. `rate_limit` est une table
     * ordinaire : y écrire des adresses en clair ferait d'une fuite de cette
     * table une fuite de fichier client. La clé porte une empreinte, jamais
     * l'adresse.
     *
     * L'ASSERTION PORTE SUR TOUTE LA COLONNE, pas seulement sur la ligne
     * attendue : c'est ce qui attraperait une seconde écriture ajoutée plus
     * tard par un autre chemin.
     */
    await creerCompte(EMAIL_CIBLE);
    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe");

    const { rows } = await client.query<{ cle: string }>(
      "SELECT cle FROM compteur_compte_vise",
    );

    expect(rows.length).toBeGreaterThan(0);

    for (const { cle } of rows) {
      expect(cle).not.toContain(EMAIL_CIBLE);
      expect(cle).not.toContain("exemple.fr");
    }
  });

  it("compte la cible même quand aucun compte ne porte cette adresse", async () => {
    /*
     * IL NE RÉVÈLE PAS SI LE COMPTE EXISTE, et cette propriété est une
     * protection, pas un effet de bord. Si seules les adresses existantes
     * étaient comptées, mesurer le temps de réponse au sixième essai dirait
     * lequel des deux comptes existe : la protection deviendrait un oracle
     * d'énumération, exactement ce que Better Auth évite en ne distinguant pas
     * « adresse inconnue » de « mot de passe faux ».
     */
    await tenterConnexion("personne@exemple.fr", "mauvais-mot-de-passe");

    expect(await lireCompteur("personne@exemple.fr")).toBe(1);
  });

  it("ne distingue pas la casse de l'adresse visée", async () => {
    /*
     * SANS NORMALISATION, alterner la casse suffirait à multiplier les
     * compteurs : `Cible@exemple.fr`, `CIBLE@exemple.fr` et `cible@exemple.fr`
     * en auraient trois, et la variation est illimitée. Le plafond de cinq
     * échecs deviendrait alors sans objet.
     */
    await creerCompte(EMAIL_CIBLE);

    await tenterConnexion("Cible@Exemple.fr", "mauvais-mot-de-passe");
    await tenterConnexion("CIBLE@EXEMPLE.FR", "mauvais-mot-de-passe");

    expect(await lireCompteur(EMAIL_CIBLE)).toBe(2);
  });

  it("efface le compteur après une connexion réussie", async () => {
    /*
     * POURQUOI EFFACER PLUTÔT QUE LAISSER EXPIRER. Sans cela, une personne qui
     * se trompe six fois puis réussit resterait ralentie pour le reste des
     * quinze minutes, alors qu'elle vient de prouver son identité.
     *
     * CELA N'AFFAIBLIT PAS LA PROTECTION : le seul moyen de remettre le
     * compteur à zéro est de fournir le bon mot de passe, ce que l'attaquant
     * cherche et n'a pas.
     */
    await creerCompte(EMAIL_CIBLE);

    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe");
    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe");

    expect(await lireCompteur(EMAIL_CIBLE)).toBe(2);

    const reponse = await tenterConnexion(EMAIL_CIBLE, MOT_DE_PASSE);

    expect(reponse.status).toBe(200);
    expect(await lireCompteur(EMAIL_CIBLE)).toBeNull();
  });

  it("retarde réellement la réponse une fois le seuil franchi", async () => {
    /*
     * CE QUE CE TEST FERME, ET AUCUN AUTRE NE LE VOIT. Les tests ci-dessus
     * prouvent que le compteur monte ; ils resteraient tous VERTS si le hook
     * calculait le délai sans jamais l'appliquer, c'est-à-dire si le
     * ralentissement était une ligne morte. C'est le motif « fonction testée
     * jamais appelée » du dépôt.
     *
     * IL DÉPEND D'UNE PROPRIÉTÉ NON ÉVIDENTE DE BETTER AUTH : `runAfterHooks`
     * attend chaque hook en série AVANT de rendre la réponse, vérifié via
     * Context7 le 11 septembre 2026. Un hook dont le résultat serait ignoré
     * laisserait la réponse partir aussitôt.
     *
     * CHAQUE TENTATIVE VIENT D'UNE ADRESSE IP DIFFÉRENTE, ET C'EST OBLIGATOIRE,
     * pas un raffinement du scénario. `/sign-in/email` est plafonné à cinq
     * requêtes par minute et par adresse IP : depuis une seule origine, la
     * SIXIÈME tentative, celle qui déclenche le premier palier, part en 429
     * depuis `onRequest` sans jamais atteindre aucun hook. Mesuré à l'écriture
     * de LS-83, statut 429 rendu en 5 ms.
     *
     * CE N'EST PAS UNE LIMITE DE LA MESURE, c'est sa raison d'être. Les deux
     * mécanismes couvrent des populations disjointes : la limitation par IP
     * attrape la rafale depuis une machine et le fait AVANT ce hook ; le
     * ralentissement par compte n'a d'utilité que là où elle ne se déclenche
     * jamais, c'est-à-dire sur une campagne répartie. Un test mené depuis une
     * seule adresse ne peut donc rien exercer de ce que la story ajoute.
     *
     * LE SEUIL MESURÉ EST BAS, 300 ms pour un délai attendu de 500 ms. Une
     * marge serrée ferait clignoter le test sur une machine chargée, et ce
     * qu'il doit distinguer est « ça attend » de « ça n'attend pas », pas la
     * précision du minuteur.
     *
     * SIX ÉCHECS ET NON DIX : le premier palier suffit à prouver l'attente, et
     * s'arrêter là garde le test sous la seconde plutôt que de le faire dormir
     * huit secondes pour la même conclusion.
     */
    await creerCompte(EMAIL_CIBLE);

    for (let essai = 0; essai < 5; essai += 1) {
      await tenterConnexion(
        EMAIL_CIBLE,
        "mauvais-mot-de-passe",
        `203.0.113.${essai + 10}`,
      );
    }

    expect(await lireCompteur(EMAIL_CIBLE)).toBe(5);

    const debut = Date.now();

    const reponse = await tenterConnexion(
      EMAIL_CIBLE,
      "mauvais-mot-de-passe",
      "203.0.113.99",
    );

    // LE STATUT EST VÉRIFIÉ, sans quoi ce test resterait vert sur un 429 : un
    // refus de cadence n'est pas un ralentissement, et les confondre ferait
    // passer pour prouvée une mesure qui n'a jamais tourné.
    expect(reponse.status).toBe(401);
    expect(Date.now() - debut).toBeGreaterThanOrEqual(300);
  });

  it("ne retarde pas les cinq premiers échecs", async () => {
    /*
     * LE VERSANT INVERSE DU TEST PRÉCÉDENT, et il compte autant. Un
     * ralentissement qui commencerait dès la première tentative punirait
     * surtout le vrai propriétaire, dont la faute de frappe est le cas le plus
     * fréquent. Sans ce test, porter `ECHECS_SANS_DELAI` à zéro laisserait
     * toute la suite verte.
     */
    await creerCompte(EMAIL_CIBLE);

    const debut = Date.now();

    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe");

    expect(Date.now() - debut).toBeLessThan(300);
  });

  it("garde le compte au-dela de la fenetre de Better Auth", async () => {
    /*
     * LE TEST QUE LA REVUE DE LS-83 A EXIGE, ET LE DEFAUT QU'IL A TROUVE.
     *
     * La premiere version partageait `rate_limit`, la table de Better Auth, ce
     * que le ticket demandait : « ne pas reinventer un stockage ». Son limiteur
     * lance `deleteExpiredRows`, un `deleteMany` SANS AUCUN FILTRE DE CLE, des
     * qu'il croise une de SES lignes hors fenetre. Le seuil vaut soixante
     * secondes : toute ligne du projet plus vieille d'une minute partait avec
     * les siennes, et la fenetre de quinze minutes n'existait pas.
     *
     * CE QUE LE DEFAUT COUTAIT, et c'est ce qui le rend grave plutot que
     * genant : la mesure ne protegeait pas contre ce qu'elle vise. Une campagne
     * repartie sur un parc de machines est lente PAR CONSTRUCTION, justement
     * pour rester sous les seuils par IP : elle ne franchit jamais cinq echecs
     * en moins de soixante secondes. Seule la rafale rapide declenchait le
     * ralentissement, cas que la limitation par IP attrape deja.
     *
     * AUCUN AUTRE TEST NE POUVAIT LE VOIR. Les six autres enchainent leurs
     * tentatives en quelques millisecondes, donc toutes dans la fenetre de
     * soixante secondes. Ce qui manquait etait l'ECOULEMENT DU TEMPS, et la
     * fenetre annoncee n'etait donc verifiee nulle part.
     *
     * LE TEMPS EST SIMULE EN VIEILLISSANT LES LIGNES, jamais en dormant : un
     * test qui attend soixante-et-une secondes n'est pas un test qu'on
     * relance, et c'est la date en base que la purge regarde.
     *
     * LA TENTATIVE FINALE VIENT D'UNE ADRESSE DEJA VUE, et ce detail est le
     * declencheur : `deleteExpiredRows` ne part que lorsque Better Auth
     * rencontre une de ses propres lignes hors fenetre. Depuis une adresse
     * neuve, la purge ne se declencherait pas et le test passerait sans rien
     * exercer.
     */
    await creerCompte(EMAIL_CIBLE);

    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe", "203.0.113.20");
    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe", "203.0.113.21");
    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe", "203.0.113.22");
    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe", "203.0.113.23");

    expect(await lireCompteur(EMAIL_CIBLE)).toBe(4);

    // SOIXANTE-DIX SECONDES, au-dela du seuil de purge de Better Auth et bien
    // en deça de la fenetre de quinze minutes du service : c'est exactement
    // l'intervalle ou les deux se contredisaient.
    await client.query(
      "UPDATE rate_limit SET last_request = last_request - 70000",
    );
    await client.query(
      "UPDATE compteur_compte_vise SET derniere_a = derniere_a - interval '70 seconds'",
    );

    await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe", "203.0.113.20");

    /*
     * LA PURGE DE BETTER AUTH PART EN TACHE DE FOND, `runInBackground` : sans
     * cette pause, le test lirait le compteur avant que la suppression ait eu
     * lieu et resterait vert sur le defaut qu'il existe pour attraper.
     */
    await new Promise((resoudre) => setTimeout(resoudre, 200));

    // CINQ ET NON UN. Un compteur retombe a 1 est la signature exacte du
    // defaut : la ligne a ete effacee puis reinseree par la tentative.
    expect(await lireCompteur(EMAIL_CIBLE)).toBe(5);
  });

  it("ne gene pas un autre compte derriere la meme adresse IP", async () => {
    /*
     * CRITERE 3 DE LS-83, et c'est le versant qui protege les innocents. Une
     * adresse IP partagee est le cas ORDINAIRE, pas le cas limite : un reseau
     * d'entreprise, un operateur mobile, une borne publique. Si le compteur
     * suivait l'origine, les echecs de quelqu'un ralentiraient son voisin.
     *
     * LA PROPRIETE EST STRUCTURELLE, la cle etant l'empreinte de l'adresse
     * email et non de l'IP : c'est precisement l'inverse du mecanisme de
     * Better Auth, qui lui compte par origine. Elle n'en a pas moins besoin
     * d'un test, sans quoi un futur ajout de l'adresse IP a la cle, geste qui
     * semblerait durcir la protection, passerait sans rien faire rougir.
     */
    await creerCompte(EMAIL_CIBLE);
    await creerCompte("voisin@exemple.fr");

    const partagee = "203.0.113.200";

    for (let essai = 0; essai < 4; essai += 1) {
      await tenterConnexion(EMAIL_CIBLE, "mauvais-mot-de-passe", partagee);
    }

    expect(await lireCompteur(EMAIL_CIBLE)).toBe(4);

    // LE VOISIN PART DE ZERO malgre les quatre echecs venus de son adresse.
    expect(await lireCompteur("voisin@exemple.fr")).toBeNull();

    const debut = Date.now();

    await tenterConnexion(
      "voisin@exemple.fr",
      "mauvais-mot-de-passe",
      partagee,
    );

    // ET IL N'EST PAS RALENTI. Le compteur seul ne suffirait pas a le prouver :
    // c'est le temps que la personne subit.
    expect(Date.now() - debut).toBeLessThan(300);
    expect(await lireCompteur("voisin@exemple.fr")).toBe(1);
  });

  it("ne compte pas une saisie qui n'est pas une adresse", async () => {
    /*
     * LES SAISIES INFORMES NE PARTAGENT PAS UN COMPTEUR. Sans ce filtre, les
     * marqueurs du journal des connexions et toute saisie sans arobase
     * tomberaient dans une clé unique, qui ralentirait alors des personnes sans
     * aucun rapport entre elles : une seule campagne de balayage suffirait à
     * ralentir la première personne qui se trompe de champ.
     */
    await tenterConnexion("pas-une-adresse", "mauvais-mot-de-passe");

    const { rows } = await client.query<{ cle: string }>(
      "SELECT cle FROM compteur_compte_vise",
    );

    expect(rows).toHaveLength(0);
  });
});
