/**
 * Adresses du catalogue public, LS-241.
 *
 * `page=1` ne doit jamais apparaitre, et un numero invalide doit etre refuse :
 * chacun de ces cas ferait deux adresses indexables du meme contenu.
 */
import { describe, expect, it } from "vitest";

import { cheminCatalogue, lireNumeroPage } from "@/lib/url-catalogue";

describe("cheminCatalogue", () => {
  it("rend /catalogue sans parametre pour la premiere page", () => {
    expect(cheminCatalogue({})).toBe("/catalogue");
    expect(cheminCatalogue({ page: 1 })).toBe("/catalogue");
  });

  it("garde la categorie et ajoute la page au-dela de la premiere", () => {
    expect(cheminCatalogue({ categorie: "bagues", page: 1 })).toBe(
      "/catalogue?categorie=bagues",
    );
    expect(cheminCatalogue({ categorie: "bagues", page: 3 })).toBe(
      "/catalogue?categorie=bagues&page=3",
    );
    expect(cheminCatalogue({ page: 2 })).toBe("/catalogue?page=2");
  });
});

describe("lireNumeroPage", () => {
  it("rend 1 quand le parametre est absent", () => {
    expect(lireNumeroPage(undefined)).toBe(1);
  });

  it("lit un numero valide", () => {
    expect(lireNumeroPage("1")).toBe(1);
    expect(lireNumeroPage("12")).toBe(12);
  });

  it("refuse tout ce qui ferait une seconde adresse ou une entree absurde", () => {
    for (const brut of ["0", "02", "abc", "-1", "1.5", "", "12345", " 2"]) {
      expect(lireNumeroPage(brut)).toBeNull();
    }
    expect(lireNumeroPage(["2", "3"])).toBeNull();
  });
});
