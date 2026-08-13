/**
 * Validation des entrees du catalogue, LS-99.
 *
 * CES TESTS SONT ECRITS AVANT L'IMPLEMENTATION, exigence du plan directeur : la
 * creation de categorie et de produit est le point d'entree de tout le
 * catalogue, et l'invariant 7 veut que toute entree non fiable soit validee
 * cote serveur.
 *
 * CE QU'ILS PROUVENT, c'est le REFUS. Un schema qui accepte les valeurs
 * correctes ne prouve rien, `z.any()` en ferait autant. Chaque schema porte donc
 * ses cas negatifs, et ce sont eux qui portent la valeur.
 *
 * LE SLUG EST TESTE A PART, et plus longuement que le reste. Il finit dans une
 * URL publique et dans une contrainte d'unicite C3 : une generation qui laisse
 * passer un caractere non sur, ou qui rend une chaine vide, produit soit une
 * URL cassee soit un doublon inexplicable pour l'administratrice.
 */
import { describe, expect, it } from "vitest";

import { EntreeInvalideError, valider } from "@/lib/validation";
import {
  engendrerSlug,
  schemaCreationCategorie,
  schemaCreationProduit,
  schemaRangCategorie,
  schemaRenommageCategorie,
  schemaReordonnancementCategories,
} from "@/services/catalogue-validation";

describe("engendrerSlug", () => {
  it("met en minuscules et remplace les espaces par des tirets", () => {
    expect(engendrerSlug("Boucles d oreilles")).toBe("boucles-d-oreilles");
  });

  /**
   * LE TEST CENTRAL POUR UN CATALOGUE FRANCAIS. Les noms de categories portent
   * des accents, et un slug qui les conserve produit une URL percent-encodee
   * illisible, `cat%C3%A9gorie`, que ni un lien partage ni un referencement ne
   * traitent bien.
   */
  it("translittere les accents et la cedille", () => {
    expect(engendrerSlug("Créations éphémères")).toBe("creations-ephemeres");
    expect(engendrerSlug("Façonné")).toBe("faconne");
    expect(engendrerSlug("Où")).toBe("ou");
  });

  /**
   * Tout ce qui n'est ni lettre ASCII, ni chiffre, ni tiret doit disparaitre.
   * Un slug qui laisserait passer `/`, `?` ou `#` casserait la route qui le
   * porte, et `..` ouvrirait une traversee de chemin.
   */
  it("supprime les caracteres non surs pour une URL", () => {
    expect(engendrerSlug("Or & argent")).toBe("or-argent");
    expect(engendrerSlug("100% fait main")).toBe("100-fait-main");
    expect(engendrerSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(engendrerSlug("bague?taille=3")).toBe("bague-taille-3");
  });

  it("ne produit ni tiret initial, ni tiret final, ni tiret double", () => {
    expect(engendrerSlug("  Colliers  ")).toBe("colliers");
    expect(engendrerSlug("Or --- argent")).toBe("or-argent");
    expect(engendrerSlug("!!!Bracelets!!!")).toBe("bracelets");
  });

  /**
   * UNE ENTREE SANS AUCUN CARACTERE EXPLOITABLE REND UNE CHAINE VIDE, et c'est
   * volontaire : cette fonction ne devine pas un nom de remplacement. C'est au
   * schema de refuser, ce que le test suivant verifie. Inventer un slug ici
   * ferait apparaitre une categorie nommee « categorie-1 » que personne n'a
   * demandee.
   */
  it("rend une chaine vide quand rien n'est exploitable", () => {
    expect(engendrerSlug("!!!")).toBe("");
    expect(engendrerSlug("   ")).toBe("");
    expect(engendrerSlug("日本語")).toBe("");
  });
});

describe("schemaCreationCategorie", () => {
  it("accepte un nom ordinaire et rend le slug engendre", () => {
    const valeur = valider(schemaCreationCategorie, { nom: "Colliers" });
    expect(valeur).toEqual({ nom: "Colliers", slug: "colliers" });
  });

  /**
   * C25 cote base, meme regle cote entree. La rejouer ici n'est pas une
   * redondance inutile : la contrainte protege la base, ce schema protege
   * l'administratrice d'un message PostgreSQL brut.
   */
  it("refuse un nom vide ou fait d'espaces", () => {
    expect(() => valider(schemaCreationCategorie, { nom: "" })).toThrow(
      EntreeInvalideError,
    );
    expect(() => valider(schemaCreationCategorie, { nom: "   " })).toThrow(
      EntreeInvalideError,
    );
  });

  /**
   * Un nom compose uniquement de caracteres non translitterables passerait la
   * validation du nom mais produirait un slug vide, donc une URL `/catalogue/`
   * qui ne designe rien. Le refus doit venir AVANT l'ecriture en base, ou la
   * seule protection serait l'unicite du slug vide, qui ne bloquerait que la
   * deuxieme occurrence.
   */
  it("refuse un nom dont le slug engendre serait vide", () => {
    expect(() => valider(schemaCreationCategorie, { nom: "日本語" })).toThrow(
      EntreeInvalideError,
    );
    expect(() => valider(schemaCreationCategorie, { nom: "!!!" })).toThrow(
      EntreeInvalideError,
    );
  });

  it("coupe les espaces de bordure du nom conserve", () => {
    expect(valider(schemaCreationCategorie, { nom: "  Bracelets  " })).toEqual({
      nom: "Bracelets",
      slug: "bracelets",
    });
  });

  it("refuse un nom demesure", () => {
    expect(() =>
      valider(schemaCreationCategorie, { nom: "a".repeat(121) }),
    ).toThrow(EntreeInvalideError);
  });

  /**
   * `strictObject` refuse les cles inconnues. Sans cela, un champ `ordre` glisse
   * dans le formulaire laisserait l'appelant choisir son rang, ce que le service
   * decide seul.
   */
  it("refuse une cle inconnue", () => {
    expect(() =>
      valider(schemaCreationCategorie, { nom: "Colliers", ordre: 1 }),
    ).toThrow(EntreeInvalideError);
  });
});

describe("schemaRenommageCategorie", () => {
  it("accepte un identifiant et un nom", () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(valider(schemaRenommageCategorie, { id, nom: "Colliers" })).toEqual({
      id,
      nom: "Colliers",
    });
  });

  /**
   * LE SLUG N'EST PAS REENGENDRE PAR UN RENOMMAGE, et le schema le rend
   * impossible en ne portant pas le champ. Une categorie deja publiee a des
   * liens entrants : changer son slug les casserait tous en silence, sans
   * redirection. Le renommage touche l'affichage, jamais l'adresse.
   */
  it("ne porte aucun champ slug", () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(() =>
      valider(schemaRenommageCategorie, { id, nom: "Colliers", slug: "autre" }),
    ).toThrow(EntreeInvalideError);
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    expect(() =>
      valider(schemaRenommageCategorie, { id: "1", nom: "Colliers" }),
    ).toThrow(EntreeInvalideError);
  });
});

describe("schemaRangCategorie", () => {
  it("accepte un rang a partir de 1", () => {
    expect(valider(schemaRangCategorie, 1)).toBe(1);
    expect(valider(schemaRangCategorie, 12)).toBe(12);
  });

  /** C24 cote base : le rang commence a 1. */
  it("refuse zero, un rang negatif et un decimal", () => {
    expect(() => valider(schemaRangCategorie, 0)).toThrow(EntreeInvalideError);
    expect(() => valider(schemaRangCategorie, -1)).toThrow(EntreeInvalideError);
    expect(() => valider(schemaRangCategorie, 1.5)).toThrow(
      EntreeInvalideError,
    );
  });
});

describe("schemaReordonnancementCategories", () => {
  const a = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  const b = "3f2504e0-4f89-41d3-9a0c-0305e82c3302";

  it("accepte une liste d'identifiants distincts", () => {
    expect(valider(schemaReordonnancementCategories, [a, b])).toEqual([a, b]);
  });

  /**
   * UN DOUBLON DANS LA LISTE EST LE CAS DANGEREUX. La liste dit « voici l'ordre
   * complet », et le service en tire les rangs 1..n. Deux fois le meme
   * identifiant lui ferait ecrire deux rangs sur une seule categorie, et en
   * laisser une autre a son rang d'origine : la contrainte differable C24
   * leverait au COMMIT avec un message que personne ne relierait au formulaire.
   */
  it("refuse un identifiant repete", () => {
    expect(() => valider(schemaReordonnancementCategories, [a, a])).toThrow(
      EntreeInvalideError,
    );
  });

  it("refuse une liste vide", () => {
    expect(() => valider(schemaReordonnancementCategories, [])).toThrow(
      EntreeInvalideError,
    );
  });
});

describe("schemaCreationProduit", () => {
  const categorieId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

  it("accepte un nom et une categorie, et engendre le slug", () => {
    expect(
      valider(schemaCreationProduit, { nom: "Collier Aube", categorieId }),
    ).toEqual({ nom: "Collier Aube", slug: "collier-aube", categorieId });
  });

  /**
   * VALIDER LA FORME DE L'IDENTIFIANT N'AUTORISE RIEN, invariant 2. Ce refus
   * empeche une chaine arbitraire d'atteindre une requete ; que la categorie
   * existe reellement est verifie par la cle etrangere, et le service traduit
   * son echec.
   */
  it("refuse une categorie qui n'est pas un UUID", () => {
    expect(() =>
      valider(schemaCreationProduit, { nom: "Collier", categorieId: "x" }),
    ).toThrow(EntreeInvalideError);
  });

  /**
   * LE STATUT N'EST PAS DANS L'ENTREE. Un produit se cree toujours en
   * BROUILLON : laisser l'appelant le choisir permettrait de publier un produit
   * sans media ni variante, ce que C1 et C7 interdisent et que LS-103 seule
   * ouvrira.
   */
  it("refuse un statut fourni par l'appelant", () => {
    expect(() =>
      valider(schemaCreationProduit, {
        nom: "Collier",
        categorieId,
        statut: "ACTIF",
      }),
    ).toThrow(EntreeInvalideError);
  });

  it("refuse un nom vide et un nom sans slug exploitable", () => {
    expect(() =>
      valider(schemaCreationProduit, { nom: "  ", categorieId }),
    ).toThrow(EntreeInvalideError);
    expect(() =>
      valider(schemaCreationProduit, { nom: "!!!", categorieId }),
    ).toThrow(EntreeInvalideError);
  });
});
