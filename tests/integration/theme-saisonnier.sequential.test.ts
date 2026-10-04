/**
 * Thème saisonnier, sur base réelle. LS-267, ADR-046.
 *
 * TROIS PROPRIÉTÉS : le thème par défaut est `AUCUN`, seul un thème écrit dans
 * le code s'enregistre, et un aperçu n'est jamais honoré pour un visiteur.
 * Chaque test remet `AUCUN` : la base éphémère est partagée par les fichiers
 * séquentiels.
 */
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

  it("enregistre le thème de Noël, et le relit", async () => {
    expect(await service.choisirThemeSaisonnier("NOEL")).toBe("NOEL");
    expect(await service.lireThemeSaisonnier()).toBe("NOEL");
    const { rows } = await client.query(
      "SELECT theme_saisonnier FROM parametre_boutique",
    );
    expect(rows).toEqual([{ theme_saisonnier: "NOEL" }]);
  });

  it("refuse un thème que le code n'écrit pas, sans rien changer", async () => {
    for (const entree of ["Noel", "PAQUES", "", null, 42]) {
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
           CHECK (theme_saisonnier IN ('AUCUN', 'NOEL'))`,
      );
    }
  });

  it("n'honore un aperçu que pour une session administratrice", () => {
    const { themeAAfficher } = service;
    // Visiteur : le lien partagé ne change rien, test négatif d'accès.
    expect(
      themeAAfficher({
        actif: "AUCUN",
        apercu: "NOEL",
        estAdministratrice: false,
      }),
    ).toBe("AUCUN");
    // Administratrice : l'aperçu s'applique, dans les deux sens.
    expect(
      themeAAfficher({
        actif: "AUCUN",
        apercu: "NOEL",
        estAdministratrice: true,
      }),
    ).toBe("NOEL");
    expect(
      themeAAfficher({
        actif: "NOEL",
        apercu: "AUCUN",
        estAdministratrice: true,
      }),
    ).toBe("AUCUN");
    // Aperçu inconnu ou absent : le thème actif, jamais une erreur.
    expect(
      themeAAfficher({
        actif: "NOEL",
        apercu: "noel",
        estAdministratrice: true,
      }),
    ).toBe("NOEL");
    expect(
      themeAAfficher({
        actif: "NOEL",
        apercu: undefined,
        estAdministratrice: true,
      }),
    ).toBe("NOEL");
  });
});
