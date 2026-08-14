/**
 * Conversion d'un prix saisi en euros vers des centimes entiers. LS-101.
 *
 * INVARIANT 1, ET C'EST LE SEUL ENDROIT OU L'ERREUR PEUT ENTRER. Le prix vit en
 * centimes entiers de bout en bout ; l'exploitante, elle, saisit des euros. La
 * frontiere entre les deux est cette fonction, et une multiplication naive par
 * 100 y suffit a produire un montant faux :
 *
 *   19.99 * 100  ->  1998.9999999999998  en virgule flottante binaire
 *   Math.round de ce nombre donne 1999, mais 1.005 * 100 donne 100.49999999999999
 *   et arrondit a 100 au lieu de 101.
 *
 * CES TESTS TOURNENT SANS BASE, d'ou leur presence dans la suite unitaire : ils
 * portent sur une fonction pure, et n'ont besoin ni de Docker ni de Prisma.
 */
import { describe, expect, it } from "vitest";

import { EntreeInvalideError, valider } from "@/lib/validation";
import {
  centimesDepuisEuros,
  schemaCreationVariante,
} from "@/services/variante-validation";

describe("conversion des euros en centimes, invariant 1", () => {
  it("convertit un montant entier", () => {
    expect(centimesDepuisEuros("42")).toBe(4200);
  });

  it("convertit un montant a deux decimales", () => {
    expect(centimesDepuisEuros("19.99")).toBe(1999);
  });

  /**
   * LES CAS QUI CASSENT UNE MULTIPLICATION NAIVE, et la raison pour laquelle
   * cette fonction n'en est pas une. Mesure en JavaScript :
   *
   *   0.07 * 100  ->  7.000000000000001
   *   0.29 * 100  ->  28.999999999999996
   *   4.35 * 100  ->  434.99999999999994
   *   19.99 * 100 ->  1998.9999999999998
   *
   * Ce sont des prix ordinaires de catalogue, pas des valeurs limites choisies
   * pour l'occasion. `Math.round` rattrape ces quatre-la, ce qui rend le defaut
   * d'autant plus sournois : il ne se voit que sur les montants dont la partie
   * fractionnaire tombe pile au-dessous du demi-centime, et il faut alors avoir
   * ce cas precis en base pour s'en apercevoir.
   *
   * Ces tests sont ecrits AVANT la fonction.
   */
  it("convertit sans perdre de centime les montants que le flottant rend inexacts", () => {
    expect(centimesDepuisEuros("0.07")).toBe(7);
    expect(centimesDepuisEuros("0.29")).toBe(29);
    expect(centimesDepuisEuros("4.35")).toBe(435);
    expect(centimesDepuisEuros("19.99")).toBe(1999);
  });

  /**
   * LA VIRGULE EST ACCEPTEE. Un clavier francais la produit naturellement, et
   * refuser « 19,99 » forcerait l'exploitante a saisir une notation qui n'est
   * pas la sienne. La conversion est la meme, seul le separateur change.
   */
  it("accepte la virgule comme separateur decimal", () => {
    expect(centimesDepuisEuros("19,99")).toBe(1999);
    expect(centimesDepuisEuros("0,05")).toBe(5);
  });

  it("accepte les espaces de bordure et les espaces de milliers", () => {
    expect(centimesDepuisEuros("  1 250,00  ")).toBe(125000);
  });

  it("convertit zero", () => {
    expect(centimesDepuisEuros("0")).toBe(0);
    expect(centimesDepuisEuros("0,00")).toBe(0);
  });

  /**
   * UNE DECIMALE SEULE VAUT DES DIZAINES DE CENTIMES. « 5,5 » fait 550 centimes
   * et non 55 : lire les chiffres apres la virgule sans les completer a droite
   * diviserait le prix par dix, defaut qu'un test sur deux decimales seulement
   * ne verrait jamais.
   */
  it("complete a droite une decimale unique", () => {
    expect(centimesDepuisEuros("5,5")).toBe(550);
  });

  /**
   * PLUS DE DEUX DECIMALES EST UN REFUS ET NON UN ARRONDI. Arrondir
   * silencieusement « 19,999 » a 2000 encaisserait un centime que l'exploitante
   * n'a pas voulu, et le prix affiche differerait de celui saisi.
   */
  it("rend null au-dela de deux decimales", () => {
    expect(centimesDepuisEuros("19,999")).toBeNull();
    /*
     * `1,005` EST REFUSE ET NON ARRONDI A 101, alors que c'est le montant que
     * toute demonstration du flottant binaire cite : `1.005 * 100` vaut
     * 100.49999999999999, donc `Math.round` rend 100.
     *
     * Le refus est ici le bon comportement, et il rend le probleme sans objet :
     * un prix a trois decimales n'existe pas en euros, et l'accepter en
     * l'arrondissant encaisserait un centime que l'exploitante n'a pas saisi.
     */
    expect(centimesDepuisEuros("1,005")).toBeNull();
    expect(centimesDepuisEuros("1.005")).toBeNull();
  });

  it("rend null sur ce qui n'est pas un montant", () => {
    for (const entree of ["", "   ", "abc", "12abc", "1.2.3", "-", ",", "."]) {
      expect(centimesDepuisEuros(entree)).toBeNull();
    }
  });

  /**
   * UN PRIX NEGATIF EST REFUSE ICI, avant `chk_variante_prix_positif`. La
   * contrainte reste la derniere ligne de defense, mais elle rendrait une erreur
   * PostgreSQL brute a l'ecran.
   */
  it("rend null sur un montant negatif", () => {
    expect(centimesDepuisEuros("-1")).toBeNull();
    expect(centimesDepuisEuros("-0,01")).toBeNull();
  });

  /**
   * AUCUNE NOTATION SCIENTIFIQUE. `Number("1e3")` vaut 1000 : sans refus
   * explicite, « 1e3 » entrerait comme 100000 centimes par un chemin que
   * personne n'a prevu.
   */
  it("rend null sur une notation scientifique", () => {
    expect(centimesDepuisEuros("1e3")).toBeNull();
    expect(centimesDepuisEuros("1E3")).toBeNull();
  });

  /**
   * `Infinity` ET `NaN` SONT DES CHAINES ACCEPTEES PAR `Number`. Le refus est
   * explicite pour la meme raison que la notation scientifique.
   */
  it("rend null sur Infinity et NaN", () => {
    for (const entree of ["Infinity", "-Infinity", "NaN"]) {
      expect(centimesDepuisEuros(entree)).toBeNull();
    }
  });
});

describe("schema de creation d'une variante", () => {
  const valide = {
    produitId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    reference: "BO-ESSAI-01",
    libelle: "Modèle court",
    dimensions: "42 cm",
    prixEuros: "19,99",
    quantitePhysique: 3,
  };

  it("accepte une entree complete et convertit le prix", () => {
    const sortie = valider(schemaCreationVariante, valide);
    expect(sortie.prixCentimes).toBe(1999);
    expect(sortie.reference).toBe("BO-ESSAI-01");
  });

  /**
   * LA REFERENCE EST NORMALISEE EN MAJUSCULES. Sans cela, `bo-essai-01` et
   * `BO-ESSAI-01` seraient deux references distinctes pour l'unicite C2, alors
   * qu'aucun humain ne les distingue sur une etiquette.
   */
  it("normalise la reference en majuscules", () => {
    const sortie = valider(schemaCreationVariante, {
      ...valide,
      reference: "  bo-essai-02  ",
    });
    expect(sortie.reference).toBe("BO-ESSAI-02");
  });

  /**
   * LA REFERENCE RESTE EN ASCII. Elle s'imprime sur une etiquette, se dicte au
   * telephone et se saisit a la main : un accent y serait une source d'erreur
   * sans aucun gain, la regle du projet reservant l'ASCII aux identifiants
   * techniques.
   */
  it("refuse une reference portant un accent ou un espace", () => {
    for (const reference of ["BO-ÉCLIPSE", "BO ESSAI", "BO_ESSAI!"]) {
      expect(() =>
        valider(schemaCreationVariante, { ...valide, reference }),
      ).toThrow(EntreeInvalideError);
    }
  });

  it("refuse un prix que la conversion rejette", () => {
    for (const prixEuros of ["", "abc", "-1", "19,999", "1e3"]) {
      expect(() =>
        valider(schemaCreationVariante, { ...valide, prixEuros }),
      ).toThrow(EntreeInvalideError);
    }
  });

  /**
   * LA QUANTITE EST UN ENTIER POSITIF OU NUL. Zero est legitime, une piece peut
   * etre creee avant d'etre fabriquee ; `1.5` ne l'est pas, et
   * `chk_variante_physique_positif` rattraperait le negatif trop tard.
   */
  it("refuse une quantite negative ou fractionnaire", () => {
    for (const quantitePhysique of [-1, 1.5]) {
      expect(() =>
        valider(schemaCreationVariante, { ...valide, quantitePhysique }),
      ).toThrow(EntreeInvalideError);
    }
    expect(valider(schemaCreationVariante, { ...valide, quantitePhysique: 0 }))
      .toMatchObject({ quantitePhysique: 0 });
  });

  /**
   * `strictObject` REFUSE LES CLES INCONNUES. `quantiteReservee` glissee dans
   * le formulaire laisserait l'appelant ecrire une reservation sans passer par
   * le service de reservation, ce qu'ADR-006 interdit.
   */
  it("refuse une cle inconnue, dont quantiteReservee", () => {
    expect(() =>
      valider(schemaCreationVariante, { ...valide, quantiteReservee: 1 }),
    ).toThrow(EntreeInvalideError);
    expect(() =>
      valider(schemaCreationVariante, { ...valide, archiveeA: new Date() }),
    ).toThrow(EntreeInvalideError);
  });

  /** Les dimensions sont facultatives, toute variante n'en portant pas. */
  it("accepte une variante sans dimensions", () => {
    const sortie = valider(schemaCreationVariante, {
      ...valide,
      dimensions: "",
    });
    expect(sortie.dimensions).toBeNull();
  });
});
