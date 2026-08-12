/**
 * Purge des journaux, exercee sur base reelle. LS-94, regle E14.
 *
 * CE QUE CETTE SUITE DOIT PROUVER, ET CE QU'ELLE NE DOIT PAS SE CONTENTER DE
 * VERIFIER. Une purge est un `DELETE` : le test facile ecrit une ligne
 * ancienne, appelle la purge et constate qu'elle a disparu. Ce test passerait
 * tout aussi bien sur un `DELETE` SANS CLAUSE `WHERE`, c'est-a-dire sur la pire
 * version possible de la fonction, celle qui vide la table entiere.
 *
 * LE TEST NEGATIF EST DONC LE CRITERE QUI COMPTE, critere 6 du ticket : une
 * ligne ENCORE DANS LA FENETRE de conservation doit survivre. « Une purge trop
 * large est pire qu'une purge absente », parce qu'elle detruit la trace qu'on
 * conservait justement pour un incident.
 *
 * CHAQUE TEST ECRIT LES DEUX LIGNES, ancienne et recente, et verifie les deux
 * assertions. Les separer en deux tests laisserait passer une purge qui vide
 * tout : le premier test serait vert, et le second echouerait sans qu'on sache
 * lequel des deux dit la verite.
 *
 * L'ECRITURE PASSE PAR SQL DIRECT et non par Prisma, parce que `cree_a` porte
 * un `DEFAULT CURRENT_TIMESTAMP` : ecrire une ligne datee de sept mois exige de
 * poser la colonne explicitement, ce que le service ne permet pas et ne doit
 * pas permettre.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let purgerJournaux: typeof import("@/services/purge-journaux").purgerJournaux;
let purgerJournalAudit: typeof import("@/services/purge-journaux").purgerJournalAudit;
let purgerRateLimit: typeof import("@/services/purge-journaux").purgerRateLimit;
let CONSERVATION_RATE_LIMIT_HEURES: typeof import("@/services/purge-journaux").CONSERVATION_RATE_LIMIT_HEURES;
let limiteDeConservation: typeof import("@/services/journal-connexion").limiteDeConservation;

/**
 * L'instant de reference des tests, fige plutot que `new Date()`.
 *
 * Un `maintenant` fige rend le test reproductible et permet de placer les
 * lignes exactement de part et d'autre de la limite. Le quantieme est
 * VOLONTAIREMENT le 31 : c'est celui qui a revele le debordement de
 * `setUTCMonth` en relecture de LS-80, le 31 aout moins six mois donnant le
 * 3 mars. Ancrer un quantieme sur (par exemple) le 11 n'expose jamais ce
 * defaut.
 */
const MAINTENANT = new Date("2026-08-31T12:00:00.000Z");

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({
    purgerJournaux,
    purgerJournalAudit,
    purgerRateLimit,
    CONSERVATION_RATE_LIMIT_HEURES,
  } = await import("@/services/purge-journaux"));
  ({ limiteDeConservation } = await import("@/services/journal-connexion"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE journal_connexion, journal_audit, rate_limit CASCADE",
  );
});

/** Decale une date d'un nombre de jours, sans toucher a l'original. */
function ilYAJours(reference: Date, jours: number): Date {
  return new Date(reference.getTime() - jours * 24 * 60 * 60 * 1000);
}

async function ecrireLigneAudit(creeA: Date, action: string): Promise<void> {
  await client.query(
    `INSERT INTO journal_audit (id, action, type_cible, id_cible, detail, cree_a)
     VALUES (gen_random_uuid()::text, $1, 'Produit', 'cible-test', '{}'::jsonb, $2)`,
    [action, creeA.toISOString()],
  );
}

async function ecrireLigneConnexion(
  creeA: Date,
  emailTente: string,
): Promise<void> {
  await client.query(
    `INSERT INTO journal_connexion (id, email_tente, moyen, issue, cree_a)
     VALUES (gen_random_uuid()::text, $1, 'MOT_DE_PASSE', 'REUSSITE', $2)`,
    [emailTente, creeA.toISOString()],
  );
}

async function ecrireLigneRateLimit(
  derniereRequete: Date,
  cle: string,
): Promise<void> {
  await client.query(
    `INSERT INTO rate_limit (id, key, count, last_request)
     VALUES (gen_random_uuid()::text, $1, 1, $2)`,
    [cle, derniereRequete.getTime()],
  );
}

async function clesRestantes(
  table: string,
  colonne: string,
): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT ${colonne} AS valeur FROM ${table} ORDER BY ${colonne}`,
  );
  return rows.map((ligne: { valeur: string }) => ligne.valeur);
}

describe("purge de JournalAudit, six mois", () => {
  it("supprime une ligne trop ancienne ET conserve une ligne dans la fenetre", async () => {
    // Sept mois : au-dela des six mois de conservation, quelle que soit la
    // longueur des mois traverses.
    await ecrireLigneAudit(ilYAJours(MAINTENANT, 213), "trop-ancienne");
    // Cinq jours : trivialement dans la fenetre. C'est la ligne dont la
    // survie invalide un `DELETE` sans clause.
    await ecrireLigneAudit(ilYAJours(MAINTENANT, 5), "recente");

    const supprimees = await purgerJournalAudit(MAINTENANT);

    expect(supprimees).toBe(1);
    expect(await clesRestantes("journal_audit", "action")).toEqual(["recente"]);
  });

  it("conserve une ligne posee exactement a la limite, comparaison stricte", async () => {
    /**
     * LA FRONTIERE, et le choix `lt` plutot que `lte` qu'elle exerce. La purge
     * de LS-80 documente la position : « a la frontiere, garder une ligne de
     * trop vaut mieux qu'en supprimer une qui pouvait servir ». Sans ce test,
     * un passage a `lte` ne ferait rougir aucune assertion.
     *
     * LA LIMITE VIENT DE `limiteDeConservation` ELLE-MEME, jamais d'un calcul
     * recopie ici. Premiere version de ce test : un
     * `setUTCMonth(mois - CONSERVATION_JOURNAL_MOIS)` ecrit a la main, qui
     * paraissait equivalent. Il ne l'est pas, et c'est exactement le defaut que
     * la relecture de LS-80 avait deja trouve : sur le 31 aout, le calcul naif
     * rend le 3 MARS quand la fonction rend le 28 FEVRIER, trois jours
     * d'ecart. La ligne se trouvait donc trois jours APRES la limite, ou elle
     * survit que la comparaison soit stricte ou non.
     *
     * La mutation `lt` -> `lte` restait verte, et ce test ne prouvait rien.
     * Une frontiere ne se teste qu'avec la valeur exacte de la frontiere,
     * demandee au code qui la calcule.
     */
    const limite = limiteDeConservation(MAINTENANT);

    await ecrireLigneAudit(limite, "pile-a-la-limite");

    const supprimees = await purgerJournalAudit(MAINTENANT);

    expect(supprimees).toBe(0);
    expect(await clesRestantes("journal_audit", "action")).toEqual([
      "pile-a-la-limite",
    ]);
  });
});

describe("purge de RateLimit, vingt-quatre heures", () => {
  it("supprime une ligne hors fenetre ET conserve une ligne recente", async () => {
    const horsFenetre = new Date(
      MAINTENANT.getTime() -
        (CONSERVATION_RATE_LIMIT_HEURES + 1) * 60 * 60 * 1000,
    );
    const dansFenetre = new Date(MAINTENANT.getTime() - 60 * 60 * 1000);

    await ecrireLigneRateLimit(horsFenetre, "ancienne|/sign-in/email");
    await ecrireLigneRateLimit(dansFenetre, "recente|/sign-in/email");

    const supprimees = await purgerRateLimit(MAINTENANT);

    expect(supprimees).toBe(1);
    expect(await clesRestantes("rate_limit", "key")).toEqual([
      "recente|/sign-in/email",
    ]);
  });

  it("compare des millisecondes et non des secondes", async () => {
    /**
     * LE DEFAUT QUE CE TEST VISE, et qu'aucun parcours nominal ne montre.
     * `last_request` porte des MILLISECONDES depuis l'epoch, `Date.now()`
     * verifie dans le code de Better Auth. Comparer a une valeur en SECONDES
     * produirait une limite mille fois trop petite, donc anterieure a 1970 :
     * plus aucune ligne ne serait jamais supprimee, et la table grossirait
     * indefiniment sans qu'aucune erreur n'apparaisse.
     *
     * Une ligne datee de mille jours est tres au-dela de toute limite
     * plausible en millisecondes, et tres en deca si la comparaison se faisait
     * en secondes. Sa suppression separe donc les deux unites.
     */
    await ecrireLigneRateLimit(
      ilYAJours(MAINTENANT, 1000),
      "tres-ancienne|/sign-in/email",
    );

    const supprimees = await purgerRateLimit(MAINTENANT);

    expect(supprimees).toBe(1);
    expect(await clesRestantes("rate_limit", "key")).toEqual([]);
  });
});

describe("purge des trois journaux ensemble", () => {
  it("purge les trois tables en une passe, sans toucher aux lignes recentes", async () => {
    await ecrireLigneConnexion(ilYAJours(MAINTENANT, 213), "vieux@exemple.fr");
    await ecrireLigneConnexion(ilYAJours(MAINTENANT, 2), "recent@exemple.fr");
    await ecrireLigneAudit(ilYAJours(MAINTENANT, 213), "audit-vieux");
    await ecrireLigneAudit(ilYAJours(MAINTENANT, 2), "audit-recent");
    await ecrireLigneRateLimit(ilYAJours(MAINTENANT, 30), "vieux|/sign-in");
    await ecrireLigneRateLimit(MAINTENANT, "recent|/sign-in");

    const resultats = await purgerJournaux(MAINTENANT);

    // Chaque table a supprime exactement sa ligne ancienne.
    expect(resultats).toEqual([
      { table: "JournalConnexion", supprimees: 1, echec: false },
      { table: "JournalAudit", supprimees: 1, echec: false },
      { table: "RateLimit", supprimees: 1, echec: false },
    ]);

    // Et surtout, les trois lignes recentes sont toujours la.
    expect(await clesRestantes("journal_connexion", "email_tente")).toEqual([
      "recent@exemple.fr",
    ]);
    expect(await clesRestantes("journal_audit", "action")).toEqual([
      "audit-recent",
    ]);
    expect(await clesRestantes("rate_limit", "key")).toEqual([
      "recent|/sign-in",
    ]);
  });

  it("une purge en echec n'empeche pas les suivantes", async () => {
    /**
     * LE CRITERE 4, ET IL SE PROUVE EN CASSANT UNE TABLE. Renommer
     * `journal_audit` fait echouer la deuxieme purge sur une relation
     * inexistante, sans toucher aux deux autres.
     *
     * POURQUOI PAS UNE SIMULATION DE PRISMA. Un `vi.mock` prouverait que le
     * `try` attrape ce qu'on lui fait lever, c'est-a-dire qu'il prouverait le
     * test lui-meme. Une vraie erreur de base exerce le chemin reel, y compris
     * le fait que l'erreur de Prisma ne soit pas d'un type que le `catch`
     * laisserait passer.
     *
     * LE RENOMMAGE EST DEFAIT DANS UN `finally` : sans cela, la table
     * resterait absente et TOUS les tests suivants echoueraient, ce qui ferait
     * chercher le defaut au mauvais endroit.
     */
    await ecrireLigneConnexion(ilYAJours(MAINTENANT, 213), "vieux@exemple.fr");
    await ecrireLigneRateLimit(ilYAJours(MAINTENANT, 30), "vieux|/sign-in");

    await client.query("ALTER TABLE journal_audit RENAME TO journal_audit_off");

    try {
      const resultats = await purgerJournaux(MAINTENANT);

      // La table du milieu a echoue...
      expect(resultats[1]).toEqual({
        table: "JournalAudit",
        supprimees: 0,
        echec: true,
      });

      // ...et les deux autres ont travaille quand meme, ce qui est le point.
      expect(resultats[0]).toEqual({
        table: "JournalConnexion",
        supprimees: 1,
        echec: false,
      });
      expect(resultats[2]).toEqual({
        table: "RateLimit",
        supprimees: 1,
        echec: false,
      });

      expect(await clesRestantes("journal_connexion", "email_tente")).toEqual(
        [],
      );
      expect(await clesRestantes("rate_limit", "key")).toEqual([]);
    } finally {
      await client.query(
        "ALTER TABLE journal_audit_off RENAME TO journal_audit",
      );
    }
  });

  it("ne leve jamais, meme quand toutes les purges echouent", async () => {
    /**
     * Une tache planifiee n'a personne devant elle. Si `purgerJournaux`
     * levait, l'exception traverserait `executerSousVerrou` qui la
     * journaliserait en `ECHOUEE` : le comportement resterait acceptable, mais
     * on perdrait le detail de QUELLES tables ont echoue, seule information
     * utile a la reparation.
     */
    await client.query("ALTER TABLE journal_connexion RENAME TO jc_off");
    await client.query("ALTER TABLE journal_audit RENAME TO ja_off");
    await client.query("ALTER TABLE rate_limit RENAME TO rl_off");

    try {
      const resultats = await purgerJournaux(MAINTENANT);

      expect(resultats.every((r) => r.echec)).toBe(true);
      expect(resultats.map((r) => r.table)).toEqual([
        "JournalConnexion",
        "JournalAudit",
        "RateLimit",
      ]);
    } finally {
      await client.query("ALTER TABLE jc_off RENAME TO journal_connexion");
      await client.query("ALTER TABLE ja_off RENAME TO journal_audit");
      await client.query("ALTER TABLE rl_off RENAME TO rate_limit");
    }
  });
});
