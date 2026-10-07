/**
 * Jour où le client a fourni la preuve d'expédition de son retour, LS-288.
 *
 * L221-24 ALINÉA 2 RETIENT LA DATE OÙ LE CONSOMMATEUR FOURNIT LA PREUVE, et non
 * celle où l'exploitante la recopie dans l'administration. Le service écrivait
 * `new Date()` à la saisie : un numéro de suivi reçu le 3 et saisi le 9 portait
 * le 9, soit six jours de moins au compteur du remboursement dans un litige.
 *
 * CES TESTS SONT ÉCRITS AVANT L'IMPLÉMENTATION, zone critique. Les instants
 * attendus sont écrits en clair, jamais calculés par le code testé.
 */
import { describe, expect, it } from "vitest";

import {
  JourDePreuveInvalideError,
  instantDePreuveFournie,
} from "@/lib/retractation";

/** Demande déposée le 1er octobre 2026 à 10 h, heure de Paris (8 h UTC). */
const DEPOSEE_A = new Date("2026-10-01T08:00:00.000Z");
/** Saisie le 9 octobre 2026 à 15 h, heure de Paris (13 h UTC). */
const MAINTENANT = new Date("2026-10-09T13:00:00.000Z");

const bornes = { deposeeA: DEPOSEE_A, maintenant: MAINTENANT };

describe("instantDePreuveFournie, LS-288", () => {
  it("retient le jour donné par l'exploitante, à minuit heure de Paris", () => {
    // Le 3 octobre 2026 est en heure d'été : minuit à Paris vaut 22 h UTC la veille.
    expect(instantDePreuveFournie("2026-10-03", bornes).toISOString()).toBe(
      "2026-10-02T22:00:00.000Z",
    );
  });

  it("tient le passage à l'heure d'hiver", () => {
    const apres = {
      deposeeA: new Date("2026-10-20T08:00:00.000Z"),
      maintenant: new Date("2026-11-05T13:00:00.000Z"),
    };
    // Le 1er novembre 2026 est en heure d'hiver : minuit à Paris vaut 23 h UTC.
    expect(instantDePreuveFournie("2026-11-01", apres).toISOString()).toBe(
      "2026-10-31T23:00:00.000Z",
    );
  });

  it("accepte le jour du dépôt et le jour de la saisie, bornes comprises", () => {
    expect(() => instantDePreuveFournie("2026-10-01", bornes)).not.toThrow();
    expect(() => instantDePreuveFournie("2026-10-09", bornes)).not.toThrow();
  });

  it("refuse un jour à venir : une preuve ne se fournit pas demain", () => {
    expect(() => instantDePreuveFournie("2026-10-10", bornes)).toThrow(
      JourDePreuveInvalideError,
    );
  });

  it("refuse un jour antérieur au dépôt de la demande", () => {
    expect(() => instantDePreuveFournie("2026-09-30", bornes)).toThrow(
      JourDePreuveInvalideError,
    );
  });

  it("refuse une date mal formée ou inexistante", () => {
    for (const saisie of ["", "03/10/2026", "2026-10-3", "2026-02-30", "x"]) {
      expect(() => instantDePreuveFournie(saisie, bornes)).toThrow(
        JourDePreuveInvalideError,
      );
    }
  });

  it("compte le jour de saisie à Paris, pas en UTC", () => {
    // 23 h 30 à Paris le 9 octobre vaut 21 h 30 UTC : le 9 reste aujourd'hui,
    // et le 10 reste refusé.
    const tard = {
      ...bornes,
      maintenant: new Date("2026-10-09T21:30:00.000Z"),
    };
    expect(() => instantDePreuveFournie("2026-10-09", tard)).not.toThrow();
    // 0 h 30 à Paris le 10 octobre vaut 22 h 30 UTC le 9 : le 10 est déjà là.
    const minuitPasse = {
      ...bornes,
      maintenant: new Date("2026-10-09T22:30:00.000Z"),
    };
    expect(() =>
      instantDePreuveFournie("2026-10-10", minuitPasse),
    ).not.toThrow();
  });
});
