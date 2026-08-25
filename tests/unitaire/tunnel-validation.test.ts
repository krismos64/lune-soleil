/**
 * Validation de la saisie du tunnel, LS-115. Critere 5 et invariant 7.
 *
 * LE POINT CENTRAL EST L'EQUIVALENCE MODE / POINT DE RETRAIT. La contrainte
 * `chk_commande_mode_point_relais` s'ecrit
 * `(mode IN ('POINT_RELAIS','LOCKER')) = (point_relais_id IS NOT NULL)`, une
 * EQUIVALENCE et non une implication : elle refuse un DOMICILE porteur d'un
 * point AUTANT qu'un POINT_RELAIS sans point.
 *
 * Ne verifier qu'un sens laisserait passer la moitie des cas jusqu'a la base,
 * ou le CHECK rejetterait l'ecriture de LS-117 avec un message incomprehensible
 * pour le visiteur. Le projet a deja rencontre ce piege, fiche memoire
 * « implication et non equivalence ».
 */
import { describe, expect, it } from "vitest";

import {
  EntreeInvalideError,
  schemaChoixLivraison,
  schemaCoordonnees,
  schemaModeLivraison,
  schemaPointRetrait,
  schemaTelephone,
  valider,
} from "@/lib/validation";

const POINT_VALIDE = {
  identifiant: "FR-000000",
  nom: "Point de retrait de démonstration",
  ligne1: "1 rue de la Démonstration",
  codePostal: "35000",
  ville: "Rennes",
};

describe("schemaChoixLivraison, les deux sens de l'equivalence", () => {
  it.each(["POINT_RELAIS", "LOCKER"])(
    "accepte %s avec un point de retrait",
    (mode) => {
      expect(
        valider(schemaChoixLivraison, { mode, pointRetrait: POINT_VALIDE }),
      ).toEqual({ mode, pointRetrait: POINT_VALIDE });
    },
  );

  it("accepte DOMICILE sans point de retrait", () => {
    expect(
      valider(schemaChoixLivraison, {
        mode: "DOMICILE",
        pointRetrait: null,
      }),
    ).toEqual({ mode: "DOMICILE", pointRetrait: null });
  });

  /* PREMIER SENS : un mode en relais sans point est refuse. */
  it.each(["POINT_RELAIS", "LOCKER"])(
    "refuse %s sans point de retrait",
    (mode) => {
      expect(() =>
        valider(schemaChoixLivraison, { mode, pointRetrait: null }),
      ).toThrow(EntreeInvalideError);
    },
  );

  /*
   * SECOND SENS, celui qu'on oublie : un domicile AVEC un point est refuse.
   * C'est la moitie de la contrainte que le projet a deja laissee passer une
   * fois en recopiant la forme d'un CHECK voisin.
   */
  it("refuse DOMICILE porteur d'un point de retrait", () => {
    expect(() =>
      valider(schemaChoixLivraison, {
        mode: "DOMICILE",
        pointRetrait: POINT_VALIDE,
      }),
    ).toThrow(EntreeInvalideError);
  });
});

describe("schemaModeLivraison", () => {
  it.each(["POINT_RELAIS", "LOCKER", "DOMICILE"])("accepte %s", (mode) => {
    expect(valider(schemaModeLivraison, mode)).toBe(mode);
  });

  /*
   * UN MODE INCONNU EST REFUSE, y compris une valeur qui existerait dans l'enum
   * Prisma sans avoir de tarif. Le schema est ecrit en dur pour cette raison :
   * le deriver de l'enum ouvrirait la saisie en silence a toute valeur ajoutee.
   */
  it.each(["DRONE", "domicile", "", "RETRAIT_BOUTIQUE"])(
    "refuse %s",
    (mode) => {
      expect(() => valider(schemaModeLivraison, mode)).toThrow(
        EntreeInvalideError,
      );
    },
  );
});

describe("schemaPointRetrait", () => {
  it("refuse un point sans adresse complete", () => {
    expect(() =>
      valider(schemaPointRetrait, {
        identifiant: "FR-000000",
        nom: "Point",
      }),
    ).toThrow(EntreeInvalideError);
  });

  /*
   * `strictObject` REFUSE LES CLES INCONNUES. Sur un point de retrait cela
   * parait inoffensif, mais la meme habitude appliquee ailleurs laisserait
   * passer un champ que personne n'attend, regle de `validation.ts`.
   */
  it("refuse une cle inconnue", () => {
    expect(() =>
      valider(schemaPointRetrait, { ...POINT_VALIDE, fraisCentimes: 0 }),
    ).toThrow(EntreeInvalideError);
  });

  it("refuse un code postal hors metropole", () => {
    expect(() =>
      valider(schemaPointRetrait, { ...POINT_VALIDE, codePostal: "97400" }),
    ).toThrow(EntreeInvalideError);
  });
});

describe("schemaTelephone", () => {
  /*
   * LES SEPARATEURS SONT TOLERES PUIS RETIRES. Refuser « 06 12 34 56 78 »
   * serait refuser la facon dont un numero s'ecrit en France, et le visiteur
   * n'aurait aucun moyen de deviner la forme attendue.
   */
  it.each([
    ["0612345678", "0612345678"],
    ["06 12 34 56 78", "0612345678"],
    ["06.12.34.56.78", "0612345678"],
    ["06-12-34-56-78", "0612345678"],
    ["+33612345678", "+33612345678"],
  ])("normalise %s", (saisi, attendu) => {
    expect(valider(schemaTelephone, saisi)).toBe(attendu);
  });

  /* FACULTATIF : une chaine vide passe, le champ etant nullable en base. */
  it("accepte une saisie vide", () => {
    expect(valider(schemaTelephone, "")).toBe("");
  });

  it.each(["0123", "0012345678", "abcdefghij", "0612345678901"])(
    "refuse %s",
    (valeur) => {
      expect(() => valider(schemaTelephone, valeur)).toThrow(
        EntreeInvalideError,
      );
    },
  );
});

describe("schemaCoordonnees", () => {
  it("accepte un nom et un email valides", () => {
    expect(
      valider(schemaCoordonnees, {
        nomClient: "Camille Dupont",
        email: "camille@exemple.test",
        telephone: "",
      }),
    ).toEqual({
      nomClient: "Camille Dupont",
      email: "camille@exemple.test",
      telephone: "",
    });
  });

  it.each([
    ["nom vide", { nomClient: "   ", email: "a@b.test", telephone: "" }],
    ["email sans arobase", { nomClient: "X", email: "ab.test", telephone: "" }],
    ["email vide", { nomClient: "X", email: "", telephone: "" }],
  ])("refuse %s", (_libelle, entree) => {
    expect(() => valider(schemaCoordonnees, entree)).toThrow(
      EntreeInvalideError,
    );
  });

  /*
   * UN CHAMP REDUIT A DES CARACTERES INVISIBLES EST REFUSE.
   *
   * `trim()` retire les espaces ASCII et quelques Unicode, mais pas U+200B ni
   * U+FEFF : un nomClient valant "\u200B" franchissait l'etape 1 et la garde de
   * progression, pour produire en LS-117 une etiquette de colis sans
   * destinataire lisible. Mesure le 25 aout 2026, releve par
   * `ls-critical-reviewer`.
   */
  it.each([
    ["espace sans chasse", "\u200B"],
    ["indicateur d'ordre des octets", "\uFEFF"],
    ["liant de mot", "\u2060"],
  ])("refuse un nom reduit a %s", (_libelle, valeur) => {
    expect(() =>
      valider(schemaCoordonnees, {
        nomClient: valeur,
        email: "camille@exemple.test",
        telephone: "",
      }),
    ).toThrow(EntreeInvalideError);
  });

  /*
   * L'ERREUR NE PORTE JAMAIS LA VALEUR REFUSEE, invariant 9. Une saisie
   * invalide peut etre un mot de passe colle dans le mauvais champ.
   */
  it("ne divulgue pas la valeur refusee", () => {
    const valeurSensible = "ceci-pourrait-etre-un-mot-de-passe";

    try {
      valider(schemaCoordonnees, {
        nomClient: "X",
        email: valeurSensible,
        telephone: "",
      });
      expect.unreachable("la validation devait echouer");
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(EntreeInvalideError);
      expect(String(erreur)).not.toContain(valeurSensible);
      expect((erreur as EntreeInvalideError).details).not.toContain(
        valeurSensible,
      );
    }
  });
});
