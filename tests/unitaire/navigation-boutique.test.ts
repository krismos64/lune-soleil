import { describe, expect, it } from "vitest";

import {
  ENTREES_MENU_MOBILE,
  ENTREES_NAVIGATION,
  estEntreeActive,
} from "@/lib/navigation-boutique";

/** L'entrée active pour un chemin, ou aucune. */
function actives(chemin: string, entrees = ENTREES_MENU_MOBILE): string[] {
  return entrees
    .filter((entree) => estEntreeActive(chemin, entree.href))
    .map((entree) => entree.libelle);
}

describe("estEntreeActive, LS-309", () => {
  it.each([
    ["/", ["Accueil"]],
    ["/catalogue", ["Les créations"]],
    ["/produit/bague-lune", ["Les créations"]],
    ["/atelier", ["L'atelier"]],
    ["/aide", ["Livraison et aide"]],
    ["/contact", ["Contact"]],
  ])("%s active exactement %j", (chemin, attendu) => {
    expect(actives(chemin)).toEqual(attendu);
  });

  it.each(["/panier", "/compte", "/compte/commandes", "/informations-legales"])(
    "%s n'active aucune entrée",
    (chemin) => {
      expect(actives(chemin)).toEqual([]);
    },
  );

  it("l'accueil n'est pas un préfixe de toutes les pages", () => {
    expect(estEntreeActive("/catalogue", "/")).toBe(false);
  });

  it("le préfixe s'arrête à un segment entier", () => {
    expect(estEntreeActive("/aide-cadeau", "/aide")).toBe(false);
    expect(estEntreeActive("/produits", "/catalogue")).toBe(false);
    expect(estEntreeActive("/aide/retours", "/aide")).toBe(true);
  });

  it("la page des avis est active sur elle-même et sur le signalement, LS-314", () => {
    expect(actives("/avis")).toEqual(["Avis"]);
    expect(actives("/avis/signaler")).toEqual(["Avis"]);
    expect(estEntreeActive("/avisx", "/avis")).toBe(false);
  });
});

describe("entrées de navigation", () => {
  it("l'accueil ouvre la liste, le menu mobile ajoute le contact à la fin", () => {
    expect(ENTREES_NAVIGATION.map((e) => e.href)).toEqual([
      "/",
      "/catalogue",
      "/atelier",
      "/aide",
      "/avis",
    ]);
    expect(ENTREES_MENU_MOBILE.map((e) => e.href)).toEqual([
      "/",
      "/catalogue",
      "/atelier",
      "/aide",
      "/avis",
      "/contact",
    ]);
  });
});
