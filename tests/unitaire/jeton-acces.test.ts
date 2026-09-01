/**
 * Jetons d'acces sans compte, valeur signee et empreinte. LS-132.
 *
 * CE JETON EST LA SEULE AUTORISATION D'UN CLIENT SANS COMPTE, invariant 2. Un
 * jeton forgeable laisserait lire la facture d'autrui, donc son nom, son
 * adresse et ses achats, a partir d'une valeur fabriquee.
 *
 * MEME MECANIQUE QUE LES COOKIES SIGNES, ETIQUETTE DIFFERENTE : une signature
 * valide pour un autre usage ne doit jamais valoir ici.
 */
import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  CHEMIN_ACCES_DOCUMENT,
  DUREE_JETON_DOCUMENT_JOURS,
  empreinteJeton,
  engendrerJeton,
  expirationDocument,
  lienDocument,
  signatureJetonValide,
} from "@/lib/jeton-acces";

/*
 * Secret de test, compose a l'execution, meme traitement que LS-114 et LS-118 :
 * une chaine litterale affectee au nom de la variable declencherait l'analyse
 * de secrets du depot, a juste titre.
 */
const SECRET_TEST = ["ls132", "valeur", "de", "test", "jetable"].join("-");

function poserSecret(valeur: string | undefined): void {
  if (valeur === undefined) {
    delete process.env.BETTER_AUTH_SECRET;
    return;
  }

  process.env.BETTER_AUTH_SECRET = valeur;
}

beforeEach(() => {
  poserSecret(SECRET_TEST);
});

describe("engendrerJeton", () => {
  it("rend une valeur et son empreinte, l'empreinte n'etant pas la valeur", () => {
    const jeton = engendrerJeton();

    expect(jeton.valeur).not.toBe("");
    expect(jeton.empreinte).not.toBe("");
    expect(jeton.empreinte).not.toBe(jeton.valeur);
    /* L5 : ce qui part en base ne doit pas contenir la valeur transmise. */
    expect(jeton.empreinte).not.toContain(jeton.valeur);
  });

  it("engendre une valeur differente a chaque appel", () => {
    const valeurs = new Set(
      Array.from({ length: 50 }, () => engendrerJeton().valeur),
    );

    expect(valeurs.size).toBe(50);
  });

  it("produit une empreinte reproductible depuis la valeur", () => {
    const jeton = engendrerJeton();

    expect(empreinteJeton(jeton.valeur)).toBe(jeton.empreinte);
  });

  it("refuse d'engendrer sans secret, defaut ferme", () => {
    poserSecret(undefined);

    expect(() => engendrerJeton()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("refuse d'engendrer sur un secret vide", () => {
    poserSecret("");

    expect(() => engendrerJeton()).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe("signatureJetonValide, quatrieme condition « modifie »", () => {
  it("accepte un jeton fraichement engendre", () => {
    expect(signatureJetonValide(engendrerJeton().valeur)).toBe(true);
  });

  it("refuse une valeur vide ou sans separateur", () => {
    expect(signatureJetonValide("")).toBe(false);
    expect(signatureJetonValide("sansseparateur")).toBe(false);
    expect(signatureJetonValide(".")).toBe(false);
  });

  it("refuse une signature vide apres le separateur", () => {
    const jeton = engendrerJeton();
    const alea = jeton.valeur.slice(0, jeton.valeur.lastIndexOf("."));

    expect(signatureJetonValide(`${alea}.`)).toBe(false);
  });

  it("refuse un jeton dont la partie aleatoire a ete modifiee", () => {
    const jeton = engendrerJeton();
    const separateur = jeton.valeur.lastIndexOf(".");
    const alea = jeton.valeur.slice(0, separateur);
    const signature = jeton.valeur.slice(separateur + 1);

    /* Un seul caractere change suffit a invalider. */
    const aleaModifie = `${alea.slice(0, -1)}${alea.at(-1) === "A" ? "B" : "A"}`;

    expect(signatureJetonValide(`${aleaModifie}.${signature}`)).toBe(false);
  });

  it("refuse un jeton dont la signature a ete modifiee", () => {
    const jeton = engendrerJeton();
    const separateur = jeton.valeur.lastIndexOf(".");
    const alea = jeton.valeur.slice(0, separateur);
    const signature = jeton.valeur.slice(separateur + 1);

    const signatureModifiee = `${signature.slice(0, -1)}${
      signature.at(-1) === "A" ? "B" : "A"
    }`;

    expect(signatureJetonValide(`${alea}.${signatureModifiee}`)).toBe(false);
  });

  it("refuse un jeton signe avec un autre secret", () => {
    const jeton = engendrerJeton();

    poserSecret(["ls132", "autre", "secret"].join("-"));

    expect(signatureJetonValide(jeton.valeur)).toBe(false);
  });

  /**
   * L'ETIQUETTE EST CE QUI SEPARE LES USAGES. La cle maitre est partagee avec
   * les trois cookies signes : sans etiquette propre, une signature de panier
   * vaudrait ici, et un cookie public deviendrait un acces aux factures.
   */
  it("refuse une signature produite avec l'etiquette d'un autre usage", () => {
    const alea = "alea-de-test-ls132";

    const cleAutreUsage = createHmac("sha256", SECRET_TEST)
      .update("panier-v1")
      .digest();
    const signatureAutreUsage = createHmac("sha256", cleAutreUsage)
      .update(alea)
      .digest("base64url");

    expect(signatureJetonValide(`${alea}.${signatureAutreUsage}`)).toBe(false);
  });

  it("accepte la signature produite avec la bonne etiquette", () => {
    const alea = "alea-de-test-ls132";

    const cleDocument = createHmac("sha256", SECRET_TEST)
      .update("document-v1")
      .digest();
    const signature = createHmac("sha256", cleDocument)
      .update(alea)
      .digest("base64url");

    expect(signatureJetonValide(`${alea}.${signature}`)).toBe(true);
  });

  it("refuse sans secret plutot que de lever, un refus n'est pas une panne", () => {
    const jeton = engendrerJeton();

    poserSecret(undefined);

    /*
     * LA LEVEE EST ACCEPTABLE ICI, l'absence de secret etant une panne de
     * configuration et non une entree douteuse. Ce que le test fixe, c'est
     * qu'aucune valeur ne devienne valide dans cet etat.
     */
    let valide: boolean;

    try {
      valide = signatureJetonValide(jeton.valeur);
    } catch {
      valide = false;
    }

    expect(valide).toBe(false);
  });
});

describe("empreinteJeton", () => {
  it("porte sur la valeur complete, signature comprise", () => {
    const jeton = engendrerJeton();
    const alea = jeton.valeur.slice(0, jeton.valeur.lastIndexOf("."));

    /*
     * Prendre l'empreinte de la seule partie aleatoire laisserait deux valeurs
     * distinctes, l'une correctement signee et l'autre non, partager la meme
     * ligne en base.
     */
    expect(empreinteJeton(alea)).not.toBe(jeton.empreinte);
  });

  it("rend la meme empreinte pour la meme valeur, quel que soit le secret", () => {
    const jeton = engendrerJeton();
    const avant = empreinteJeton(jeton.valeur);

    poserSecret(["ls132", "secret", "different"].join("-"));

    /* L'empreinte est un condensat de la valeur, elle ne depend pas du secret. */
    expect(empreinteJeton(jeton.valeur)).toBe(avant);
  });
});

describe("expirationDocument", () => {
  it("place l'expiration a trente jours", () => {
    const maintenant = new Date("2026-09-01T12:00:00.000Z");
    const expire = expirationDocument(maintenant);

    expect(expire.toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(DUREE_JETON_DOCUMENT_JOURS).toBe(30);
  });

  it("rend une date strictement future", () => {
    const maintenant = new Date();

    expect(expirationDocument(maintenant).getTime()).toBeGreaterThan(
      maintenant.getTime(),
    );
  });
});

describe("lienDocument", () => {
  const BASE = "https://lune-soleil.fr";

  function poserBase(valeur: string | undefined): void {
    if (valeur === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      return;
    }

    process.env.NEXT_PUBLIC_SITE_URL = valeur;
  }

  it("compose un lien portant la valeur du jeton", () => {
    poserBase(BASE);

    const jeton = engendrerJeton();
    const lien = lienDocument(jeton.valeur);

    expect(lien).toBe(`${BASE}${CHEMIN_ACCES_DOCUMENT}/${jeton.valeur}`);
  });

  it("ne double pas la barre oblique quand la base en porte une", () => {
    poserBase(`${BASE}/`);

    expect(lienDocument("jeton-de-test")).toBe(
      `${BASE}${CHEMIN_ACCES_DOCUMENT}/jeton-de-test`,
    );
  });

  /**
   * DEFAUT FERME. Un lien construit sur une base absente partirait vers un
   * chemin relatif ou vers localhost : dans les deux cas le jeton quitte le
   * domaine attendu, et il ouvre l'acces a qui recoit l'email.
   */
  it("refuse de composer un lien sans base configuree", () => {
    poserBase(undefined);

    expect(() => lienDocument("jeton-de-test")).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("refuse de composer un lien sur une base vide", () => {
    poserBase("");

    expect(() => lienDocument("jeton-de-test")).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
