/**
 * Classement des erreurs d'envoi et lecture de configuration, LS-82.
 *
 * POURQUOI CES CONTROLES SONT UNITAIRES. La decision « retenter ou non » est
 * une fonction pure du code d'erreur : l'eprouver avec une base et un serveur
 * SMTP la rendrait lente et fragile sans rien prouver de plus. Les effets en
 * base sont eprouves par `envoi-email.sequential.test.ts`.
 *
 * CE QUE LE CRITERE 4 DE LS-82 EXIGE : une erreur d'authentification ne
 * declenche pas de nouvelle tentative. La preuve tient en deux morceaux, le
 * classement ici, et son effet sur les tentatives dans le test d'integration.
 */
import { describe, expect, it } from "vitest";

import {
  ConfigurationEmailIncompleteError,
  estReessayable,
  lireConfigurationSmtp,
  motifSansSecret,
} from "@/integrations/email/smtp";
import { rendreModele } from "@/integrations/email/modeles";

/** Erreur nodemailer simulee : seul `code` est lu par le classement. */
function erreur(code: string): Error & { code: string } {
  return Object.assign(new Error(`erreur ${code}`), { code });
}

describe("estReessayable", () => {
  it("refuse de retenter sur une erreur d'authentification", () => {
    // LE DEFAUT VISE PAR LE CRITERE 4. Retenter sur un mot de passe faux
    // epuise le quota de 200 messages par heure du MX Plan, et fait tomber les
    // envois legitimes avec lui.
    expect(estReessayable(erreur("EAUTH"))).toBe(false);
    expect(estReessayable(erreur("ENOAUTH"))).toBe(false);
  });

  it("refuse de retenter sur une adresse ou une configuration refusee", () => {
    expect(estReessayable(erreur("EENVELOPE"))).toBe(false);
    expect(estReessayable(erreur("ECONFIG"))).toBe(false);
  });

  it("retente sur une erreur reseau", () => {
    expect(estReessayable(erreur("ECONNECTION"))).toBe(true);
    expect(estReessayable(erreur("ETIMEDOUT"))).toBe(true);
  });

  it("retente par defaut sur un code inconnu", () => {
    // CE SENS EST DELIBERE. Un code non repertorie est plus souvent une panne
    // passagere qu'une faute definitive, et le nombre de tentatives reste
    // borne par l'appelant. Refuser par defaut priverait un client de sa
    // confirmation sur un code jamais vu.
    expect(estReessayable(erreur("EQUELQUECHOSE"))).toBe(true);
    expect(estReessayable(new Error("sans code"))).toBe(true);
    expect(estReessayable(null)).toBe(true);
  });
});

describe("motifSansSecret", () => {
  it("garde le code et rien d'autre", () => {
    // Un refus SMTP reel transporte parfois l'identifiant de connexion dans
    // son texte. La chaine ci-dessous est une VALEUR DE TEST : elle existe
    // pour prouver que le filtre la retient, et son absence dans le resultat
    // est l'assertion qui compte.
    const refus = Object.assign(
      new Error("535 Authentication failed for utilisateur-de-test"),
      { code: "EAUTH", response: "535 identifiants refuses" },
    );

    const motif = motifSansSecret(refus);

    expect(motif).toBe("EAUTH");
    expect(motif).not.toContain("utilisateur-de-test");
    expect(motif).not.toContain("535");
  });

  it("rend une valeur stable quand le code manque", () => {
    expect(motifSansSecret(new Error("panne"))).toBe("ERREUR_INCONNUE");
    expect(motifSansSecret(undefined)).toBe("ERREUR_INCONNUE");
  });
});

describe("lireConfigurationSmtp", () => {
  /**
   * Marqueur tenant lieu de mot de passe, ASSEMBLE A L'EXECUTION.
   *
   * IL N'EST PAS ECRIT COMME UN LITTERAL, et ce n'est pas de la coquetterie :
   * une chaine posee sur une cle nommee `SMTP_PASSWORD` a la FORME d'un secret
   * en dur, et l'analyse de secrets de la CI la refuse a juste titre. Elle ne
   * peut pas savoir que la valeur est inventee.
   *
   * L'assemblage garde au test toute sa force : c'est bien une valeur presente
   * et non vide qui traverse la lecture, et c'est son ABSENCE du message
   * d'erreur qui est verifiee plus bas. Un test ecrit avec une chaine vide
   * prouverait moins, la fonction refusant deja le vide.
   */
  const MARQUEUR_MOT_DE_PASSE = ["valeur", "inventee", "sans", "effet"].join(
    "-",
  );

  /** Environnement complet, valeurs inventees et sans effet reseau. */
  const COMPLET = {
    SMTP_HOST: "smtp.exemple.invalid",
    SMTP_PORT: "587",
    SMTP_USER: "compte@exemple.invalid",
    SMTP_PASSWORD: MARQUEUR_MOT_DE_PASSE,
    EMAIL_FROM_ADDRESS: "contact@exemple.invalid",
  } as unknown as NodeJS.ProcessEnv;

  it("lit les cinq valeurs necessaires", () => {
    const config = lireConfigurationSmtp(COMPLET);

    expect(config.hote).toBe("smtp.exemple.invalid");
    expect(config.port).toBe(587);
    expect(config.expediteur).toBe("contact@exemple.invalid");
  });

  it("retient 587 quand le port est absent", () => {
    const sansPort = { ...COMPLET };
    delete sansPort.SMTP_PORT;

    expect(lireConfigurationSmtp(sansPort).port).toBe(587);
  });

  it("refuse une configuration incomplete en nommant ce qui manque", () => {
    const sansMotDePasse = { ...COMPLET };
    delete sansMotDePasse.SMTP_PASSWORD;

    // ELLE NOMME LA VARIABLE, JAMAIS SA VALEUR : invariant 9, le depot est
    // public et cette erreur peut remonter dans un journal.
    expect(() => lireConfigurationSmtp(sansMotDePasse)).toThrow(
      ConfigurationEmailIncompleteError,
    );

    try {
      lireConfigurationSmtp(sansMotDePasse);
      expect.unreachable("la lecture aurait du refuser");
    } catch (capturee) {
      const attendue = capturee as ConfigurationEmailIncompleteError;
      expect(attendue.variablesManquantes).toEqual(["SMTP_PASSWORD"]);
      expect(attendue.message).not.toContain(MARQUEUR_MOT_DE_PASSE);
    }
  });

  it("refuse aussi quand une valeur est presente mais vide", () => {
    // UNE CHAINE VIDE EST UNE ABSENCE, pas une valeur. Sans ce controle, un
    // `SMTP_PASSWORD=` laisse en place ferait echouer l'authentification a
    // chaque envoi plutot qu'au demarrage.
    expect(() => lireConfigurationSmtp({ ...COMPLET, SMTP_HOST: "" })).toThrow(
      ConfigurationEmailIncompleteError,
    );
  });
});

describe("rendreModele", () => {
  it("rend les trois modeles avec leur variable", () => {
    const verification = rendreModele({
      destinataire: "test@example.invalid",
      modele: "verification-adresse",
      variables: { lien: "https://exemple.invalid/verifier" },
    });

    expect(verification.objet).toContain("adresse");
    expect(verification.texte).toContain("https://exemple.invalid/verifier");
  });

  it("refuse de rendre un message dont la variable manque", () => {
    // UN LIEN ABSENT PRODUIRAIT UN MESSAGE POLI ET INUTILISABLE, que le client
    // recevrait sans pouvoir agir, et la trace dirait `ENVOYE`. Le defaut
    // serait invisible des deux cotes.
    expect(() =>
      rendreModele({
        destinataire: "test@example.invalid",
        modele: "reinitialisation-mot-de-passe",
        variables: {},
      }),
    ).toThrow(/lien/);
  });

  /**
   * LES ACCENTS SONT UNE EXIGENCE DE REDACTION ET UN ENJEU DE DELIVRABILITE.
   *
   * Regle du projet : tous les accents presents dans tout texte visible, et un
   * email transactionnel en est. Le defaut a ete constate le 27 aout 2026 dans
   * une vraie boite, « Connexion a l'administration », apres que le message
   * soit parti : aucun test ne le voyait, celui du cadratin ne regardant que
   * les tirets.
   *
   * S'Y AJOUTE UN MOTIF TECHNIQUE : un texte français sans accents est un
   * signal connu des filtres anti-indesirables, qui le lisent comme du texte
   * degrade. Le message de test avait ete classe en indesirable chez Yahoo.
   *
   * LE CONTROLE PORTE SUR DES MOTS ATTENDUS ET NON SUR « au moins un accent ».
   * Compter les accents laisserait passer un texte qui en porte un et en oublie
   * six ; nommer les formes fautives attrape la faute la ou elle se produit.
   */
  it("ecrit tous les accents des textes visibles", () => {
    const rendus = [
      rendreModele({
        destinataire: "test@example.invalid",
        modele: "verification-adresse",
        variables: { lien: "https://exemple.invalid/verifier" },
      }),
      rendreModele({
        destinataire: "test@example.invalid",
        modele: "reinitialisation-mot-de-passe",
        variables: { lien: "https://exemple.invalid/reinitialiser" },
      }),
      rendreModele({
        destinataire: "test@example.invalid",
        modele: "alerte-connexion-administration",
        variables: { horodatage: "27 aout 2026 a 14h30" },
      }),
    ];

    // Formes fautives reellement rencontrees, objet et corps confondus.
    const FAUTES = [
      "creation",
      "Reinitialisation",
      "reinitialisation de mot de passe a ete demandee",
      "n'etes pas a l'origine",
      "Connexion a l'administration",
      "connexion a l'administration",
      "la votre",
      "verifiez vos cles d'acces",
    ];

    for (const rendu of rendus) {
      const complet = `${rendu.objet}\n${rendu.texte}`;

      for (const faute of FAUTES) {
        expect(complet).not.toContain(faute);
      }
    }
  });

  it("n'ecrit aucun tiret cadratin", () => {
    // Regle de redaction du projet, applicable a l'interface visible par les
    // clients : ces textes en font partie.
    const rendu = rendreModele({
      destinataire: "test@example.invalid",
      modele: "alerte-connexion-administration",
      variables: { horodatage: "27 aout 2026 a 14h30" },
    });

    expect(rendu.texte).not.toMatch(/[–—]/);
    expect(rendu.objet).not.toMatch(/[–—]/);
  });
});

/**
 * Le choix de l'envoyeur, correction du 10 septembre 2026.
 *
 * CE QUE CES TESTS EMPECHENT DE REVENIR. `creerAuth()` prenait
 * `envoyeurJournalise` comme valeur par defaut, et il est appele sans argument :
 * Better Auth employait donc le repli EN PRODUCTION, avec une configuration
 * SMTP complete a cote. Aucun email de verification, de reinitialisation ni
 * d'alerte de connexion ne partait.
 *
 * LE DEFAUT ETAIT INVISIBLE parce que le repli ne leve pas, regle E4 : l'ecran
 * annonce « email envoye », et il a fallu qu'une personne reelle ne recoive
 * jamais son lien pour qu'on le voie.
 */
describe("choisirEnvoyeurEmail", () => {
  /*
   * `NODE_ENV` EST PRESENT parce que le projet type `ProcessEnv` avec ce champ
   * requis. Sa valeur est indifferente au choix d'envoyeur, seule sa presence
   * satisfait le type.
   */
  const CONFIGURATION_COMPLETE = {
    NODE_ENV: "test" as const,
    SMTP_HOST: "smtp.exemple.fr",
    SMTP_USER: "contact@exemple.fr",
    /*
     * LA VALEUR EST ASSEMBLEE A L'EXECUTION, convention deja employee plus haut
     * dans ce fichier. GitGuardian a signale la premiere version, un litteral
     * qui ressemblait a un mot de passe, et il avait raison : un analyseur ne
     * peut pas distinguer un faux secret d'un vrai, et le depot est public.
     * Aucun litteral du fichier ne doit donc avoir la FORME d'un secret.
     */
    SMTP_PASSWORD: ["valeur", "factice", "sans", "effet"].join("-"),
    EMAIL_FROM_ADDRESS: "contact@exemple.fr",
  };

  it("rend le repli quand aucune variable n'est posee", async () => {
    const { choisirEnvoyeurEmail, envoyeurJournalise } =
      await import("@/integrations/email");

    expect(choisirEnvoyeurEmail({ NODE_ENV: "test" })).toBe(envoyeurJournalise);
  });

  /*
   * CHAQUE VARIABLE EST EPROUVEE SEULE, jamais le seul cas « tout absent ».
   * Une condition ecrite sur trois variables au lieu de quatre passerait le cas
   * global et laisserait partir un envoyeur incomplet, qui echouerait au
   * premier envoi plutot qu'au demarrage.
   */
  // LA BOUCLE NE PARCOURT QUE LES QUATRE VARIABLES SMTP, jamais toutes les
  // cles de l'objet : `NODE_ENV` n'y est que pour satisfaire le type, et le
  // retirer ne doit PAS faire choisir le repli.
  for (const manquante of [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "EMAIL_FROM_ADDRESS",
  ] as const) {
    it(`rend le repli quand ${manquante} manque`, async () => {
      const { choisirEnvoyeurEmail, envoyeurJournalise } =
        await import("@/integrations/email");

      const env = { ...CONFIGURATION_COMPLETE, [manquante]: "" };

      expect(choisirEnvoyeurEmail(env)).toBe(envoyeurJournalise);
    });
  }

  it("rend un envoyeur SMTP quand les quatre variables sont posees", async () => {
    const { choisirEnvoyeurEmail, envoyeurJournalise } =
      await import("@/integrations/email");

    const envoyeur = choisirEnvoyeurEmail(CONFIGURATION_COMPLETE);

    /*
     * LES DEUX ASSERTIONS SONT NECESSAIRES, et la seconde est celle qui compte.
     * Verifier seulement qu'un objet est rendu passerait sur un code qui rend
     * le repli : c'est un `EnvoyeurEmail` lui aussi. C'est la DIFFERENCE avec
     * `envoyeurJournalise` qui prouve que le vrai chemin est pris.
     */
    expect(envoyeur).toBeDefined();
    expect(envoyeur).not.toBe(envoyeurJournalise);
  });
});

/**
 * `creerAuth` PREND-IL VRAIMENT LE BON ENVOYEUR PAR DEFAUT.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE TEST EN PLUS DES PRECEDENTS. Les tests de
 * `choisirEnvoyeurEmail` ci-dessus eprouvent la FONCTION. Ils restent VERTS si
 * `auth.ts` ne l'appelle pas : mesure par mutation le 10 septembre 2026, en
 * remettant `envoyeurJournalise` comme valeur par defaut, les vingt cas
 * passaient toujours.
 *
 * C'est le motif « fonction testee jamais appelee » : une fonction correcte et
 * du code mort produisent exactement les memes tests verts. Le defaut d'origine
 * etait precisement la, dans le CABLAGE et non dans la fonction.
 *
 * CE TEST LIT LE FICHIER plutot que d'appeler `creerAuth()`, qui exige une base
 * et un secret de signature a l'evaluation du module. Un controle textuel ne
 * remplace pas un test d'execution, mais il est ici le seul a voir la valeur
 * par defaut d'un parametre, qu'aucun appelant n'exerce : tous les tests
 * d'integration passent leur propre double.
 * ---------------------------------------------------------------------------
 */
describe("cablage de l'envoyeur dans auth.ts", () => {
  it("creerAuth prend choisirEnvoyeurEmail et non le repli", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/lib/auth.ts", "utf8");

    const parametre = source.match(/envoyeurEmail: EnvoyeurEmail = (\w+)/);

    // LA GARDE CONTRE LE CONTROLE LUI-MEME : si la signature est reecrite
    // autrement, ce test doit ECHOUER bruyamment plutot que rendre un OK
    // silencieux sur un motif qui ne trouve plus rien.
    expect(
      parametre,
      "la signature de creerAuth a change, ce controle ne voit plus rien",
    ).not.toBeNull();

    expect(parametre?.[1]).toBe("choisirEnvoyeurEmail");
  });
});
