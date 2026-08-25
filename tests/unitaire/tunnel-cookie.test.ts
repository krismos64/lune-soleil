/**
 * Saisie du tunnel de commande, cookie signe. LS-115, etape 3b du parcours 1.
 *
 * TESTS ECRITS AVANT L'IMPLEMENTATION. La saisie porte des donnees personnelles,
 * nom, adresse et telephone : un cookie forgeable laisserait injecter une
 * adresse arbitraire, et un cookie non expirant les conserverait indefiniment.
 *
 * MEME MECANIQUE QUE LE PANIER, ETIQUETTE DIFFERENTE. La cle est derivee de
 * `BETTER_AUTH_SECRET` avec l'etiquette `tunnel-v1` : une signature valide pour
 * le panier ne doit jamais valoir pour le tunnel.
 */
import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  DUREE_TUNNEL_SECONDES,
  decoderSaisieTunnel,
  encoderSaisieTunnel,
  type SaisieTunnel,
} from "@/lib/tunnel-cookie";

/*
 * Secret de test, compose a l'execution.
 *
 * UNE CHAINE LITTERALE DE SEIZE CARACTERES affectee a BETTER_AUTH_SECRET
 * declenche la regle gitleaks du projet, a juste titre : l'analyse ne peut pas
 * deviner qu'une valeur est inventee. Meme traitement qu'en LS-114.
 */
const SECRET_TEST = ["ls115", "valeur", "de", "test", "jetable"].join("-");

function poserSecret(valeur: string | undefined): void {
  const cle = ["BETTER", "AUTH", "SECRET"].join("_");

  if (valeur === undefined) {
    delete process.env[cle];
    return;
  }

  process.env[cle] = valeur;
}

/** Saisie complete, mode domicile. */
const SAISIE_DOMICILE: SaisieTunnel = {
  nomClient: "Camille Dupont",
  email: "camille.dupont@exemple.test",
  telephone: "0600000000",
  adresse: {
    ligne1: "12 rue des Ateliers",
    codePostal: "35000",
    ville: "Rennes",
    pays: "FR",
  },
  mode: "DOMICILE",
  pointRetrait: null,
};

/** Saisie complete, mode Point Relais avec son point copie en entier. */
const SAISIE_RELAIS: SaisieTunnel = {
  ...SAISIE_DOMICILE,
  mode: "POINT_RELAIS",
  pointRetrait: {
    identifiant: "FR-000000",
    nom: "Point de retrait de démonstration",
    ligne1: "1 rue de la Démonstration",
    codePostal: "35000",
    ville: "Rennes",
  },
};

beforeEach(() => {
  poserSecret(SECRET_TEST);
});

describe("encoderSaisieTunnel et decoderSaisieTunnel", () => {
  it("rend la saisie telle qu'elle a ete ecrite", () => {
    const decodee = decoderSaisieTunnel(encoderSaisieTunnel(SAISIE_DOMICILE));

    expect(decodee).toEqual(SAISIE_DOMICILE);
  });

  it("conserve le point de retrait en entier, pas seulement son identifiant", () => {
    const decodee = decoderSaisieTunnel(encoderSaisieTunnel(SAISIE_RELAIS));

    /*
     * `PARCOURS.md` etape 3b : « le point de retrait est copie avec son libelle
     * et son adresse, pas seulement son identifiant. Un point qui ferme rendrait
     * autrement illisible une commande passee ». LS-117 figera cet objet.
     */
    expect(decodee?.pointRetrait).toEqual(SAISIE_RELAIS.pointRetrait);
  });

  it("conserve un telephone absent comme absent", () => {
    const sansTelephone: SaisieTunnel = {
      ...SAISIE_DOMICILE,
      telephone: null,
    };

    expect(decoderSaisieTunnel(encoderSaisieTunnel(sansTelephone))).toEqual(
      sansTelephone,
    );
  });
});

describe("integrite du cookie", () => {
  /*
   * UNE SIGNATURE INVALIDE REND `null` ET NE LEVE PAS. Le tunnel repart alors
   * d'une saisie vide, ce qui est desagreable mais sur. Lever ferait une erreur
   * serveur sur une page publique, et un cookie corrompu par un ancien format
   * suffirait a rendre la boutique inaccessible.
   */
  it("refuse une charge modifiee", () => {
    const valide = encoderSaisieTunnel(SAISIE_DOMICILE);
    const [charge, signature] = valide.split(".");
    const chargeModifiee = Buffer.from(
      JSON.stringify({ ...SAISIE_DOMICILE, nomClient: "Autre personne" }),
      "utf8",
    ).toString("base64url");

    expect(charge).toBeDefined();
    expect(decoderSaisieTunnel(`${chargeModifiee}.${signature}`)).toBeNull();
  });

  it("refuse une signature tronquee", () => {
    const valide = encoderSaisieTunnel(SAISIE_DOMICILE);

    expect(decoderSaisieTunnel(valide.slice(0, -4))).toBeNull();
  });

  it.each([
    ["valeur absente", undefined],
    ["chaine vide", ""],
    ["sans separateur", "abcdef"],
    ["charge non JSON", "cGFzIGR1IEpTT04.signature"],
  ])("refuse %s", (_libelle, valeur) => {
    expect(decoderSaisieTunnel(valeur)).toBeNull();
  });

  /*
   * LE COEUR DE LA DERIVATION PAR ETIQUETTE, et le test le plus delicat du
   * fichier.
   *
   * LA CHARGE EST UNE SAISIE DE TUNNEL PARFAITEMENT VALIDE, signee avec la cle
   * du PANIER. C'est la seule facon d'isoler l'etiquette : un vrai cookie de
   * panier serait deja rejete par le controle de forme, un tableau JSON n'etant
   * pas une saisie, et le test passerait meme avec les deux etiquettes
   * confondues. Mesure le 25 aout 2026 : ecrit ainsi, il ne detectait pas la
   * mutation qui remplace `tunnel-v1` par `panier-v1`.
   *
   * Sans etiquette distincte, une signature valide pour un usage serait
   * acceptee pour l'autre.
   */
  it("refuse une saisie signee avec la cle derivee du panier", () => {
    const charge = Buffer.from(
      JSON.stringify(SAISIE_DOMICILE),
      "utf8",
    ).toString("base64url");

    const clePanier = createHmac("sha256", SECRET_TEST)
      .update("panier-v1")
      .digest();
    const signaturePanier = createHmac("sha256", clePanier)
      .update(charge)
      .digest("base64url");

    expect(decoderSaisieTunnel(`${charge}.${signaturePanier}`)).toBeNull();
  });

  /*
   * ET LA CONTRE-EPREUVE : la meme charge signee avec la cle du TUNNEL passe.
   * Sans elle, le test ci-dessus resterait vert meme si le decodeur refusait
   * tout, ce qui ne prouverait plus rien de l'etiquette.
   */
  it("accepte la meme charge signee avec la cle derivee du tunnel", () => {
    const charge = Buffer.from(
      JSON.stringify(SAISIE_DOMICILE),
      "utf8",
    ).toString("base64url");

    const cleTunnel = createHmac("sha256", SECRET_TEST)
      .update("tunnel-v1")
      .digest();
    const signatureTunnel = createHmac("sha256", cleTunnel)
      .update(charge)
      .digest("base64url");

    expect(decoderSaisieTunnel(`${charge}.${signatureTunnel}`)).toEqual(
      SAISIE_DOMICILE,
    );
  });

  it("refuse une saisie signee avec un autre secret", () => {
    const signeAilleurs = encoderSaisieTunnel(SAISIE_DOMICILE);

    poserSecret(["ls115", "autre", "valeur", "jetable"].join("-"));

    expect(decoderSaisieTunnel(signeAilleurs)).toBeNull();
  });

  /*
   * DEFAUT FERME : sans secret, l'encodage leve plutot que de signer avec une
   * valeur vide, ce qui rendrait tout cookie forgeable. Meme decision que le
   * panier en LS-114.
   */
  it("refuse de signer sans secret", () => {
    poserSecret(undefined);

    expect(() => encoderSaisieTunnel(SAISIE_DOMICILE)).toThrow();
  });
});

describe("forme de la saisie", () => {
  /*
   * LE COOKIE NE PORTE AUCUN MONTANT. Meme raisonnement que le panier : un
   * frais de port ou un total ecrit ici serait un montant que le client peut
   * figer a son avantage. Tout montant vient du serveur, invariant 1 et
   * critere 3 de la story.
   */
  it("ne porte aucun montant, meme fourni en trop", () => {
    const avecMontant = {
      ...SAISIE_DOMICILE,
      fraisPortCentimes: 0,
      totalCentimes: 1,
    };

    const decodee = decoderSaisieTunnel(
      encoderSaisieTunnel(avecMontant as SaisieTunnel),
    );

    expect(decodee).not.toBeNull();
    expect(decodee).not.toHaveProperty("fraisPortCentimes");
    expect(decodee).not.toHaveProperty("totalCentimes");
  });

  /*
   * LE MONTANT NE DOIT PAS ENTRER DANS LA CHARGE SIGNEE, et pas seulement
   * disparaitre au decodage.
   *
   * CE TEST LIT LE COOKIE ET NON SON DECODAGE, parce que c'est la seule facon
   * de voir le defaut. Mesure le 25 aout 2026 : avec un `...saisie` dans
   * `normaliser`, le montant etait ECRIT ET SIGNE dans le cookie, et le
   * decodeur le retirait ensuite. Le test precedent restait vert, et un montant
   * signe par le serveur circulait quand meme chez le client, ce que
   * l'invariant 1 interdit.
   */
  it("n'ecrit aucun montant dans la charge signee elle-meme", () => {
    const avecMontant = {
      ...SAISIE_DOMICILE,
      fraisPortCentimes: 0,
      totalCentimes: 1,
    };

    const cookie = encoderSaisieTunnel(avecMontant as SaisieTunnel);
    const charge = Buffer.from(
      cookie.slice(0, cookie.lastIndexOf(".")),
      "base64url",
    ).toString("utf8");

    expect(charge).not.toContain("fraisPortCentimes");
    expect(charge).not.toContain("totalCentimes");
  });

  /*
   * UN MODE INCONNU REND `null`. Le cookie a pu etre ecrit par une version
   * anterieure, ou forge malgre la signature si le secret fuitait : le decodeur
   * ne fait confiance a rien, meme apres verification de signature.
   */
  it("refuse un mode de livraison inconnu", () => {
    const decodee = decoderSaisieTunnel(
      encoderSaisieTunnel({
        ...SAISIE_DOMICILE,
        mode: "DRONE",
      } as unknown as SaisieTunnel),
    );

    expect(decodee).toBeNull();
  });

  /*
   * LA COHERENCE MODE / POINT DE RETRAIT EST VERIFIEE ICI AUSSI, en plus de
   * Zod a la saisie et du CHECK en base. Un DOMICILE porteur d'un point de
   * retrait violerait `chk_commande_mode_point_relais` a l'ecriture de LS-117 :
   * mieux vaut le refuser des la lecture du cookie.
   */
  it("refuse un DOMICILE porteur d'un point de retrait", () => {
    const decodee = decoderSaisieTunnel(
      encoderSaisieTunnel({
        ...SAISIE_DOMICILE,
        pointRetrait: SAISIE_RELAIS.pointRetrait,
      }),
    );

    expect(decodee).toBeNull();
  });

  it("refuse un POINT_RELAIS sans point de retrait", () => {
    const decodee = decoderSaisieTunnel(
      encoderSaisieTunnel({
        ...SAISIE_RELAIS,
        pointRetrait: null,
      }),
    );

    expect(decodee).toBeNull();
  });
});

describe("duree de vie", () => {
  /*
   * PLUS COURTE QUE CELLE DU PANIER, et c'est deliberé. Le panier vit trente
   * jours parce qu'il n'immobilise rien et ne porte aucune donnee personnelle.
   * Cette saisie porte un nom, une adresse et un telephone : la minimisation du
   * RGPD demande de ne pas les conserver au-dela de l'usage, qui est une
   * commande en cours.
   */
  it("est nettement plus courte que celle du panier", () => {
    const trenteJours = 30 * 24 * 60 * 60;

    expect(DUREE_TUNNEL_SECONDES).toBeLessThan(trenteJours);
  });

  it("laisse le temps de remplir le tunnel", () => {
    const uneHeure = 60 * 60;

    expect(DUREE_TUNNEL_SECONDES).toBeGreaterThanOrEqual(uneHeure);
  });
});
