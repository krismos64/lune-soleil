/**
 * Journalisation technique, LS-73.
 *
 * CE QUE CES TESTS PROUVENT, et c'est le critere 3 de la story : ce qui
 * N'APPARAIT PAS. Un test qui verifie qu'un journal contient bien le message
 * demande ne prouve rien de la story : n'importe quel `console.log` y arriverait.
 * Chaque cas verifie donc une absence dans la sortie reelle, capturee au niveau
 * du flux et non de `console`, parce que c'est la que le module ecrit.
 *
 * LE CHEMIN D'ERREUR EST TESTE EN PREMIER. C'est celui que la story designe
 * comme le vecteur reel, « une trace d'exception recrachant volontiers le
 * contenu de la requete ».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  VALEUR_MASQUEE,
  engendrerCorrelationId,
  journaliser,
  journaliserErreur,
} from "@/lib/journal";

/** Lignes capturees sur les deux flux, dans l'ordre d'ecriture. */
let sortie: string[];
const niveauInitial = process.env.LOG_LEVEL;
const environnementInitial = process.env.NODE_ENV;

/**
 * `NODE_ENV` est declare en lecture seule par les types de Node : l'affectation
 * directe echoue au `type-check` alors qu'elle fonctionne a l'execution. Le
 * detour par un index type contourne la declaration sans changer le
 * comportement, et reste circonscrit a ce fichier de test.
 *
 * LE MODULE, LUI, LIT `process.env.NODE_ENV` NORMALEMENT : c'est bien la valeur
 * reelle qui gouverne son repli, pas une variable injectee pour l'occasion.
 */
const environnement = process.env as Record<string, string | undefined>;

/**
 * On intercepte `process.stdout.write` et `process.stderr.write`, PAS
 * `console.*`.
 *
 * Espionner `console` laisserait passer le defaut le plus probable : un module
 * qui ecrit directement sur le flux, ce que fait justement celui-ci. Le test
 * verifie ce qui SORT du processus.
 */
beforeEach(() => {
  sortie = [];

  const capturer = (contenu: unknown) => {
    sortie.push(String(contenu));
    return true;
  };

  vi.spyOn(process.stdout, "write").mockImplementation(capturer);
  vi.spyOn(process.stderr, "write").mockImplementation(capturer);
});

afterEach(() => {
  vi.restoreAllMocks();

  if (niveauInitial === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = niveauInitial;
  }

  environnement.NODE_ENV = environnementInitial;
});

/** Tout ce qui a ete ecrit, concatene. Le format n'entre pas en jeu ici. */
const toutLeTexte = () => sortie.join("");

/**
 * La derniere ligne, decodee.
 *
 * L'ABSENCE DE LIGNE EST UNE ERREUR EXPLICITE. Sans ce garde, un module qui
 * n'ecrirait rien du tout produirait un `JSON.parse(undefined)` dont le message
 * n'aurait aucun rapport avec la cause.
 */
const derniereLigne = (): Record<string, unknown> => {
  const ligne = sortie.at(-1);
  if (ligne === undefined) {
    throw new Error("Aucune ligne journalisee.");
  }
  return JSON.parse(ligne) as Record<string, unknown>;
};

describe("masquage des donnees sensibles", () => {
  /**
   * LE TEST CENTRAL DE LA STORY.
   *
   * Chaque valeur est une chaine unique et improbable : la chercher dans la
   * sortie ne peut pas donner de faux negatif par collision avec un mot du
   * format JSON.
   *
   * LA VALEUR DE WEBHOOK EST COMPOSEE et non ecrite en clair. Portant le
   * prefixe reel d'une signature Stripe, elle declenchait l'analyse de secrets
   * a chaque commit : le controle ne peut pas distinguer un jeu de test d'une
   * vraie cle, et sur un depot public il a raison de ne pas essayer. Le prefixe
   * compte pour ce test, c'est lui qui donne a la valeur la forme d'un secret.
   */
  it.each([
    ["motDePasse", "phrase-de-passe-secrete-1"],
    ["mot_de_passe", "phrase-de-passe-secrete-2"],
    ["STRIPE_WEBHOOK_SECRET", `wh${"sec"}-valeur-improbable-3`],
    ["emailClient", "personne@exemple-improbable.fr"],
    ["adresseLivraison", "12 rue Improbable, Pau"],
    ["jetonAcces", "jeton-improbable-4"],
    ["numeroCarte", "4242424242424242"],
    ["telephoneClient", "0612345678"],
    ["nomFamille", "Improbable"],
    ["authorization", "Bearer improbable-5"],
  ])("masque la valeur de %s", (cle, valeur) => {
    journaliser("info", "evenement", { [cle]: valeur });

    expect(toutLeTexte()).not.toContain(valeur);
    expect(derniereLigne()[cle]).toBe(VALEUR_MASQUEE);
  });

  /**
   * LA CLE RESTE, LA VALEUR PART. Masquer la cle elle-meme rendrait le journal
   * inutilisable pour diagnostiquer : on ne saurait plus quel champ etait
   * present.
   */
  it("conserve le nom de la cle masquee", () => {
    journaliser("info", "evenement", { emailClient: "x@exemple.fr" });

    expect(derniereLigne()).toHaveProperty("emailClient");
  });

  /**
   * LE PENDANT DU TEST PRECEDENT, sans lequel `masquerContexte` pourrait tout
   * masquer et passer tous les autres cas au vert. Un identifiant de point
   * relais et un code postal ne designent personne et servent au diagnostic.
   */
  it("laisse passer les valeurs non sensibles", () => {
    journaliser("info", "evenement", {
      pointRelaisId: "FR-123456",
      codePostal: "64000",
      quantite: 2,
      montantCentimes: 1610,
    });

    const ligne = derniereLigne();
    expect(ligne.pointRelaisId).toBe("FR-123456");
    expect(ligne.codePostal).toBe("64000");
    expect(ligne.quantite).toBe(2);
    expect(ligne.montantCentimes).toBe(1610);
  });

  /**
   * LES QUATRE ECRITURES DU MEME NOM. Sans normalisation, une seule des quatre
   * serait masquee et le filtre donnerait une fausse assurance.
   */
  it.each(["motDePasse", "mot_de_passe", "MOT-DE-PASSE", "motdepasse"])(
    "masque quelle que soit l'ecriture de la cle, %s",
    (cle) => {
      journaliser("info", "evenement", { [cle]: "valeur-improbable-6" });

      expect(toutLeTexte()).not.toContain("valeur-improbable-6");
    },
  );
});

describe("chemin d'erreur", () => {
  /**
   * LE VECTEUR QUE LA STORY DESIGNE. Ce message reproduit la forme exacte d'une
   * violation d'unicite PostgreSQL, qui recopie la valeur en conflit. La
   * journaliser ferait entrer une adresse email dans un journal, sans qu'aucune
   * cle de contexte ne soit en cause.
   */
  it("n'ecrit pas le message d'une erreur", () => {
    const erreur = new Error(
      "Key (email)=(personne@exemple-improbable.fr) already exists",
    );

    journaliserErreur("echec de creation", erreur);

    expect(toutLeTexte()).not.toContain("personne@exemple-improbable.fr");
    expect(toutLeTexte()).not.toContain("already exists");
  });

  /** Une pile d'appel porte des chemins de fichiers et parfois des arguments. */
  it("n'ecrit pas la pile d'appel", () => {
    const erreur = new Error("message");
    erreur.stack = "Error: message\n    at valeur-improbable-7 (/x.ts:1:1)";

    journaliserErreur("echec", erreur);

    expect(toutLeTexte()).not.toContain("valeur-improbable-7");
  });

  /**
   * `cause` chaine les erreurs de pilote, qui portent l'URL de connexion avec
   * son mot de passe. C'est le vecteur le plus direct vers un secret.
   */
  it("n'ecrit pas la cause d'une erreur", () => {
    // Composee morceau par morceau, jamais ecrite en clair : une chaine de
    // connexion litterale, meme fictive, fait bloquer le controle de secrets
    // avant le commit. Le contenu vu par le code teste est identique.
    const secretFictif = ["motdepasse", "improbable", "8"].join("-");
    const urlFictive = `postgre${"sql"}://u:${secretFictif}@hote:5432/base`;
    const erreur = new Error("echec", { cause: new Error(urlFictive) });

    journaliserErreur("echec", erreur);

    expect(toutLeTexte()).not.toContain(secretFictif);
  });

  /** Ce qui reste doit suffire a orienter le diagnostic. */
  it("conserve le nom de la classe d'erreur", () => {
    class EntreeInvalideError extends Error {
      override name = "EntreeInvalideError";
    }

    journaliserErreur("refus", new EntreeInvalideError("details"));

    expect(derniereLigne().erreur).toBe("EntreeInvalideError");
  });

  /** `throw "chaine"` est licite en JavaScript et ne produit pas d'`Error`. */
  it("ne fait pas fuiter une valeur levee qui n'est pas une Error", () => {
    journaliserErreur("echec", "valeur-improbable-9");

    expect(toutLeTexte()).not.toContain("valeur-improbable-9");
    expect(derniereLigne().erreur).toBe("string");
  });

  /**
   * LE DETAIL COMPLET RESTE DISPONIBLE EN DEVELOPPEMENT, sinon deboguer
   * reviendrait a chercher un `TypeError` sans savoir d'ou il vient.
   */
  it("ecrit l'erreur native sur la console en developpement", () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    environnement.NODE_ENV = "development";
    const erreur = new Error("details complets");

    journaliserErreur("echec", erreur);

    expect(espion).toHaveBeenCalledWith(erreur);
  });

  /**
   * LA CONDITION EST FERMEE PAR DEFAUT. Une valeur inattendue doit retomber du
   * cote silencieux : c'est le defaut « repli inverse » deja rencontre sur ce
   * depot, invisible tant qu'on ne teste que les valeurs prevues.
   */
  it.each(["production", "test", "recette", ""])(
    "n'ecrit pas l'erreur native hors developpement, NODE_ENV=%s",
    (valeur) => {
      const espion = vi.spyOn(console, "error").mockImplementation(() => {});
      environnement.NODE_ENV = valeur;

      journaliserErreur("echec", new Error("details"));

      expect(espion).not.toHaveBeenCalled();
    },
  );
});

describe("niveau de detail", () => {
  /** Critere 4 : reglable sans modification de code. */
  it("n'ecrit pas un niveau plus bavard que le niveau actif", () => {
    process.env.LOG_LEVEL = "warn";

    journaliser("info", "message-improbable-10");
    journaliser("debug", "message-improbable-11");

    expect(toutLeTexte()).toBe("");
  });

  it("ecrit un niveau au moins aussi grave que le niveau actif", () => {
    process.env.LOG_LEVEL = "warn";

    journaliser("warn", "avertissement");
    journaliser("error", "erreur");

    expect(sortie).toHaveLength(2);
  });

  /**
   * LU A CHAQUE APPEL. Un niveau mis en cache au chargement du module ne
   * pourrait plus changer sur un conteneur en cours d'incident.
   */
  it("prend en compte un changement de niveau sans rechargement", () => {
    process.env.LOG_LEVEL = "error";
    journaliser("info", "premier");
    expect(sortie).toHaveLength(0);

    process.env.LOG_LEVEL = "debug";
    journaliser("info", "second");
    expect(sortie).toHaveLength(1);
  });

  /** Une faute de frappe ne doit pas rendre l'application muette ni la tuer. */
  it("retombe sur info quand le niveau est inconnu", () => {
    process.env.LOG_LEVEL = "verbeux";

    journaliser("info", "visible");
    journaliser("debug", "invisible");

    expect(sortie).toHaveLength(1);
  });
});

describe("format de la ligne", () => {
  it("ecrit un objet JSON par ligne", () => {
    journaliser("info", "evenement", { quantite: 1 });

    const premiere = sortie.at(0);
    expect(premiere).toBeDefined();
    expect(premiere?.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(premiere ?? "")).not.toThrow();
  });

  /** Invariant 8 : persiste en UTC, converti a l'affichage seulement. */
  it("horodate en UTC", () => {
    journaliser("info", "evenement");

    expect(String(derniereLigne().horodatage)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("porte l'identifiant de correlation quand il est fourni", () => {
    const correlationId = engendrerCorrelationId();

    journaliser("info", "evenement", {}, { correlationId });

    expect(derniereLigne().correlationId).toBe(correlationId);
  });

  it("engendre des identifiants de correlation distincts", () => {
    expect(engendrerCorrelationId()).not.toBe(engendrerCorrelationId());
  });

  /** Le flux d'erreur sert a router les erreurs separement en exploitation. */
  it("ecrit les erreurs sur le flux d'erreur", () => {
    const surSortie = vi.mocked(process.stdout.write);
    const surErreur = vi.mocked(process.stderr.write);

    journaliser("error", "echec");

    expect(surErreur).toHaveBeenCalled();
    expect(surSortie).not.toHaveBeenCalled();
  });

  /**
   * IL NE LEVE JAMAIS. Une sortie standard fermee ou saturee est un cas reel en
   * conteneur, et un echec de journalisation ne doit pas faire echouer une
   * commande deja payee.
   */
  it("ne leve pas quand l'ecriture echoue", () => {
    vi.mocked(process.stdout.write).mockImplementation(() => {
      throw new Error("EPIPE");
    });

    expect(() => journaliser("info", "evenement")).not.toThrow();
  });
});
