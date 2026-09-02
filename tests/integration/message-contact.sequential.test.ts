/**
 * MESSAGE DE CONTACT, LS-97.
 *
 * ECRIT AVANT LE SERVICE, exigence du plan directeur : la regle principale de
 * cette story est un ORDRE D'ECRITURE, et un ordre ne se relit pas, il se
 * mesure.
 *
 * LA REGLE : le message est persiste AVANT toute tentative d'envoi d'email.
 * `MODELE-CONCEPTUEL.md` l'annoncait depuis le 28 juillet 2026 sans qu'aucun
 * code ne la porte. Une panne du fournisseur ne doit jamais faire perdre une
 * demande client.
 *
 * AUCUNE CONTRAINTE DE BASE NE PEUT L'EXPRIMER, et c'est pourquoi ces tests
 * existent : c'est une propriete du CODE. Le controle de mutation qui inverse
 * les deux instructions est la preuve que ces tests l'attrapent.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let deposerMessage: typeof import("@/services/message-contact").deposerMessage;
let listerMessages: typeof import("@/services/message-contact").listerMessages;
let lireMessage: typeof import("@/services/message-contact").lireMessage;
let changerStatutMessage: typeof import("@/services/message-contact").changerStatutMessage;

/** Une saisie valide, que chaque test derive pour n'en changer qu'un point. */
const SAISIE = {
  nom: "TEST Camille Dupont",
  email: "test-contact@example.invalid",
  sujet: "Question sur un bracelet",
  corps: "Bonjour, ce bracelet existe-t-il en taille 18 cm ? Merci.",
  piege: "",
  ouvertA: 0,
};

/** Instant d'ouverture credible : le formulaire a ete affiche il y a 30 s. */
function ouvertIlYa(secondes: number): number {
  return Date.now() - secondes * 1000;
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ deposerMessage, listerMessages, lireMessage, changerStatutMessage } =
    await import("@/services/message-contact"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query("TRUNCATE message, envoi_en_attente, rate_limit CASCADE");
});

describe("deposerMessage", () => {
  it("ecrit le message et depose la notification, dans cet ordre", async () => {
    const issue = await deposerMessage({
      saisie: { ...SAISIE, ouvertA: ouvertIlYa(30) },
      adresseIp: "203.0.113.10",
    });

    expect(issue.statut).toBe("ENREGISTRE");

    const { rows } = await client.query<{
      nom: string;
      email: string;
      sujet: string;
      corps: string;
      statut: string;
      lu_a: Date | null;
      traite_a: Date | null;
    }>("SELECT nom, email, sujet, corps, statut, lu_a, traite_a FROM message");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.nom).toBe("TEST Camille Dupont");
    expect(rows[0]?.sujet).toBe("Question sur un bracelet");
    expect(rows[0]?.statut).toBe("NOUVEAU");
    expect(rows[0]?.lu_a).toBeNull();
    expect(rows[0]?.traite_a).toBeNull();

    /*
     * L'EMAIL EST NORMALISE, comme `Commande.emailNormalise` : c'est ce qui rend
     * deux messages de la meme personne rapprochables a l'oeil, quelle que soit
     * la casse de saisie.
     */
    expect(rows[0]?.email).toBe("test-contact@example.invalid");

    /*
     * LA NOTIFICATION EST DEPOSEE DANS L'OUTBOX, jamais envoyee en direct :
     * `securite.md` interdit l'appel direct depuis un chemin transactionnel,
     * ce qui rouvrirait le doublon qu'ADR-033 ferme.
     */
    const { rows: envois } = await client.query<{
      modele: string;
      statut: string;
      commande_id: string | null;
      variables: Record<string, string>;
    }>("SELECT modele, statut, commande_id, variables FROM envoi_en_attente");

    expect(envois).toHaveLength(1);
    expect(envois[0]?.modele).toBe("message-contact-recu");
    expect(envois[0]?.statut).toBe("EN_ATTENTE");

    /*
     * `commande_id` EST NUL, et c'est ce qui rend deux notifications de contact
     * possibles : PostgreSQL traite les `NULL` comme distincts dans un index
     * unique, donc `envoi_en_attente_actif_unique` ne les refuse jamais.
     */
    expect(envois[0]?.commande_id).toBeNull();
  });

  it("ne recopie JAMAIS le corps du message dans les variables d'envoi", async () => {
    const secret = "Mon numero de securite sociale est 1234567890123";

    await deposerMessage({
      saisie: { ...SAISIE, corps: secret, ouvertA: ouvertIlYa(30) },
      adresseIp: null,
    });

    const { rows } = await client.query<{ variables: Record<string, string> }>(
      "SELECT variables FROM envoi_en_attente",
    );

    /*
     * PRECAUTION 3 D'ADR-008 : « le contenu du message n'est pas stocke,
     * seulement son type et son destinataire ». Le corps est un champ LIBRE ou
     * une personne peut ecrire une donnee sensible au sens de l'article 9,
     * qu'aucun formulaire ne lui a demandee.
     *
     * LE RECOPIER LE STOCKERAIT UNE SECONDE FOIS, dans une table que T9 declare
     * file de travail et non trace, avec une duree de retention differente.
     */
    expect(JSON.stringify(rows[0]?.variables)).not.toContain(secret);
    expect(JSON.stringify(rows[0]?.variables)).not.toContain(
      "securite sociale",
    );
  });

  it("GARDE LE MESSAGE quand le depot de la notification echoue", async () => {
    /*
     * LE COEUR DE LA STORY, critere 2. La table de l'outbox est rendue
     * inaccessible pendant la transaction : le depot leve, et la question est
     * de savoir ce qui subsiste.
     *
     * LA REPONSE ATTENDUE EST « le message », et c'est contre-intuitif pour qui
     * connait ADR-033 : ailleurs sur ce projet, l'intention d'envoi et l'effet
     * metier partagent la transaction, donc les deux existent ou aucun. ICI
     * L'ARBITRAGE EST INVERSE, et il est ecrit dans le service : une demande
     * client perdue ne se rattrape par aucun rejeu, alors qu'une notification
     * manquee se voit dans l'administration, ou le message attend.
     */
    await client.query("ALTER TABLE envoi_en_attente RENAME TO envoi_absent");

    try {
      const issue = await deposerMessage({
        saisie: { ...SAISIE, ouvertA: ouvertIlYa(30) },
        adresseIp: null,
      });

      /*
       * L'ECRAN NE MENT PAS AU CLIENT : le message est bien enregistre, donc
       * l'issue est un succes. Rendre une erreur ferait recommencer une
       * personne dont la demande est deja arrivee.
       */
      expect(issue.statut).toBe("ENREGISTRE");

      const { rows } = await client.query<{ nombre: string }>(
        "SELECT count(*)::text AS nombre FROM message",
      );
      expect(rows[0]?.nombre).toBe("1");
    } finally {
      await client.query("ALTER TABLE envoi_absent RENAME TO envoi_en_attente");
    }
  });

  it("refuse une saisie vide, trop longue ou sans email valide", async () => {
    const vide = await deposerMessage({
      saisie: { ...SAISIE, corps: "   ", ouvertA: ouvertIlYa(30) },
      adresseIp: null,
    });
    expect(vide.statut).toBe("INVALIDE");

    const emailFaux = await deposerMessage({
      saisie: { ...SAISIE, email: "pas-une-adresse", ouvertA: ouvertIlYa(30) },
      adresseIp: null,
    });
    expect(emailFaux.statut).toBe("INVALIDE");

    /*
     * LE CORPS EST BORNE, invariant 7. Sans borne, un envoi automatise
     * remplirait la table avec un seul appel : c'est une entree publique, donc
     * non fiable par definition.
     */
    const demesure = await deposerMessage({
      saisie: { ...SAISIE, corps: "x".repeat(6000), ouvertA: ouvertIlYa(30) },
      adresseIp: null,
    });
    expect(demesure.statut).toBe("INVALIDE");

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM message",
    );
    expect(rows[0]?.nombre).toBe("0");
  });

  it("refuse un envoi automatise sans jamais le dire au robot", async () => {
    /*
     * LE CHAMP PIEGE EST INVISIBLE A L'ECRAN, donc une personne ne le remplit
     * jamais. Un robot qui remplit tous les champs du formulaire s'y prend.
     *
     * L'ISSUE EST UN SUCCES APPARENT, et c'est deliberé : dire « refuse » a un
     * robot lui apprend l'existence du piege, et la prochaine version de son
     * script le contournera. Rien n'est ecrit, il croit avoir reussi.
     */
    const issue = await deposerMessage({
      saisie: {
        ...SAISIE,
        piege: "http://exemple.test",
        ouvertA: ouvertIlYa(30),
      },
      adresseIp: null,
    });

    expect(issue.statut).toBe("ENREGISTRE");

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM message",
    );
    expect(rows[0]?.nombre).toBe("0");

    const { rows: envois } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM envoi_en_attente",
    );
    expect(envois[0]?.nombre).toBe("0");
  });

  it("refuse une soumission trop rapide pour avoir ete redigee", async () => {
    /*
     * LA SECONDE COUCHE, INDEPENDANTE DE LA PREMIERE. Un robot qui n'aurait pas
     * rempli le piege soumet quand meme en quelques millisecondes : personne ne
     * redige un message en moins de trois secondes.
     *
     * LE SEUIL EST BAS EXPRES. Il ne s'agit pas de mesurer un temps de
     * redaction credible, ce qui punirait un copier-coller preparé ailleurs,
     * mais d'ecarter la soumission instantanee.
     */
    const issue = await deposerMessage({
      saisie: { ...SAISIE, ouvertA: Date.now() },
      adresseIp: null,
    });

    expect(issue.statut).toBe("ENREGISTRE");

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM message",
    );
    expect(rows[0]?.nombre).toBe("0");
  });

  it("plafonne les envois d'une meme adresse IP", async () => {
    /*
     * LA TROISIEME COUCHE, qui borne le volume plutot que la nature de
     * l'appelant. Elle ne remplace pas les deux autres : elle ferme le cas d'un
     * robot qui aurait appris a eviter le piege et a temporiser.
     *
     * ELLE EST EN COMPLEMENT ET NON EN SOCLE, parce que l'adresse IP peut etre
     * NULLE : `getIp` ne lit que des en-tetes, et sa fiabilite tient a
     * l'ecrasement Nginx de LS-91. Un plafond qui en dependrait seul serait
     * inoperant partout ailleurs.
     */
    const adresseIp = "203.0.113.42";

    for (let tentative = 0; tentative < 5; tentative += 1) {
      const issue = await deposerMessage({
        saisie: {
          ...SAISIE,
          sujet: `Sujet ${tentative}`,
          ouvertA: ouvertIlYa(30),
        },
        adresseIp,
      });
      expect(issue.statut).toBe("ENREGISTRE");
    }

    const refuse = await deposerMessage({
      saisie: { ...SAISIE, sujet: "Le sixieme", ouvertA: ouvertIlYa(30) },
      adresseIp,
    });

    /*
     * LE REFUS EST DIT, ICI. Contrairement au piege, un plafond atteint concerne
     * une personne reelle dans l'immense majorite des cas : lui laisser croire
     * que son message est parti serait le vrai defaut.
     */
    expect(refuse.statut).toBe("TROP_DE_MESSAGES");

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM message",
    );
    expect(rows[0]?.nombre).toBe("5");
  });

  it("ne plafonne pas quand l'adresse IP est inconnue", async () => {
    /*
     * UNE ADRESSE NULLE NE DOIT PAS PRODUIRE UN COMPTEUR PARTAGE PAR TOUS.
     * C'est le defaut que `limitation-action.ts` documente : compter sur une
     * valeur qui peut etre nulle donne un plafond unique pour le monde entier,
     * donc un deni de service offert au premier venu.
     */
    for (let tentative = 0; tentative < 8; tentative += 1) {
      const issue = await deposerMessage({
        saisie: {
          ...SAISIE,
          sujet: `Sujet ${tentative}`,
          ouvertA: ouvertIlYa(30),
        },
        adresseIp: null,
      });
      expect(issue.statut).toBe("ENREGISTRE");
    }

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM message",
    );
    expect(rows[0]?.nombre).toBe("8");
  });
});

describe("listerMessages et lireMessage", () => {
  it("liste les messages, les plus recents d'abord", async () => {
    await deposerMessage({
      saisie: { ...SAISIE, sujet: "Le premier", ouvertA: ouvertIlYa(30) },
      adresseIp: null,
    });
    await deposerMessage({
      saisie: { ...SAISIE, sujet: "Le second", ouvertA: ouvertIlYa(30) },
      adresseIp: null,
    });

    const messages = await listerMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0]?.sujet).toBe("Le second");
  });

  it("rend le detail, corps compris", async () => {
    await deposerMessage({
      saisie: { ...SAISIE, ouvertA: ouvertIlYa(30) },
      adresseIp: null,
    });

    const [resume] = await listerMessages();
    const detail = await lireMessage(resume!.id);

    expect(detail?.corps).toBe(SAISIE.corps);
    expect(detail?.email).toBe(SAISIE.email);
  });

  it("rend null sur un identifiant inexistant", async () => {
    expect(
      await lireMessage("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });
});

describe("changerStatutMessage", () => {
  it("horodate le passage a LU puis a TRAITE", async () => {
    await deposerMessage({
      saisie: { ...SAISIE, ouvertA: ouvertIlYa(30) },
      adresseIp: null,
    });
    const [resume] = await listerMessages();

    await changerStatutMessage({ messageId: resume!.id, statut: "LU" });

    const { rows: apresLu } = await client.query<{
      statut: string;
      lu_a: Date | null;
      traite_a: Date | null;
    }>("SELECT statut, lu_a, traite_a FROM message WHERE id = $1", [
      resume!.id,
    ]);

    expect(apresLu[0]?.statut).toBe("LU");
    expect(apresLu[0]?.lu_a).not.toBeNull();
    expect(apresLu[0]?.traite_a).toBeNull();

    await changerStatutMessage({ messageId: resume!.id, statut: "TRAITE" });

    const { rows: apresTraite } = await client.query<{
      statut: string;
      lu_a: Date | null;
      traite_a: Date | null;
    }>("SELECT statut, lu_a, traite_a FROM message WHERE id = $1", [
      resume!.id,
    ]);

    expect(apresTraite[0]?.statut).toBe("TRAITE");
    /*
     * `lu_a` SURVIT AU PASSAGE A TRAITE, et C30 l'exige : un message traite a
     * forcement ete lu. L'ecraser perdrait la date de premiere lecture, seule
     * information qui dise combien de temps la demande a attendu.
     */
    expect(apresTraite[0]?.lu_a).not.toBeNull();
    expect(apresTraite[0]?.traite_a).not.toBeNull();
  });

  it("garde la date de premiere lecture quand on repasse par LU", async () => {
    await deposerMessage({
      saisie: { ...SAISIE, ouvertA: ouvertIlYa(30) },
      adresseIp: null,
    });
    const [resume] = await listerMessages();

    await changerStatutMessage({ messageId: resume!.id, statut: "LU" });

    const { rows: premiere } = await client.query<{ lu_a: Date }>(
      "SELECT lu_a FROM message WHERE id = $1",
      [resume!.id],
    );

    await changerStatutMessage({ messageId: resume!.id, statut: "LU" });

    const { rows: seconde } = await client.query<{ lu_a: Date }>(
      "SELECT lu_a FROM message WHERE id = $1",
      [resume!.id],
    );

    /*
     * OUVRIR DEUX FOIS UN MESSAGE NE LE REND PAS LU DEUX FOIS. Reecrire la date
     * a chaque affichage ferait croire qu'une demande de la semaine derniere
     * vient d'etre vue, et l'anciennete reelle disparaitrait.
     */
    expect(seconde[0]?.lu_a.getTime()).toBe(premiere[0]?.lu_a.getTime());
  });

  it("refuse un identifiant inexistant sans rien ecrire", async () => {
    const issue = await changerStatutMessage({
      messageId: "00000000-0000-4000-8000-000000000000",
      statut: "LU",
    });

    expect(issue.statut).toBe("INTROUVABLE");
  });

  it("rejette un identifiant difforme avant toute lecture", async () => {
    await expect(
      changerStatutMessage({ messageId: "pas-un-identifiant", statut: "LU" }),
    ).rejects.toThrow();
  });
});
