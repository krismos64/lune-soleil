/**
 * Referencement technique sur le HTML reellement servi, LS-137.
 *
 * POURQUOI CE FICHIER EXISTE ALORS QUE `verifier-seo.sh` EST VERT. Le controle
 * textuel constate qu'une cle figure dans un fichier source ; il ne dit RIEN de
 * ce que le serveur rend. Entre les deux il y a `metadataBase`, la resolution
 * des URL relatives, le gabarit de titre du layout et l'heritage entre segments,
 * autant de mecanismes qui peuvent transformer une declaration juste en balise
 * fausse. Un controle textuel ne remplace pas un test d'execution, motif deja en
 * fiche sur ce depot.
 *
 * AUCUNE SESSION ICI. Toutes les pages visitees sont publiques, et l'absence de
 * `storageState` verifie au passage qu'aucune garde n'a ete posee par erreur.
 *
 * LES DONNEES VIENNENT DE `session-administration.setup.ts`, qui pose trois
 * pieces publiees, une categorie vide et un BROUILLON. Ce brouillon est ce qui
 * permet de prouver le critere 3 sans manipuler la base depuis ce fichier.
 *
 * UNE SEULE LARGEUR. Ces tests lisent des balises et jamais un rendu : les
 * rejouer a 320, 768 et 1280 px triplerait la duree pour trois fois la meme
 * assertion. Motif « plafond de debit et suite e2e », en fiche.
 */
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST, PRODUIT_TEST } from "./chemin-session";

/**
 * Lit le contenu du premier bloc JSON-LD d'un type donne.
 *
 * LA PAGE EN PORTE PLUSIEURS, la fiche produit posant `Product` ET
 * `BreadcrumbList`. Prendre le premier `script[type="application/ld+json"]`
 * ferait dependre le test de l'ordre d'ecriture dans le composant.
 */
async function lireJsonLd(
  page: import("@playwright/test").Page,
  type: string,
): Promise<Record<string, unknown>> {
  const blocs = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();

  for (const bloc of blocs) {
    const balisage = JSON.parse(bloc) as Record<string, unknown>;
    if (balisage["@type"] === type) {
      return balisage;
    }
  }

  throw new Error(
    `Aucun bloc JSON-LD de type ${type} dans la page. Types trouves : ` +
      blocs
        .map((bloc) => (JSON.parse(bloc) as { "@type"?: string })["@type"])
        .join(", "),
  );
}

/**
 * L'URL absolue du site, telle que le serveur de test la sert.
 *
 * ELLE VIENT DE `baseURL` ET NON DE `process.env`. Le processus Playwright
 * n'herite pas de l'environnement pose dans `webServer.env` : y lire
 * `NEXT_PUBLIC_SITE_URL` rendrait la valeur de `.env`, donc le port 3000, quand
 * le serveur sert sur 3100. Le test comparerait alors le canonical a une adresse
 * que rien n'a jamais servie, et rougirait sur une configuration correcte.
 *
 * `playwright.config.ts` pose les deux depuis la MEME constante, `URL_BASE` :
 * c'est ce qui garantit que la valeur lue ici est celle que le serveur emploie.
 */
function siteAttendu(baseURL: string | undefined): string {
  if (baseURL === undefined || baseURL === "") {
    throw new Error(
      "baseURL absente de la configuration Playwright : ce test verifie que " +
        "les canoniques sont ABSOLUS, ce qui n'a pas de sens sans adresse de " +
        "reference.",
    );
  }
  return baseURL.replace(/\/+$/, "");
}

test.describe("metadonnees des pages publiques", () => {
  /*
   * LE CANONICAL EST ABSOLU, et c'est ce que `metadataBase` produit. Un
   * canonical relatif servi tel quel serait resolu par les moteurs contre
   * l'hote de la requete : juste par accident tant qu'un seul nom de domaine
   * sert le site, faux des qu'un second apparait. Rien a l'ecran ne le montre.
   */
  test("l'accueil porte un canonical absolu et son Open Graph", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      siteAttendu(baseURL),
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "Lune & Soleil",
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
      "content",
      "fr_FR",
    );
  });

  test("l'accueil porte le JSON-LD Organization", async ({ page, baseURL }) => {
    await page.goto("/");

    const balisage = await lireJsonLd(page, "Organization");
    expect(balisage["url"]).toBe(siteAttendu(baseURL));
  });

  /*
   * CHAQUE FILTRE PORTE SON PROPRE CANONICAL. Un canonical fige a `/catalogue`
   * dirait aux moteurs que la page filtree EST le catalogue complet, et la
   * page filtree sortirait de l'index en emportant les mots-cles de sa
   * categorie.
   */
  test("le catalogue filtre porte le canonical de son filtre", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`/catalogue?categorie=${CATALOGUE_TEST.categorieA.slug}`);

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${siteAttendu(baseURL)}/catalogue?categorie=${CATALOGUE_TEST.categorieA.slug}`,
    );
  });

  /*
   * UN SLUG INCONNU RETOMBE SUR LE CANONICAL NU. Sans cela, chaque slug invente
   * creerait sa propre URL canonique, et un lien errone suffirait a peupler
   * l'index de pages fantomes qui servent toutes le catalogue complet.
   */
  test("un filtre inconnu retombe sur le canonical du catalogue nu", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/catalogue?categorie=slug-qui-nexiste-pas");

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${siteAttendu(baseURL)}/catalogue`,
    );
  });

  /*
   * LE TUNNEL ET LE PANIER NE SONT PAS INDEXABLES, critere 4. Leur contenu vient
   * d'un cookie : pour un robot ils sont vides, et les indexer ferait remonter
   * « Votre panier est vide » sur le nom de la boutique.
   */
  for (const chemin of ["/panier", "/commande"]) {
    test(`${chemin} porte noindex`, async ({ page }) => {
      await page.goto(chemin);

      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
    });
  }
});

test.describe("donnees structurees de la fiche produit", () => {
  /*
   * ------------------------------------------------------------------
   * LE TEST CENTRAL DE LA STORY, critere 2, sur le HTML REELLEMENT SERVI.
   *
   * La piece visee porte EXACTEMENT UNE unite. C'est le cas ou la fuite se
   * produirait : l'ecran affiche « Derniere piece », et un balisage bavard
   * dirait « il en reste 1 » a tout agregateur qui lit le JSON-LD.
   *
   * LE TEST LIT LE BLOC SERIALISE ENTIER et non des cles choisies : une
   * quantite s'ajouterait naturellement dans `offers`, au deuxieme niveau, ou
   * une inspection des cles de premier niveau ne verrait rien.
   * ------------------------------------------------------------------
   */
  test("la fiche d'une piece unique ne publie aucune quantite", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`/produit/${CATALOGUE_TEST.dernierePiece.slug}`);

    const balisage = await lireJsonLd(page, "Product");
    const serialise = JSON.stringify(balisage);

    for (const interdit of [
      "inventoryLevel",
      "availableQuantity",
      "quantity",
      "stockLevel",
    ]) {
      expect(serialise).not.toContain(interdit);
    }

    /*
     * ET LE VERSANT POSITIF. Le test ci-dessus resterait vert sur un balisage
     * vide : celui-ci exige que la disponibilite soit la, et qu'elle soit
     * `InStock`, donc indistinguable d'une piece disponible en plusieurs
     * exemplaires. C'est la traduction fidele de la regle « la quantite exacte
     * n'est pas publique ».
     */
    const offre = balisage["offers"] as {
      availability: string;
      price: string;
      url: string;
    };
    expect(offre.availability).toBe("https://schema.org/InStock");
    expect(offre.price).toBe("129.00");

    /*
     * L'URL DE L'OFFRE EST ABSOLUE. Une URL relative dans un JSON-LD n'a aucune
     * base contre laquelle se resoudre, `metadataBase` ne s'appliquant qu'aux
     * balises `<head>` engendrees par Next.js et jamais au contenu d'un script
     * ecrit par la page.
     */
    expect(offre.url).toBe(
      `${siteAttendu(baseURL)}/produit/${CATALOGUE_TEST.dernierePiece.slug}`,
    );
  });

  test("la fiche porte un fil d'Ariane balise, numerote a partir de 1", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`/produit/${CATALOGUE_TEST.enStock.slug}`);

    const balisage = await lireJsonLd(page, "BreadcrumbList");
    const elements = balisage["itemListElement"] as {
      position: number;
      item: string;
    }[];

    expect(elements.map((element) => element.position)).toEqual([1, 2, 3, 4]);
    expect(elements[0]?.item).toBe(siteAttendu(baseURL));
    expect(elements[3]?.item).toBe(
      `${siteAttendu(baseURL)}/produit/${CATALOGUE_TEST.enStock.slug}`,
    );
  });

  /*
   * UN BROUILLON NE PORTE NI BALISAGE NI TITRE DE PRODUIT. Le 404 est la garde
   * principale ; ce test verifie qu'aucune donnee du produit n'a fuite dans les
   * metadonnees avant lui, ce qui divulguerait l'existence d'un travail en
   * preparation.
   */
  test("un brouillon ne publie ni JSON-LD ni son nom", async ({ page }) => {
    const reponse = await page.goto(`/produit/${PRODUIT_TEST.slug}`);

    expect(reponse?.status()).toBe(404);
    await expect(
      page.locator('script[type="application/ld+json"]'),
    ).toHaveCount(0);
    expect(await page.content()).not.toContain(PRODUIT_TEST.nom);
  });
});

test.describe("sitemap et robots", () => {
  /*
   * LE CRITERE 3, PROUVE SUR LE FICHIER SERVI. Le sitemap ne doit contenir que
   * des produits publies : le brouillon de la preparation est la piece qui le
   * demontre, puisqu'il existe en base et ne doit pas en sortir.
   */
  test("le sitemap liste les pieces publiees et jamais le brouillon", async ({
    request,
  }) => {
    const reponse = await request.get("/sitemap.xml");
    expect(reponse.status()).toBe(200);

    const xml = await reponse.text();

    for (const piece of [
      CATALOGUE_TEST.enStock,
      CATALOGUE_TEST.dernierePiece,
    ]) {
      expect(xml).toContain(`/produit/${piece.slug}`);
    }

    expect(xml).not.toContain(`/produit/${PRODUIT_TEST.slug}`);
  });

  /*
   * LE SITEMAP N'ANNONCE AUCUNE ZONE PRIVEE. Il declare ce qu'on souhaite voir
   * indexe : y faire entrer `/compte` ou `/administration` contredirait le
   * `noindex` de ces pages et le robots.txt d'un seul coup.
   */
  test("le sitemap n'annonce aucune zone privee", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();

    for (const prive of [
      "/administration",
      "/compte",
      "/panier",
      "/commande",
    ]) {
      expect(xml).not.toContain(`${prive}<`);
    }
  });

  test("robots.txt interdit les quatre zones privees et annonce le sitemap", async ({
    request,
  }) => {
    const reponse = await request.get("/robots.txt");
    expect(reponse.status()).toBe(200);

    const texte = await reponse.text();

    for (const zone of ["/administration", "/compte", "/panier", "/commande"]) {
      expect(texte).toContain(`Disallow: ${zone}`);
    }

    expect(texte).toContain("Sitemap:");
    expect(texte).toContain("/sitemap.xml");
  });
});
