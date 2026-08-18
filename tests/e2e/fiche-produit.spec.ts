/**
 * Fiche produit publique, de bout en bout. LS-105.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent le SERVICE : ils disent que `lireFichePublique` refuse un
 * brouillon et filtre les sections. Ils ne disent rien de la PAGE, ni de
 * l'ORDRE des blocs, ni du fait que le choix d'une declinaison met a jour le
 * prix sans recharger.
 *
 * L'ORDRE DES BLOCS EST LE COEUR DE LA STORY, et il ne se verifie qu'ici : une
 * page qui rendrait les onze blocs dans le desordre passerait tous les tests
 * d'integration.
 *
 * AUCUNE DONNEE DU PROTOTYPE, interdit du projet. Les noms viennent de
 * `FICHE_TEST`, prefixes `TEST` et inventes.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST, FICHE_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const CHEMIN_FICHE = `/produit/${CATALOGUE_TEST.enStock.slug}`;

/**
 * L'ORDRE IMPOSE, MESURE SUR LA POSITION VERTICALE REELLE.
 *
 * POURQUOI PAS L'ORDRE DU DOM. A partir de 768 px la grille place la galerie a
 * gauche et l'achat a droite : deux blocs voisins dans le DOM se retrouvent
 * cote a cote, et « l'un avant l'autre » n'a plus le meme sens. La position
 * verticale est ce que le visiteur lit, et c'est elle que la regle decrit,
 * conçue pour un ecran de 320 px ou tout est empile.
 *
 * LE TEST NE COMPARE QUE LES BLOCS DE LA COLONNE D'ACHAT entre eux, plus les
 * blocs editoriaux entre eux : comparer une galerie posee a gauche avec un prix
 * pose a droite mesurerait la mise en page, pas l'ordre.
 */
test("les blocs d'achat se suivent dans l'ordre impose", async ({ page }) => {
  await page.goto(CHEMIN_FICHE);

  const hauteurs: Record<string, number> = {};
  const relever = async (
    nom: string,
    cible: ReturnType<typeof page.locator>,
  ) => {
    const boite = await cible.first().boundingBox();
    expect(boite, `${nom} doit etre visible`).not.toBeNull();
    hauteurs[nom] = boite!.y;
  };

  // Blocs 1 a 8, dans l'ordre de la table de `frontend-design.md`.
  await relever("1-nom", page.getByRole("heading", { level: 1 }));
  await relever("2-presentation", page.getByText(FICHE_TEST.descriptionCourte));
  await relever("3-prix", page.getByText("49,00 €"));
  await relever("4-disponibilite", page.getByText("En stock", { exact: true }));
  await relever(
    "5-declinaison",
    page.getByRole("group", { name: "Déclinaison" }),
  );
  await relever(
    "6-panier",
    page.getByRole("button", { name: "Ajouter au panier" }),
  );
  await relever("7-livraison", page.getByText(/Livraison par Mondial Relay/));
  await relever(
    "8-dimensions",
    page.getByRole("heading", { name: "Dimensions" }),
  );

  const ordreAttendu = [
    "1-nom",
    "2-presentation",
    "3-prix",
    "4-disponibilite",
    "5-declinaison",
    "6-panier",
    "7-livraison",
    "8-dimensions",
  ];

  const ordreObtenu = [...ordreAttendu].sort(
    (a, b) => hauteurs[a]! - hauteurs[b]!,
  );
  expect(ordreObtenu).toEqual(ordreAttendu);
});

/**
 * Les blocs 9 et 10 suivent les blocs d'achat, et le 9 precede le 10.
 *
 * MESURE SEPAREE DU TEST PRECEDENT parce que ces blocs occupent toute la
 * largeur sous les deux colonnes : leur position se compare a celle du dernier
 * bloc d'achat, jamais a la galerie.
 */
test("les blocs editoriaux suivent l'achat, sections puis textes legaux", async ({
  page,
}) => {
  await page.goto(CHEMIN_FICHE);

  const y = async (cible: ReturnType<typeof page.locator>) => {
    const boite = await cible.first().boundingBox();
    expect(boite).not.toBeNull();
    return boite!.y;
  };

  const panier = await y(
    page.getByRole("button", { name: "Ajouter au panier" }),
  );
  const section1 = await y(
    page.getByRole("heading", {
      name: FICHE_TEST.sections.visiblePremiere.titre,
    }),
  );
  const section2 = await y(
    page.getByRole("heading", {
      name: FICHE_TEST.sections.visibleSeconde.titre,
    }),
  );
  const legal = await y(
    page.getByRole("heading", { name: "Retours et rétractation" }),
  );

  expect(section1).toBeGreaterThan(panier);
  // Les sections gardent l'ordre choisi par l'administratrice, ADR-026.
  expect(section2).toBeGreaterThan(section1);
  expect(legal).toBeGreaterThan(section2);
});

/**
 * LE CRITERE 5 DE LA STORY, et il ne se verifie que dans un navigateur : « le
 * choix de variante met a jour prix et disponibilite sans rechargement
 * complet ».
 *
 * L'ABSENCE DE RECHARGEMENT EST PROUVEE PAR UN TEMOIN pose sur la page. Une
 * navigation le detruirait : sans lui, le test passerait aussi bien sur une
 * implementation qui rechargerait tout, ce qui est precisement ce que le
 * critere interdit.
 */
test("choisir une declinaison change prix, disponibilite et dimensions sans recharger", async ({
  page,
}) => {
  await page.goto(CHEMIN_FICHE);

  await page.evaluate(() => {
    (window as unknown as { temoinLS105: boolean }).temoinLS105 = true;
  });

  // Etat initial : la premiere declinaison, en stock.
  await expect(page.getByText("49,00 €")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("En stock");
  await expect(
    page.getByText(FICHE_TEST.varianteEnStock.dimensions),
  ).toBeVisible();

  await page
    .getByRole("radio", { name: FICHE_TEST.varianteEpuisee.libelle })
    .check();

  await expect(page.getByText("54,00 €")).toBeVisible();
  /*
   * LE BADGE EST VISE PAR SON ROLE, et non par son texte. « Épuisé » apparait
   * DEUX fois quand la declinaison l'est : sur le badge de disponibilite et sur
   * le bouton d'ajout, qui prend ce libelle en etant desactive. Un selecteur
   * textuel echoue alors en mode strict, sans rien dire du comportement.
   */
  await expect(page.getByRole("status")).toHaveText("Épuisé");
  await expect(
    page.getByText(FICHE_TEST.varianteEpuisee.dimensions),
  ).toBeVisible();
  await expect(page.getByText("49,00 €")).toHaveCount(0);

  const temoin = await page.evaluate(
    () => (window as unknown as { temoinLS105?: boolean }).temoinLS105 === true,
  );
  expect(temoin, "la page ne doit pas avoir ete rechargee").toBe(true);
});

/**
 * LA FICHE EPUISEE RESTE CONSULTABLE, `PROTOTYPE.md`. Le produit n'est jamais
 * masque, seulement rendu non achetable : retirer le bouton ou la page
 * laisserait le visiteur sans explication, et ferait perdre l'adresse publique.
 */
test("une declinaison epuisee laisse la fiche consultable et le bouton desactive", async ({
  page,
}) => {
  await page.goto(CHEMIN_FICHE);

  await page
    .getByRole("radio", { name: FICHE_TEST.varianteEpuisee.libelle })
    .check();

  const bouton = page.getByRole("button", { name: "Épuisé" });
  await expect(bouton).toBeVisible();
  await expect(bouton).toBeDisabled();

  // Les photographies et le contenu restent servis.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: FICHE_TEST.sections.visiblePremiere.titre,
    }),
  ).toBeVisible();

  /*
   * AUCUNE QUANTITE N'EST AFFICHEE. Le test cherche le mot lui-meme plutot
   * qu'un chiffre : un nombre se confondrait avec un prix ou une dimension.
   */
  const texte = (await page.locator("body").textContent()) ?? "";
  expect(texte).not.toMatch(/en stock\s*:\s*\d/i);
  expect(texte).not.toMatch(/\d+\s+(exemplaires?|pi[eè]ces? disponibles?)/i);
});

/**
 * C22 ET C23 DANS LE HTML SERVI, et non dans le seul retour du service. Une
 * section masquee qui arriverait au navigateur puis serait cachee en CSS serait
 * lisible dans la source : le filtre doit avoir lieu AVANT le rendu.
 */
test("aucune section masquee ni vide n'atteint le HTML servi", async ({
  page,
}) => {
  const reponse = await page.goto(CHEMIN_FICHE);
  const html = (await reponse?.text()) ?? "";

  expect(html).toContain(FICHE_TEST.sections.visiblePremiere.titre);
  expect(html).not.toContain(FICHE_TEST.sections.masquee.titre);
  expect(html).not.toContain(FICHE_TEST.sections.masquee.contenu);
  expect(html).not.toContain(FICHE_TEST.sections.vide.titre);
});

/**
 * LA GARDE DE LA STORY, vue depuis la ROUTE. Le test d'integration prouve que
 * le service rend `null` ; celui-ci prouve que la PAGE en fait un 404, et
 * qu'aucun titre de brouillon ne fuit en chemin.
 */
test("un produit en brouillon rend 404 et ne divulgue rien", async ({
  page,
}) => {
  const reponse = await page.goto("/produit/e2e-ls111-produit-de-controle");

  expect(reponse?.status()).toBe(404);

  const html = (await reponse?.text()) ?? "";
  expect(html).not.toContain("TEST Produit de contrôle LS-111");
});

test("un slug inconnu rend 404", async ({ page }) => {
  const reponse = await page.goto("/produit/nexiste-pas-du-tout");

  expect(reponse?.status()).toBe(404);
});

/**
 * LS-85, LES TROIS VIGNETTES SANS NOM ACCESSIBLE DU PROTOTYPE.
 *
 * LE TEST NE S'EXECUTE QU'AVEC PLUSIEURS PHOTOGRAPHIES, la galerie n'affichant
 * ses vignettes qu'a partir de deux. `skip` plutot qu'une assertion sur zero
 * vignette : annoncer « aucune vignette sans nom » quand il n'y en a aucune
 * serait un test qui passe pour la mauvaise raison.
 */
test("chaque bouton de vignette porte un nom accessible", async ({ page }) => {
  await page.goto(CHEMIN_FICHE);

  const vignettes = page.getByRole("button", { name: /Voir la photo/ });
  const total = await vignettes.count();

  test.skip(
    total === 0,
    "La preparation ne pose qu'une photographie : pas de vignettes a nommer.",
  );

  for (let rang = 0; rang < total; rang += 1) {
    const nom = await vignettes.nth(rang).getAttribute("aria-label");
    expect(nom, `la vignette ${rang + 1} doit porter un nom`).toBeTruthy();
    expect(nom).toContain(CATALOGUE_TEST.enStock.nom);
  }
});

test("la fiche ne deborde pas horizontalement", async ({ page }) => {
  await page.goto(CHEMIN_FICHE);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("la fiche ne porte aucune violation d'accessibilite", async ({ page }) => {
  await page.goto(CHEMIN_FICHE);

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});
