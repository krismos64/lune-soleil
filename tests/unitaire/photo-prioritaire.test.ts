import { describe, expect, test } from "vitest";

import { rangPhotoPrioritaire } from "@/lib/photo-prioritaire";

const avec = { mediaChemin: "medias/abc" };
const sans = { mediaChemin: null };

describe("rangPhotoPrioritaire, LS-285", () => {
  test("la première carte quand elle a une photo", () => {
    expect(rangPhotoPrioritaire([avec, avec, avec])).toBe(0);
  });

  test("la première carte qui a une photo, pas la première carte", () => {
    expect(rangPhotoPrioritaire([sans, sans, avec, avec])).toBe(2);
  });

  test("aucune carte prioritaire sans photo, ni sans carte", () => {
    expect(rangPhotoPrioritaire([sans, sans])).toBe(-1);
    expect(rangPhotoPrioritaire([])).toBe(-1);
  });
});
