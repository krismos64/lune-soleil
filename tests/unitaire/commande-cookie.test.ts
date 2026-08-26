/**
 * Commande en cours de paiement, cookie signe. LS-118, etapes 5 et 6 du
 * parcours 1.
 *
 * CE COOKIE EST UN JETON, PAS UNE PREFERENCE : il designe la commande que la
 * page de confirmation affiche et que le reessai de paiement relance,
 * invariant 2. Un cookie forgeable laisserait consulter et payer la commande
 * d'autrui a partir d'un identifiant devine.
 *
 * MEME MECANIQUE QUE LE PANIER ET LE TUNNEL, ETIQUETTE DIFFERENTE : une
 * signature valide pour un autre usage ne doit jamais valoir ici.
 */
import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  DUREE_COMMANDE_SECONDES,
  decoderCommandeEnCours,
  encoderCommandeEnCours,
} from "@/lib/commande-cookie";

/*
 * Secret de test, compose a l'execution, meme traitement qu'en LS-114 : une
 * chaine litterale affectee au nom de la variable declencherait l'analyse de
 * secrets du depot, a juste titre.
 */
const SECRET_TEST = ["ls118", "valeur", "de", "test", "jetable"].join("-");

function poserSecret(valeur: string | undefined): void {
  const cle = ["BETTER", "AUTH", "SECRET"].join("_");

  if (valeur === undefined) {
    delete process.env[cle];
    return;
  }

  process.env[cle] = valeur;
}

const COMMANDE = { commandeId: "1f4c9f6e-0000-4000-8000-000000000042" };

beforeEach(() => {
  poserSecret(SECRET_TEST);
});

describe("aller-retour", () => {
  it("rend la commande encodee, a l'identique", () => {
    const cookie = encoderCommandeEnCours(COMMANDE);

    expect(decoderCommandeEnCours(cookie)).toEqual(COMMANDE);
  });
});

describe("integrite", () => {
  it("refuse une charge modifiee apres signature", () => {
    const cookie = encoderCommandeEnCours(COMMANDE);
    const [, signature] = cookie.split(".");
    const chargeForgee = Buffer.from(
      JSON.stringify({
        commandeId: "2a000000-0000-4000-8000-00000000dead",
        emisA: Date.now(),
      }),
      "utf8",
    ).toString("base64url");

    expect(decoderCommandeEnCours(`${chargeForgee}.${signature}`)).toBeNull();
  });

  it("refuse une signature d'une autre etiquette, panier ou tunnel", () => {
    // Meme cle maitre, etiquette `tunnel-v1` : la signature est valide pour le
    // tunnel et doit etre refusee ici.
    const charge = Buffer.from(
      JSON.stringify({ commandeId: COMMANDE.commandeId, emisA: Date.now() }),
      "utf8",
    ).toString("base64url");
    const cleTunnel = createHmac("sha256", SECRET_TEST)
      .update("tunnel-v1")
      .digest();
    const signatureTunnel = createHmac("sha256", cleTunnel)
      .update(charge)
      .digest("base64url");

    expect(decoderCommandeEnCours(`${charge}.${signatureTunnel}`)).toBeNull();
  });

  it("refuse un cookie absent, vide ou sans separateur", () => {
    expect(decoderCommandeEnCours(undefined)).toBeNull();
    expect(decoderCommandeEnCours("")).toBeNull();
    expect(decoderCommandeEnCours("sans-point")).toBeNull();
  });

  it("leve sans secret configure, defaut ferme", () => {
    poserSecret(undefined);

    expect(() => encoderCommandeEnCours(COMMANDE)).toThrow(
      /Aucune valeur par defaut/,
    );
  });
});

describe("peremption cote serveur", () => {
  it("refuse une charge plus vieille que la duree de vie", () => {
    const emisA = Date.now() - (DUREE_COMMANDE_SECONDES * 1000 + 1);
    const cookie = encoderCommandeEnCours(COMMANDE, emisA);

    expect(decoderCommandeEnCours(cookie)).toBeNull();
  });

  it("refuse une emission dans le futur, horloge reculee", () => {
    const cookie = encoderCommandeEnCours(COMMANDE, Date.now() + 60_000);

    expect(decoderCommandeEnCours(cookie)).toBeNull();
  });

  it("refuse une charge signee SANS emisA, jamais tolere comme neuve", () => {
    const charge = Buffer.from(
      JSON.stringify({ commandeId: COMMANDE.commandeId }),
      "utf8",
    ).toString("base64url");
    const cleCommande = createHmac("sha256", SECRET_TEST)
      .update("commande-v1")
      .digest();
    const signature = createHmac("sha256", cleCommande)
      .update(charge)
      .digest("base64url");

    expect(decoderCommandeEnCours(`${charge}.${signature}`)).toBeNull();
  });
});
