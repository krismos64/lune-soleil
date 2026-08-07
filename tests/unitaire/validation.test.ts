/**
 * Socle de validation serveur, LS-71.
 *
 * CES TESTS SONT ECRITS AVANT L'IMPLEMENTATION, exigence du plan directeur sur
 * les zones a risque : le socle garde l'entree du stock et des montants.
 *
 * CE QU'ILS PROUVENT, et c'est le point de la story : le refus. Un schema qui
 * accepte les valeurs correctes ne prouve rien, n'importe quel `z.any()` en
 * ferait autant. Chaque type couvert porte donc son test negatif, et les cas
 * limites sont ceux qui coutent cher : le decimal silencieusement arrondi, le
 * zero pris pour une quantite, l'horodatage sans fuseau.
 */
import { describe, expect, it } from "vitest";

import {
  EntreeInvalideError,
  formaterProblemes,
  schemaAdressePostale,
  schemaHorodatageUtc,
  schemaIdentifiant,
  schemaMontantCentimes,
  schemaQuantite,
  valider,
} from "@/lib/validation";

describe("schemaMontantCentimes", () => {
  it("accepte un entier positif et zero", () => {
    expect(schemaMontantCentimes.parse(1610)).toBe(1610);
    expect(schemaMontantCentimes.parse(0)).toBe(0);
  });

  /**
   * LE TEST CENTRAL DE L'INVARIANT 1.
   *
   * `19.99` est la forme exacte du defaut que cet invariant existe pour
   * interdire : un prix saisi en euros qui arriverait tel quel dans un champ
   * de centimes. Le schema doit le REFUSER, jamais l'arrondir a 20 ni le
   * multiplier par cent. Un arrondi silencieux ferait une facture fausse que
   * personne ne verrait passer.
   */
  it.each([19.99, 0.5, -0.01, 1610.000001])(
    "refuse un montant decimal, %s",
    (valeur) => {
      expect(schemaMontantCentimes.safeParse(valeur).success).toBe(false);
    },
  );

  it("refuse un montant negatif", () => {
    expect(schemaMontantCentimes.safeParse(-1).success).toBe(false);
  });

  /**
   * `NaN` et les infinis sont des `number` pour TypeScript : sans refus
   * explicite, ils traverseraient un typage `number` sans alerter, et
   * `NaN` contaminerait tout calcul en aval sans jamais lever.
   */
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "refuse une valeur non finie, %s",
    (valeur) => {
      expect(schemaMontantCentimes.safeParse(valeur).success).toBe(false);
    },
  );

  /**
   * AUCUNE COERCION DEPUIS LA CHAINE. `z.coerce` transformerait `"19.99"` en
   * nombre, donc reintroduirait par la porte de service le decimal que ce
   * schema refuse par la porte principale.
   */
  it.each(["1610", "", null, undefined, {}])(
    "refuse une valeur non numerique, %s",
    (valeur) => {
      expect(schemaMontantCentimes.safeParse(valeur).success).toBe(false);
    },
  );
});

describe("schemaQuantite", () => {
  it("accepte un entier strictement positif", () => {
    expect(schemaQuantite.parse(1)).toBe(1);
    expect(schemaQuantite.parse(3)).toBe(3);
  });

  /**
   * LES TROIS VALEURS DE LA DETTE DE LS-50, reprises telles quelles.
   *
   * `0` merite d'etre distingue d'un montant : zero centime est un montant
   * legitime, zero article n'est pas une quantite. Les deux schemas different
   * donc sur cette seule borne, et c'est intentionnel.
   */
  it.each([0, -1, 1.5])("refuse une quantite invalide, %s", (valeur) => {
    expect(schemaQuantite.safeParse(valeur).success).toBe(false);
  });

  it("refuse une quantite non finie", () => {
    expect(schemaQuantite.safeParse(Number.NaN).success).toBe(false);
    expect(schemaQuantite.safeParse(Number.POSITIVE_INFINITY).success).toBe(
      false,
    );
  });
});

describe("schemaIdentifiant", () => {
  it("accepte un UUID", () => {
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(schemaIdentifiant.parse(uuid)).toBe(uuid);
  });

  /**
   * UN IDENTIFIANT VALIDE NE VAUT PAS AUTORISATION, invariant 2.
   *
   * Ce test ne peut pas prouver l'absence d'autorisation, il ancre l'intention :
   * le schema rend une chaine, jamais une ressource ni un droit. Le controle
   * d'acces reste dans `services/autorisation.ts`, recoupe cote serveur.
   */
  it("rend une chaine et rien d'autre", () => {
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(typeof schemaIdentifiant.parse(uuid)).toBe("string");
  });

  it.each([
    "",
    "pas-un-uuid",
    "3f2504e0-4f89-41d3-9a0c",
    "3f2504e0_4f89_41d3_9a0c_0305e82c3301",
    42,
    null,
  ])("refuse un identifiant mal forme, %s", (valeur) => {
    expect(schemaIdentifiant.safeParse(valeur).success).toBe(false);
  });
});

describe("schemaHorodatageUtc", () => {
  /**
   * INVARIANT 8 : persiste en UTC, converti a l'affichage seulement.
   *
   * Le schema rend une `Date`, qui n'a pas de fuseau : c'est un instant. Le
   * fuseau est une affaire de RENDU, pas de stockage.
   */
  it("accepte un instant ISO 8601 en UTC et rend une Date", () => {
    const resultat = schemaHorodatageUtc.parse("2026-08-07T16:30:00.000Z");
    expect(resultat).toBeInstanceOf(Date);
    expect(resultat.toISOString()).toBe("2026-08-07T16:30:00.000Z");
  });

  it("accepte un decalage explicite et le ramene a l'instant UTC", () => {
    const resultat = schemaHorodatageUtc.parse("2026-08-07T18:30:00+02:00");
    expect(resultat.toISOString()).toBe("2026-08-07T16:30:00.000Z");
  });

  /**
   * LE REFUS QUI COMPTE : une chaine sans fuseau est ambigue. « 2026-08-07
   * 18:30 » designe deux instants distincts selon qu'on la lit a Paris ou a
   * Londres. L'accepter ferait dependre une date de commande du fuseau du
   * serveur, donc changer d'un deploiement a l'autre.
   */
  it.each([
    "2026-08-07T18:30:00",
    "2026-08-07",
    "07/08/2026",
    "",
    "pas une date",
    1_754_584_200_000,
    null,
  ])("refuse un horodatage sans instant certain, %s", (valeur) => {
    expect(schemaHorodatageUtc.safeParse(valeur).success).toBe(false);
  });
});

describe("schemaAdressePostale", () => {
  const valide = {
    ligne1: "12 rue des Lilas",
    codePostal: "75011",
    ville: "Paris",
    pays: "FR",
  };

  it("accepte une adresse metropolitaine complete", () => {
    expect(schemaAdressePostale.parse(valide)).toMatchObject(valide);
  });

  it("accepte une seconde ligne facultative", () => {
    const resultat = schemaAdressePostale.parse({
      ...valide,
      ligne2: "Batiment C",
    });
    expect(resultat.ligne2).toBe("Batiment C");
  });

  /**
   * LA CLE INCONNUE EST REFUSEE, et c'est le motif de `services/utilisateur.ts`
   * generalise ici. Sans strictness, Zod ignore la cle en silence : sur une
   * adresse cela paraitrait inoffensif, mais la meme habitude appliquee a un
   * profil laisserait passer une tentative d'elevation sans bruit.
   */
  it("refuse une cle inconnue", () => {
    const resultat = schemaAdressePostale.safeParse({
      ...valide,
      role: "ADMINISTRATRICE",
    });
    expect(resultat.success).toBe(false);
  });

  /**
   * FRANCE METROPOLITAINE, perimetre de vente du cahier des charges. Les codes
   * de l'outre-mer commencent par 97 ou 98 : les accepter promettrait une
   * livraison que le tarif Mondial Relay retenu ne couvre pas.
   */
  it.each(["97400", "98000", "7501", "750111", "ABCDE", ""])(
    "refuse un code postal hors metropole ou mal forme, %s",
    (codePostal) => {
      expect(
        schemaAdressePostale.safeParse({ ...valide, codePostal }).success,
      ).toBe(false);
    },
  );

  it("refuse un pays autre que la France", () => {
    expect(
      schemaAdressePostale.safeParse({ ...valide, pays: "BE" }).success,
    ).toBe(false);
  });

  it.each(["ligne1", "ville"])("refuse un champ %s vide", (champ) => {
    expect(
      schemaAdressePostale.safeParse({ ...valide, [champ]: "   " }).success,
    ).toBe(false);
  });
});

describe("valider", () => {
  it("rend la valeur analysee quand l'entree est conforme", () => {
    expect(valider(schemaQuantite, 2)).toBe(2);
  });

  it("leve EntreeInvalideError quand l'entree est refusee", () => {
    expect(() => valider(schemaQuantite, 0)).toThrow(EntreeInvalideError);
  });

  /**
   * INVARIANT 9, LE VECTEUR REEL, mesure sur Zod 4 et non suppose.
   *
   * Les `issues` de Zod ne portent pas la valeur refusee. Le probleme
   * `unrecognized_keys` porte en revanche les NOMS des cles rejetees, dans son
   * message, et ces noms viennent de l'entree : un corps hostile les choisit.
   * `{ "cle_api_sk_live_xxx": 1 }` ferait ecrire cette chaine dans un journal
   * par le seul message d'erreur.
   *
   * C'est le seul chemin par lequel une entree peut ressortir, et donc celui
   * que ce test verrouille.
   */
  it("ne recopie pas le nom d'une cle inconnue", () => {
    const nomRevelateur = "cle_api_sk_live_secrete";

    try {
      valider(schemaAdressePostale, {
        ligne1: "12 rue des Lilas",
        codePostal: "75011",
        ville: "Paris",
        pays: "FR",
        [nomRevelateur]: "valeur",
      });
      expect.unreachable("la validation aurait du echouer");
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(EntreeInvalideError);
      expect((erreur as EntreeInvalideError).message).not.toContain(
        nomRevelateur,
      );
      expect((erreur as EntreeInvalideError).details).not.toContain(
        nomRevelateur,
      );
    }
  });

  /** Le diagnostic reste possible : le nombre de champs rejetes est conserve. */
  it("indique combien de champs sont non reconnus", () => {
    try {
      valider(schemaAdressePostale, {
        ligne1: "12 rue des Lilas",
        codePostal: "75011",
        ville: "Paris",
        pays: "FR",
        premier: 1,
        second: 2,
      });
      expect.unreachable("la validation aurait du echouer");
    } catch (erreur) {
      expect((erreur as EntreeInvalideError).details).toContain("2");
    }
  });

  /**
   * La valeur elle-meme ne doit pas davantage ressortir, meme si Zod ne la met
   * pas dans ses messages aujourd'hui : ce test ancre la garantie plutot que le
   * comportement actuel de la bibliotheque.
   */
  it("ne recopie jamais la valeur refusee dans le message", () => {
    const secret = "mot-de-passe-tres-secret-42";

    try {
      valider(schemaIdentifiant, secret);
      expect.unreachable("la validation aurait du echouer");
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(EntreeInvalideError);
      const message = (erreur as EntreeInvalideError).message;
      expect(message).not.toContain(secret);
      expect((erreur as EntreeInvalideError).details).not.toContain(secret);
    }
  });

  it("ne recopie pas non plus une valeur refusee imbriquee", () => {
    const secret = "4111111111111111";

    const erreur = (() => {
      try {
        valider(schemaAdressePostale, {
          ligne1: secret,
          codePostal: "invalide",
          ville: "Paris",
          pays: "FR",
        });
        return null;
      } catch (capturee) {
        return capturee as EntreeInvalideError;
      }
    })();

    expect(erreur).toBeInstanceOf(EntreeInvalideError);
    expect(erreur?.message).not.toContain(secret);
    expect(erreur?.details).not.toContain(secret);
  });

  /**
   * L'ERREUR RESTE EXPLOITABLE : nommer le CHAMP fautif est ce qui permet a une
   * interface de pointer la bonne case. C'est le chemin qui sort, jamais la
   * valeur.
   */
  it("nomme le champ fautif sans sa valeur", () => {
    try {
      valider(schemaAdressePostale, {
        ligne1: "12 rue des Lilas",
        codePostal: "97400",
        ville: "Paris",
        pays: "FR",
      });
      expect.unreachable("la validation aurait du echouer");
    } catch (erreur) {
      expect((erreur as EntreeInvalideError).details).toContain("codePostal");
    }
  });
});

describe("formaterProblemes", () => {
  it("rend un chemin lisible pour un champ imbrique", () => {
    const resultat = schemaAdressePostale.safeParse({
      ligne1: "12 rue des Lilas",
      codePostal: "97400",
      ville: "Paris",
      pays: "FR",
    });

    expect(resultat.success).toBe(false);
    if (resultat.success) return;

    expect(formaterProblemes(resultat.error.issues)).toContain("codePostal");
  });

  /**
   * Un probleme sans chemin, la racine, ne doit pas produire un « : » orphelin
   * ni une chaine vide : l'interface afficherait un message tronque.
   */
  it("nomme la racine quand le probleme n'a pas de chemin", () => {
    const resultat = schemaQuantite.safeParse(0);

    expect(resultat.success).toBe(false);
    if (resultat.success) return;

    const formate = formaterProblemes(resultat.error.issues);
    expect(formate.length).toBeGreaterThan(0);
    expect(formate.startsWith(":")).toBe(false);
  });
});
