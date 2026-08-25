/**
 * Tarifs de livraison et calcul des frais de port, LS-115. Etape 3b du parcours 1.
 *
 * CES TESTS SONT ECRITS AVANT L'IMPLEMENTATION. Un frais de port faux est une
 * information precontractuelle fausse, sanctionnee bien au-dela de l'ecart de
 * prix, voir `.claude/rules/legal.md`. Le montant se calcule cote serveur et
 * ne se lit jamais depuis le navigateur, critere 3 de la story.
 *
 * AUCUNE BASE DE DONNEES : le module sous test ne lit que sa configuration.
 */
import { describe, expect, it } from "vitest";

import {
  MODES_SANS_POINT_RETRAIT,
  ConfigurationLivraisonInvalideError,
  calculerFraisPort,
  lireConfigurationLivraison,
} from "@/lib/livraison";

/*
 * Configuration de reference, celle d'ADR-025 au 30 juillet 2026.
 *
 * ECRITE ICI EN CENTIMES ENTIERS et non en euros : l'invariant 1 interdit tout
 * flottant dans un calcul monetaire, et un test qui manipulerait 4.10 aurait
 * deja quitte le domaine du code teste.
 */
const CONFIGURATION_ADR_025 = {
  relaisCentimes: 410,
  domicileCentimes: 499,
  seuilFranchiseCentimes: 3900,
};

describe("lireConfigurationLivraison", () => {
  it("lit les trois valeurs depuis l'environnement", () => {
    const configuration = lireConfigurationLivraison({
      SHIPPING_RELAY_RATE_CENTS: "410",
      SHIPPING_HOME_RATE_CENTS: "499",
      SHIPPING_FREE_THRESHOLD_CENTS: "3900",
    });

    expect(configuration).toEqual(CONFIGURATION_ADR_025);
  });

  /*
   * LE SEUIL VIDE DESACTIVE LA FRANCHISE, il ne vaut pas zero.
   *
   * La nuance decide du comportement : un seuil a zero rendrait la livraison
   * gratuite pour TOUT panier, un seuil absent la rend payante pour tous. LS-27
   * exige que la franchise soit desactivable, et `.env.example` documente
   * « laisser vide pour desactiver ».
   */
  it("traite un seuil vide comme une franchise desactivee, et non comme zero", () => {
    const configuration = lireConfigurationLivraison({
      SHIPPING_RELAY_RATE_CENTS: "410",
      SHIPPING_HOME_RATE_CENTS: "499",
      SHIPPING_FREE_THRESHOLD_CENTS: "",
    });

    expect(configuration.seuilFranchiseCentimes).toBeNull();
  });

  it("traite un seuil absent comme une franchise desactivee", () => {
    const configuration = lireConfigurationLivraison({
      SHIPPING_RELAY_RATE_CENTS: "410",
      SHIPPING_HOME_RATE_CENTS: "499",
    });

    expect(configuration.seuilFranchiseCentimes).toBeNull();
  });

  /*
   * UN TARIF MANQUANT EST UNE ERREUR, jamais un repli silencieux.
   *
   * Un repli a zero afficherait « livraison offerte » sur tout le site, et un
   * repli sur une constante ecrite en dur reintroduirait exactement ce que
   * `frontend-design.md` interdit. Echouer au demarrage est le seul
   * comportement sur : le defaut se voit tout de suite.
   */
  it.each([
    ["tarif relais absent", { SHIPPING_HOME_RATE_CENTS: "499" }],
    ["tarif domicile absent", { SHIPPING_RELAY_RATE_CENTS: "410" }],
    ["les deux absents", {}],
  ])("refuse de demarrer quand un tarif manque : %s", (_libelle, brut) => {
    expect(() => lireConfigurationLivraison(brut)).toThrow(
      ConfigurationLivraisonInvalideError,
    );
  });

  it.each([
    ["non numerique", "quatre euros dix"],
    ["negatif", "-410"],
    ["decimal", "4.10"],
  ])("refuse un tarif %s", (_libelle, valeur) => {
    expect(() =>
      lireConfigurationLivraison({
        SHIPPING_RELAY_RATE_CENTS: valeur,
        SHIPPING_HOME_RATE_CENTS: "499",
      }),
    ).toThrow(ConfigurationLivraisonInvalideError);
  });
});

describe("calculerFraisPort, tarifs par mode", () => {
  /*
   * LES DEUX MODES EN RELAIS PARTAGENT LE MEME TARIF, ADR-025. Les tester
   * separement plutot que d'ecrire « les modes en relais » garantit qu'un
   * futur ecart de tarif entre Point Relais et Locker fasse rougir un test.
   */
  it.each([
    ["POINT_RELAIS" as const, 410],
    ["LOCKER" as const, 410],
    ["DOMICILE" as const, 499],
  ])("applique le tarif de %s sous le seuil", (mode, attendu) => {
    const frais = calculerFraisPort({
      mode,
      totalArticlesCentimes: 1000,
      configuration: CONFIGURATION_ADR_025,
    });

    expect(frais).toBe(attendu);
  });
});

describe("calculerFraisPort, franchise a 39 euros", () => {
  /*
   * LA BORNE EXACTE EST LE CRITERE 4 DE LA STORY.
   *
   * « A partir de 39 euros » inclut 39 euros. Le defaut classique est un `>`
   * au lieu d'un `>=`, qui facture 4,10 euros a un panier de 39,00 euros
   * pendant que le site annonce la gratuite : information precontractuelle
   * fausse sur la seule valeur ou le client verifie.
   *
   * Les trois cas encadrent la borne au centime pres.
   */
  it("facture un centime sous le seuil", () => {
    expect(
      calculerFraisPort({
        mode: "POINT_RELAIS",
        totalArticlesCentimes: 3899,
        configuration: CONFIGURATION_ADR_025,
      }),
    ).toBe(410);
  });

  it("offre la livraison exactement au seuil", () => {
    expect(
      calculerFraisPort({
        mode: "POINT_RELAIS",
        totalArticlesCentimes: 3900,
        configuration: CONFIGURATION_ADR_025,
      }),
    ).toBe(0);
  });

  it("offre la livraison un centime au-dessus du seuil", () => {
    expect(
      calculerFraisPort({
        mode: "POINT_RELAIS",
        totalArticlesCentimes: 3901,
        configuration: CONFIGURATION_ADR_025,
      }),
    ).toBe(0);
  });

  /*
   * LA FRANCHISE VAUT POUR LES TROIS MODES, y compris le domicile plus cher.
   * ADR-025 : « Livraison offerte des 39 euros, tous modes ».
   */
  it.each(["POINT_RELAIS" as const, "LOCKER" as const, "DOMICILE" as const])(
    "offre la livraison au seuil pour %s",
    (mode) => {
      expect(
        calculerFraisPort({
          mode,
          totalArticlesCentimes: 3900,
          configuration: CONFIGURATION_ADR_025,
        }),
      ).toBe(0);
    },
  );

  it("facture le tarif normal quand la franchise est desactivee", () => {
    const frais = calculerFraisPort({
      mode: "DOMICILE",
      totalArticlesCentimes: 100_000,
      configuration: { ...CONFIGURATION_ADR_025, seuilFranchiseCentimes: null },
    });

    expect(frais).toBe(499);
  });
});

describe("calculerFraisPort, entrees hors domaine", () => {
  /*
   * UN TOTAL NEGATIF NE PEUT PAS VENIR D'UN PANIER REVALIDE, mais le refuser
   * coute une ligne et ferme un chemin : un total negatif franchirait sinon le
   * seuil par le bas et rendrait la livraison payante sans que rien ne le dise.
   */
  it("refuse un total d'articles negatif", () => {
    expect(() =>
      calculerFraisPort({
        mode: "DOMICILE",
        totalArticlesCentimes: -1,
        configuration: CONFIGURATION_ADR_025,
      }),
    ).toThrow(RangeError);
  });

  it("refuse un total d'articles non entier", () => {
    expect(() =>
      calculerFraisPort({
        mode: "DOMICILE",
        totalArticlesCentimes: 39.5,
        configuration: CONFIGURATION_ADR_025,
      }),
    ).toThrow(RangeError);
  });

  /*
   * UN PANIER VIDE NE PASSE PAS AU TUNNEL, mais s'il y arrivait il ne doit pas
   * profiter de la franchise : zero est sous le seuil.
   */
  it("facture le tarif normal sur un total nul", () => {
    expect(
      calculerFraisPort({
        mode: "POINT_RELAIS",
        totalArticlesCentimes: 0,
        configuration: CONFIGURATION_ADR_025,
      }),
    ).toBe(410);
  });
});

describe("MODES_SANS_POINT_RETRAIT", () => {
  /*
   * CETTE CONSTANTE PORTE LE CAS DE PANNE, critere 6 de la story.
   *
   * Quand l'API Mondial Relay est indisponible, les modes qui exigent un point
   * de retrait ne peuvent pas etre choisis, et c'est cette liste qui reste
   * proposee. La tester ici plutot que dans le composant evite qu'un ecran
   * l'ecrive en dur : `PARCOURS.md` fonde la vente restante sur le fait qu'un
   * mode au moins n'appelle aucun service externe.
   */
  it("contient le domicile, qui n'appelle aucun service externe", () => {
    expect(MODES_SANS_POINT_RETRAIT).toContain("DOMICILE");
  });

  it("exclut les deux modes qui exigent un point de retrait", () => {
    expect(MODES_SANS_POINT_RETRAIT).not.toContain("POINT_RELAIS");
    expect(MODES_SANS_POINT_RETRAIT).not.toContain("LOCKER");
  });

  /*
   * UNE PANNE NE DOIT JAMAIS FERMER LA VENTE. Si cette liste devenait vide,
   * le tunnel n'aurait plus rien a proposer et le cas d'erreur du parcours 1
   * cesserait d'etre couvert sans qu'aucun autre test ne le voie.
   */
  it("n'est jamais vide", () => {
    expect(MODES_SANS_POINT_RETRAIT.length).toBeGreaterThan(0);
  });
});
