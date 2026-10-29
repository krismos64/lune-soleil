/**
 * Denomination legale de l'entreprise individuelle, LS-297.
 *
 * Article R526-27 du Code de commerce : le nom de l'entrepreneur, precede ou
 * suivi immediatement de « entrepreneur individuel » ou « EI », sur tout
 * document a usage professionnel, factures comprises.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MOTIF_MENTION_EI,
  schemaEmetteurFacture,
  schemaInstantaneLegal,
} from "@/lib/validation";
import { denominationLegale, emetteurPourDocument } from "@/services/facture";

describe("denominationLegale", () => {
  it("ajoute la mention EI au nom", () => {
    expect(denominationLegale("TEST Dupont Camille")).toBe(
      "TEST Dupont Camille EI",
    );
  });

  // « EI » au milieu d'un nom n'est pas la mention : elle suit immediatement.
  it("ne prend pas des lettres d'un nom pour la mention", () => {
    expect(denominationLegale("TEST Reina Leila")).toBe("TEST Reina Leila EI");
  });

  it("retire les espaces de bord avant d'ajouter la mention", () => {
    expect(denominationLegale("  TEST Dupont Camille  ")).toBe(
      "TEST Dupont Camille EI",
    );
  });
});

describe("la configuration porte le nom seul", () => {
  const IDENTITE = {
    siret: "12345678901234",
    adresse: "3 rue TEST des Ateliers, 64000 Pau",
    emailContact: "test@exemple.test",
  };

  /*
   * TOUTE FORME DE LA MENTION EST REFUSEE, avant ou apres le nom, et quelle
   * que soit la casse : la deviner doublait « EI Marie Dupont » en
   * « EI Marie Dupont EI », fige ensuite sur chaque facture, releve par la
   * revue critique de LS-297.
   */
  it.each([
    "EI TEST Dupont Camille",
    "TEST Dupont Camille EI",
    "TEST Dupont Camille (EI)",
    "TEST Dupont Camille E.I.",
    "TEST Dupont Camille ei",
    "Entrepreneur individuel TEST Dupont Camille",
    "TEST Dupont Camille entrepreneur individuel",
  ])("refuse « %s »", (raisonSociale) => {
    expect(
      schemaEmetteurFacture.safeParse({ ...IDENTITE, raisonSociale }).success,
    ).toBe(false);
  });

  // Des lettres E et I dans un nom ne sont pas la mention.
  it.each(["TEST Dupont Camille", "TEST Reina Leila", "TEST Eileen Ei-Sun"])(
    "accepte « %s »",
    (raisonSociale) => {
      expect(
        schemaEmetteurFacture.safeParse({ ...IDENTITE, raisonSociale }).success,
      ).toBe(true);
    },
  );
});

describe("le motif recopie par le script de diagnostic", () => {
  /*
   * `verifier-emetteur-facture.sh` RECOPIE LE MOTIF, faute de pouvoir importer
   * `@/lib/validation` sans outillage. Un motif divergent ferait dire « valide »
   * au diagnostic pour une valeur que le service refuse a l'emission.
   */
  it("porte exactement le motif du service", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/verifier-emetteur-facture.sh"),
      "utf8",
    );

    expect(source).toContain(`/${MOTIF_MENTION_EI.source}/i`);
  });
});

describe("emetteurPourDocument", () => {
  it("fige la marque et la denomination sans toucher a l'identite", () => {
    const emetteur = {
      raisonSociale: "TEST Dupont Camille",
      siret: "12345678901234",
      adresse: "3 rue TEST des Ateliers, 64000 Pau",
      emailContact: "test@exemple.test",
    };

    expect(emetteurPourDocument(emetteur)).toEqual({
      ...emetteur,
      nomCommercial: "Lune-soleil",
      denomination: "TEST Dupont Camille EI",
    });
  });
});

describe("relecture de l'instantane legal, deux versions", () => {
  const EMETTEUR = {
    raisonSociale: "TEST Dupont Camille",
    siret: "12345678901234",
    adresse: "3 rue TEST des Ateliers, 64000 Pau",
    emailContact: "test@exemple.test",
  };
  const CORPS = {
    client: {
      nom: "TEST Client",
      email: "client@exemple.test",
      adresseFacturation: {
        nom: "TEST Client",
        ligne1: "1 rue TEST",
        codePostal: "64000",
        ville: "Pau",
        pays: "FR",
      },
    },
    commande: { numero: "C-2026-0001", passeeA: "2026-10-29T16:00:00.000Z" },
    lignes: [
      {
        referenceFigee: "TEST-1",
        libelleProduit: "TEST Boucles",
        libelleVariante: "Unique",
        prixUnitaireCentimes: 100,
        quantite: 1,
      },
    ],
    sousTotalCentimes: 100,
    fraisPortCentimes: 410,
    totalCentimes: 510,
    mentions: ["TVA non applicable, article 293 B du Code général des impôts"],
  };

  /*
   * LES FACTURES EMISES AVANT LS-297 RESTENT LISIBLES, F-2026-0001 comprise :
   * sans la version 1 dans l'union, leur relecture leverait, et la page de la
   * commande comme la regeneration du PDF tomberaient.
   */
  it("relit une version 1, sans marque ni denomination", () => {
    expect(
      schemaInstantaneLegal.safeParse({
        version: 1,
        emetteur: EMETTEUR,
        ...CORPS,
      }).success,
    ).toBe(true);
  });

  it("relit une version 2 complete", () => {
    expect(
      schemaInstantaneLegal.safeParse({
        version: 2,
        emetteur: emetteurPourDocument(EMETTEUR),
        ...CORPS,
      }).success,
    ).toBe(true);
  });

  // Une version 2 sans denomination porterait un document sans « EI ».
  it("refuse une version 2 privee de sa denomination", () => {
    expect(
      schemaInstantaneLegal.safeParse({
        version: 2,
        emetteur: EMETTEUR,
        ...CORPS,
      }).success,
    ).toBe(false);
  });
});
