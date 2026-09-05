/**
 * Socle du referencement technique, LS-137.
 *
 * CES TESTS SONT ECRITS AVANT LE BRANCHEMENT DES PAGES. Le defaut que la story
 * nomme, publier la quantite exacte dans le JSON-LD, est INVISIBLE a l'ecran :
 * la fiche s'affiche a l'identique, seul le balisage change. Aucun controle
 * visuel ne l'attraperait, et une fois indexe le mal est fait.
 *
 * AUCUNE BASE DE DONNEES. Le module sous test est pur, et `EtatDisponibilite`
 * n'est importe qu'en TYPE : un `import type` disparait a la compilation, donc
 * `services/catalogue` et sa `DATABASE_URL` ne sont jamais charges. Motif deja
 * rencontre plusieurs fois sur ce depot, ou une fonction pure prisonniere d'un
 * service reclamait une base pour tester un decoupage de chaine.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EtatDisponibilite } from "@/services/catalogue";
import {
  absolutise,
  disponibiliteDuProduit,
  disponibiliteSchemaOrg,
  jsonLdFilAriane,
  jsonLdOrganisation,
  jsonLdProduit,
  urlDuSite,
} from "@/lib/seo";

const SITE = "https://lune-et-soleil.fr";

/*
 * LA VARIABLE EST POSEE ET RESTAUREE PAR TEST. Sans restauration, un test qui
 * l'efface pour verifier le refus laisserait les suivants sur un environnement
 * different du leur, et l'ordre d'execution deviendrait significatif.
 */
let valeurInitiale: string | undefined;

beforeEach(() => {
  valeurInitiale = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
});

afterEach(() => {
  if (valeurInitiale === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = valeurInitiale;
  }
});

describe("urlDuSite", () => {
  it("rend l'adresse configuree", () => {
    expect(urlDuSite()).toBe(SITE);
  });

  it("retire la barre oblique finale, qui doublerait celle du chemin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = `${SITE}/`;
    expect(urlDuSite()).toBe(SITE);
  });

  /*
   * LE REFUS EST TESTE, ET C'EST LE POINT LE PLUS IMPORTANT DE CE BLOC. Une
   * valeur par defaut ferait pointer chaque canonical vers localhost en
   * production : les moteurs SUIVENT le canonical, et le site entier sortirait
   * de l'index sans qu'aucun ecran ne change d'aspect. Motif « secret par defaut
   * de Better Auth », deja en fiche : un repli silencieux laisse le build
   * reussir sur une configuration fausse.
   */
  it("leve quand la variable est absente, plutot que de replier sur localhost", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(() => urlDuSite()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("leve sur une valeur vide, qui passerait une simple verification de presence", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    expect(() => urlDuSite()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});

describe("absolutise", () => {
  it("compose une URL absolue a partir d'un chemin", () => {
    expect(absolutise("/catalogue")).toBe(`${SITE}/catalogue`);
  });

  it("rend la racine sans barre oblique finale", () => {
    expect(absolutise("/")).toBe(SITE);
  });

  /*
   * SANS CETTE GARDE, « catalogue » produirait « https://lune-et-soleil.frcatalogue »,
   * une adresse plausible que rien ne signale. Motif « chaine construite a
   * l'execution », deja en fiche sur ce depot.
   */
  it("refuse un chemin sans barre oblique initiale", () => {
    expect(() => absolutise("catalogue")).toThrow(/Chemin interne/);
  });
});

describe("disponibiliteSchemaOrg", () => {
  it("traduit En stock", () => {
    expect(disponibiliteSchemaOrg("EN_STOCK")).toBe(
      "https://schema.org/InStock",
    );
  });

  it("traduit Epuise", () => {
    expect(disponibiliteSchemaOrg("EPUISE")).toBe(
      "https://schema.org/OutOfStock",
    );
  });

  /*
   * LE TEST CENTRAL DE LA STORY, critere 2 et sa preuve par mutation.
   *
   * « Derniere piece » ET « En stock » DOIVENT ETRE INDISTINGUABLES dans le
   * balisage. Les separer, par `LimitedAvailability` par exemple, dirait a tout
   * agregateur lisant le JSON-LD qu'il reste exactement une piece : c'est la
   * quantite exacte, publiee par un autre chemin que l'ecran.
   */
  it("rend « derniere piece » indistinguable de « en stock »", () => {
    expect(disponibiliteSchemaOrg("DERNIERE_PIECE")).toBe(
      disponibiliteSchemaOrg("EN_STOCK"),
    );
  });
});

describe("disponibiliteDuProduit", () => {
  it("retient En stock des qu'une variante l'est", () => {
    expect(
      disponibiliteDuProduit(["EPUISE", "EN_STOCK", "DERNIERE_PIECE"]),
    ).toBe("EN_STOCK");
  });

  it("retient Derniere piece quand aucune variante n'est mieux", () => {
    expect(disponibiliteDuProduit(["EPUISE", "DERNIERE_PIECE"])).toBe(
      "DERNIERE_PIECE",
    );
  });

  it("rend Epuise quand toutes les variantes le sont", () => {
    expect(disponibiliteDuProduit(["EPUISE", "EPUISE"])).toBe("EPUISE");
  });

  /*
   * UN PRODUIT SANS VARIANTE PROPOSEE EST EPUISE, ET NON « EN STOCK ». Le cas
   * s'atteint reellement : toutes les variantes archivees, C13 les excluant de
   * la fiche. Un repli par defaut sur « disponible » promettrait a l'index un
   * bijou que la fiche affiche comme indisponible.
   */
  it("rend Epuise sur une liste vide, sans replier sur disponible", () => {
    expect(disponibiliteDuProduit([])).toBe("EPUISE");
  });
});

describe("jsonLdOrganisation", () => {
  it("porte le type et l'adresse du site", () => {
    const balisage = jsonLdOrganisation();
    expect(balisage["@type"]).toBe("Organization");
    expect(balisage["url"]).toBe(SITE);
  });
});

describe("jsonLdFilAriane", () => {
  const maillons = [
    { nom: "Accueil", chemin: "/" },
    { nom: "Le catalogue", chemin: "/catalogue" },
    { nom: "Collier Aurore", chemin: "/produit/collier-aurore" },
  ];

  /*
   * LES POSITIONS COMMENCENT A 1, schema.org l'imposant. Un index de tableau non
   * decale rend une liste commencant a 0 : muette a la lecture, rejetee par les
   * validateurs.
   */
  it("numerote les positions a partir de 1", () => {
    const elements = jsonLdFilAriane(maillons)["itemListElement"] as {
      position: number;
    }[];
    expect(elements.map((element) => element.position)).toEqual([1, 2, 3]);
  });

  it("absolutise chaque maillon", () => {
    const elements = jsonLdFilAriane(maillons)["itemListElement"] as {
      item: string;
    }[];
    expect(elements.map((element) => element.item)).toEqual([
      SITE,
      `${SITE}/catalogue`,
      `${SITE}/produit/collier-aurore`,
    ]);
  });
});

describe("jsonLdProduit", () => {
  const produit = {
    nom: "Collier Aurore",
    slug: "collier-aurore",
    descriptionCourte: "Un collier en laiton dore.",
    categorieNom: "Colliers",
    prixCentimes: 4250,
    disponibilite: "DERNIERE_PIECE" as EtatDisponibilite,
    photoChemin: "/medias/collier-aurore-640.jpeg",
  };

  it("porte le type Product et l'URL canonique de la fiche", () => {
    const balisage = jsonLdProduit(produit);
    expect(balisage["@type"]).toBe("Product");
    expect(balisage["url"]).toBe(`${SITE}/produit/collier-aurore`);
  });

  /*
   * LA CONVERSION EN EURO EST LA SEULE DU PROJET, et elle est terminale :
   * schema.org attend « 42.50 ». L'invariant 1 interdit le flottant dans un
   * CALCUL, il n'y en a aucun ici.
   */
  it("exprime le prix en euro a deux decimales, depuis les centimes", () => {
    const offre = jsonLdProduit(produit)["offers"] as { price: string };
    expect(offre.price).toBe("42.50");
  });

  it("conserve les deux decimales sur un montant rond", () => {
    const offre = jsonLdProduit({ ...produit, prixCentimes: 4000 })[
      "offers"
    ] as { price: string };
    expect(offre.price).toBe("40.00");
  });

  it("declare la devise en euro", () => {
    const offre = jsonLdProduit(produit)["offers"] as { priceCurrency: string };
    expect(offre.priceCurrency).toBe("EUR");
  });

  it("absolutise le chemin de la photographie", () => {
    expect(jsonLdProduit(produit)["image"]).toBe(
      `${SITE}/medias/collier-aurore-640.jpeg`,
    );
  });

  /*
   * OMIS ET NON `null`. Un `description: null` est une valeur presente et vide
   * pour un validateur, la ou l'absence de cle est l'absence d'information.
   */
  it("omet la description quand elle est absente, plutot que de poser null", () => {
    const balisage = jsonLdProduit({ ...produit, descriptionCourte: null });
    expect("description" in balisage).toBe(false);
  });

  it("omet l'image quand aucune photographie n'existe", () => {
    const balisage = jsonLdProduit({ ...produit, photoChemin: null });
    expect("image" in balisage).toBe(false);
  });

  /*
   * ------------------------------------------------------------------
   * LA GARDE CENTRALE DE LA STORY, critere 2.
   *
   * Le balisage ne doit porter AUCUNE quantite, sous aucun nom. Ce test ne
   * cherche pas une cle precise, il inspecte le JSON serialise entier a la
   * recherche des noms par lesquels une quantite pourrait entrer.
   *
   * POURQUOI LE JSON ENTIER ET NON LES CLES DE PREMIER NIVEAU. Une quantite
   * s'ajoute naturellement dans `offers`, donc au deuxieme niveau : un controle
   * sur `Object.keys(balisage)` resterait vert sur exactement le defaut qu'il
   * pretend attraper. Motif « compter ne verifie pas le contenu », en fiche.
   * ------------------------------------------------------------------
   */
  it("ne publie aucune quantite, sous aucun nom schema.org", () => {
    const serialise = JSON.stringify(jsonLdProduit(produit));

    for (const interdit of [
      "inventoryLevel",
      "availableQuantity",
      "quantite",
      "quantity",
      "stockLevel",
      "eligibleQuantity",
    ]) {
      expect(serialise).not.toContain(interdit);
    }
  });

  /*
   * ET LE VERSANT POSITIF DU MEME CRITERE. Le test ci-dessus resterait vert sur
   * un balisage vide : celui-ci exige que la disponibilite soit bien LA, et
   * qu'elle soit celle qui masque la derniere piece.
   */
  it("publie une disponibilite, et c'est celle qui masque la derniere piece", () => {
    const offreDerniere = jsonLdProduit(produit)["offers"] as {
      availability: string;
    };
    const offreStock = jsonLdProduit({
      ...produit,
      disponibilite: "EN_STOCK",
    })["offers"] as { availability: string };

    expect(offreDerniere.availability).toBe("https://schema.org/InStock");
    expect(offreDerniere.availability).toBe(offreStock.availability);
  });

  it("declare epuise un produit qui l'est", () => {
    const offre = jsonLdProduit({ ...produit, disponibilite: "EPUISE" })[
      "offers"
    ] as { availability: string };
    expect(offre.availability).toBe("https://schema.org/OutOfStock");
  });
});
