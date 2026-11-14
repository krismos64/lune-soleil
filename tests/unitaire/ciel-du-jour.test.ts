/**
 * L'arc du jour du tableau de bord, LS-325 : la place de l'astre se calcule
 * côté serveur, à l'heure de Paris. Ce fichier fixe les bornes, où une
 * erreur d'un cran poserait une lune en plein jour.
 */
import { describe, expect, it } from "vitest";

import { heureDeParis, momentDuJour } from "@/components/ciel-du-jour";

describe("moment du jour", () => {
  it("le soleil se lève à 6 h et se couche à 21 h", () => {
    expect(momentDuJour(5.99)).toMatchObject({ astre: "lune", moment: "nuit" });
    expect(momentDuJour(6)).toEqual({
      astre: "soleil",
      moment: "aube",
      avancement: 0,
    });
    expect(momentDuJour(20.99).astre).toBe("soleil");
    expect(momentDuJour(21)).toEqual({
      astre: "lune",
      moment: "nuit",
      avancement: 0,
    });
  });

  it("l'aube, le jour puis le crépuscule se suivent", () => {
    expect(momentDuJour(8.9).moment).toBe("aube");
    expect(momentDuJour(9).moment).toBe("jour");
    expect(momentDuJour(17.9).moment).toBe("jour");
    expect(momentDuJour(18).moment).toBe("crepuscule");
  });

  it("l'astre est au sommet au milieu de sa course, et reste sur l'arc", () => {
    // 6 h à 21 h : le milieu est 13 h 30. 21 h à 6 h : le milieu est 1 h 30.
    expect(momentDuJour(13.5).avancement).toBeCloseTo(0.5);
    expect(momentDuJour(1.5).avancement).toBeCloseTo(0.5);
    for (let heure = 0; heure < 24; heure += 0.25) {
      const { avancement } = momentDuJour(heure);
      expect(avancement).toBeGreaterThanOrEqual(0);
      expect(avancement).toBeLessThan(1);
    }
  });

  it("une heure hors de la journée se ramène à la journée", () => {
    expect(momentDuJour(30)).toEqual(momentDuJour(6));
    expect(momentDuJour(-3)).toEqual(momentDuJour(21));
  });
});

describe("heure de Paris", () => {
  it("convertit un instant UTC, heure d'hiver puis heure d'été", () => {
    // 14 novembre, UTC+1 : 13 h 30 UTC vaut 14 h 30 à Paris.
    expect(heureDeParis(new Date("2026-11-14T13:30:00Z"))).toBeCloseTo(14.5);
    // 14 juillet, UTC+2 : 22 h 15 UTC vaut 0 h 15 le lendemain à Paris.
    expect(heureDeParis(new Date("2026-07-14T22:15:00Z"))).toBeCloseTo(0.25);
  });
});
