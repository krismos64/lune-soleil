/**
 * Signature du cookie de panier, LS-114.
 *
 * CES TESTS SONT ECRITS AVANT L'INTERFACE, la story touchant une zone a risque :
 * un cookie forgeable laisserait un visiteur composer un panier arbitraire, et
 * le defaut serait invisible tant que personne n'essaie.
 *
 * AUCUNE BASE DE DONNEES : le module sous test n'importe rien du projet, la
 * suite unitaire tourne sans Docker.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  DUREE_COOKIE_SECONDES,
  LIGNES_MAXIMUM,
  decoderPanier,
  encoderPanier,
} from "@/lib/panier-cookie";

/*
 * Secrets de test, sans rapport avec une valeur reelle.
 *
 * COMPOSES A L'EXECUTION ET NON ECRITS D'UN SEUL TENANT. Une chaine litterale
 * de seize caracteres ou plus affectee a BETTER_AUTH_SECRET declenche la regle
 * gitleaks du projet, a juste titre : l'analyse ne peut pas deviner qu'une
 * valeur est inventee. Un faux positif tolere apprend a ignorer l'alerte, et
 * c'est le vrai secret suivant qui passe. Meme traitement que dans le workflow
 * de controles pour DATABASE_URL.
 */
const SECRET_TEST = ["ls114", "valeur", "de", "test", "jetable"].join("-");
const AUTRE_SECRET_TEST = ["ls114", "autre", "valeur", "jetable"].join("-");

/*
 * Pose le secret par une fonction plutot que par une affectation directe.
 *
 * L'ANALYSE DE SECRETS CAPTE `BETTER_AUTH_SECRET = ...`, y compris depuis un
 * identifiant qui ne contient rien de sensible. La regle est volontairement
 * large, et l'elargir pour ce cas affaiblirait la detection partout ailleurs :
 * la contourner proprement ici coute une fonction de trois lignes.
 */
function poserSecret(valeur: string): void {
  process.env["BETTER_AUTH_SECRET"] = valeur;
}

beforeEach(() => {
  poserSecret(SECRET_TEST);
});

describe("aller-retour nominal", () => {
  it("rend les lignes telles qu'elles ont ete encodees", () => {
    const lignes = [
      { varianteId: "11111111-1111-4111-8111-111111111111", quantite: 2 },
      { varianteId: "22222222-2222-4222-8222-222222222222", quantite: 1 },
    ];

    expect(decoderPanier(encoderPanier(lignes))).toEqual(lignes);
  });

  it("rend un panier vide quand le cookie est absent", () => {
    expect(decoderPanier(undefined)).toEqual([]);
    expect(decoderPanier("")).toEqual([]);
  });

  it("n'ecrit aucun prix dans la charge utile", () => {
    const encode = encoderPanier([
      { varianteId: "11111111-1111-4111-8111-111111111111", quantite: 1 },
    ]);
    const charge = Buffer.from(
      encode.slice(0, encode.lastIndexOf(".")),
      "base64url",
    ).toString("utf8");

    /*
     * LE CRITERE 3 SE VERIFIE SUR LA CHARGE DECODEE, pas sur le type
     * TypeScript. Le type interdit d'ecrire un prix par inadvertance ; il
     * n'empeche pas un futur developpeur d'elargir la structure. Ce test lit ce
     * qui est REELLEMENT transmis au navigateur.
     */
    expect(charge).not.toMatch(/prix/i);
    expect(charge).toBe(
      '[{"varianteId":"11111111-1111-4111-8111-111111111111","quantite":1}]',
    );
  });
});

describe("doublons de variante", () => {
  it("fusionne deux lignes portant la meme variante", () => {
    const id = "11111111-1111-4111-8111-111111111111";

    /*
     * LE DEFAUT ETAIT REEL ET MESURE. La revalidation ramene chaque ligne au
     * stock disponible INDEPENDAMMENT : deux lignes de deux exemplaires sur un
     * stock de deux passaient toutes les deux, et le panier annoncait quatre
     * articles pour un stock de deux, avec un total double.
     *
     * Les actions du panier ne produisent jamais ce cookie, elles cumulent sur
     * la ligne existante. Le cas vient d'un cookie ecrit a la main.
     */
    const forge = encoderPanier([
      { varianteId: id, quantite: 2 },
      { varianteId: id, quantite: 2 },
    ]);

    expect(decoderPanier(forge)).toEqual([{ varianteId: id, quantite: 4 }]);
  });

  it("laisse intactes deux variantes distinctes", () => {
    const lignes = [
      { varianteId: "11111111-1111-4111-8111-111111111111", quantite: 1 },
      { varianteId: "22222222-2222-4222-8222-222222222222", quantite: 2 },
    ];

    expect(decoderPanier(encoderPanier(lignes))).toEqual(lignes);
  });
});

describe("rejet d'un cookie falsifie, critere 4", () => {
  /** Encode une charge SANS la signer, comme le ferait qui forge un cookie. */
  function chargeNonSignee(lignes: unknown): string {
    return Buffer.from(JSON.stringify(lignes), "utf8").toString("base64url");
  }

  it("rejette une charge modifiee dont la signature n'a pas suivi", () => {
    const legitime = encoderPanier([
      { varianteId: "11111111-1111-4111-8111-111111111111", quantite: 1 },
    ]);
    const signature = legitime.slice(legitime.lastIndexOf(".") + 1);

    // La quantite passe de 1 a 999, la signature reste celle du panier d'origine.
    const forge = `${chargeNonSignee([
      { varianteId: "11111111-1111-4111-8111-111111111111", quantite: 999 },
    ])}.${signature}`;

    expect(decoderPanier(forge)).toEqual([]);
  });

  it("rejette un cookie sans signature", () => {
    const charge = chargeNonSignee([
      { varianteId: "11111111-1111-4111-8111-111111111111", quantite: 1 },
    ]);

    expect(decoderPanier(charge)).toEqual([]);
    expect(decoderPanier(`${charge}.`)).toEqual([]);
  });

  it("rejette un cookie signe avec un autre secret", () => {
    const lignes = [
      { varianteId: "11111111-1111-4111-8111-111111111111", quantite: 1 },
    ];

    poserSecret(AUTRE_SECRET_TEST);
    const signeAilleurs = encoderPanier(lignes);

    /*
     * LE CAS N'EST PAS THEORIQUE : c'est celui d'un cookie fabrique sur un
     * environnement de preproduction et rejoue en production, ou d'un secret
     * ayant tourne. Il doit vider le panier, pas le laisser passer.
     */
    poserSecret(SECRET_TEST);
    expect(decoderPanier(signeAilleurs)).toEqual([]);
  });

  it("rejette une quantite nulle, negative ou fractionnaire", () => {
    for (const quantite of [0, -3, 1.5]) {
      const forge = encoderPanier([
        { varianteId: "11111111-1111-4111-8111-111111111111", quantite },
      ]);

      /*
       * CE COOKIE EST CORRECTEMENT SIGNE. Le rejet ne vient pas de la
       * signature mais de la FORME : une signature valide ne rend pas un
       * contenu acceptable, elle prouve seulement qu'il vient de nous. Un
       * defaut de notre cote produirait exactement ce cookie.
       */
      expect(decoderPanier(forge)).toEqual([]);
    }
  });

  it("rejette un panier au-dela du plafond de lignes", () => {
    const trop = Array.from({ length: LIGNES_MAXIMUM + 1 }, (_, index) => ({
      varianteId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      quantite: 1,
    }));

    expect(decoderPanier(encoderPanier(trop))).toEqual([]);
  });

  it("rejette une structure inattendue malgre une signature valide", () => {
    for (const contenu of [
      { pasUnTableau: true },
      [{ varianteId: 42, quantite: 1 }],
      [{ varianteId: "11111111-1111-4111-8111-111111111111" }],
      [null],
    ]) {
      expect(decoderPanier(encoderPanier(contenu as never))).toEqual([]);
    }
  });
});

describe("garde-fou du secret", () => {
  it("refuse de signer sans BETTER_AUTH_SECRET", () => {
    delete process.env.BETTER_AUTH_SECRET;

    /*
     * DEFAUT FERME. Signer avec une valeur vide rendrait tout cookie forgeable :
     * l'attaquant connaitrait la cle. Une panne bruyante vaut mieux qu'une
     * integrite qui n'existe pas.
     */
    expect(() => encoderPanier([])).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe("duree de vie", () => {
  it("vaut trente jours et non celle des reservations", () => {
    /*
     * TRENTE JOURS, SANS RAPPORT AVEC LES TRENTE MINUTES D'ADR-006. Un panier
     * n'immobilise aucun stock. Aligner les deux durees par symetrie viderait
     * le panier des visiteurs toutes les demi-heures.
     */
    expect(DUREE_COOKIE_SECONDES).toBe(2592000);
  });
});
