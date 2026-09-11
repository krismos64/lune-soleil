/**
 * ALERTES CRITIQUES, consultation et acquittement, LS-98.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE, ET CE QU'AUCUN TEST NE COUVRAIT.
 *
 * SEPT services levent des alertes, `confirmation.ts`,
 * `document-comptable.ts`, `webhook-paiement.ts`, `traitement-retractation.ts`,
 * `avoir.ts`, `envoi-email.ts` et `suivi-livraison.ts`. AUCUN code ne les
 * LISAIT avant le 11 septembre 2026 : `DOUBLE_ENCAISSEMENT` et
 * `MONTANT_DIVERGENT` se signalaient dans une table que rien ne consultait.
 *
 * Une alerte que personne ne voit est un incident non traite, et tout le
 * mecanisme existait par ailleurs, gravite, index d'unicite et colonnes
 * d'acquittement compris.
 * ------------------------------------------------------------------
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let lireAlertes: typeof import("@/services/alerte").lireAlertes;
let acquitter: typeof import("@/services/alerte").acquitter;

/** Pose une alerte directement en base, comme le ferait un service. */
async function poserAlerte(parametres: {
  type: string;
  gravite: "AVERTISSEMENT" | "CRITIQUE";
  idCible?: string;
  creeA?: string;
}): Promise<string> {
  const id = randomUUID();

  await client.query(
    `INSERT INTO alerte_critique
       (id, type, message, gravite, type_cible, id_cible, cree_a)
     VALUES ($1, $2, $3, $4, 'Commande', $5, ${parametres.creeA ?? "now()"})`,
    [
      id,
      parametres.type,
      `TEST Message de ${parametres.type}`,
      parametres.gravite,
      parametres.idCible ?? randomUUID(),
    ],
  );

  return id;
}

/** Cree une administratrice et rend son identifiant. */
async function creerAdministratrice(): Promise<string> {
  const id = randomUUID();

  await client.query(
    `INSERT INTO utilisateur (id, email, email_verifie, nom, role, cree_a, mis_a_jour_a)
     VALUES ($1, $2, true, 'TEST Exploitante', 'ADMINISTRATRICE', now(), now())`,
    [id, `ls98-alerte-${id}@exemple.test`],
  );

  return id;
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ lireAlertes, acquitter } = await import("@/services/alerte"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query("DELETE FROM alerte_critique");
  /*
   * LES COMPTES PARTENT AUSSI : la regle E1 n'admet qu'UNE administratrice, et
   * deux tests qui en creent chacune une heurteraient l'index partiel.
   */
  await client.query("DELETE FROM utilisateur WHERE role = 'ADMINISTRATRICE'");
});

describe("lireAlertes", () => {
  /*
   * ------------------------------------------------------------------
   * L'ORDRE PORTE UNE DECISION D'USAGE, et ce test est celui qui compte.
   *
   * Une `CRITIQUE` de la semaine derniere passe AVANT un `AVERTISSEMENT` d'il y
   * a une heure. Trier par date seule enterrerait un double encaissement sous
   * des avertissements de livraison, au moment precis ou l'exploitante a besoin
   * de le voir.
   *
   * LE PIEGE QU'IL ATTRAPE : PostgreSQL ordonne un enum par sa DECLARATION, et
   * `GraviteAlerte` liste `AVERTISSEMENT` avant `CRITIQUE`. Un tri ascendant,
   * qui parait naturel, mettrait donc les avertissements en tete.
   * ------------------------------------------------------------------
   */
  it("presente les critiques avant les avertissements, meme plus anciennes", async () => {
    await poserAlerte({
      type: "DOUBLE_ENCAISSEMENT",
      gravite: "CRITIQUE",
      creeA: "now() - interval '7 days'",
    });
    await poserAlerte({
      type: "ENVOI_EMAIL_BLOQUE",
      gravite: "AVERTISSEMENT",
      creeA: "now() - interval '1 hour'",
    });

    const { ouvertes } = await lireAlertes();

    expect(ouvertes).toHaveLength(2);
    expect(ouvertes[0]?.type).toBe("DOUBLE_ENCAISSEMENT");
    expect(ouvertes[1]?.type).toBe("ENVOI_EMAIL_BLOQUE");
  });

  /*
   * LES DEUX LISTES NE SE MELANGENT PAS, et le sens negatif compte autant : une
   * alerte acquittee qui resterait dans les ouvertes ferait retraiter un
   * incident clos.
   */
  it("separe les alertes ouvertes des alertes acquittees", async () => {
    const ouverte = await poserAlerte({
      type: "MONTANT_DIVERGENT",
      gravite: "CRITIQUE",
    });
    const traitee = await poserAlerte({
      type: "FACTURE_NON_EMISE",
      gravite: "CRITIQUE",
    });

    const administratrice = await creerAdministratrice();
    await acquitter({ alerteId: traitee, acquitteeParId: administratrice });

    const { ouvertes, acquittees } = await lireAlertes();

    expect(ouvertes.map((alerte) => alerte.id)).toEqual([ouverte]);
    expect(acquittees.map((alerte) => alerte.id)).toEqual([traitee]);
  });

  it("nomme qui a acquitte", async () => {
    const alerte = await poserAlerte({
      type: "PDF_FACTURE_EN_ECHEC",
      gravite: "AVERTISSEMENT",
    });
    const administratrice = await creerAdministratrice();

    await acquitter({ alerteId: alerte, acquitteeParId: administratrice });

    const { acquittees } = await lireAlertes();

    expect(acquittees[0]?.acquitteePar).toBe("TEST Exploitante");
    expect(acquittees[0]?.acquitteeA).not.toBeNull();
  });
});

describe("acquitter", () => {
  it("retire l'alerte de la file et fait descendre le compte", async () => {
    const alerte = await poserAlerte({
      type: "STOCK_INSUFFISANT_A_LA_CONFIRMATION",
      gravite: "CRITIQUE",
    });
    const administratrice = await creerAdministratrice();

    /*
     * LE COMPTE EST LU EN SQL ET NON PAR LE REPOSITORY, mesure faite plutot que
     * supposee : `compterAlertesOuvertes` attend un client PRISMA, et lui
     * passer le client `pg` de ce fichier echoue a l'execution. La requete dit
     * la meme chose sans emprunter un type qui ne correspond pas.
     */
    const compte = async (): Promise<number> => {
      const { rows } = await client.query<{ nombre: string }>(
        "SELECT count(*)::text AS nombre FROM alerte_critique WHERE acquittee_a IS NULL",
      );
      return Number(rows[0]?.nombre);
    };

    expect(await compte()).toBe(1);

    const issue = await acquitter({
      alerteId: alerte,
      acquitteeParId: administratrice,
    });

    expect(issue.statut).toBe("ACQUITTEE");

    /*
     * LE COMPTE DESCEND, et c'est ce qui alimente la pastille de la barre. Sans
     * cette assertion, un acquittement qui n'ecrirait rien passerait sur le
     * seul statut rendu.
     */
    expect(await compte()).toBe(0);
  });

  /*
   * ------------------------------------------------------------------
   * LE SECOND ACQUITTEMENT N'ECRASE PAS LE PREMIER, et c'est le test qui
   * justifie la condition `acquitteeA: null` du `WHERE`.
   *
   * SANS ELLE, un double clic remplacerait la date et le nom : l'historique
   * dirait que la derniere personne a traite l'incident, alors qu'elle n'a fait
   * que recliquer. Regle E7, une alerte s'acquitte et ne se reecrit jamais.
   *
   * LE STATUT `DEJA_TRAITEE` N'EST PAS UN ECHEC : un double clic est un geste
   * ordinaire, et l'ecran le presente comme un fait sans gravite.
   * ------------------------------------------------------------------
   */
  it("refuse un second acquittement sans ecraser le premier", async () => {
    const alerte = await poserAlerte({
      type: "AVOIR_NON_EMIS",
      gravite: "CRITIQUE",
    });
    const premiere = await creerAdministratrice();

    await acquitter({ alerteId: alerte, acquitteeParId: premiere });

    const { rows: avant } = await client.query<{ acquittee: Date }>(
      "SELECT acquittee_a AS acquittee FROM alerte_critique WHERE id = $1",
      [alerte],
    );

    const issue = await acquitter({
      alerteId: alerte,
      acquitteeParId: premiere,
    });

    expect(issue.statut).toBe("DEJA_TRAITEE");

    const { rows: apres } = await client.query<{
      acquittee: Date;
      par: string;
    }>(
      `SELECT acquittee_a AS acquittee, acquittee_par_id AS par
         FROM alerte_critique WHERE id = $1`,
      [alerte],
    );

    expect(apres[0]?.acquittee).toEqual(avant[0]?.acquittee);
    expect(apres[0]?.par).toBe(premiere);
  });

  /*
   * UNE ALERTE INEXISTANTE REND LE MEME STATUT QU'UNE ALERTE DEJA TRAITEE, et
   * la confusion est deliberee : les distinguer revelerait l'existence d'un
   * identifiant a qui le devine. Meme regle que le 404 de la route de facture.
   */
  it("confond une alerte inconnue avec une alerte deja traitee", async () => {
    const administratrice = await creerAdministratrice();

    const issue = await acquitter({
      alerteId: randomUUID(),
      acquitteeParId: administratrice,
    });

    expect(issue.statut).toBe("DEJA_TRAITEE");
  });

  /*
   * L'ALERTE N'EST JAMAIS SUPPRIMEE, regle E7. Le test verifie la LIGNE en base
   * et non la liste : un service qui supprimerait au lieu d'acquitter ferait
   * passer tous les tests de liste ci-dessus.
   */
  it("conserve l'alerte en base apres acquittement", async () => {
    const alerte = await poserAlerte({
      type: "PAIEMENT_SUR_COMMANDE_ANNULEE",
      gravite: "CRITIQUE",
    });
    const administratrice = await creerAdministratrice();

    await acquitter({ alerteId: alerte, acquitteeParId: administratrice });

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM alerte_critique WHERE id = $1",
      [alerte],
    );

    expect(Number(rows[0]?.nombre)).toBe(1);
  });
});
