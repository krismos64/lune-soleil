/**
 * Thème saisonnier, sur base réelle. LS-267, ADR-046.
 *
 * TROIS PROPRIÉTÉS : le thème par défaut est `AUCUN`, seul un thème écrit dans
 * le code s'enregistre, et un aperçu n'est jamais honoré pour un visiteur.
 * Chaque test remet `AUCUN` : la base éphémère est partagée par les fichiers
 * séquentiels.
 */
import { readFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let service: typeof import("@/services/theme-saisonnier");

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;
  client = new Client({ connectionString: url });
  await client.connect();
  service = await import("@/services/theme-saisonnier");
});

afterEach(async () => {
  await client.query(
    "UPDATE parametre_boutique SET theme_saisonnier = 'AUCUN' WHERE id = true",
  );
});

afterAll(async () => {
  await client.end();
});

describe("thème saisonnier, ADR-046", () => {
  it("vaut AUCUN par défaut, la migration n'habille rien", async () => {
    expect(await service.lireThemeSaisonnier()).toBe("AUCUN");
  });

  it("enregistre chacun des deux thèmes de Noël, et le relit, LS-277", async () => {
    for (const theme of ["NOEL_1", "NOEL_2"] as const) {
      expect(await service.choisirThemeSaisonnier(theme)).toBe(theme);
      expect(await service.lireThemeSaisonnier()).toBe(theme);
      const { rows } = await client.query(
        "SELECT theme_saisonnier FROM parametre_boutique",
      );
      expect(rows).toEqual([{ theme_saisonnier: theme }]);
    }
  });

  /*
   * LA MIGRATION DE LS-277 EST EXÉCUTÉE TELLE QU'ÉCRITE, sur l'état qu'elle
   * rencontrera : l'ancienne contrainte et `NOEL` choisi. Son ordre est
   * imposé, la conversion entre le retrait et la nouvelle contrainte ; un
   * ordre inversé échouerait ici, et non en production.
   */
  it("la migration convertit un NOEL choisi en NOEL_1, sans activer de thème", async () => {
    const sql = readFileSync(
      "prisma/migrations/20261006200000_themes_noel/migration.sql",
      "utf8",
    );
    await client.query(
      "ALTER TABLE parametre_boutique DROP CONSTRAINT chk_parametre_theme_connu",
    );
    await client.query(
      `ALTER TABLE parametre_boutique ADD CONSTRAINT chk_parametre_theme_connu
         CHECK (theme_saisonnier IN ('AUCUN', 'NOEL'))`,
    );
    try {
      await client.query(
        "UPDATE parametre_boutique SET theme_saisonnier = 'NOEL' WHERE id = true",
      );
      await client.query(sql);
      const { rows } = await client.query(
        "SELECT theme_saisonnier FROM parametre_boutique",
      );
      expect(rows).toEqual([{ theme_saisonnier: "NOEL_1" }]);
      await expect(
        client.query(
          "UPDATE parametre_boutique SET theme_saisonnier = 'NOEL' WHERE id = true",
        ),
      ).rejects.toMatchObject({ constraint: "chk_parametre_theme_connu" });
    } finally {
      await client.query(
        "UPDATE parametre_boutique SET theme_saisonnier = 'AUCUN' WHERE id = true",
      );
    }
  });

  it("refuse un thème que le code n'écrit pas, sans rien changer", async () => {
    for (const entree of ["NOEL", "noel_1", "Noel", "PAQUES", "", null, 42]) {
      await expect(
        service.choisirThemeSaisonnier(entree),
      ).rejects.toMatchObject({ name: "EntreeInvalideError" });
    }
    expect(await service.lireThemeSaisonnier()).toBe("AUCUN");
  });

  it("une valeur inconnue en base rend l'habillage ordinaire", async () => {
    // C'est le cas que `chk_parametre_theme_connu` interdit : la contrainte
    // est retirée le temps du test pour exercer le repli du service.
    await client.query(
      "ALTER TABLE parametre_boutique DROP CONSTRAINT chk_parametre_theme_connu",
    );
    try {
      await client.query(
        "UPDATE parametre_boutique SET theme_saisonnier = 'PAQUES' WHERE id = true",
      );
      expect(await service.lireThemeSaisonnier()).toBe("AUCUN");
    } finally {
      await client.query(
        "UPDATE parametre_boutique SET theme_saisonnier = 'AUCUN' WHERE id = true",
      );
      await client.query(
        `ALTER TABLE parametre_boutique ADD CONSTRAINT chk_parametre_theme_connu
           CHECK (theme_saisonnier IN ('AUCUN', 'NOEL_1', 'NOEL_2'))`,
      );
    }
  });

  it("n'honore un aperçu que pour une session administratrice", () => {
    const { themeAAfficher } = service;
    // Visiteur : le lien partagé ne change rien, test négatif d'accès.
    expect(
      themeAAfficher({
        actif: "AUCUN",
        apercu: "NOEL_2",
        estAdministratrice: false,
      }),
    ).toBe("AUCUN");
    // Administratrice : l'aperçu s'applique, dans les deux sens.
    expect(
      themeAAfficher({
        actif: "AUCUN",
        apercu: "NOEL_2",
        estAdministratrice: true,
      }),
    ).toBe("NOEL_2");
    expect(
      themeAAfficher({
        actif: "NOEL_1",
        apercu: "AUCUN",
        estAdministratrice: true,
      }),
    ).toBe("AUCUN");
    // Aperçu inconnu ou absent : le thème actif, jamais une erreur.
    expect(
      themeAAfficher({
        actif: "NOEL_1",
        apercu: "NOEL",
        estAdministratrice: true,
      }),
    ).toBe("NOEL_1");
    expect(
      themeAAfficher({
        actif: "NOEL_1",
        apercu: undefined,
        estAdministratrice: true,
      }),
    ).toBe("NOEL_1");
  });
});
