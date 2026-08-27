/**
 * L'OUTBOX FERME LE DOUBLON D'EMAIL, LS-51 et LS-82, ADR-033.
 *
 * ECRIT AVANT LE SERVICE, exigence du plan directeur en zone critique. Ce
 * fichier dit ce que l'expedition doit garantir, pas ce qu'elle fait.
 *
 * LE SUJET N'EST PAS QU'UN EMAIL PARTE. C'est qu'il ne parte JAMAIS DEUX FOIS
 * quand le processus tombe entre l'appel au serveur et l'ecriture de la trace.
 * `journal_email_systeme_unique` ne voit rien de cette fenetre : elle protege
 * la base, pas l'appel reseau. Le test « panne entre l'appel et l'ecriture »
 * porte cette garantie, et lui seul.
 *
 * QUATRIEME CLE D'IDEMPOTENCE. LS-119 a livre avec deux cles sur quatre
 * prouvees, aucune ligne `JournalEmail` n'etant ecrite nulle part. Ce fichier
 * exerce la quatrieme, et ses TROIS CONDITIONS SEPAREMENT : le filtre sur
 * `statut`, celui sur `origine`, et l'exclusion d'`ADMIN`. Les eprouver
 * ensemble laisserait passer une condition retiree.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import type { EnvoyeurEmail, MessageEmail } from "@/integrations/email";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let deposerEnvoi: typeof import("@/services/envoi-email").deposerEnvoi;
let expedierEnvoisEnAttente: typeof import("@/services/envoi-email").expedierEnvoisEnAttente;
let envoyerDirect: typeof import("@/services/envoi-email").envoyerDirect;
let prisma: typeof import("@/lib/prisma").prisma;

/** Saisie minimale, mode DOMICILE, reprise du test de webhook. */
const SAISIE_DOMICILE = {
  nomClient: "TEST Camille Dupont",
  email: "test@example.invalid",
  telephone: null,
  adresse: {
    ligne1: "1 rue de Test",
    codePostal: "75001",
    ville: "TESTVILLE",
    pays: "FR" as const,
  },
  mode: "DOMICILE" as const,
  pointRetrait: null,
};

const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 499,
  seuilFranchiseCentimes: 3900,
};

/**
 * Double d'envoyeur qui compte les appels et peut echouer a la demande.
 *
 * IL COMPTE LES APPELS PLUTOT QUE LES LIGNES EN BASE, et c'est le point du
 * fichier : le defaut vise est un SECOND APPEL au serveur, qui part meme si la
 * base refuse ensuite d'ecrire la trace. Compter les lignes de `JournalEmail`
 * verrait une base propre et raterait l'email en double dans la boite du
 * client.
 */
function envoyeurDouble(
  options: { erreur?: unknown } = {},
): EnvoyeurEmail & { appels: MessageEmail[] } {
  const appels: MessageEmail[] = [];

  return {
    appels,
    async envoyer(message) {
      appels.push(message);

      if (options.erreur !== undefined) {
        throw options.erreur;
      }
    },
  };
}

/** Erreur nodemailer simulee, avec son code, seul champ que le code lit. */
function erreurSmtp(code: string): Error & { code: string } {
  return Object.assign(new Error(`erreur de test ${code}`), { code });
}

/** Ecrit une commande reelle par le service, jamais par un INSERT a la main. */
async function commanderUnePiece(): Promise<string> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  return issue.commandeId;
}

/** Depose une intention par le service, dans une transaction comme en vrai. */
async function deposer(
  commandeId: string,
  options: {
    modele?: string;
    origine?: "SYSTEME" | "RECONCILIATION" | "ADMIN";
  } = {},
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await deposerEnvoi(transaction, {
      commandeId,
      destinataire: "test@example.invalid",
      modele: (options.modele ?? "verification-adresse") as never,
      variables: { lien: "https://exemple.invalid/verifier" },
      origine: options.origine ?? "SYSTEME",
    });
  });
}

/** Etat d'une ligne d'outbox, par commande. */
async function lireOutbox(commandeId: string): Promise<
  {
    statut: string;
    tentatives: number;
    motif_echec: string | null;
  }[]
> {
  const { rows } = await client.query<{
    statut: string;
    tentatives: number;
    motif_echec: string | null;
  }>(
    `SELECT statut, tentatives, motif_echec FROM envoi_en_attente
     WHERE commande_id = $1 ORDER BY cree_a`,
    [commandeId],
  );

  return rows;
}

/** Traces ecrites pour une commande. */
async function lireTraces(
  commandeId: string,
): Promise<{ statut: string; origine: string; modele: string }[]> {
  const { rows } = await client.query<{
    statut: string;
    origine: string;
    modele: string;
  }>(
    `SELECT statut, origine, modele FROM journal_email
     WHERE commande_id = $1 ORDER BY cree_a`,
    [commandeId],
  );

  return rows;
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  // Les services lisent `DATABASE_URL` a l'evaluation du module `@/lib/prisma`,
  // d'ou les imports differes.
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ deposerEnvoi, expedierEnvoisEnAttente, envoyerDirect } =
    await import("@/services/envoi-email"));
  ({ prisma } = await import("@/lib/prisma"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE alerte_critique, journal_email, envoi_en_attente,
     historique_statut, mouvement_stock, evenement_fournisseur, paiement,
     reservation, ligne_commande, commande, variante, produit, categorie,
     compteur_numero CASCADE`,
  );
});

describe("expedition, cas nominal", () => {
  it("envoie le message, marque la ligne ENVOYE et ecrit sa trace", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    const envoyeur = envoyeurDouble();
    const bilan = await expedierEnvoisEnAttente(envoyeur, prisma);

    expect(bilan).toEqual({ envoyes: 1, echoues: 0, bloques: 0 });
    expect(envoyeur.appels).toHaveLength(1);
    expect(envoyeur.appels[0]?.destinataire).toBe("test@example.invalid");

    // CRITERE 2 : chaque envoi produit une ligne de trace.
    expect(await lireTraces(commandeId)).toEqual([
      {
        statut: "ENVOYE",
        origine: "SYSTEME",
        modele: "verification-adresse",
      },
    ]);

    const outbox = await lireOutbox(commandeId);
    expect(outbox[0]?.statut).toBe("ENVOYE");
  });

  it("ne renvoie rien au cycle suivant", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    const envoyeur = envoyeurDouble();
    await expedierEnvoisEnAttente(envoyeur, prisma);
    await expedierEnvoisEnAttente(envoyeur, prisma);

    // UN SEUL APPEL AU SERVEUR, et c'est l'assertion qui compte : compter les
    // traces verrait une base propre meme si le message etait parti deux fois.
    expect(envoyeur.appels).toHaveLength(1);
  });

  /**
   * CE QUE LE MARQUAGE AVANT APPEL PROTEGE VRAIMENT, et le test precedent ne
   * le voyait pas.
   *
   * Mesure le 27 aout 2026 : neutraliser le marquage `ENVOI_EN_COURS` laissait
   * les deux tests ci-dessus au VERT. Le motif est que le premier cycle se
   * termine avant le second et ecrit `ENVOYE` : la ligne sort du filtre par son
   * statut final, jamais par la marque. Le marquage n'etait donc exerce pour
   * rien de ce qu'il garantit.
   *
   * LA GARANTIE PORTE SUR DEUX EXECUTIONS QUI SE CHEVAUCHENT. La seconde
   * demarre pendant que la premiere est SUSPENDUE DANS SON APPEL SMTP, ce qui
   * est la situation reelle : un appel reseau dure des secondes, le verrou de
   * tache expire, ou deux conteneurs tournent. Sans la marque, la seconde
   * retrouve une ligne `EN_ATTENTE` intacte et envoie le meme message.
   *
   * L'ATTENTE N'EST PAS UN `setTimeout`, qui mesurerait une duree plutot qu'un
   * ordre : la promesse est resolue par le test lui-meme, une fois la seconde
   * execution terminee. La fenetre est donc ouverte de façon deterministe.
   */
  it("n'envoie pas deux fois quand deux executions se chevauchent", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    const appels: string[] = [];

    // La promesse de relachement est construite AVANT l'envoyeur, plutot que
    // depuis sa closure : TypeScript deduirait sinon `never` du resolveur, la
    // seule affectation visible etant dans une fonction imbriquee.
    let libererPremierAppel = (): void => {};
    const premierAppelSuspendu = new Promise<void>((relacher) => {
      libererPremierAppel = relacher;
    });

    let signalerAppelCommence = (): void => {};
    const premierAppelCommence = new Promise<void>((resoudre) => {
      signalerAppelCommence = resoudre;
    });

    const envoyeurLent: EnvoyeurEmail = {
      async envoyer(message) {
        appels.push(message.modele);
        signalerAppelCommence();

        // Suspendue jusqu'a ce que la seconde execution ait fini de chercher
        // du travail. C'est la fenetre que la marque doit avoir fermee.
        await premierAppelSuspendu;
      },
    };

    const premiereExecution = expedierEnvoisEnAttente(envoyeurLent, prisma);

    await premierAppelCommence;

    // La seconde execution demarre pendant que la premiere tient son appel.
    const secondEnvoyeur = envoyeurDouble();
    const bilan = await expedierEnvoisEnAttente(secondEnvoyeur, prisma);

    libererPremierAppel();
    await premiereExecution;

    // ELLE NE TROUVE RIEN A ENVOYER : la ligne porte deja `ENVOI_EN_COURS`,
    // commite avant l'appel. Sans cette marque elle serait `EN_ATTENTE`, et le
    // client recevrait deux confirmations identiques.
    expect(secondEnvoyeur.appels).toHaveLength(0);
    expect(bilan.envoyes).toBe(0);
    expect(appels).toHaveLength(1);
  });
});

describe("la fenetre qu'ADR-033 ferme", () => {
  /**
   * LE TEST CENTRAL DU FICHIER.
   *
   * Il simule la panne entre l'appel reussi et l'ecriture du resultat : la
   * ligne reste `ENVOI_EN_COURS`, etat ou personne ne sait si le message est
   * parti. Le cycle suivant NE DOIT PAS la reprendre.
   *
   * SANS L'OUTBOX, ce scenario produisait un second email : aucune trace
   * n'existait, donc rien ne bloquait la reprise. C'est exactement le defaut
   * decrit par LS-51.
   */
  it("ne rejoue jamais une ligne restee ENVOI_EN_COURS", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    // La panne est simulee en posant l'etat que le processus aurait laisse :
    // marque prise, aucun resultat ecrit. C'est l'etat REEL apres un arret
    // brutal, la marque etant commitee avant l'appel.
    await client.query(
      `UPDATE envoi_en_attente
       SET statut = 'ENVOI_EN_COURS', prise_a = now(), tentatives = 1
       WHERE commande_id = $1`,
      [commandeId],
    );

    const envoyeur = envoyeurDouble();
    const bilan = await expedierEnvoisEnAttente(envoyeur, prisma);

    // AUCUN APPEL : le message est peut-etre parti, on ne le rejoue pas.
    expect(envoyeur.appels).toHaveLength(0);
    expect(bilan.envoyes).toBe(0);

    const outbox = await lireOutbox(commandeId);
    expect(outbox[0]?.statut).toBe("ENVOI_EN_COURS");
  });

  it("alerte sur une ligne bloquee au-dela du delai de garde", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    // Prise il y a onze minutes, au-dela des dix minutes de garde.
    await client.query(
      `UPDATE envoi_en_attente
       SET statut = 'ENVOI_EN_COURS', prise_a = now() - interval '11 minutes'
       WHERE commande_id = $1`,
      [commandeId],
    );

    const bilan = await expedierEnvoisEnAttente(envoyeurDouble(), prisma);

    expect(bilan.bloques).toBe(1);

    const { rows } = await client.query<{ type: string; gravite: string }>(
      "SELECT type, gravite FROM alerte_critique",
    );

    expect(rows).toEqual([
      { type: "ENVOI_EMAIL_BLOQUE", gravite: "AVERTISSEMENT" },
    ]);
  });

  it("n'alerte pas sur une ligne prise a l'instant", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    await client.query(
      `UPDATE envoi_en_attente
       SET statut = 'ENVOI_EN_COURS', prise_a = now()
       WHERE commande_id = $1`,
      [commandeId],
    );

    const bilan = await expedierEnvoisEnAttente(envoyeurDouble(), prisma);

    // SANS CE TEST, un delai de garde mis a zero passerait inapercu et
    // alerterait sur chaque envoi normal, noyant l'alerte reelle.
    expect(bilan.bloques).toBe(0);
  });
});

describe("classement des erreurs, critere 4", () => {
  it("ne retente pas apres une erreur d'authentification", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    const envoyeur = envoyeurDouble({ erreur: erreurSmtp("EAUTH") });

    await expedierEnvoisEnAttente(envoyeur, prisma);
    await expedierEnvoisEnAttente(envoyeur, prisma);
    await expedierEnvoisEnAttente(envoyeur, prisma);

    // UN SEUL APPEL malgre trois cycles : un mot de passe faux le reste, et
    // chaque reprise entamerait le quota horaire de l'offre MX Plan.
    expect(envoyeur.appels).toHaveLength(1);

    const outbox = await lireOutbox(commandeId);
    expect(outbox[0]?.statut).toBe("ECHOUE");
    expect(outbox[0]?.motif_echec).toBe("EAUTH");
  });

  it("retente apres une erreur reseau, dans la limite du plafond", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    const envoyeur = envoyeurDouble({ erreur: erreurSmtp("ECONNECTION") });

    await expedierEnvoisEnAttente(envoyeur, prisma);
    await expedierEnvoisEnAttente(envoyeur, prisma);
    await expedierEnvoisEnAttente(envoyeur, prisma);
    await expedierEnvoisEnAttente(envoyeur, prisma);

    // TROIS APPELS ET NON QUATRE : la retentative existe, regle E4, mais elle
    // est bornee. Sans plafond, une adresse morte consommerait le quota a
    // chaque cycle, indefiniment.
    expect(envoyeur.appels).toHaveLength(3);
  });

  it("ecrit une trace ECHOUE, critere 2", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    await expedierEnvoisEnAttente(
      envoyeurDouble({ erreur: erreurSmtp("ECONNECTION") }),
      prisma,
    );

    const traces = await lireTraces(commandeId);
    expect(traces).toEqual([
      {
        statut: "ECHOUE",
        origine: "SYSTEME",
        modele: "verification-adresse",
      },
    ]);
  });

  it("ne recopie jamais la reponse du serveur dans le motif", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);

    // Une reponse SMTP reelle transporte parfois l'identifiant de connexion.
    // La constante ci-dessous est une VALEUR DE TEST, jamais un secret reel :
    // elle existe pour prouver que le filtre la retient.
    const erreur = Object.assign(
      new Error("535 5.7.8 Authentication failed for utilisateur-de-test"),
      { code: "EAUTH", response: "535 identifiants refuses" },
    );

    await expedierEnvoisEnAttente(envoyeurDouble({ erreur }), prisma);

    const outbox = await lireOutbox(commandeId);

    // CRITERE 6 : seul le code est conserve, jamais le texte du serveur.
    expect(outbox[0]?.motif_echec).toBe("EAUTH");
    expect(outbox[0]?.motif_echec).not.toContain("utilisateur-de-test");
  });
});

describe("la quatrieme cle d'idempotence, ses trois conditions", () => {
  it("refuse une seconde intention pour la meme commande et le meme modele", async () => {
    const commandeId = await commanderUnePiece();

    await deposer(commandeId);
    await deposer(commandeId);

    // LE SECOND DEPOT EST ABSORBE, PAS PROPAGE : lever annulerait la
    // transaction metier entiere, donc la confirmation de commande, pour un
    // email en double. Une commande payee non confirmee est bien pire.
    expect(await lireOutbox(commandeId)).toHaveLength(1);
  });

  it("laisse passer le meme modele sur une AUTRE commande", async () => {
    const premiere = await commanderUnePiece();
    const seconde = await commanderUnePiece();

    await deposer(premiere);
    await deposer(seconde);

    // La cle porte sur le COUPLE commande et modele. Une cle ancree sur le
    // modele seul bloquerait toutes les confirmations apres la premiere.
    expect(await lireOutbox(premiere)).toHaveLength(1);
    expect(await lireOutbox(seconde)).toHaveLength(1);
  });

  it("laisse passer un AUTRE modele sur la meme commande", async () => {
    const commandeId = await commanderUnePiece();

    await deposer(commandeId, { modele: "verification-adresse" });
    await deposer(commandeId, { modele: "reinitialisation-mot-de-passe" });

    expect(await lireOutbox(commandeId)).toHaveLength(2);
  });

  it("rouvre la cle une fois l'envoi termine, ce qui autorise le renvoi manuel", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId);
    await expedierEnvoisEnAttente(envoyeurDouble(), prisma);

    // REGLE E6 : la ligne ENVOYE n'occupe plus la cle, l'administratrice peut
    // redeposer. Un filtre sans exclusion des lignes terminees bloquerait ce
    // renvoi pour toujours.
    await deposer(commandeId, { origine: "ADMIN" });

    const outbox = await lireOutbox(commandeId);
    expect(outbox).toHaveLength(2);
    expect(outbox.map((ligne) => ligne.statut)).toEqual([
      "ENVOYE",
      "EN_ATTENTE",
    ]);
  });

  it("conserve l'origine reelle dans la trace, SYSTEME ou RECONCILIATION", async () => {
    const commandeId = await commanderUnePiece();
    await deposer(commandeId, { origine: "RECONCILIATION" });

    await expedierEnvoisEnAttente(envoyeurDouble(), prisma);

    // L'ORIGINE ALIMENTE LE FILTRE DE `journal_email_systeme_unique`. La
    // recopier depuis l'outbox garde le chemin d'entree reel : ecrire SYSTEME
    // en dur ferait mentir la trace sur le chemin qui a produit l'email, et la
    // decision D existe precisement pour distinguer les deux.
    expect(await lireTraces(commandeId)).toEqual([
      {
        statut: "ENVOYE",
        origine: "RECONCILIATION",
        modele: "verification-adresse",
      },
    ]);
  });
});

describe("envoi direct, hors outbox", () => {
  it("ecrit une trace sans commande", async () => {
    const envoyeur = envoyeurDouble();

    await envoyerDirect(
      envoyeur,
      {
        destinataire: "test@example.invalid",
        modele: "reinitialisation-mot-de-passe",
        variables: { lien: "https://exemple.invalid/reinitialiser" },
      },
      prisma,
    );

    expect(envoyeur.appels).toHaveLength(1);

    const { rows } = await client.query<{
      statut: string;
      commande_id: string | null;
    }>("SELECT statut, commande_id FROM journal_email");

    expect(rows).toEqual([{ statut: "ENVOYE", commande_id: null }]);
  });

  /**
   * CRITERE 3 DE LS-82, SON CAS LE PLUS STRICT : ce n'est pas l'envoi qui
   * echoue, c'est L'ECRITURE DE LA TRACE. Une base momentanement indisponible
   * ne doit pas faire echouer une reinitialisation de mot de passe.
   *
   * LE DOUBLE PORTE SUR `journalEmail.create` ET NON SUR LE CLIENT ENTIER : le
   * reste du client doit continuer de fonctionner, sans quoi le test prouverait
   * seulement qu'une base morte ne casse rien, ce qui est un autre sujet.
   */
  it("ne leve pas quand la trace ne peut pas s'ecrire", async () => {
    const envoyeur = envoyeurDouble();

    const clientCasse = {
      ...prisma,
      journalEmail: {
        create: async () => {
          throw new Error("ecriture de trace impossible");
        },
      },
    } as unknown as typeof prisma;

    await expect(
      envoyerDirect(
        envoyeur,
        {
          destinataire: "test@example.invalid",
          modele: "verification-adresse",
          variables: { lien: "https://exemple.invalid/verifier" },
        },
        clientCasse,
      ),
    ).resolves.toBeUndefined();

    // LE MESSAGE EST BIEN PARTI malgre la trace perdue : la trace degrade le
    // diagnostic, elle ne ferme pas la porte a l'utilisateur. Meme principe
    // que la regle E15 pour le journal de connexions.
    expect(envoyeur.appels).toHaveLength(1);
  });

  it("ne leve pas quand le fournisseur echoue", async () => {
    await expect(
      envoyerDirect(
        envoyeurDouble({ erreur: erreurSmtp("ECONNECTION") }),
        {
          destinataire: "test@example.invalid",
          modele: "reinitialisation-mot-de-passe",
          variables: { lien: "https://exemple.invalid/reinitialiser" },
        },
        prisma,
      ),
    ).resolves.toBeUndefined();

    const { rows } = await client.query<{ statut: string }>(
      "SELECT statut FROM journal_email",
    );

    expect(rows).toEqual([{ statut: "ECHOUE" }]);
  });
});
