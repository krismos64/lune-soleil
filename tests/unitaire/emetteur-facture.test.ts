/**
 * L'identite legale de l'emetteur des factures, LS-126.
 *
 * DEUX SUJETS DANS CE FICHIER, et le second est le plus important.
 *
 * Le premier est le schema lui-meme, ce qu'il accepte et refuse.
 *
 * LE SECOND EST LA RECOPIE. `scripts/verifier-emetteur-facture.sh` redeclare ce
 * schema, faute de pouvoir importer `@/lib/validation` sans outillage : Node ne
 * resout pas l'alias `@/`. Une regle recopiee est une regle qui divergera, et la
 * divergence serait silencieuse dans les deux sens. Un script plus PERMISSIF
 * annoncerait « emetteur conforme » sur une configuration que le service refuse
 * ensuite, en production, au moment d'emettre une facture ; un script plus
 * STRICT ferait corriger une configuration valide.
 *
 * CE TEST CONFRONTE LES DEUX DECLARATIONS, champ par champ, sans executer ni
 * evaluer le script : il lit `.env`, dont les valeurs sont interdites de
 * lecture. Les champs attendus sont lus sur `schemaEmetteurFacture` lui-meme et
 * non recopies ici, sans quoi ce test serait une troisieme copie a maintenir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { schemaEmetteurFacture } from "@/lib/validation";

/** Un emetteur valide, valeurs inventees et reconnaissables comme telles. */
const VALIDE = {
  raisonSociale: "TEST Lune et Soleil",
  siret: "12345678901234",
  adresse: "1 rue de Test, 75001 TESTVILLE",
  emailContact: "test-emetteur@example.invalid",
};

describe("schemaEmetteurFacture", () => {
  it("accepte une identite complete", () => {
    expect(schemaEmetteurFacture.parse(VALIDE)).toEqual(VALIDE);
  });

  it("refuse un champ absent", () => {
    for (const champ of Object.keys(VALIDE)) {
      const ampute: Record<string, unknown> = { ...VALIDE };
      delete ampute[champ];

      expect(
        schemaEmetteurFacture.safeParse(ampute).success,
        `${champ} absent devrait etre refuse`,
      ).toBe(false);
    }
  });

  /*
   * LE SIRET EST LE CHAMP LE PLUS FACILE A SAISIR DE TRAVERS, et sa forme est
   * la seule que le projet puisse verifier : la validite reelle de
   * l'immatriculation ne se prouve qu'aupres de l'INSEE.
   */
  it("refuse un SIRET qui n'est pas quatorze chiffres", () => {
    const fautifs = [
      "1234567890123", // treize
      "123456789012345", // quinze
      "123 456 789 01234", // espaces, forme affichee couramment
      "1234567890123A", // une lettre
      "", // vide
    ];

    for (const siret of fautifs) {
      expect(
        schemaEmetteurFacture.safeParse({ ...VALIDE, siret }).success,
        `le SIRET « ${siret} » devrait etre refuse`,
      ).toBe(false);
    }
  });

  it("refuse une cle inconnue", () => {
    expect(
      schemaEmetteurFacture.safeParse({ ...VALIDE, tva: "FR123" }).success,
    ).toBe(false);
  });

  /*
   * INVARIANT 9. Ce message finit dans une alerte, un journal et un message
   * d'erreur : il nomme le champ, jamais ce qui y a ete saisi.
   */
  it("ne fait fuir aucune valeur refusee dans ses messages", () => {
    const secret = "VALEUR-QUI-NE-DOIT-PAS-RESSORTIR";
    const resultat = schemaEmetteurFacture.safeParse({
      ...VALIDE,
      siret: secret,
    });

    expect(resultat.success).toBe(false);

    if (!resultat.success) {
      expect(JSON.stringify(resultat.error.issues)).not.toContain(secret);
    }
  });
});

describe("le schema recopie par le script de verification", () => {
  /*
   * POURQUOI CE BLOC EXISTE. `scripts/verifier-emetteur-facture.sh` redeclare le
   * schema, faute de pouvoir importer `@/lib/validation` sans outillage : Node ne
   * resout pas l'alias `@/`. Une regle recopiee est une regle qui divergera, et la
   * divergence serait silencieuse dans les deux sens.
   *
   * LE SCRIPT N'EST NI EXECUTE NI EVALUE ICI. Il lit `.env`, dont les valeurs sont
   * interdites de lecture, et evaluer du texte extrait d'un fichier serait une
   * mauvaise habitude a laisser dans un projet, meme sur une source du depot. Le
   * test confronte donc les DECLARATIONS, champ par champ.
   */
  const SOURCE = readFileSync(
    join(process.cwd(), "scripts/verifier-emetteur-facture.sh"),
    "utf8",
  );

  it("declare exactement les memes champs que celui du service", () => {
    const debut = SOURCE.indexOf("const schema = z.strictObject({");

    expect(
      debut,
      "schema introuvable dans le script : s'il a ete renomme ou reecrit, " +
        "ce test ne protege plus rien, reparer l'extraction plutot que de " +
        "supprimer le test",
    ).toBeGreaterThan(-1);

    const declaration = SOURCE.slice(debut, SOURCE.indexOf("});", debut));

    // LES CHAMPS DU SERVICE FONT FOI, lus sur le schema lui-meme et non
    // recopies dans ce test : un champ ajoute a `schemaEmetteurFacture` et
    // oublie dans le script fait rougir ici.
    const attendus = Object.keys(schemaEmetteurFacture.shape);

    expect(attendus).toHaveLength(4);

    for (const champ of attendus) {
      expect(declaration, `${champ} manque au schema du script`).toContain(
        `${champ}:`,
      );
    }

    // ET AUCUN CHAMP EN TROP : le script ne doit pas exiger ce que le service
    // n'exige pas, sans quoi il ferait corriger une configuration valide.
    const declares = [...declaration.matchAll(/^\s{2}(\w+):/gm)].map(
      (occurrence) => occurrence[1],
    );

    expect(declares.sort()).toEqual([...attendus].sort());
  });

  /*
   * LE `strictObject` EST LA GARANTIE QUI SE PERD LE PLUS FACILEMENT en
   * recopiant : `z.object` accepte une cle inconnue en silence, ce qui ferait
   * passer une configuration que le service refuse.
   */
  it("emploie strictObject, comme le service", () => {
    expect(SOURCE).toContain("z.strictObject({");
    expect(SOURCE).not.toMatch(/const schema = z\.object\(/);
  });

  /*
   * LA REGLE DU SIRET EST LA SEULE CONTRAINTE DE FORME DU SCHEMA, donc la seule
   * qui puisse diverger sur autre chose qu'un nom de champ.
   */
  it("porte la meme regle de SIRET que le service", () => {
    expect(SOURCE).toContain("/^\\d{14}$/");

    // Le service la porte aussi : si l'un des deux change, ce test le dit.
    expect(
      schemaEmetteurFacture.safeParse({ ...VALIDE, siret: "1234567890123" })
        .success,
    ).toBe(false);
    expect(schemaEmetteurFacture.safeParse(VALIDE).success).toBe(true);
  });
});
