/**
 * Etat de depart de l'etape adresse du tunnel, avec le carnet. LS-299.
 */
import { describe, expect, it } from "vitest";

import {
  adresseCorrespondante,
  etatInitialAdresse,
  libelleProposition,
  type AdresseProposee,
} from "@/lib/carnet-tunnel";
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

describe("la liste dit ce qui partira", () => {
  /*
   * RETOUR A L'ETAPE, releve par la revue frontend : la saisie enregistree
   * reproduit l'adresse par defaut, la liste doit la nommer et non annoncer
   * « une autre adresse ».
   */
  it("nomme l'adresse du carnet que la saisie reproduit", () => {
    const saisie = saisieAvec("1 rue TEST");
    saisie.adresse = {
      ligne1: "1 rue TEST",
      codePostal: "64000",
      ville: "Pau",
      pays: "FR",
    };

    expect(etatInitialAdresse(saisie, [SECONDE, PRINCIPALE]).choix).toBe(
      "adresse-principale",
    );
  });

  // Une retouche detache la liste de l'adresse choisie.
  it("ne nomme plus l'adresse apres une retouche", () => {
    expect(
      adresseCorrespondante(
        {
          ligne1: "1 rue TEST",
          ligne2: "Bâtiment D",
          codePostal: "64000",
          ville: "Pau",
        },
        [PRINCIPALE],
      ),
    ).toBe("");
  });
});

describe("libelleProposition", () => {
  // En tete, pour survivre a la coupe du select ferme a 320 px.
  it("annonce l'adresse par defaut en tete", () => {
    expect(libelleProposition(PRINCIPALE)).toBe(
      "Par défaut, Maison : 1 rue TEST, 64000 Pau",
    );
  });

  // Deux adresses d'un immeuble ne different parfois que par le complement.
  it("porte le complement quand il existe", () => {
    expect(
      libelleProposition({ ...SECONDE, libelle: null, ligne2: "Bâtiment B" }),
    ).toBe("2 place TEST, Bâtiment B, 64000 Pau");
  });
});
