/**
 * L'heure de Paris du tableau de bord, reprise du test de l'arc du jour,
 * retiré par la refonte de l'administration du 22 novembre 2026.
 */
import { describe, expect, it } from "vitest";

import { heureDeParis } from "@/lib/heure-de-paris";

describe("heure de Paris", () => {
  it("convertit un instant UTC, heure d'hiver puis heure d'été", () => {
    // 14 novembre, UTC+1 : 13 h 30 UTC vaut 14 h 30 à Paris.
    expect(heureDeParis(new Date("2026-11-14T13:30:00Z"))).toBeCloseTo(14.5);
    // 14 juillet, UTC+2 : 22 h 15 UTC vaut 0 h 15 le lendemain à Paris.
    expect(heureDeParis(new Date("2026-07-14T22:15:00Z"))).toBeCloseTo(0.25);
  });
});
