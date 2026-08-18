/**
 * Catalogue public rendu, aux trois largeurs. LS-104.
 *
 * PREMIER ECRAN PUBLIC REEL DU PROJET, et le premier que des clients verront.
 * Les tests d'integration exercent le service sur base reelle, ils ne disent
 * rien de ce que la personne VOIT : ni le debordement a 320 px, ni les badges,
 * ni l'etat vide.
 *
 * AUCUNE SESSION ICI. Le catalogue est public, et le declarer sans
 * `storageState` verifie au passage qu'il ne demande aucune authentification :
 * une garde ajoutee par erreur ferait rougir tout ce fichier.
 *
 * LES DONNEES VIENNENT DE LA PREPARATION, `session-administration.setup.ts`,
 * qui pose trois pieces publiees dans deux categories, plus un BROUILLON qui ne
 * doit jamais apparaitre.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { declinaisonsAttendues } from "@/integrations/medias/traitement";

import { CATALOGUE_TEST, PRODUIT_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/** Les declinaisons que le traitement ecrit reellement, ADR-007. */
const DECLINAISONS_PRODUITES = declinaisonsAttendues();

test("le catalogue s'affiche sans session et rend les pieces publiees", async ({
  page,
}) => {
  await page.goto("/catalogue");

  await expect(
    page.getByRole("heading", { name: "Le catalogue", level: 1 }),
  ).toBeVisible();

  for (const piece of [
    CATALOGUE_TEST.enStock,
    CATALOGUE_TEST.dernierePiece,
    CATALOGUE_TEST.epuise,
  ]) {
    await expect(page.getByRole("heading", { name: piece.nom })).toBeVisible();
  }
});

/*
 * LE TEST QUI COMPTE LE PLUS DE CE FICHIER. Un brouillon porte du travail en
 * cours et des prix non arretes : le laisser fuir publierait ce que
 * l'exploitante n'a pas decide de publier.
 *
 * Il double le test d'integration a dessein : celui-ci verifie le SERVICE, ce
 * test verifie ce qui atterrit dans le HTML servi, y compris masque.
 */
test("aucun produit en brouillon n'apparait dans le HTML servi", async ({
  page,
}) => {
  const reponse = await page.goto("/catalogue");
  const corps = (await reponse?.text()) ?? "";

  expect(corps).not.toContain(PRODUIT_TEST.nom);
  expect(corps).not.toContain(PRODUIT_TEST.slug);
});

/*
 * AUCUNE QUANTITE EXACTE DANS LE HTML. Le service ne la rend deja pas, ce test
 * ferme le second versant : une quantite transmise puis masquee en CSS resterait
 * lisible dans la source de la page.
 */
test("aucune quantite exacte ne fuite dans le HTML", async ({ page }) => {
  const reponse = await page.goto("/catalogue");
  const corps = (await reponse?.text()) ?? "";

  expect(corps).not.toContain("quantitePhysique");
  expect(corps).not.toContain("quantiteDisponible");
  expect(corps).not.toContain("quantiteReservee");
});

test("les trois etats de disponibilite s'affichent", async ({ page }) => {
  await page.goto("/catalogue");

  const carteEnStock = page.locator("li", {
    has: page.getByRole("heading", { name: CATALOGUE_TEST.enStock.nom }),
  });
  const carteUnique = page.locator("li", {
    has: page.getByRole("heading", { name: CATALOGUE_TEST.dernierePiece.nom }),
  });
  const carteEpuisee = page.locator("li", {
    has: page.getByRole("heading", { name: CATALOGUE_TEST.epuise.nom }),
  });

  await expect(carteEnStock).toContainText("En stock");
  await expect(carteUnique).toContainText("Dernière pièce");
  await expect(carteEpuisee).toContainText("Épuisé");
});

test("le prix est affiche en euros a partir des centimes", async ({ page }) => {
  await page.goto("/catalogue");

  const carte = page.locator("li", {
    has: page.getByRole("heading", { name: CATALOGUE_TEST.dernierePiece.nom }),
  });

  // 12900 centimes, jamais « 12900 » ni « 129 » nu.
  await expect(carte).toContainText("129,00");
});

test("le filtrage par categorie ne garde que ses pieces", async ({ page }) => {
  await page.goto(`/catalogue?categorie=${CATALOGUE_TEST.categorieB.slug}`);

  await expect(
    page.getByRole("heading", { name: CATALOGUE_TEST.epuise.nom }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: CATALOGUE_TEST.enStock.nom }),
  ).toHaveCount(0);
});

/*
 * LE FILTRE ACTIF S'ANNONCE, LS-85. La couleur dit a l'oeil quel filtre est
 * retenu, `aria-current` le dit a qui ecoute : sans lui, rien ne distingue le
 * filtre courant des autres pour un lecteur d'ecran.
 */
test("le filtre retenu porte aria-current", async ({ page }) => {
  await page.goto(`/catalogue?categorie=${CATALOGUE_TEST.categorieA.slug}`);

  /*
   * LE SELECTEUR EST ANCRE DANS LA BARRE DE FILTRES, et la premiere version ne
   * l'etait pas. `getByRole("link", { name: "TEST Catégorie A" })` trouvait
   * TROIS elements : le filtre, mais aussi les deux cartes de cette categorie,
   * dont le nom accessible concatene le nom du produit et celui de sa categorie.
   *
   * Le test echouait donc en « strict mode violation » sur un code correct,
   * l'attribut etant bien pose sur le premier des trois.
   */
  const barre = page.getByRole("navigation", { name: "Filtrer par catégorie" });

  await expect(
    barre.getByRole("link", { name: CATALOGUE_TEST.categorieA.nom }),
  ).toHaveAttribute("aria-current", "page");

  // Et « Tout voir » ne le porte plus.
  await expect(
    barre.getByRole("link", { name: "Tout voir" }),
  ).not.toHaveAttribute("aria-current", "page");
});

/*
 * UN SLUG INCONNU NE PRODUIT PAS D'ERREUR. Une URL partagee apres qu'une
 * categorie a ete renommee doit montrer la boutique : le visiteur n'a rien fait
 * de mal, et une 404 ici renseignerait sur les categories existantes.
 */
test("un slug de categorie inconnu rend le catalogue entier", async ({
  page,
}) => {
  const reponse = await page.goto("/catalogue?categorie=nexiste-pas-du-tout");

  expect(reponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: CATALOGUE_TEST.enStock.nom }),
  ).toBeVisible();
});

/*
 * LE TRI PAR NOUVEAUTES SE MESURE SUR L'ORDRE DES CARTES, et la premiere
 * version de ce test comparait les ORDONNEES. Elle passait a 320 et 390 px, ou
 * la grille est sur une colonne, et echouait a 1280 px ou les trois pieces
 * partagent la meme ligne, donc la meme ordonnee au pixel pres.
 *
 * L'ordre du DOM est ce que le tri produit reellement, et la grille le suit :
 * `auto-fill` remplit de gauche a droite puis ligne par ligne. Comparer les
 * positions verticales mesurait la mise en page, pas le tri.
 */
test("les nouveautes sortent en tete", async ({ page }) => {
  await page.goto("/catalogue");

  const noms = await page.locator("ul li h2").allTextContents();

  // Les trois pieces publiees, de la plus recente a la plus ancienne :
  // 10 aout, 1er aout, 1er juillet.
  expect(noms).toEqual([
    CATALOGUE_TEST.dernierePiece.nom,
    CATALOGUE_TEST.enStock.nom,
    CATALOGUE_TEST.epuise.nom,
  ]);
});

test("le catalogue ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/catalogue");
  await expect(
    page.getByRole("heading", { name: "Le catalogue", level: 1 }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le catalogue filtre ne deborde pas horizontalement", async ({ page }) => {
  await page.goto(`/catalogue?categorie=${CATALOGUE_TEST.categorieA.slug}`);
  await expect(
    page.getByRole("heading", { name: "Le catalogue", level: 1 }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le catalogue ne porte aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto("/catalogue");
  await expect(
    page.getByRole("heading", { name: "Le catalogue", level: 1 }),
  ).toBeVisible();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/*
 * L'ETAT VIDE, ET IL N'EST JAMAIS UNE GRILLE VIDE.
 *
 * IL SE DISTINGUE D'UN SLUG INCONNU, et la nuance est celle qu'un test
 * d'integration a imposee au service. Un slug qui ne correspond a rien rend le
 * catalogue entier ; une categorie qui EXISTE mais dont plus aucune piece n'est
 * vendable doit dire « aucune piece » et proposer d'effacer le filtre.
 *
 * LA CATEGORIE VIDE EST POSEE PAR LA PREPARATION, `CATALOGUE_TEST.categorieVide`
 * : elle existe en base, elle ne porte aucun produit. Une categorie creee puis
 * detruite par ce test polluerait la barre de filtres des autres pendant son
 * existence, les tests des trois largeurs s'executant en parallele.
 */
test("une categorie vide affiche un texte et une action, jamais une grille vide", async ({
  page,
}) => {
  await page.goto(`/catalogue?categorie=${CATALOGUE_TEST.categorieVide.slug}`);

  // AUCUNE CARTE, et pas seulement « moins de cartes ».
  await expect(
    page.getByRole("heading", { name: CATALOGUE_TEST.enStock.nom }),
  ).toHaveCount(0);

  /*
   * LA CATEGORIE EST NOMMEE, et c'est une correction de la revue. La premiere
   * version disait « aucune piece dans cette categorie » sans jamais dire
   * LAQUELLE : le nom etait cherche dans la liste des categories PROPOSEES au
   * filtre, qui exclut par construction celle qu'on filtre quand elle est vide.
   * Le visiteur lisait un message sur une categorie anonyme.
   */
  await expect(
    page.getByText(
      new RegExp(
        `Aucune pièce dans ${CATALOGUE_TEST.categorieVide.nom} pour le moment`,
        "i",
      ),
    ),
  ).toBeVisible();

  // LE COMPTE LA NOMME AUSSI, meme a zero produit : le ternaire ne traitait le
  // cas nomme que pour les catalogues non vides.
  await expect(page.getByRole("status")).toContainText(
    CATALOGUE_TEST.categorieVide.nom,
  );

  // L'ACTION DE SORTIE EXISTE ET FONCTIONNE : sans elle, le visiteur devrait
  // comprendre l'URL pour revenir au catalogue.
  const sortie = page.getByRole("link", { name: "Voir tout le catalogue" });
  await expect(sortie).toBeVisible();

  await sortie.click();
  await expect(
    page.getByRole("heading", { name: CATALOGUE_TEST.enStock.nom }),
  ).toBeVisible();
});

test("l'etat vide ne deborde pas et reste accessible", async ({ page }) => {
  await page.goto(`/catalogue?categorie=${CATALOGUE_TEST.categorieVide.slug}`);
  await expect(
    page.getByText(
      new RegExp(
        `Aucune pièce dans ${CATALOGUE_TEST.categorieVide.nom} pour le moment`,
        "i",
      ),
    ),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/*
 * LA CARTE AVEC PHOTO, ET SES TROIS SOURCES. LS-104, releve en revue.
 *
 * CE BLOC EXISTE PARCE QUE LE `<picture>` N'ETAIT EXECUTE PAR AUCUN TEST. La
 * preparation ne posait aucune ligne `media`, donc les trois cartes empruntaient
 * toutes la branche « image absente » : un `srcSet` mal forme, une largeur
 * absente ou un format renomme n'auraient fait rougir personne.
 *
 * C'est le motif exact du defaut deja rencontre sur ce projet, une URL de
 * vignette portant `640.jpg` quand le traitement ecrit `640.jpeg` : une chaine
 * construite a l'execution et confrontee a rien.
 */
test.describe("la carte avec photo", () => {
  test("rend un picture a trois sources et un repli JPEG", async ({ page }) => {
    await page.goto("/catalogue");

    const carte = page.locator("li", {
      has: page.getByRole("heading", { name: CATALOGUE_TEST.enStock.nom }),
    });

    // LE REPLI EST UN VRAI `<img>`, seul element qu'un navigateur sans AVIF ni
    // WebP sait afficher. Une `<source>` seule rendrait une image cassee.
    const image = carte.locator("img");
    await expect(image).toHaveAttribute(
      "alt",
      CATALOGUE_TEST.mediaEnStock.texteAlternatif,
    );

    const src = await image.getAttribute("src");
    expect(src).toContain(CATALOGUE_TEST.mediaEnStock.chemin);
    // `.jpeg` ET NON `.jpg`, extension REELLEMENT produite par le traitement.
    expect(src).toMatch(/640\.jpeg$/);

    // Les deux formats modernes sont proposes avant le repli, dans cet ordre.
    await expect(carte.locator('source[type="image/avif"]')).toHaveCount(1);
    await expect(carte.locator('source[type="image/webp"]')).toHaveCount(1);
  });

  /*
   * LES URL SONT CONFRONTEES AUX DECLINAISONS REELLEMENT PRODUITES, et non
   * relues a l'oeil. `declinaisonsAttendues()` est la source de verite du
   * traitement : si une largeur y disparait ou change de format, ce test rougit
   * au lieu de laisser des URL mortes en production.
   */
  test("chaque URL servie correspond a une declinaison produite", async ({
    page,
  }) => {
    await page.goto("/catalogue");

    const carte = page.locator("li", {
      has: page.getByRole("heading", { name: CATALOGUE_TEST.enStock.nom }),
    });

    const srcSets = await carte
      .locator("source")
      .evaluateAll((sources) =>
        sources.map((source) => source.getAttribute("srcset") ?? ""),
      );
    const src = (await carte.locator("img").getAttribute("src")) ?? "";

    const urls = [
      ...srcSets.flatMap((jeu) =>
        jeu.split(",").map((entree) => entree.trim().split(/\s+/)[0] ?? ""),
      ),
      src,
    ].filter(Boolean);

    expect(urls.length).toBeGreaterThan(0);

    for (const url of urls) {
      const declinaison = url.split("/").pop() ?? "";
      expect(
        DECLINAISONS_PRODUITES,
        `l'URL ${url} ne correspond a aucune declinaison produite`,
      ).toContain(declinaison);
    }
  });

  test("la carte avec photo ne deborde pas horizontalement", async ({
    page,
  }) => {
    await page.goto("/catalogue");
    await expect(
      page.getByRole("heading", { name: CATALOGUE_TEST.enStock.nom }),
    ).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  /*
   * LES DEUX BRANCHES COEXISTENT : une piece porte une photo, deux n'en portent
   * pas. Une carte sans photo reste affichee, avec un emplacement vide, plutot
   * que de disparaitre du catalogue.
   */
  test("une piece sans photo reste affichee", async ({ page }) => {
    await page.goto("/catalogue");

    const sansPhoto = page.locator("li", {
      has: page.getByRole("heading", { name: CATALOGUE_TEST.epuise.nom }),
    });

    await expect(sansPhoto).toBeVisible();
    await expect(sansPhoto.locator("img")).toHaveCount(0);
  });
});
