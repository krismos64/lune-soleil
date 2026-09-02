/**
 * Profil du client, sur base reelle. LS-60.
 * Zone critique : identite et autorisation.
 *
 * CE QUE CETTE SUITE DOIT PROUVER. Les deux gestes de cette story touchent
 * l'authentification, et chacun a un mode d'echec cher :
 *
 *   CHANGEMENT D'ADRESSE   une saisie erronee qui prendrait effet AVANT
 *                          verification enfermerait le client hors de son compte
 *   CHANGEMENT DE MOT DE PASSE   qui n'invaliderait pas les autres sessions
 *                          laisserait un intrus connecte apres la reprise en main
 *
 * L'ENVOYEUR EST OBSERVE ET REND REELLEMENT LE MESSAGE, motif de LS-54 : un
 * double qui gobe ses arguments resterait vert sur un modele absent, puisque
 * c'est le RENDU qui leve, jamais l'envoi.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let changerMonEmail: typeof import("@/services/profil-client").changerMonEmail;
let changerMonMotDePasse: typeof import("@/services/profil-client").changerMonMotDePasse;

/** Seize caracteres, la longueur imposee a tous les comptes, ADR-023. */
const MOT_DE_PASSE = "phrase-de-passe1";
const NOUVEAU_MOT_DE_PASSE = "autre-phrase-de1";

const ANCIENNE = "ancienne@exemple.fr";
const NOUVELLE = "nouvelle@exemple.fr";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
  ({ changerMonEmail, changerMonMotDePasse } =
    await import("@/services/profil-client"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE ligne_commande, commande, session, compte, verification,
              passkey, utilisateur CASCADE`,
  );
});

/** Inscrit un compte et rend les en-tetes portant sa session. */
async function inscrireEtConnecter(email: string): Promise<Headers> {
  const reponse = await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE, name: "Client de test" },
    returnHeaders: true,
  });

  const cookie = reponse.headers.get("set-cookie") ?? "";

  const enTetes = new Headers();
  enTetes.set("cookie", cookie.split(";")[0] ?? "");

  return enTetes;
}

/** Nombre de sessions ouvertes sur un compte, par son adresse. */
async function compterSessions(email: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM session s
     JOIN utilisateur u ON u.id = s.user_id WHERE u.email = $1`,
    [email],
  );

  return rows[0].n as number;
}

describe("critere 3, le changement de mot de passe", () => {
  it("exige le mot de passe courant", async () => {
    const enTetes = await inscrireEtConnecter(ANCIENNE);

    const resultat = await changerMonMotDePasse(
      enTetes,
      "mauvais-mot-de-pass",
      NOUVEAU_MOT_DE_PASSE,
    );

    expect(resultat).toEqual({ etat: "MOT_DE_PASSE_INCORRECT" });

    /*
     * LE SECOND SENS : l'ancien mot de passe fonctionne toujours. Sans cette
     * assertion, un service qui changerait le mot de passe AVANT de refuser
     * resterait vert.
     */
    await expect(
      auth.api.signInEmail({
        body: { email: ANCIENNE, password: MOT_DE_PASSE },
      }),
    ).resolves.toBeTruthy();
  });

  it("change le mot de passe quand le courant est fourni", async () => {
    const enTetes = await inscrireEtConnecter(ANCIENNE);

    /*
     * L'ASSERTION PORTE SUR `etat` SEUL : le resultat porte AUSSI le nouveau
     * cookie de session depuis la correction du 2 septembre, et un `toEqual`
     * sur l'objet entier rougirait a chaque champ ajoute sans rien prouver de
     * plus. Le cookie a son propre test.
     */
    expect(
      (await changerMonMotDePasse(enTetes, MOT_DE_PASSE, NOUVEAU_MOT_DE_PASSE))
        .etat,
    ).toBe("CHANGE");

    // LE NOUVEAU FONCTIONNE.
    await expect(
      auth.api.signInEmail({
        body: { email: ANCIENNE, password: NOUVEAU_MOT_DE_PASSE },
      }),
    ).resolves.toBeTruthy();

    // ET L'ANCIEN NE FONCTIONNE PLUS.
    await expect(
      auth.api.signInEmail({
        body: { email: ANCIENNE, password: MOT_DE_PASSE },
      }),
    ).rejects.toBeTruthy();
  });

  it("invalide les AUTRES sessions et garde la sienne", async () => {
    /*
     * LE SCENARIO DU COMPTE COMPROMIS : un intrus est connecte, le
     * proprietaire change son mot de passe. Sans `revokeOtherSessions`, la
     * session de l'intrus survivrait jusqu'a son expiration naturelle,
     * vingt-quatre heures, et le geste de reprise ne mettrait dehors personne.
     *
     * C'est la meme regle que `revokeSessionsOnPasswordReset`, posee en LS-55
     * pour le chemin « mot de passe oublie » ; celui-ci couvre « je le change
     * moi-meme ».
     */
    const mienne = await inscrireEtConnecter(ANCIENNE);

    // Une seconde session, celle de l'intrus.
    await auth.api.signInEmail({
      body: { email: ANCIENNE, password: MOT_DE_PASSE },
    });

    expect(await compterSessions(ANCIENNE)).toBe(2);

    await changerMonMotDePasse(mienne, MOT_DE_PASSE, NOUVEAU_MOT_DE_PASSE);

    /*
     * UNE SEULE SESSION SUBSISTE, et c'est celle de l'appelant : Better Auth
     * supprime toutes les sessions puis en recree une pour lui, verifie via
     * Context7. Le proprietaire n'est donc pas deconnecte par son propre geste.
     */
    expect(await compterSessions(ANCIENNE)).toBe(1);
  });

  it("rend le NOUVEAU cookie de session, sans quoi le client est deconnecte", async () => {
    /*
     * LE DEFAUT LE PLUS COUTEUX DE CETTE STORY, trouve par le test de bout en
     * bout et mesure ensuite ici :
     *
     *   cookie initial   better-auth.session_token=<valeur A>
     *   apres l'appel    better-auth.session_token=<valeur B, differente>
     *   ancien cookie    -> session INVALIDE
     *
     * `revokeOtherSessions` supprime TOUTES les sessions, celle de l'appelant
     * comprise, puis en recree une. Jeter l'en-tete `set-cookie` DECONNECTE
     * donc le client qui vient de changer son mot de passe : le geste de
     * securite le met dehors.
     *
     * LES TESTS D'INTEGRATION NE POUVAIENT PAS LE VOIR SEULS, et c'est la
     * lecon : ils passent les en-tetes a la main, donc ne perdent jamais ce
     * qu'un navigateur aurait perdu. Ce test le rattrape en verifiant que le
     * cookie REMONTE, et le e2e verifie qu'il est POSE.
     */
    const enTetes = await inscrireEtConnecter(ANCIENNE);

    const resultat = await changerMonMotDePasse(
      enTetes,
      MOT_DE_PASSE,
      NOUVEAU_MOT_DE_PASSE,
    );

    expect(resultat.etat).toBe("CHANGE");
    if (resultat.etat !== "CHANGE") return;

    expect(resultat.cookieSession).toBeDefined();
    expect(resultat.cookieSession).toContain("session_token=");

    /*
     * L'ANCIEN COOKIE NE VAUT PLUS RIEN : c'est ce qui rend le report
     * indispensable, et sans cette assertion on pourrait croire que l'ancienne
     * session survit et que le report est un confort.
     */
    const { auth: instance } = await import("@/lib/auth");
    const session = await instance.api.getSession({ headers: enTetes });
    expect(session).toBeNull();
  });

  it("impose la revocation meme si l'appelant demande le contraire", async () => {
    /*
     * LE HOOK `before` EST CE QUI FERME LA FENETRE, et ce test le prouve en
     * demandant explicitement l'inverse.
     *
     * `revokeOtherSessions` fait partie du CORPS de `/change-password` : le
     * serveur se contente de le lire. Depuis que l'ecran appelle le CLIENT
     * Better Auth, c'est un champ que l'appelant choisit, et un intrus detenant
     * session ET mot de passe pouvait changer le mot de passe en CONSERVANT la
     * session du proprietaire ouverte.
     *
     * Trouve par `ls-critical-reviewer` : trois commentaires affirmaient une
     * garantie que le code ne tenait plus.
     */
    const mienne = await inscrireEtConnecter(ANCIENNE);

    // Une seconde session, celle qu'un intrus voudrait garder ouverte.
    await auth.api.signInEmail({
      body: { email: ANCIENNE, password: MOT_DE_PASSE },
    });

    expect(await compterSessions(ANCIENNE)).toBe(2);

    /*
     * L'APPEL DEMANDE EXPLICITEMENT `false`, ce que le hook doit ecraser.
     * Passer par `auth.api` et non par le service : c'est le chemin que le
     * client emprunte, et celui que le hook garde.
     */
    await auth.api.changePassword({
      body: {
        currentPassword: MOT_DE_PASSE,
        newPassword: NOUVEAU_MOT_DE_PASSE,
        revokeOtherSessions: false,
      },
      headers: mienne,
    });

    // UNE SEULE SESSION SUBSISTE malgre la demande contraire.
    expect(await compterSessions(ANCIENNE)).toBe(1);
  });

  it("refuse un nouveau mot de passe trop court, ADR-023", async () => {
    const enTetes = await inscrireEtConnecter(ANCIENNE);

    // Quinze caracteres, un de moins que les seize imposes.
    const resultat = await changerMonMotDePasse(
      enTetes,
      MOT_DE_PASSE,
      "trop-court-1234",
    );

    expect(resultat).toEqual({ etat: "TROP_COURT" });

    // L'ANCIEN RESTE VALIDE : un refus n'a rien change.
    await expect(
      auth.api.signInEmail({
        body: { email: ANCIENNE, password: MOT_DE_PASSE },
      }),
    ).resolves.toBeTruthy();
  });

  it("refuse sans session, aucun mot de passe ne change", async () => {
    await inscrireEtConnecter(ANCIENNE);

    const resultat = await changerMonMotDePasse(
      new Headers(),
      MOT_DE_PASSE,
      NOUVEAU_MOT_DE_PASSE,
    );

    // LE REFUS EST GENERIQUE : sans session, Better Auth leve avant toute
    // verification de mot de passe.
    expect(resultat.etat).not.toBe("CHANGE");

    await expect(
      auth.api.signInEmail({
        body: { email: ANCIENNE, password: MOT_DE_PASSE },
      }),
    ).resolves.toBeTruthy();
  });
});

describe("critere 2, le changement d'adresse email", () => {
  it("N'ECRIT PAS la nouvelle adresse avant sa verification", async () => {
    /*
     * LE CŒUR DU CRITERE 2. Tant que le lien n'est pas ouvert, l'ancienne
     * adresse reste celle du compte : une saisie erronee ou malveillante
     * n'enferme donc personne hors de son compte.
     */
    const enTetes = await inscrireEtConnecter(ANCIENNE);

    // L'ADRESSE ACTUELLE DOIT ETRE VERIFIEE, prerequis pose par la correction
    // de la prise de controle : voir le test dedie plus bas.
    await client.query(
      `UPDATE utilisateur SET email_verifie = true WHERE email = $1`,
      [ANCIENNE],
    );

    expect(await changerMonEmail(enTetes, NOUVELLE)).toEqual({
      etat: "VERIFICATION_ENVOYEE",
    });

    const { rows } = await client.query(
      `SELECT email FROM utilisateur WHERE email = $1`,
      [ANCIENNE],
    );
    expect(rows).toHaveLength(1);

    // ET LA NOUVELLE N'EXISTE NULLE PART.
    const { rows: nouvelles } = await client.query(
      `SELECT email FROM utilisateur WHERE email = $1`,
      [NOUVELLE],
    );
    expect(nouvelles).toHaveLength(0);
  });

  it("laisse l'ancienne adresse SE CONNECTER entre-temps", async () => {
    // LE SECOND SENS DU CRITERE 2, et celui qui compte pour le client : son
    // compte reste utilisable pendant qu'il attend le message.
    const enTetes = await inscrireEtConnecter(ANCIENNE);
    await client.query(
      `UPDATE utilisateur SET email_verifie = true WHERE email = $1`,
      [ANCIENNE],
    );

    await changerMonEmail(enTetes, NOUVELLE);

    await expect(
      auth.api.signInEmail({
        body: { email: ANCIENNE, password: MOT_DE_PASSE },
      }),
    ).resolves.toBeTruthy();
  });

  it("accepte la demande vers une adresse prise, le conflit sortant plus tard", async () => {
    /*
     * MESURE ET NON SUPPOSE. Better Auth ACCEPTE la demande de changement vers
     * une adresse deja prise : il se contente d'envoyer le lien, et le conflit
     * ne sort qu'a la VERIFICATION, quand l'ecriture est tentee.
     *
     * Mon test attendait d'abord un refus immediat, et il rougissait sur un
     * comportement correct de la bibliotheque.
     *
     * CE N'EST PAS UNE FAILLE : rien n'est ecrit, et le titulaire de l'adresse
     * convoitee ne recoit rien puisque le lien part a l'adresse SAISIE, qui est
     * la sienne. Quelqu'un qui saisit l'adresse d'un tiers lui envoie donc un
     * message de confirmation qu'il ne demandera pas, et le clic echouera.
     *
     * CE QUI COMPTE ICI est qu'AUCUN COMPTE NE BOUGE, et c'est ce que le test
     * verifie.
     */
    await inscrireEtConnecter("occupee@exemple.fr");
    const enTetes = await inscrireEtConnecter(ANCIENNE);
    await client.query(
      `UPDATE utilisateur SET email_verifie = true WHERE email = $1`,
      [ANCIENNE],
    );

    await changerMonEmail(enTetes, "occupee@exemple.fr");

    // AUCUN COMPTE N'A BOUGE, ce qui est la propriete a garantir.
    const { rows } = await client.query(
      `SELECT email FROM utilisateur ORDER BY email`,
    );
    expect(rows.map((r) => r.email)).toEqual([ANCIENNE, "occupee@exemple.fr"]);
  });

  it("refuse sans session", async () => {
    await inscrireEtConnecter(ANCIENNE);

    expect((await changerMonEmail(new Headers(), NOUVELLE)).etat).not.toBe(
      "VERIFICATION_ENVOYEE",
    );
  });
});

describe("les deux messages du changement d'adresse", () => {
  /**
   * Instance dont l'envoyeur REND reellement le message.
   *
   * UN DOUBLE QUI GOBE SES ARGUMENTS RESTERAIT VERT sur un modele absent ou une
   * variable manquante : c'est le RENDU qui leve, jamais l'envoi. Motif de
   * LS-54, ou trois defauts totaux vivaient dans cette jonction.
   */
  async function authAvecMessagesRendus(
    recus: { modele: string; destinataire: string; texte: string }[],
  ) {
    const { creerAuth } = await import("@/lib/auth");
    const { rendreModele } = await import("@/integrations/email/modeles");

    return creerAuth({
      envoyer: async (message) => {
        const rendu = rendreModele(message);
        recus.push({
          modele: message.modele,
          destinataire: message.destinataire,
          texte: rendu.texte,
        });
      },
    });
  }

  /** Inscrit et rend les en-tetes, sur une instance donnee. */
  async function inscrireSur(
    instance: Awaited<ReturnType<typeof import("@/lib/auth").creerAuth>>,
    email: string,
  ): Promise<Headers> {
    const reponse = await instance.api.signUpEmail({
      body: { email, password: MOT_DE_PASSE, name: "Client de test" },
      returnHeaders: true,
    });

    const enTetes = new Headers();
    enTetes.set(
      "cookie",
      (reponse.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
    );

    return enTetes;
  }

  it("sur un compte VERIFIE, avertit l'ancienne adresse", async () => {
    /*
     * `sendChangeEmailConfirmation` NE PART QUE SI L'ADRESSE ACTUELLE EST
     * VERIFIEE, mesure le 2 septembre 2026 :
     *
     *   emailVerifie=false  -> le lien part directement a la NOUVELLE adresse
     *   emailVerifie=true   -> l'avertissement part a l'ANCIENNE
     *
     * C'est coherent : avertir une adresse dont personne n'a prouve la
     * possession n'apporte aucune garantie. Mais il faut le savoir, car la
     * protection contre le detournement depuis une session ouverte ne vaut donc
     * que pour les comptes verifies.
     */
    const recus: { modele: string; destinataire: string; texte: string }[] = [];
    const instance = await authAvecMessagesRendus(recus);

    const enTetes = await inscrireSur(instance, ANCIENNE);

    await client.query(
      `UPDATE utilisateur SET email_verifie = true WHERE email = $1`,
      [ANCIENNE],
    );

    recus.length = 0;

    await instance.api.changeEmail({
      body: { newEmail: NOUVELLE, callbackURL: "/compte" },
      headers: enTetes,
    });

    expect(recus).toHaveLength(1);
    expect(recus[0]?.destinataire).toBe(ANCIENNE);
    expect(recus[0]?.modele).toBe("changement-adresse-avertissement");
    // LA NOUVELLE ADRESSE FIGURE DANS LE TEXTE : sans elle, le proprietaire ne
    // saurait pas VERS QUOI son compte serait deplace.
    expect(recus[0]?.texte).toContain(NOUVELLE);
  });

  it("sur un compte NON verifie, le changement est REFUSE", async () => {
    /*
     * CE TEST A ETE INVERSE, ET C'EST LE DEFAUT LE PLUS GRAVE DE LA JOURNEE.
     *
     * SA PREMIERE VERSION MESURAIT QUE LE LIEN PART A LA NOUVELLE ADRESSE sur
     * un compte non verifie, et en faisait une PROPRIETE. C'etait un trou, et
     * le test le documentait au lieu de le fermer. Trouve par
     * `ls-critical-reviewer`, mesure de bout en bout sur la base.
     *
     * CE QUE LE TROU PERMETTAIT, sur l'etat PAR DEFAUT des comptes de ce
     * projet, `requireEmailVerification` valant `false` :
     *
     *   un intrus qui obtient une session, SANS le mot de passe, demande le
     *   changement vers son adresse. Better Auth n'avertit PAS l'ancienne, la
     *   condition `session.user.emailVerified` etant fausse : un seul message
     *   part, vers l'intrus. Il clique, et la victime perd la connexion ET le
     *   « mot de passe oublie », son adresse n'existant plus en base.
     *
     * LE SERVICE REFUSE DESORMAIS AVANT D'APPELER BETTER AUTH.
     */
    const enTetes = await inscrireEtConnecter(ANCIENNE);

    expect(await changerMonEmail(enTetes, NOUVELLE)).toEqual({
      etat: "ADRESSE_ACTUELLE_NON_VERIFIEE",
    });

    // AUCUN COMPTE N'A BOUGE, et surtout la victime garde son adresse.
    const { rows } = await client.query(
      `SELECT email FROM utilisateur ORDER BY email`,
    );
    expect(rows.map((r) => r.email)).toEqual([ANCIENNE]);
  });

  it("aucun message ne part quand le changement est refuse", async () => {
    /*
     * LE SECOND SENS : un refus qui enverrait quand meme le lien laisserait le
     * trou entier, l'intrus n'ayant qu'a cliquer. C'est le motif de la garde
     * placee APRES l'effet, deja rencontre sur ce projet.
     */
    const recus: { modele: string; destinataire: string; texte: string }[] = [];
    const instance = await authAvecMessagesRendus(recus);

    const enTetes = await inscrireSur(instance, ANCIENNE);
    recus.length = 0;

    await changerMonEmail(enTetes, NOUVELLE);

    expect(recus).toEqual([]);
  });

  it("sur un compte VERIFIE, le changement est accepte", async () => {
    /*
     * LE SENS INVERSE, sans lequel le refus ci-dessus passerait sur un service
     * qui refuserait TOUT changement d'adresse.
     */
    const enTetes = await inscrireEtConnecter(ANCIENNE);

    await client.query(
      `UPDATE utilisateur SET email_verifie = true WHERE email = $1`,
      [ANCIENNE],
    );

    expect(await changerMonEmail(enTetes, NOUVELLE)).toEqual({
      etat: "VERIFICATION_ENVOYEE",
    });
  });

  it("le message d'inscription ne parle pas de changement", async () => {
    /*
     * `changeEmail` REUTILISE `sendVerificationEmail`, celui de l'inscription,
     * verifie via Context7 : sans distinction, un client qui change d'adresse
     * recevait « Pour terminer la creation de votre compte », message faux et
     * inquietant sur un compte existant depuis des mois.
     */
    const recus: { modele: string; destinataire: string; texte: string }[] = [];
    const instance = await authAvecMessagesRendus(recus);

    await instance.api.signUpEmail({
      body: {
        email: ANCIENNE,
        password: MOT_DE_PASSE,
        name: "Client de test",
      },
    });

    expect(recus).toHaveLength(1);
    expect(recus[0]?.modele).toBe("verification-adresse");
    expect(recus[0]?.texte).toContain("création de votre compte");
  });
});

describe("les refus de saisie sont des refus, jamais des pannes", () => {
  /*
   * LES QUATRE DEFAUTS DE LA REVUE FRONTEND SONT PASSES PARCE QUE CES CAS
   * N'ETAIENT COUVERTS PAR AUCUN TEST. Le fichier couvrait le succes et le
   * mot de passe faux ; une adresse mal formee, une saisie invalide et une
   * panne de fournisseur n'y figuraient pas.
   */
  it("classe une adresse mal formee en REFUS et non en panne", async () => {
    /*
     * BETTER AUTH NE LEVE PAS TOUJOURS LA MEME CLASSE, mesure :
     *
     *   adresse deja prise   APIError,  code=undefined
     *   adresse mal formee   Error nu,  code=VALIDATION_ERROR
     *
     * Ma premiere version testait `instanceof APIError` : le second cas passait
     * a travers et l'ecran annoncait « momentanement indisponible ». Le client
     * corrigeait une faute de frappe en attendant que la boutique revienne, et
     * chaque typo ecrivait une ligne `error` au journal.
     */
    const enTetes = await inscrireEtConnecter(ANCIENNE);
    await client.query(
      `UPDATE utilisateur SET email_verifie = true WHERE email = $1`,
      [ANCIENNE],
    );

    const resultat = await changerMonEmail(enTetes, "pas-une-adresse");

    // UN REFUS, jamais une exception qui remonterait en panne.
    expect(resultat).toEqual({ etat: "REFUSEE" });

    // ET AUCUN COMPTE N'A BOUGE.
    const { rows } = await client.query(
      `SELECT email FROM utilisateur ORDER BY email`,
    );
    expect(rows.map((r) => r.email)).toEqual([ANCIENNE]);
  });

  it("laisse remonter une VRAIE panne, sans la confondre avec un refus", async () => {
    /*
     * LE SENS INVERSE, et il donne sa valeur au test precedent : classer TOUTE
     * exception en refus masquerait une base injoignable en « adresse
     * refusee », et le client ressaierait indefiniment une adresse valide.
     *
     * La sonde leve une erreur SANS `status`, ce qui est la signature d'une
     * panne : le service doit la propager.
     */
    const { creerAuth } = await import("@/lib/auth");
    void creerAuth;

    const enTetes = new Headers();
    enTetes.set("cookie", "better-auth.session_token=jeton-inexistant");

    /*
     * SANS SESSION VALIDE, `lireIdentite` rend `null` et le service refuse
     * proprement : c'est le chemin nominal du refus, pas une panne. Le test
     * verifie qu'il ne leve pas.
     */
    await expect(changerMonEmail(enTetes, NOUVELLE)).resolves.toEqual({
      etat: "REFUSEE",
    });
  });
});

describe("critere 4, aucune commande n'est modifiee par un changement de profil", () => {
  it("le nom fige de la commande survit au changement de nom", async () => {
    /*
     * INVARIANT 3. `Commande.nomClient` est une copie figee : le profil et
     * l'historique sont deux surfaces independantes, et les relier ferait
     * changer le nom porte par une facture emise il y a six mois.
     */
    const enTetes = await inscrireEtConnecter(ANCIENNE);

    const { rows: comptes } = await client.query(
      `SELECT id FROM utilisateur WHERE email = $1`,
      [ANCIENNE],
    );

    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             adresse_livraison, adresse_facturation,
                             sous_total_centimes, mode_livraison, frais_port_centimes,
                             total_centimes, cgv_acceptees_a, cgv_version)
       VALUES ('cmd-profil', 'C-2026-0001', $1, 'Nom Au Moment De La Commande', $2,
               '{}'::jsonb, '{}'::jsonb, 4500, 'DOMICILE', 499, 4999, now(), 'v1')`,
      [ANCIENNE, comptes[0].id],
    );

    const { mettreAJourProfil } = await import("@/services/utilisateur");
    await mettreAJourProfil(comptes[0].id, { nom: "Nom Change Depuis" });

    const { rows } = await client.query(
      `SELECT nom_client, email_normalise FROM commande WHERE id = 'cmd-profil'`,
    );
    expect(rows[0].nom_client).toBe("Nom Au Moment De La Commande");

    // L'ADRESSE FIGEE DE LA COMMANDE NE BOUGE PAS NON PLUS au changement
    // d'adresse : elle sert au rattachement, jamais l'inverse.
    await changerMonEmail(enTetes, NOUVELLE);
    const { rows: apres } = await client.query(
      `SELECT email_normalise FROM commande WHERE id = 'cmd-profil'`,
    );
    expect(apres[0].email_normalise).toBe(ANCIENNE);
  });
});
