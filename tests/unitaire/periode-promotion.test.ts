/**
 * La période annoncée de la promotion, amendement d'ADR-051 du 13 novembre
 * 2026 : son écriture pour le bandeau et sa validation.
 */
import { describe, expect, it } from "vitest";

import { formaterPeriode, schemaPeriodePromotion } from "@/lib/promotion";

const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("écriture de la période", () => {
  it("le mois une seule fois quand il ne change pas", () => {
    expect(formaterPeriode(jour("2026-11-23"), jour("2026-11-29"))).toBe(
      "du lundi 23 au dimanche 29 novembre",
    );
  });

  it("les deux mois quand ils changent", () => {
    expect(formaterPeriode(jour("2026-11-30"), jour("2026-12-06"))).toBe(
      "du lundi 30 novembre au dimanche 6 décembre",
    );
  });

  it("les années quand elles changent", () => {
    expect(formaterPeriode(jour("2026-12-28"), jour("2027-01-03"))).toBe(
      "du lundi 28 décembre 2026 au dimanche 3 janvier 2027",
    );
  });

  it("un seul jour", () => {
    expect(formaterPeriode(jour("2026-11-27"), jour("2026-11-27"))).toBe(
      "le vendredi 27 novembre",
    );
  });
});

describe("validation de la période", () => {
  it("deux dates dans l'ordre", () => {
    expect(
      schemaPeriodePromotion.parse({ debut: "2026-11-23", fin: "2026-11-29" }),
    ).toEqual({ debut: "2026-11-23", fin: "2026-11-29" });
  });

  it("aucune date, aucune période", () => {
    expect(schemaPeriodePromotion.parse({ debut: "", fin: "" })).toBeNull();
  });

  it("refuse une seule date", () => {
    const lu = schemaPeriodePromotion.safeParse({
      debut: "2026-11-23",
      fin: "",
    });
    expect(lu.success).toBe(false);
    expect(lu.error?.issues[0]?.message).toBe(
      "Indiquez les deux dates, ou aucune.",
    );
  });

  it("refuse une fin avant le début", () => {
    const lu = schemaPeriodePromotion.safeParse({
      debut: "2026-11-29",
      fin: "2026-11-23",
    });
    expect(lu.error?.issues[0]?.message).toBe(
      "La date de fin ne peut pas précéder la date de début.",
    );
  });

  it("refuse une date mal formée", () => {
    expect(
      schemaPeriodePromotion.safeParse({
        debut: "23/11/2026",
        fin: "2026-11-29",
      }).success,
    ).toBe(false);
  });
});
