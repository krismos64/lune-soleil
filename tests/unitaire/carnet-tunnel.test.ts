/**
 * Etat de depart de l'etape adresse du tunnel, avec le carnet. LS-299.
 */
import { describe, expect, it } from "vitest";

import { etatInitialAdresse, type AdresseProposee } from "@/lib/carnet-tunnel";
import type { SaisieTunnel } from "@/lib/tunnel-cookie";

function saisieAvec(ligne1: string): SaisieTunnel {
  return {
    nomClient: "TEST Client",
    email: "client@exemple.test",
    telephone: null,
    adresse: {
      ligne1,
      ligne2: ligne1 === "" ? undefined : "Bâtiment B",
      codePostal: ligne1 === "" ? "" : "35000",
      ville: ligne1 === "" ? "" : "Rennes",
      pays: "FR",
    },
    mode: null,
    pointRetrait: null,
  } as SaisieTunnel;
}

const PRINCIPALE: AdresseProposee = {
  id: "adresse-principale",
  libelle: "Maison",
  ligne1: "1 rue TEST",
  ligne2: null,
  codePostal: "64000",
  ville: "Pau",
  estParDefaut: true,
};

const SECONDE: AdresseProposee = {
  ...PRINCIPALE,
  id: "adresse-seconde",
  libelle: "Bureau",
  ligne1: "2 place TEST",
  estParDefaut: false,
};

describe("etatInitialAdresse", () => {
  // Critere 1 : l'adresse par defaut est preselectionnee sur un formulaire vide.
  it("preselectionne l'adresse par defaut sur un formulaire vide", () => {
    expect(etatInitialAdresse(saisieAvec(""), [SECONDE, PRINCIPALE])).toEqual({
      choix: "adresse-principale",
      champs: {
        ligne1: "1 rue TEST",
        ligne2: "",
        codePostal: "64000",
        ville: "Pau",
      },
    });
  });

  /*
   * LA SAISIE ENREGISTREE L'EMPORTE : un client revenu en arriere retrouve ce
   * qu'il avait tape, jamais ecrase par son adresse par defaut.
   */
  it("garde la saisie deja enregistree", () => {
    expect(etatInitialAdresse(saisieAvec("12 rue TEST"), [PRINCIPALE])).toEqual(
      {
        choix: "",
        champs: {
          ligne1: "12 rue TEST",
          ligne2: "Bâtiment B",
          codePostal: "35000",
          ville: "Rennes",
        },
      },
    );
  });

  // A7 : un carnet sans adresse par defaut est legitime, rien n'est choisi.
  it("ne choisit rien dans un carnet sans adresse par defaut", () => {
    expect(etatInitialAdresse(saisieAvec(""), [SECONDE]).choix).toBe("");
    expect(etatInitialAdresse(saisieAvec(""), [SECONDE]).champs.ligne1).toBe(
      "",
    );
  });

  // Critere 3 : sans session, carnet vide, le tunnel est inchange.
  it("laisse le formulaire vide sans carnet", () => {
    expect(etatInitialAdresse(saisieAvec(""), [])).toEqual({
      choix: "",
      champs: { ligne1: "", ligne2: "", codePostal: "", ville: "" },
    });
  });
});
