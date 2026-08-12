/**
 * Etablissement d'une preuve d'identite, sur base reelle. LS-89, ADR-027.
 * Zone critique : autorisation.
 *
 * CE QUE CES TESTS DOIVENT PROUVER, et qui n'est pas evident : qu'aucun chemin
 * livre ne permet d'ecrire une preuve SANS avoir verifie quelque chose.
 * `enregistrerPreuveIdentite` ne verifie rien, par construction : c'est
 * l'appelant qui en repond, et le ticket LS-89 signale que rien d'automatique
 * ne peut le detecter. Le critere 7 demande donc un test negatif, ecrit ici.
 *
 * LES TESTS APPELLENT LES VRAIS POINTS D'ENTREE, service et Server Action, et
 * jamais une reproduction de leur mecanique : lecon de LS-50.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let prouverIdentiteParMotDePasse: typeof import("@/services/preuve-identite").prouverIdentiteParMotDePasse;
let prouverIdentiteParPasskey: typeof import("@/services/preuve-identite").prouverIdentiteParPasskey;
let FENETRE_SESSION_NEUVE_MS: typeof import("@/services/preuve-identite").FENETRE_SESSION_NEUVE_MS;
let exigerReauthentificationRecente: typeof import("@/services/reauthentification").exigerReauthentificationRecente;
let exigerAdministratrice: typeof import("@/services/autorisation").exigerAdministratrice;
let AutorisationRefuseeError: typeof import("@/services/autorisation").AutorisationRefuseeError;
let ReauthentificationRequiseError: typeof import("@/services/reauthentification").ReauthentificationRequiseError;

const EMAIL = "exploitante@exemple.fr";
const MOT_DE_PASSE = "phrase-de-passe1";
const MAUVAIS_MOT_DE_PASSE = "phrase-de-passe2";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
  ({
    prouverIdentiteParMotDePasse,
    prouverIdentiteParPasskey,
    FENETRE_SESSION_NEUVE_MS,
  } = await import("@/services/preuve-identite"));
  ({ exigerReauthentificationRecente, ReauthentificationRequiseError } =
    await import("@/services/reauthentification"));
  ({ exigerAdministratrice, AutorisationRefuseeError } =
    await import("@/services/autorisation"));
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
 * Cree un compte et ouvre une session, en rendant les en-tetes qui la portent.
 *
 * PAS D'INSERTION SQL DIRECTE pour le mot de passe : il doit passer par le
 * hachage de Better Auth, sans quoi `verifyPassword` ne prouverait rien.
 */
async function ouvrirSession(): Promise<Headers> {
  await auth.api.signUpEmail({
    body: { email: EMAIL, password: MOT_DE_PASSE, name: "Exploitante" },
  });

  const reponse = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: MOT_DE_PASSE }),
    }),
  );

  const cookie = reponse.headers.get("set-cookie");
  expect(cookie).not.toBeNull();

  // Seule la paire nom=valeur, sans les attributs `Path`, `HttpOnly` et les
  // autres : un en-tete `Cookie` de requete ne les porte pas.
  const paire = cookie?.split(";")[0];
  expect(paire).toBeDefined();

  const enTetes = new Headers();
  enTetes.set("cookie", paire as string);
  return enTetes;
}

/**
 * La preuve, lue sur N'IMPORTE QUELLE session du compte.
 *
 * PAS DE `LIMIT 1`, ET LA NUANCE A FAIT ECHOUER LA PREMIERE VERSION.
 * `signUpEmail` ouvre deja une session, puis la connexion en ouvre une seconde :
 * deux lignes coexistent, et un `LIMIT 1` sans tri lisait celle de
 * l'inscription, restee sans preuve. Le test echouait donc alors que le
 * service faisait exactement son travail.
 */
async function preuveEnBase(): Promise<Date | null> {
  const { rows } = await client.query(
    "SELECT reauthentifiee_le FROM session WHERE reauthentifiee_le IS NOT NULL",
  );
  return rows[0]?.reauthentifiee_le ?? null;
}

describe("preuve par mot de passe, critere 1", () => {
  it("un mot de passe correct etablit la preuve", async () => {
    const enTetes = await ouvrirSession();

    // AUCUNE PREUVE AU DEPART : le defaut ferme de LS-81, une session neuve
    // n'a rien prouve.
    expect(await preuveEnBase()).toBeNull();

    const resultat = await prouverIdentiteParMotDePasse(enTetes, MOT_DE_PASSE);

    expect(resultat).toEqual({ etat: "ETABLIE" });
    expect(await preuveEnBase()).not.toBeNull();
  });

  /**
   * LE TEST QUI COMPTE POUR LE CRITERE 7. Un mot de passe faux ne doit ecrire
   * AUCUNE preuve : c'est ce qui distingue une verification d'une declaration.
   */
  it("un mot de passe faux n'ecrit aucune preuve", async () => {
    const enTetes = await ouvrirSession();

    const resultat = await prouverIdentiteParMotDePasse(
      enTetes,
      MAUVAIS_MOT_DE_PASSE,
    );

    expect(resultat).toEqual({ etat: "REFUSEE" });
    expect(await preuveEnBase()).toBeNull();
  });

  it("sans session, aucune preuve ne s'ecrit", async () => {
    const resultat = await prouverIdentiteParMotDePasse(
      new Headers(),
      MOT_DE_PASSE,
    );

    expect(resultat).toEqual({ etat: "SESSION_ABSENTE" });
  });

  /**
   * LA PREUVE OUVRE REELLEMENT LA GARDE, et c'est le bout de chaine qui relie
   * cette story a LS-81. Sans ce test, on prouverait qu'une colonne se remplit,
   * pas que la protection s'ouvre.
   */
  it("la preuve etablie satisfait exigerReauthentificationRecente", async () => {
    const enTetes = await ouvrirSession();

    // AVANT : la garde refuse.
    await expect(
      exigerReauthentificationRecente(enTetes, "IDENTIFIANTS"),
    ).rejects.toBeInstanceOf(ReauthentificationRequiseError);

    await prouverIdentiteParMotDePasse(enTetes, MOT_DE_PASSE);

    // APRES : la garde passe.
    await expect(
      exigerReauthentificationRecente(enTetes, "IDENTIFIANTS"),
    ).resolves.toBeUndefined();
  });

  /**
   * UN MOT DE PASSE REFUSE NE DOIT PAS OUVRIR LA GARDE NON PLUS. L'etat de la
   * base est identique dans les deux cas, `reauthentifiee_le` reste nul : ce
   * test verifie le CHEMIN, l'exception levee, et non le seul contenu.
   */
  it("un mot de passe refuse laisse la garde fermee", async () => {
    const enTetes = await ouvrirSession();

    await prouverIdentiteParMotDePasse(enTetes, MAUVAIS_MOT_DE_PASSE);

    await expect(
      exigerReauthentificationRecente(enTetes, "IDENTIFIANTS"),
    ).rejects.toBeInstanceOf(ReauthentificationRequiseError);
  });
});

describe("preuve par passkey, la session doit etre neuve", () => {
  /**
   * LE POINT DE VIGILANCE DU TICKET, ferme par une condition verifiable.
   *
   * La negociation WebAuthn se termine chez Better Auth, qui cree une session
   * NEUVE : le serveur ne peut pas la rejouer. Sans condition de fraicheur, un
   * appel a ce point d'entree depuis n'importe quelle session ouverte
   * suffirait a se declarer reauthentifie sans rien prouver.
   */
  it("une session neuve etablit la preuve", async () => {
    const enTetes = await ouvrirSession();

    const resultat = await prouverIdentiteParPasskey(enTetes);

    expect(resultat).toEqual({ etat: "ETABLIE" });
    expect(await preuveEnBase()).not.toBeNull();
  });

  it("une session ancienne est refusee, aucune preuve n'est ecrite", async () => {
    const enTetes = await ouvrirSession();

    // `maintenant` est avance au-dela de la fenetre : la session existe depuis
    // trop longtemps pour etre le resultat d'une negociation qui vient d'avoir
    // lieu.
    const plusTard = new Date(Date.now() + FENETRE_SESSION_NEUVE_MS + 1_000);

    const resultat = await prouverIdentiteParPasskey(enTetes, plusTard);

    expect(resultat).toEqual({ etat: "REFUSEE" });
    expect(await preuveEnBase()).toBeNull();
  });

  /**
   * DEFAUT FERME SUR UN AGE NEGATIF, cas d'une horloge dereglee ou d'une
   * donnee corrompue. Une soustraction negative passerait la borne haute sans
   * cette seconde condition.
   */
  it("une session datee dans le futur est refusee", async () => {
    const enTetes = await ouvrirSession();

    const avant = new Date(Date.now() - 60_000);

    const resultat = await prouverIdentiteParPasskey(enTetes, avant);

    expect(resultat).toEqual({ etat: "REFUSEE" });
    expect(await preuveEnBase()).toBeNull();
  });

  it("sans session, aucune preuve ne s'ecrit", async () => {
    const resultat = await prouverIdentiteParPasskey(new Headers());

    expect(resultat).toEqual({ etat: "SESSION_ABSENTE" });
  });
});

describe("garde de role, le defaut grave de la relecture", () => {
  /**
   * LE DEFAUT : la page et les deux Server Actions ne filtraient que la
   * PRESENCE d'une session, jamais le ROLE.
   *
   * Un client inscrit sur la boutique, role `CLIENT` par defaut, ouvrait
   * l'ecran, saisissait SON mot de passe et repartait avec une preuve
   * d'identite fraiche : `verifyPassword` verifie contre `session.user.id`,
   * donc il reussissait. La preuve avait ensuite l'air legitime en base.
   *
   * POURQUOI CE TEST PORTE SUR `exigerAdministratrice` ET NON SUR L'ACTION.
   * `headers()` de Next.js leve hors d'un contexte de requete : appeler la
   * Server Action directement rend `INDISPONIBLE` avant meme d'atteindre la
   * garde. Le test verifie donc que la garde REFUSE bien un compte CLIENT, et
   * la relecture repond de sa PRESENCE dans les deux actions, verifiable par
   * lecture. Les tests de bout en bout couvrent le reste.
   */
  it("exigerAdministratrice refuse un compte CLIENT", async () => {
    const enTetes = await ouvrirSession();

    const { rows } = await client.query(
      "SELECT role FROM utilisateur WHERE email = $1",
      [EMAIL],
    );
    expect(rows[0].role).toBe("CLIENT");

    await expect(exigerAdministratrice(enTetes)).rejects.toBeInstanceOf(
      AutorisationRefuseeError,
    );
  });

  it("exigerAdministratrice accepte le compte d'administration", async () => {
    const enTetes = await ouvrirSession();

    // `role` porte `input: false`, regle E11 : la bascule se fait en base,
    // comme le fera l'amorce reelle du compte d'administration.
    await client.query(
      "UPDATE utilisateur SET role = 'ADMINISTRATRICE' WHERE email = $1",
      [EMAIL],
    );

    await expect(exigerAdministratrice(enTetes)).resolves.toMatchObject({
      role: "ADMINISTRATRICE",
    });
  });

  /**
   * LES DEUX ACTIONS APPELLENT LA GARDE, verifie sur le source.
   *
   * Meme motif que le test du critere 7 : la propriete porte sur le CODE, et
   * une lecture du fichier l'exprime sans dependre d'un contexte de requete
   * que Vitest ne peut pas fournir.
   */
  it("les deux Server Actions appellent exigerAdministratrice", async () => {
    const { readFile } = await import("node:fs/promises");

    const source = await readFile(
      "src/app/administration/reauthentification/actions.ts",
      "utf8",
    );

    /**
     * LE COMPTAGE EST BORNE PAR FONCTION, et non sur le fichier entier.
     *
     * Un total de deux serait satisfait par deux appels dans la MEME fonction,
     * l'autre restant sans garde : c'est exactement le faux negatif que
     * `verifier-actions-sensibles.sh` a deja corrige une fois, en bornant le
     * corps de chaque fonction plutot que de chercher dans tout le fichier.
     *
     * Le decoupage se fait sur `export async function`, forme imposee a un
     * fichier `"use server"` : il n'exporte que des fonctions asynchrones.
     */
    const blocs = source
      .split(/export async function /)
      // Le premier morceau est l'entete du fichier, avant toute fonction.
      .slice(1);

    expect(blocs).toHaveLength(2);

    for (const bloc of blocs) {
      const nom = bloc.slice(0, bloc.indexOf("("));
      expect(
        bloc.includes("await exigerAdministratrice("),
        `${nom} n'appelle pas exigerAdministratrice`,
      ).toBe(true);
    }
  });
});

describe("aucun mot de passe ne fuit, invariant 9", () => {
  /**
   * MEME BALAYAGE QUE POUR LE JOURNAL DES CONNEXIONS, et pour la meme raison :
   * le critere porte sur la base entiere, pas sur une table choisie. Le mot de
   * passe transite ici par `verifyPassword`, chemin different de celui de
   * LS-80, et rien ne garantit a priori qu'aucune trace n'en subsiste.
   */
  it("le mot de passe essaye n'apparait dans aucune colonne texte", async () => {
    const enTetes = await ouvrirSession();

    await prouverIdentiteParMotDePasse(enTetes, MOT_DE_PASSE);
    await prouverIdentiteParMotDePasse(enTetes, MAUVAIS_MOT_DE_PASSE);

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
        [`%${MAUVAIS_MOT_DE_PASSE}%`],
      );

      if (rows[0].n > 0) {
        trouvailles.push(`${table_name}.${column_name}`);
      }
    }

    expect(trouvailles).toEqual([]);
  });
});

describe("l'adaptateur d'entree, critere 7", () => {
  /**
   * CE QUE CE BLOC PROUVE : la Server Action n'ouvre AUCUN chemin vers une
   * preuve non verifiee. Elle n'importe pas `enregistrerPreuveIdentite`, et
   * ses deux fonctions passent par le service qui verifie d'abord.
   */
  let etablirPreuveParMotDePasse: typeof import("@/app/administration/reauthentification/actions").etablirPreuveParMotDePasse;

  beforeAll(async () => {
    ({ etablirPreuveParMotDePasse } =
      await import("@/app/administration/reauthentification/actions"));
  });

  it("une entree qui n'est pas une chaine est refusee sans rien ecrire", async () => {
    await ouvrirSession();

    for (const entree of [null, undefined, 42, {}, []]) {
      const resultat = await etablirPreuveParMotDePasse(entree);
      expect(resultat).toEqual({ statut: "INVALIDE" });
    }

    expect(await preuveEnBase()).toBeNull();
  });

  it("une chaine vide ou demesuree est refusee sans atteindre le hachage", async () => {
    await ouvrirSession();

    expect(await etablirPreuveParMotDePasse("")).toEqual({
      statut: "INVALIDE",
    });
    expect(await etablirPreuveParMotDePasse("x".repeat(129))).toEqual({
      statut: "INVALIDE",
    });

    expect(await preuveEnBase()).toBeNull();
  });

  /**
   * LE TEST NEGATIF DU CRITERE 7, reecrit apres relecture.
   *
   * LA PREMIERE VERSION LISTAIT LES EXPORTS de l'adaptateur et exigeait
   * exactement deux noms. Elle prouvait seulement l'absence d'un TROISIEME
   * EXPORT, jamais l'absence d'appel : importer `enregistrerPreuveIdentite` et
   * l'appeler A L'INTERIEUR d'une fonction existante la laissait verte, ce qui
   * est precisement le geste qui rouvrirait le trou. Un fichier `"use server"`
   * ne peut de toute facon exporter que des fonctions asynchrones, donc elle
   * verifiait en partie une contrainte que Next.js impose deja.
   *
   * CELLE-CI EXPRIME LA PROPRIETE REELLE, celle qu'enonce la regle de
   * securite : un SEUL module appelle `enregistrerPreuveIdentite`. Elle balaie
   * tout `src/` et attrape donc l'ajout d'un second appelant, ou qu'il soit.
   */
  it("un seul module de src/ appelle enregistrerPreuveIdentite", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const executer = promisify(execFile);

    // `grep -rl` liste les FICHIERS et non les lignes : un fichier qui appelle
    // deux fois compte une fois, ce qui est le bon grain pour cette propriete.
    /**
     * DEUX MOTIFS, ET LE SECOND COUVRE LA SEULE EVASION COMMETTABLE SANS LE
     * VOULOIR.
     *
     * Chercher le seul nom de fonction laisse passer un `prisma.session.update`
     * ecrit directement sur `reauthentifieeLe` : quelqu'un qui ignore
     * l'existence de `enregistrerPreuveIdentite` produit alors exactement le
     * trou que la regle interdit, sans jamais toucher au nom recherche. Le
     * fichier de garde de `app/` interdit deja l'acces direct a Prisma, ce
     * motif double la discipline par un controle.
     *
     * Les evasions par renommage d'import ou par variable intermediaire
     * restent invisibles ici. Elles supposent une intention de contournement,
     * que ce test ne pretend pas couvrir : c'est la relecture qui en repond.
     */
    const { stdout } = await executer("grep", [
      "-rlE",
      "enregistrerPreuveIdentite\\(|reauthentifieeLe",
      "src/",
      "--include=*.ts",
      "--include=*.tsx",
    ]);

    const appelants = stdout
      .split("\n")
      .filter((ligne) => ligne.length > 0)
      // `src/generated/` est du code ENGENDRE par Prisma : il porte le nom de
      // la colonne dans ses types, ce qui n'est pas une ecriture. Meme
      // exclusion que `verifier-regles.sh`.
      .filter((chemin) => !chemin.startsWith("src/generated/"))
      // Le module qui la DEFINIT n'est pas un appelant : sa declaration porte
      // la meme chaine suivie d'une parenthese, et il ecrit legitimement la
      // colonne. On l'ecarte nommement.
      .filter((chemin) => chemin !== "src/services/reauthentification.ts")
      .sort();

    expect(appelants).toEqual(["src/services/preuve-identite.ts"]);
  });
});

/**
 * Limitation de debit et trace des tentatives, LS-92.
 *
 * CE QUE CES TESTS DOIVENT PROUVER, et l'ordre d'importance n'est pas celui
 * qu'on croit. Le ticket est explicite : « le vrai motif n'est pas l'absence de
 * plafond mais l'absence de trace ». Trois choses bornent deja le devinage,
 * session d'administration exigee, mot de passe de seize caracteres, et
 * l'attaquant devrait d'abord franchir `/sign-in/email` que Better Auth limite.
 * Ce qui manquait vraiment, c'est qu'une serie de tentatives par cette voie ne
 * laissait AUCUNE trace opposable.
 *
 * ILS EXERCENT LE VRAI POINT D'ENTREE, `prouverIdentiteParMotDePasse`, et non
 * une reproduction de sa mecanique : critere 1 du ticket, et lecon de LS-50 ou
 * reproduire la mecanique en SQL avait laisse passer deux defauts.
 *
 * ILS N'APPELLENT PAS `auth.handler`. C'est justement le point : ce chemin ne
 * passe par aucun routeur, donc par aucune limitation de la bibliotheque. Un
 * test qui passerait par `auth.handler` mesurerait la limitation de Better
 * Auth et serait vert sans rien prouver de ce code, exactement le piege des six
 * tests de LS-79.
 */
describe("limitation de debit sur la verification de mot de passe, LS-92", () => {
  /** Les lignes du journal des connexions, dans l'ordre d'ecriture. */
  async function lignesJournal(): Promise<
    { issue: string; moyen: string; email_tente: string }[]
  > {
    const { rows } = await client.query(
      "SELECT issue, moyen, email_tente FROM journal_connexion ORDER BY cree_a, id",
    );
    return rows;
  }

  it("refuse au-dela du seuil, en exerçant le vrai point d'entree", async () => {
    const enTetes = await ouvrirSession();
    const { ACTIONS_PROTEGEES } = await import("@/services/limitation-action");
    const { max } = ACTIONS_PROTEGEES["reauthentification-mot-de-passe"];

    // Les `max` premieres tentatives echouent sur le mot de passe, pas sur la
    // cadence : le plafond n'est pas encore franchi.
    for (let i = 0; i < max; i++) {
      const resultat = await prouverIdentiteParMotDePasse(
        enTetes,
        MAUVAIS_MOT_DE_PASSE,
      );
      expect(resultat).toEqual({ etat: "REFUSEE" });
    }

    // La suivante est refusee AVANT toute verification de mot de passe.
    const apres = await prouverIdentiteParMotDePasse(
      enTetes,
      MAUVAIS_MOT_DE_PASSE,
    );

    expect(apres.etat).toBe("TROP_DE_TENTATIVES");
  });

  it("refuse meme le BON mot de passe une fois le seuil franchi", async () => {
    /**
     * LE TEST QUI SEPARE UN VRAI PLAFOND D'UN COMPTEUR DECORATIF.
     *
     * Si la limitation ne s'appliquait qu'aux echecs, un attaquant qui trouve
     * le mot de passe a la centieme tentative passerait quand meme. Le plafond
     * doit couper le chemin AVANT `verifyPassword`, quel que soit le secret
     * fourni.
     */
    const enTetes = await ouvrirSession();
    const { ACTIONS_PROTEGEES } = await import("@/services/limitation-action");
    const { max } = ACTIONS_PROTEGEES["reauthentification-mot-de-passe"];

    for (let i = 0; i < max; i++) {
      await prouverIdentiteParMotDePasse(enTetes, MAUVAIS_MOT_DE_PASSE);
    }

    const resultat = await prouverIdentiteParMotDePasse(enTetes, MOT_DE_PASSE);

    expect(resultat.etat).toBe("TROP_DE_TENTATIVES");
    // ET AUCUNE PREUVE N'EST ECRITE : le refus est complet, pas cosmetique.
    expect(await preuveEnBase()).toBeNull();
  });

  it("journalise chaque tentative, echec, reussite et refus de cadence", async () => {
    /**
     * LE CRITERE 2, ET LE VRAI MOTIF DE LA STORY. Avant LS-92, aucune de ces
     * lignes n'existait : `verifyPassword` ne croise aucun des chemins que le
     * hook de LS-80 surveille.
     */
    const enTetes = await ouvrirSession();
    const { ACTIONS_PROTEGEES } = await import("@/services/limitation-action");
    const { max } = ACTIONS_PROTEGEES["reauthentification-mot-de-passe"];

    // La connexion de `ouvrirSession` a deja laisse sa propre ligne, ecrite par
    // le hook de LS-80. On part donc du compte courant.
    const avant = (await lignesJournal()).length;

    await prouverIdentiteParMotDePasse(enTetes, MAUVAIS_MOT_DE_PASSE);
    await prouverIdentiteParMotDePasse(enTetes, MOT_DE_PASSE);

    const apresDeux = (await lignesJournal()).slice(avant);

    expect(apresDeux.map((l) => l.issue)).toEqual(["ECHEC", "REUSSITE"]);
    // LE MOYEN RESTE `MOT_DE_PASSE`, sans valeur d'enum supplementaire : c'est
    // bien un mot de passe qui a ete verifie, le chemin d'entree est une autre
    // question et n'a pas a polluer ce champ.
    expect(apresDeux.every((l) => l.moyen === "MOT_DE_PASSE")).toBe(true);
    // L'ADRESSE VIENT DE LA SESSION, jamais d'une saisie : l'appelant est deja
    // authentifie.
    expect(apresDeux.every((l) => l.email_tente === EMAIL)).toBe(true);

    /**
     * Puis le refus de cadence, qui doit lui aussi laisser sa trace : le VOLUME
     * refuse est le signal d'une attaque.
     *
     * `max + 1` ET NON `max`, ET LA NUANCE A FAIT ECHOUER LA PREMIERE VERSION
     * DE CE TEST. La reussite ci-dessus a EFFACE le compteur : les `max`
     * tentatives suivantes portent donc les comptes 1 a `max`, dont aucun ne
     * franchit le seuil, qui refuse a `compte > max`. Il en faut une de plus
     * pour observer le refus.
     *
     * Le code etait juste, c'est le test qui comptait mal. Rien ne le
     * signalait : le compteur reparti a zero est precisement le comportement
     * qu'un autre test de cette suite exige.
     */
    for (let i = 0; i <= max; i++) {
      await prouverIdentiteParMotDePasse(enTetes, MAUVAIS_MOT_DE_PASSE);
    }

    const toutes = await lignesJournal();
    expect(toutes.filter((l) => l.issue === "REFUSEE_LIMITATION").length).toBe(
      1,
    );
  });

  it("une reussite remet le compteur a zero", async () => {
    /**
     * Sans cela, une exploitante qui se trompe quatre fois puis reussit
     * resterait a quatre tentatives consommees pour le reste de la minute : sa
     * cinquieme saisie legitime serait refusee alors qu'elle vient de prouver
     * son identite.
     *
     * CELA N'AFFAIBLIT RIEN : le seul moyen d'obtenir cette remise a zero est
     * de fournir le bon mot de passe, c'est-a-dire ce que l'attaquant cherche.
     */
    const enTetes = await ouvrirSession();
    const { ACTIONS_PROTEGEES } = await import("@/services/limitation-action");
    const { max } = ACTIONS_PROTEGEES["reauthentification-mot-de-passe"];

    for (let i = 0; i < max - 1; i++) {
      await prouverIdentiteParMotDePasse(enTetes, MAUVAIS_MOT_DE_PASSE);
    }

    expect(await prouverIdentiteParMotDePasse(enTetes, MOT_DE_PASSE)).toEqual({
      etat: "ETABLIE",
    });

    // Le compteur est reparti a zero : `max` nouvelles tentatives passent sans
    // etre refusees pour cadence.
    for (let i = 0; i < max; i++) {
      const resultat = await prouverIdentiteParMotDePasse(
        enTetes,
        MAUVAIS_MOT_DE_PASSE,
      );
      expect(resultat).toEqual({ etat: "REFUSEE" });
    }
  });

  it("compte par session et non globalement", async () => {
    /**
     * DEUX SESSIONS NE PARTAGENT PAS LEUR COMPTEUR. Un compteur global ferait
     * qu'une exploitante bloquerait l'autre, et sur ce projet mono-compte, que
     * l'exploitante se bloquerait elle-meme depuis un second appareil.
     *
     * La cle porte donc l'identifiant de session, et le prefixe `action:` la
     * garde disjointe des cles de Better Auth, `<ip>|<chemin>`.
     */
    const premiere = await ouvrirSession();
    const { ACTIONS_PROTEGEES } = await import("@/services/limitation-action");
    const { max } = ACTIONS_PROTEGEES["reauthentification-mot-de-passe"];

    for (let i = 0; i <= max; i++) {
      await prouverIdentiteParMotDePasse(premiere, MAUVAIS_MOT_DE_PASSE);
    }

    expect(
      (await prouverIdentiteParMotDePasse(premiere, MOT_DE_PASSE)).etat,
    ).toBe("TROP_DE_TENTATIVES");

    // Une seconde connexion, donc une seconde session, sur le MEME compte.
    const reponse = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: MOT_DE_PASSE }),
      }),
    );
    const seconde = new Headers();
    seconde.set(
      "cookie",
      reponse.headers.get("set-cookie")?.split(";")[0] ?? "",
    );

    expect(await prouverIdentiteParMotDePasse(seconde, MOT_DE_PASSE)).toEqual({
      etat: "ETABLIE",
    });
  });

  it("n'ecrit pas sous une cle qui heurterait celles de Better Auth", async () => {
    /**
     * LA CLE EST PREFIXEE `action:`, et ce test le mesure plutot que de le
     * supposer. Better Auth ecrit `<ip>|<chemin>` : sans prefixe distinct, une
     * Server Action et une route de la bibliotheque partageraient un compteur,
     * chacune consommant le quota de l'autre.
     */
    const enTetes = await ouvrirSession();

    await prouverIdentiteParMotDePasse(enTetes, MAUVAIS_MOT_DE_PASSE);

    const { rows } = await client.query("SELECT key FROM rate_limit");
    const cles = rows.map((l: { key: string }) => l.key);

    expect(cles.some((c: string) => c.startsWith("action:"))).toBe(true);
    expect(
      cles.some((c: string) =>
        c.startsWith("action:reauthentification-mot-de-passe|"),
      ),
    ).toBe(true);
  });
});
