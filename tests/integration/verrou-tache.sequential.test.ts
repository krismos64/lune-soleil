/**
 * Verrou de tache planifiee, exerce sur base reelle. LS-72, regle E8.
 * Zone critique : ce verrou protege le stock d'une double decrementation.
 *
 * LE TEST DE CONCURRENCE EST LE CRITERE QUI COMPTE, le ticket le dit et il a
 * ete ecrit avant le reste. Sans lui, le reste de cette suite verifierait qu'un
 * verrou s'ecrit et se supprime, ce qu'un `INSERT` naif ferait tout aussi bien.
 *
 * CE QUE CHAQUE TEST DOIT DISTINGUER. Sur plusieurs scenarios l'etat final de
 * la base est IDENTIQUE que la protection existe ou non : une seule ligne dans
 * `verrou_tache`, parce que l'unicite l'impose de toute facon. Ce qui separe
 * les deux cas est le NOMBRE D'APPELANTS SERVIS, jamais le contenu de la table.
 * C'est la lecon de LS-68, ou la contrainte CHECK rattrapait l'UPDATE et
 * produisait le meme etat final.
 */
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let pool: Pool;
let executerSousVerrou: typeof import("@/services/tache-planifiee").executerSousVerrou;
let TACHES: typeof import("@/services/tache-planifiee").TACHES;

const TACHE = "liberation-reservations" as const;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  // UN POOL ET NON UN CLIENT UNIQUE pour la concurrence : un client unique
  // serialise les requetes sur une seule connexion, et le test mesurerait
  // alors une execution sequentielle en croyant mesurer de la concurrence.
  pool = new Pool({ connectionString: url, max: 20 });

  ({ executerSousVerrou, TACHES } = await import("@/services/tache-planifiee"));
});

afterAll(async () => {
  await pool.end();
  await client.end();
});

afterEach(async () => {
  await client.query("TRUNCATE verrou_tache");
});

async function lignesVerrou() {
  const { rows } = await client.query(
    "SELECT nom, id, acquis_a, expire_a FROM verrou_tache ORDER BY nom",
  );
  return rows;
}

describe("concurrence, le critere qui compte", () => {
  /**
   * VINGT APPELS SIMULTANES, UN SEUL SERVI.
   *
   * Le travail est volontairement LENT, cinquante millisecondes : sans cela,
   * la premiere execution se termine et relache le verrou avant que les
   * suivantes ne le demandent, et le test passerait au vert sans avoir mis
   * deux appelants en concurrence une seule fois.
   */
  it("vingt executions simultanees, une seule obtient le verrou", async () => {
    const compteur = { executions: 0 };

    const resultats = await Promise.all(
      Array.from({ length: 20 }, () =>
        executerSousVerrou(TACHE, async () => {
          compteur.executions += 1;
          await new Promise((resoudre) => setTimeout(resoudre, 50));
        }),
      ),
    );

    const executees = resultats.filter((r) => r.etat === "EXECUTEE");
    const ignorees = resultats.filter((r) => r.etat === "IGNOREE");

    // LE COMPTE DES APPELANTS SERVIS, et non l'etat de la table : c'est la
    // seule mesure qui distingue un verrou d'un simple INSERT unique.
    expect(executees).toHaveLength(1);
    expect(ignorees).toHaveLength(19);
    expect(compteur.executions).toBe(1);

    // Chaque refus dit POURQUOI : un `IGNOREE` sans motif se confondrait avec
    // une tache qui n'a rien trouve a faire.
    for (const ignoree of ignorees) {
      expect(ignoree).toMatchObject({ motif: "verrou-detenu-ailleurs" });
    }

    // Le verrou est relache a la fin, la table est vide.
    expect(await lignesVerrou()).toHaveLength(0);
  });

  /**
   * DEUX TACHES DIFFERENTES NE SE BLOQUENT PAS. Un verrou global les
   * serialiserait : la reconciliation attendrait la liberation sans aucune
   * raison, et une tache lente retarderait l'autre.
   */
  it("deux taches distinctes s'executent en parallele", async () => {
    const executees: string[] = [];

    const resultats = await Promise.all([
      executerSousVerrou("liberation-reservations", async () => {
        executees.push("liberation");
        await new Promise((resoudre) => setTimeout(resoudre, 50));
      }),
      executerSousVerrou("reconciliation-paiements", async () => {
        executees.push("reconciliation");
        await new Promise((resoudre) => setTimeout(resoudre, 50));
      }),
    ]);

    expect(resultats.every((r) => r.etat === "EXECUTEE")).toBe(true);
    expect(executees.sort()).toEqual(["liberation", "reconciliation"]);
  });
});

describe("reprise d'un verrou expire", () => {
  /**
   * UNE INSTANCE MORTE NE BLOQUE PAS LA TACHE POUR TOUJOURS, second critere
   * explicite du ticket.
   *
   * Le verrou est pose a la main avec une expiration DEJA PASSEE, ce qui
   * simule exactement une instance tuee en cours de travail : la ligne reste,
   * personne ne la relachera jamais.
   */
  it("un verrou expire est repris par l'execution suivante", async () => {
    await client.query(
      `INSERT INTO verrou_tache (id, nom, acquis_a, expire_a)
       VALUES ('instance-morte', $1, now() - interval '1 hour', now() - interval '30 minutes')`,
      [TACHE],
    );

    let execute = false;
    const resultat = await executerSousVerrou(TACHE, async () => {
      execute = true;
    });

    expect(resultat.etat).toBe("EXECUTEE");
    expect(execute).toBe(true);
    expect(await lignesVerrou()).toHaveLength(0);
  });

  /**
   * LE REVERS, ET C'EST LUI QUI PROUVE QUE LA CONDITION D'EXPIRATION EXISTE.
   *
   * Un verrou NON expire ne doit jamais etre vole. Sans ce test, un
   * `ON CONFLICT DO UPDATE` sans clause `WHERE` passerait le test precedent
   * tout en ecrasant systematiquement le verrou d'autrui : la reprise
   * marcherait, et la protection n'existerait plus.
   */
  it("un verrou encore valide n'est jamais vole", async () => {
    await client.query(
      `INSERT INTO verrou_tache (id, nom, acquis_a, expire_a)
       VALUES ('instance-active', $1, now(), now() + interval '10 minutes')`,
      [TACHE],
    );

    let execute = false;
    const resultat = await executerSousVerrou(TACHE, async () => {
      execute = true;
    });

    expect(resultat).toMatchObject({
      etat: "IGNOREE",
      motif: "verrou-detenu-ailleurs",
    });
    expect(execute).toBe(false);

    // LE VERROU D'AUTRUI EST INTACT, ni son detenteur ni son expiration n'ont
    // bouge. Un `DO UPDATE` sans condition aurait remplace `id`.
    const lignes = await lignesVerrou();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].id).toBe("instance-active");
  });
});

describe("relachement", () => {
  /**
   * LE VERROU PART MEME SI LE TRAVAIL LEVE, sans quoi une seule exception
   * bloquerait la tache jusqu'a l'expiration, et une exception recurrente la
   * bloquerait pour toujours.
   */
  it("une tache qui leve relache quand meme son verrou", async () => {
    const resultat = await executerSousVerrou(TACHE, async () => {
      throw new Error("panne simulee");
    });

    expect(resultat.etat).toBe("ECHOUEE");
    expect(await lignesVerrou()).toHaveLength(0);

    // ET LA TACHE SUIVANTE PASSE : c'est la propriete utile, pas la table vide.
    const suivante = await executerSousVerrou(TACHE, async () => {});
    expect(suivante.etat).toBe("EXECUTEE");
  });

  /**
   * UNE INSTANCE EN RETARD NE RELACHE PAS LE VERROU DE SA REMPLACANTE.
   *
   * Scenario : A prend le verrou, se fige, son verrou expire, B le reprend
   * legitimement. A se reveille et termine. Sans la condition sur le jeton, A
   * supprimerait la ligne de B, qui continuerait a travailler en croyant
   * detenir le verrou pendant qu'une troisieme instance le prendrait. Deux
   * executions simultanees, exactement ce que la table empeche.
   */
  it("le relachement ne touche pas le verrou d'une autre instance", async () => {
    const resultat = await executerSousVerrou(TACHE, async () => {
      // Pendant le travail, le verrou expire et une autre instance le reprend.
      await client.query(
        `UPDATE verrou_tache
         SET id = 'instance-remplacante', expire_a = now() + interval '10 minutes'
         WHERE nom = $1`,
        [TACHE],
      );
    });

    expect(resultat.etat).toBe("EXECUTEE");

    // LE VERROU DE LA REMPLACANTE EST TOUJOURS LA.
    const lignes = await lignesVerrou();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].id).toBe("instance-remplacante");
  });
});

describe("duree du verrou", () => {
  /**
   * L'EXPIRATION EST POSEE PAR L'HORLOGE DE POSTGRESQL, invariant 8, et non par
   * celle de Node. Deux conteneurs dont les horloges derivent compareraient
   * sinon des instants incomparables, et la fenetre de reprise s'ouvrirait trop
   * tot sur l'un d'eux.
   */
  it("l'expiration suit la duree configuree pour la tache", async () => {
    // Le verrou est observe PENDANT le travail : apres, il est relache.
    let mesure: { acquis: Date; expire: Date } | null = null;

    await executerSousVerrou(TACHE, async () => {
      const lignes = await lignesVerrou();
      mesure = {
        acquis: lignes[0].acquis_a as Date,
        expire: lignes[0].expire_a as Date,
      };
    });

    expect(mesure).not.toBeNull();

    const ecartSecondes =
      (mesure!.expire.getTime() - mesure!.acquis.getTime()) / 1000;

    expect(ecartSecondes).toBe(TACHES[TACHE].dureeVerrouSecondes);
  });
});

describe("route interne, secret partage et invariant 2", () => {
  /**
   * CE QUE CES TESTS PROUVENT ET QUE LE TEST UNITAIRE NE PROUVE PAS : que la
   * ROUTE appelle vraiment la garde. Un adaptateur qui oublierait l'appel
   * passerait tous les tests de `secret-cron.test.ts`, la fonction gardee
   * etant correcte et simplement jamais invoquee. C'est la lecon de LS-70.
   */
  const SECRET = "secret-de-test-uniquement-jamais-en-production";

  let POST: (
    requete: Request,
    contexte: { params: Promise<{ nom: string }> },
  ) => Promise<Response>;

  beforeAll(async () => {
    process.env.CRON_SHARED_SECRET = SECRET;
    ({ POST } = await import("@/app/api/interne/taches/[nom]/route"));
  });

  function appeler(nom: string, secret?: string) {
    const enTetes = new Headers();
    if (secret !== undefined) {
      enTetes.set("x-cron-secret", secret);
    }

    return POST(
      new Request(`http://localhost:3000/api/interne/taches/${nom}`, {
        method: "POST",
        headers: enTetes,
      }),
      { params: Promise.resolve({ nom }) },
    );
  }

  it("execute la tache avec le bon secret", async () => {
    const reponse = await appeler(TACHE, SECRET);

    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({
      tache: TACHE,
      etat: "EXECUTEE",
    });
  });

  /** TEST NEGATIF DE SECURITE, exige par le ticket. */
  it("refuse un appel sans secret, et n'execute rien", async () => {
    const reponse = await appeler(TACHE);

    expect(reponse.status).toBe(404);
    // AUCUN VERROU N'A ETE PRIS : le refus intervient avant toute ecriture.
    expect(await lignesVerrou()).toHaveLength(0);
  });

  it("refuse un appel au secret faux", async () => {
    const reponse = await appeler(TACHE, `${SECRET.slice(0, -1)}X`);

    expect(reponse.status).toBe(404);
    expect(await lignesVerrou()).toHaveLength(0);
  });

  /**
   * UNE TACHE INCONNUE EST REFUSEE MEME AVEC LE BON SECRET. Sans ce filtre, un
   * appelant muni du secret creerait un verrou portant le nom de son choix,
   * remplissant la table de lignes qu'aucune tache ne relacherait.
   */
  it("refuse un nom de tache absent de la table connue", async () => {
    const reponse = await appeler("tache-inventee", SECRET);

    expect(reponse.status).toBe(404);
    expect(await lignesVerrou()).toHaveLength(0);
  });

  /**
   * LE REFUS EST INDISCERNABLE ENTRE TACHE CONNUE ET INCONNUE pour qui ne
   * prouve rien. Repondre 401 sur l'une et 404 sur l'autre publierait la liste
   * des taches internes a un appelant non authentifie.
   */
  it("sans secret, tache connue et inconnue rendent la meme reponse", async () => {
    const connue = await appeler(TACHE);
    const inconnue = await appeler("tache-inventee");

    expect(connue.status).toBe(inconnue.status);
    expect(await connue.text()).toBe(await inconnue.text());
  });

  it("un second appel pendant le verrou est ignore, sans erreur", async () => {
    await client.query(
      `INSERT INTO verrou_tache (id, nom, acquis_a, expire_a)
       VALUES ('autre-instance', $1, now(), now() + interval '10 minutes')`,
      [TACHE],
    );

    const reponse = await appeler(TACHE, SECRET);

    // 200 ET NON 409 : ne rien faire est le comportement attendu, pas une
    // erreur. Un cron qui recevrait une erreur toutes les cinq minutes
    // apprendrait a ignorer ses alertes.
    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({
      tache: TACHE,
      etat: "IGNOREE",
    });
  });
});
