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
let purgerEnvoisTermines: typeof import("@/services/purge-journaux").purgerEnvoisTermines;
let purgerMessages: typeof import("@/services/purge-journaux").purgerMessages;
let CONSERVATION_ENVOI_TERMINE_JOURS: typeof import("@/services/purge-journaux").CONSERVATION_ENVOI_TERMINE_JOURS;
let CONSERVATION_MESSAGE_ANNEES: typeof import("@/services/purge-journaux").CONSERVATION_MESSAGE_ANNEES;
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
    purgerEnvoisTermines,
    purgerMessages,
    CONSERVATION_ENVOI_TERMINE_JOURS,
    CONSERVATION_MESSAGE_ANNEES,
  } = await import("@/services/purge-journaux"));
  ({ limiteDeConservation } = await import("@/services/journal-connexion"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE journal_connexion, journal_audit, rate_limit, envoi_en_attente, message CASCADE",
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

/**
 * Une ligne d'outbox dans l'etat demande.
 *
 * `prise_a` EST POSE SUR `ENVOI_EN_COURS` SEULEMENT, C31 n'existant pas mais la
 * coherence important : une ligne prise sans horodatage de prise serait
 * indistinguable d'une ligne prise a l'instant, ce que le delai de garde de
 * `envoi-email.ts` mesure precisement.
 */
async function ecrireEnvoi(
  creeA: Date,
  statut: string,
  modele: string,
): Promise<void> {
  await client.query(
    `INSERT INTO envoi_en_attente (
       id, commande_id, destinataire, modele, variables, statut, origine,
       tentatives, prise_a, cree_a
     )
     VALUES (gen_random_uuid()::text, NULL, 'test@exemple.invalid', $1,
             '{}'::jsonb, $2::"StatutEnvoi", 'SYSTEME', 0,
             CASE WHEN $2 = 'ENVOI_EN_COURS' THEN $3::timestamptz ELSE NULL END,
             $3)`,
    [modele, statut, creeA.toISOString()],
  );
}

async function ecrireMessage(creeA: Date, sujet: string): Promise<void> {
  await client.query(
    `INSERT INTO message (id, nom, email, sujet, corps, statut, cree_a)
     VALUES (gen_random_uuid()::text, 'TEST Personne', 'test@exemple.invalid',
             $1, 'Corps du message de test.', 'NOUVEAU', $2)`,
    [sujet, creeA.toISOString()],
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

describe("purge de EnvoiEnAttente, les lignes TERMINEES seulement", () => {
  it("supprime une ligne terminee ancienne ET conserve une ligne recente", async () => {
    const horsFenetre = ilYAJours(
      MAINTENANT,
      CONSERVATION_ENVOI_TERMINE_JOURS + 1,
    );
    const dansFenetre = ilYAJours(MAINTENANT, 1);

    await ecrireEnvoi(horsFenetre, "ENVOYE", "ancienne-envoyee");
    await ecrireEnvoi(dansFenetre, "ENVOYE", "recente-envoyee");

    const supprimees = await purgerEnvoisTermines(MAINTENANT);

    expect(supprimees).toBe(1);
    expect(await clesRestantes("envoi_en_attente", "modele")).toEqual([
      "recente-envoyee",
    ]);
  });

  it("supprime aussi les lignes ECHOUE anciennes, leur trace vivant ailleurs", async () => {
    /*
     * `ECHOUE` EST TERMINEE AU MEME TITRE QUE `ENVOYE`, et le registre le dit :
     * l'information de fond survit dans `JournalEmail`, qui est la trace
     * opposable. La distinguer ici ferait garder deux fois la meme chose.
     */
    await ecrireEnvoi(
      ilYAJours(MAINTENANT, CONSERVATION_ENVOI_TERMINE_JOURS + 1),
      "ECHOUE",
      "ancienne-echouee",
    );

    const supprimees = await purgerEnvoisTermines(MAINTENANT);

    expect(supprimees).toBe(1);
    expect(await clesRestantes("envoi_en_attente", "modele")).toEqual([]);
  });

  it("NE SUPPRIME JAMAIS une ligne ENVOI_EN_COURS, quel que soit son age", async () => {
    /*
     * LE CRITERE 2, ET LE COEUR DE CETTE STORY. Une ligne bloquee est AMBIGUE :
     * personne ne sait si le message est parti, ADR-033 refuse de trancher
     * automatiquement, et une alerte appelle l'exploitante a decider.
     *
     * LA PURGER EFFACERAIT PRECISEMENT CE QU'IL FAUT TRAITER, et le ferait en
     * silence : l'incident disparaitrait sans avoir ete resolu. C'est la raison
     * pour laquelle cette purge n'a pas ete ecrite dans LS-82, ou un
     * `deleteMany` par age aurait suffi.
     *
     * L'AGE EST DEMESURE, mille jours, pour qu'aucune borne de duree plausible
     * ne puisse expliquer la survie de la ligne : seul le filtre sur le statut
     * la protege.
     */
    await ecrireEnvoi(ilYAJours(MAINTENANT, 1000), "ENVOI_EN_COURS", "bloquee");

    const supprimees = await purgerEnvoisTermines(MAINTENANT);

    expect(supprimees).toBe(0);
    expect(await clesRestantes("envoi_en_attente", "modele")).toEqual([
      "bloquee",
    ]);
  });

  it("NE SUPPRIME JAMAIS une ligne EN_ATTENTE, quel que soit son age", async () => {
    /*
     * LE CRITERE 3. Une ligne en attente n'est pas encore partie : la purger
     * priverait un client de sa confirmation, et le message serait perdu sans
     * qu'aucune trace ne subsiste.
     *
     * UNE LIGNE TRES ANCIENNE EN ATTENTE EST ELLE-MEME UN INCIDENT, la tache
     * d'expedition tournant tous les quarts d'heure. La purger effacerait le
     * symptome au lieu de le montrer.
     */
    await ecrireEnvoi(ilYAJours(MAINTENANT, 1000), "EN_ATTENTE", "en-attente");

    const supprimees = await purgerEnvoisTermines(MAINTENANT);

    expect(supprimees).toBe(0);
    expect(await clesRestantes("envoi_en_attente", "modele")).toEqual([
      "en-attente",
    ]);
  });

  it("distingue les quatre statuts dans une seule passe", async () => {
    /*
     * LES QUATRE ETATS ENSEMBLE, ET TOUS ANCIENS. Les tester separement
     * laisserait passer un filtre qui garde le bon statut par hasard : ici les
     * quatre lignes sont hors fenetre, et seules DEUX doivent partir.
     */
    const vieux = ilYAJours(MAINTENANT, 1000);

    await ecrireEnvoi(vieux, "ENVOYE", "a-envoyee");
    await ecrireEnvoi(vieux, "ECHOUE", "b-echouee");
    await ecrireEnvoi(vieux, "ENVOI_EN_COURS", "c-bloquee");
    await ecrireEnvoi(vieux, "EN_ATTENTE", "d-attente");

    const supprimees = await purgerEnvoisTermines(MAINTENANT);

    expect(supprimees).toBe(2);
    expect(await clesRestantes("envoi_en_attente", "modele")).toEqual([
      "c-bloquee",
      "d-attente",
    ]);
  });
});

describe("purge de Message, trois ans", () => {
  it("supprime un message hors fenetre ET conserve un message recent", async () => {
    const horsFenetre = ilYAJours(
      MAINTENANT,
      CONSERVATION_MESSAGE_ANNEES * 365 + 30,
    );
    const dansFenetre = ilYAJours(MAINTENANT, 300);

    await ecrireMessage(horsFenetre, "ancien");
    await ecrireMessage(dansFenetre, "recent");

    const supprimees = await purgerMessages(MAINTENANT);

    expect(supprimees).toBe(1);
    expect(await clesRestantes("message", "sujet")).toEqual(["recent"]);
  });

  it("ne regarde pas le statut, contrairement a l'outbox", async () => {
    /*
     * L'ASYMETRIE AVEC `EnvoiEnAttente` EST VOULUE ET ELLE SE JUSTIFIE.
     *
     * Une ligne d'outbox bloquee est un INCIDENT a traiter : la purger
     * effacerait le travail. Un message NON LU de trois ans n'est pas un
     * incident, c'est une demande a laquelle personne n'a repondu et a laquelle
     * plus personne ne repondra : le conserver au-dela de la duree annoncee
     * contredirait la minimisation sans rendre service a qui que ce soit.
     *
     * LA DUREE EST LE SEUL CRITERE ICI, et ce test le fige : un filtre sur le
     * statut ajoute plus tard ferait rougir.
     */
    const vieux = ilYAJours(MAINTENANT, CONSERVATION_MESSAGE_ANNEES * 365 + 30);

    await client.query(
      `INSERT INTO message (id, nom, email, sujet, corps, statut, lu_a, cree_a)
       VALUES (gen_random_uuid()::text, 'TEST', 'test@exemple.invalid',
               'ancien-lu', 'Corps.', 'LU', $1, $1)`,
      [vieux.toISOString()],
    );
    await ecrireMessage(vieux, "ancien-nouveau");

    const supprimees = await purgerMessages(MAINTENANT);

    expect(supprimees).toBe(2);
    expect(await clesRestantes("message", "sujet")).toEqual([]);
  });
});

describe("purge des cinq tables ensemble", () => {
  it("purge les cinq tables en une passe, sans toucher aux lignes recentes", async () => {
    await ecrireLigneConnexion(ilYAJours(MAINTENANT, 213), "vieux@exemple.fr");
    await ecrireLigneConnexion(ilYAJours(MAINTENANT, 2), "recent@exemple.fr");
    await ecrireLigneAudit(ilYAJours(MAINTENANT, 213), "audit-vieux");
    await ecrireLigneAudit(ilYAJours(MAINTENANT, 2), "audit-recent");
    await ecrireLigneRateLimit(ilYAJours(MAINTENANT, 30), "vieux|/sign-in");
    await ecrireLigneRateLimit(MAINTENANT, "recent|/sign-in");
    await ecrireEnvoi(ilYAJours(MAINTENANT, 400), "ENVOYE", "envoi-vieux");
    await ecrireEnvoi(ilYAJours(MAINTENANT, 2), "ENVOYE", "envoi-recent");
    /*
     * UNE LIGNE BLOQUEE ANCIENNE DANS LA PASSE COMPLETE, et non seulement dans
     * son test isole : c'est ici qu'une purge trop large se verrait, la ou
     * cinq tables sont traitees d'affilee et ou l'attention se relache.
     */
    await ecrireEnvoi(ilYAJours(MAINTENANT, 400), "ENVOI_EN_COURS", "bloquee");
    await ecrireMessage(ilYAJours(MAINTENANT, 1500), "message-vieux");
    await ecrireMessage(ilYAJours(MAINTENANT, 2), "message-recent");

    const resultats = await purgerJournaux(MAINTENANT);

    // Chaque table a supprime exactement sa ligne ancienne.
    expect(resultats).toEqual([
      { table: "JournalConnexion", supprimees: 1, echec: false },
      { table: "JournalAudit", supprimees: 1, echec: false },
      { table: "RateLimit", supprimees: 1, echec: false },
      { table: "EnvoiEnAttente", supprimees: 1, echec: false },
      { table: "Message", supprimees: 1, echec: false },
    ]);

    // Et surtout, les lignes recentes sont toujours la.
    expect(await clesRestantes("journal_connexion", "email_tente")).toEqual([
      "recent@exemple.fr",
    ]);
    expect(await clesRestantes("journal_audit", "action")).toEqual([
      "audit-recent",
    ]);
    expect(await clesRestantes("rate_limit", "key")).toEqual([
      "recent|/sign-in",
    ]);
    /*
     * LA LIGNE BLOQUEE SURVIT A LA PASSE COMPLETE, avec la recente. C'est
     * l'assertion qui vaut le plus dans ce test : elle porte sur la table dont
     * la purge est CONDITIONNELLE, la ou les quatre autres ne dependent que de
     * l'age.
     */
    expect(await clesRestantes("envoi_en_attente", "modele")).toEqual([
      "bloquee",
      "envoi-recent",
    ]);
    expect(await clesRestantes("message", "sujet")).toEqual(["message-recent"]);
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
    await client.query("ALTER TABLE envoi_en_attente RENAME TO ea_off");
    await client.query("ALTER TABLE message RENAME TO ms_off");

    try {
      const resultats = await purgerJournaux(MAINTENANT);

      expect(resultats.every((r) => r.echec)).toBe(true);
      /*
       * LES CINQ TABLES SONT ENUMEREES, et cette liste en dur est ce qui rend
       * l'ajout d'une purge VISIBLE : la sixieme fera rougir ce test, donc
       * personne ne l'ajoutera sans se demander si elle doit figurer au
       * registre. C'est deliberement le contraire d'une assertion souple.
       */
      expect(resultats.map((r) => r.table)).toEqual([
        "JournalConnexion",
        "JournalAudit",
        "RateLimit",
        "EnvoiEnAttente",
        "Message",
      ]);
    } finally {
      await client.query("ALTER TABLE jc_off RENAME TO journal_connexion");
      await client.query("ALTER TABLE ja_off RENAME TO journal_audit");
      await client.query("ALTER TABLE rl_off RENAME TO rate_limit");
      await client.query("ALTER TABLE ea_off RENAME TO envoi_en_attente");
      await client.query("ALTER TABLE ms_off RENAME TO message");
    }
  });
});
