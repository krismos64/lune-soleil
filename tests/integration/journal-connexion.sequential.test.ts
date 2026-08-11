/**
 * Journal des connexions exerce sur base reelle. LS-80, ADR-027 decision 2.
 * Zone critique : donnees personnelles.
 *
 * CES TESTS APPELLENT LE VRAI POINT D'ENTREE, `auth.handler` avec une vraie
 * `Request`, et non `auth.api.*`. La difference n'est pas cosmetique : LS-79 a
 * mesure que `auth.api.*` court-circuite une partie de la chaine de la
 * bibliotheque, et six tests y sont passes au vert sans rien exercer. Le hook
 * qui alimente ce journal vit dans cette chaine.
 *
 * CE QUE CHAQUE TEST DOIT DISTINGUER. Sur plusieurs scenarios, l'etat de la
 * base est identique que la protection existe ou non : une connexion reussit
 * aussi bien avec un journal que sans. Chaque test verifie donc la LIGNE ECRITE,
 * son issue et son moyen, jamais seulement que la connexion a abouti.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let purgerJournalConnexion: typeof import("@/services/journal-connexion").purgerJournalConnexion;
let limiteDeConservation: typeof import("@/services/journal-connexion").limiteDeConservation;
let enregistrerTentativeConnexion: typeof import("@/services/journal-connexion").enregistrerTentativeConnexion;
let CONSERVATION_JOURNAL_MOIS: typeof import("@/services/journal-connexion").CONSERVATION_JOURNAL_MOIS;

/**
 * MOT DE PASSE RECONNAISSABLE, et c'est tout l'objet du critere 2.
 *
 * Une chaine improbable, cherchee ensuite dans TOUTES les colonnes texte de la
 * base. Un mot de passe banal comme « motdepasse » ne prouverait rien : il
 * pourrait apparaitre par coincidence, ou etre absent sans qu'on sache si
 * c'est parce qu'il n'est pas ecrit ou parce qu'il ressemble a autre chose.
 */
const MOT_DE_PASSE_RECONNAISSABLE = "zorglub-cassiopee-1789-xyz";
const EMAIL_ADMIN = "administratrice@exemple.fr";
const EMAIL_CLIENT = "client@exemple.fr";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
  ({
    purgerJournalConnexion,
    limiteDeConservation,
    enregistrerTentativeConnexion,
    CONSERVATION_JOURNAL_MOIS,
  } = await import("@/services/journal-connexion"));
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
 * Cree un compte par la vraie route d'inscription.
 *
 * PAS D'INSERTION SQL DIRECTE : le mot de passe doit passer par le hachage de
 * Better Auth, sans quoi la connexion testee ensuite ne prouverait rien.
 */
async function creerCompte(email: string, role?: "ADMINISTRATRICE") {
  await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE_RECONNAISSABLE, name: "Essai" },
  });

  if (role) {
    // `role` porte `input: false`, regle E11 : il ne peut pas etre pose depuis
    // la requete d'inscription. La bascule se fait donc en base, comme le fera
    // l'amorce reelle de l'unique compte d'administration.
    await client.query(
      "UPDATE utilisateur SET role = 'ADMINISTRATRICE' WHERE email = $1",
      [email],
    );
  }

  // L'inscription ouvre une session et ecrit une ligne de journal si le chemin
  // est surveille ; on repart d'une table vide pour que chaque test ne voie
  // que ce qu'il declenche lui-meme.
  await client.query("TRUNCATE journal_connexion");
}

/**
 * Tente une connexion par mot de passe via `auth.handler`, le vrai chemin.
 *
 * Les en-tetes portent une adresse et un agent : sans eux, le test ne
 * distinguerait pas « le hook ne les lit pas » de « la requete n'en portait
 * pas ».
 */
async function tenterConnexion(email: string, motDePasse: string) {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.7",
        "user-agent": "Navigateur-Essai/1.0",
      },
      body: JSON.stringify({ email, password: motDePasse }),
    }),
  );
}

async function lignesJournal() {
  const { rows } = await client.query(
    "SELECT email_tente, utilisateur_id, moyen, issue, adresse_ip, agent_utilisateur, cree_a FROM journal_connexion ORDER BY cree_a",
  );
  return rows;
}

describe("journal des connexions, critere 1", () => {
  it("une connexion reussie d'administration produit une ligne REUSSITE", async () => {
    await creerCompte(EMAIL_ADMIN, "ADMINISTRATRICE");

    const reponse = await tenterConnexion(
      EMAIL_ADMIN,
      MOT_DE_PASSE_RECONNAISSABLE,
    );
    expect(reponse.status).toBe(200);

    const lignes = await lignesJournal();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].issue).toBe("REUSSITE");
    expect(lignes[0].moyen).toBe("MOT_DE_PASSE");
    expect(lignes[0].email_tente).toBe(EMAIL_ADMIN);
    // Sur une reussite, le compte est identifie : l'ecran doit pouvoir relier
    // la tentative a un utilisateur.
    expect(lignes[0].utilisateur_id).not.toBeNull();
  });

  it("une connexion echouee d'administration produit une ligne ECHEC", async () => {
    await creerCompte(EMAIL_ADMIN, "ADMINISTRATRICE");

    const reponse = await tenterConnexion(EMAIL_ADMIN, "mauvais-mot-de-passe1");
    expect(reponse.status).not.toBe(200);

    const lignes = await lignesJournal();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].issue).toBe("ECHEC");
    expect(lignes[0].email_tente).toBe(EMAIL_ADMIN);
  });

  it("les deux issues sont enregistrees aussi sur un compte client", async () => {
    await creerCompte(EMAIL_CLIENT);

    await tenterConnexion(EMAIL_CLIENT, MOT_DE_PASSE_RECONNAISSABLE);
    await tenterConnexion(EMAIL_CLIENT, "mauvais-mot-de-passe1");

    const lignes = await lignesJournal();
    expect(lignes.map((l) => l.issue)).toEqual(["REUSSITE", "ECHEC"]);
  });

  /**
   * LE CAS QUI JUSTIFIE `utilisateurId` NULLABLE. Un balayage d'adresses est
   * precisement ce que le journal doit montrer, et c'est le seul scenario ou
   * aucun compte ne peut etre designe.
   */
  it("un echec sur une adresse inconnue est journalise sans utilisateur", async () => {
    await tenterConnexion("inconnu@exemple.fr", MOT_DE_PASSE_RECONNAISSABLE);

    const lignes = await lignesJournal();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].issue).toBe("ECHEC");
    expect(lignes[0].utilisateur_id).toBeNull();
    expect(lignes[0].email_tente).toBe("inconnu@exemple.fr");
  });

  it("l'agent utilisateur de la requete est enregistre", async () => {
    await creerCompte(EMAIL_CLIENT);
    await tenterConnexion(EMAIL_CLIENT, MOT_DE_PASSE_RECONNAISSABLE);

    const lignes = await lignesJournal();
    expect(lignes[0].agent_utilisateur).toBe("Navigateur-Essai/1.0");
  });
});

describe("aucun mot de passe en base, critere 2", () => {
  /**
   * LE TEST QUI PORTE LE CRITERE 2, et il balaie la base entiere plutot que la
   * seule table du journal.
   *
   * POURQUOI TOUTES LES COLONNES ET NON `journal_connexion` SEULE : le critere
   * dit « n'apparait en base », pas « n'apparait dans cette table ». Un hook
   * qui recopierait le corps de la requete dans `journal_audit.detail`, un
   * champ JSONB, echapperait a un test cible sur la bonne table. La requete
   * ci-dessous interroge le catalogue de PostgreSQL, donc elle couvrira aussi
   * les tables qui n'existent pas encore.
   */
  it("le mot de passe essaye n'apparait dans aucune colonne texte", async () => {
    await creerCompte(EMAIL_ADMIN, "ADMINISTRATRICE");

    await tenterConnexion(EMAIL_ADMIN, MOT_DE_PASSE_RECONNAISSABLE);
    await tenterConnexion(EMAIL_ADMIN, `${MOT_DE_PASSE_RECONNAISSABLE}-faux`);

    // Construit une union de recherches sur toute colonne textuelle de toute
    // table du schema public.
    const { rows: colonnes } = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text', 'character varying', 'jsonb', 'json')
    `);

    expect(colonnes.length).toBeGreaterThan(0);

    const trouvailles: string[] = [];

    for (const { table_name, column_name } of colonnes) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM "${table_name}" WHERE "${column_name}"::text LIKE $1`,
        [`%${MOT_DE_PASSE_RECONNAISSABLE}%`],
      );

      if (rows[0].n > 0) {
        trouvailles.push(`${table_name}.${column_name}`);
      }
    }

    expect(trouvailles).toEqual([]);
  });

  /**
   * L'EMPREINTE EST ATTENDUE, ELLE, et ce test evite un contresens : si le
   * test precedent passait parce que le compte n'a pas de mot de passe du
   * tout, il ne prouverait rien. Celui-ci verifie qu'une empreinte existe bien
   * et qu'elle ne contient pas le secret en clair.
   */
  it("le compte porte une empreinte, qui n'est pas le mot de passe", async () => {
    await creerCompte(EMAIL_ADMIN, "ADMINISTRATRICE");

    const { rows } = await client.query(
      "SELECT password FROM compte WHERE password IS NOT NULL",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].password).not.toContain(MOT_DE_PASSE_RECONNAISSABLE);
    expect(rows[0].password.length).toBeGreaterThan(20);
  });
});

describe("purge, criteres 3 et 4", () => {
  /**
   * ANTIDATE DE PART ET D'AUTRE DE LA LIMITE, et les deux cotes comptent. Une
   * purge qui supprimerait tout passerait un test qui ne verifie que la
   * disparition des vieilles lignes.
   */
  it("supprime les lignes au-dela de six mois et conserve les autres", async () => {
    const maintenant = new Date();
    const limite = limiteDeConservation(maintenant);

    const unJour = 24 * 60 * 60 * 1000;
    const avantLimite = new Date(limite.getTime() - unJour);
    const apresLimite = new Date(limite.getTime() + unJour);

    for (const [suffixe, date] of [
      ["vieille", avantLimite],
      ["recente", apresLimite],
    ] as const) {
      await client.query(
        `INSERT INTO journal_connexion (id, email_tente, moyen, issue, cree_a)
         VALUES ($1, $2, 'MOT_DE_PASSE', 'ECHEC', $3)`,
        [suffixe, `${suffixe}@exemple.fr`, date],
      );
    }

    const supprimees = await purgerJournalConnexion(maintenant);

    expect(supprimees).toBe(1);
    const lignes = await lignesJournal();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].email_tente).toBe("recente@exemple.fr");
  });

  /**
   * LA DUREE EST BIEN DE SIX MOIS, deliberation CNIL n 2021-122 point 8.
   *
   * Ce test existe parce que la purge precedente resterait verte avec une
   * duree de douze mois : elle antidate a partir de la limite calculee, donc
   * elle suit la constante quelle qu'elle soit. Celui-ci ancre la valeur.
   */
  it("la duree de conservation retenue est de six mois", () => {
    expect(CONSERVATION_JOURNAL_MOIS).toBe(6);

    const reference = new Date("2026-08-11T12:00:00.000Z");
    const limite = limiteDeConservation(reference);

    expect(limite.toISOString()).toBe("2026-02-11T12:00:00.000Z");
  });

  it("une ligne exactement a la limite est conservee", async () => {
    const maintenant = new Date();

    await client.query(
      `INSERT INTO journal_connexion (id, email_tente, moyen, issue, cree_a)
       VALUES ('pile', 'pile@exemple.fr', 'MOT_DE_PASSE', 'ECHEC', $1)`,
      [limiteDeConservation(maintenant)],
    );

    expect(await purgerJournalConnexion(maintenant)).toBe(0);
  });
});

describe("l'ecriture ne bloque jamais une connexion, critere 5", () => {
  /**
   * LE TEST DU CRITERE 5, et il exige de casser reellement l'ecriture.
   *
   * POURQUOI RENOMMER LA TABLE plutot que simuler Prisma : un doublon simule
   * prouverait que le code attrape une erreur qu'on a fabriquee, pas qu'il
   * survit a une panne reelle de la base. Ici l'insertion echoue exactement
   * comme elle echouerait sur une table absente en production.
   */
  it("une connexion aboutit meme si le journal ne peut pas s'ecrire", async () => {
    await creerCompte(EMAIL_ADMIN, "ADMINISTRATRICE");

    await client.query(
      "ALTER TABLE journal_connexion RENAME TO journal_connexion_indisponible",
    );

    try {
      const reponse = await tenterConnexion(
        EMAIL_ADMIN,
        MOT_DE_PASSE_RECONNAISSABLE,
      );

      // LA CONNEXION ABOUTIT, c'est tout l'objet de la regle E15.
      expect(reponse.status).toBe(200);
    } finally {
      await client.query(
        "ALTER TABLE journal_connexion_indisponible RENAME TO journal_connexion",
      );
    }
  });

  it("enregistrerTentativeConnexion ne leve pas sur une base cassee", async () => {
    await client.query(
      "ALTER TABLE journal_connexion RENAME TO journal_connexion_indisponible",
    );

    try {
      await expect(
        enregistrerTentativeConnexion({
          emailTente: "essai@exemple.fr",
          utilisateurId: null,
          moyen: "MOT_DE_PASSE",
          issue: "ECHEC",
          adresseIp: null,
          agentUtilisateur: null,
        }),
      ).resolves.toBeUndefined();
    } finally {
      await client.query(
        "ALTER TABLE journal_connexion_indisponible RENAME TO journal_connexion",
      );
    }
  });
});

describe("suppression d'un compte, conservation des traces", () => {
  /**
   * SET NULL ET NON CASCADE. Si supprimer un compte effacait son historique de
   * connexions, un intrus effacerait ses traces en supprimant le compte qu'il
   * vient de compromettre. La ligne survit, orpheline.
   */
  it("supprimer un compte conserve ses lignes de journal", async () => {
    await creerCompte(EMAIL_CLIENT);
    await tenterConnexion(EMAIL_CLIENT, MOT_DE_PASSE_RECONNAISSABLE);

    expect((await lignesJournal())[0].utilisateur_id).not.toBeNull();

    await client.query("DELETE FROM utilisateur WHERE email = $1", [
      EMAIL_CLIENT,
    ]);

    const lignes = await lignesJournal();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].utilisateur_id).toBeNull();
    // L'adresse tentee reste lisible : c'est ce qui rend la ligne encore utile
    // apres la disparition du compte.
    expect(lignes[0].email_tente).toBe(EMAIL_CLIENT);
  });
});
