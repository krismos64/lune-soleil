/**
 * La page des informations legales, LS-28 et LS-123.
 *
 * CE QUE CE FICHIER PROUVE EN PREMIER : les quatre liens du pied de page
 * atteignent une page reelle. Ils existaient depuis LS-122 et pointaient vers
 * une route inexistante, donc rendaient 404 : c'est le critere d'acceptation de
 * LS-28, « les liens du pied de page pointent vers ces pages reelles, aucun href
 * vide ni diese ».
 *
 * LA NAVIGATION SE FAIT AU CLIC, jamais par `page.goto` sur l'URL en dur. Un
 * test qui atteint toujours sa cible directement ne peut pas decouvrir qu'aucun
 * chemin n'y mene, motif de LS-162 : l'absence totale de menu d'administration
 * n'avait fait rougir aucune assertion pendant huit stories.
 *
 * LES CONTENUS OBLIGATOIRES SONT VERIFIES SUR LEUR SUBSTANCE, pas sur leur
 * presence. Le delai de quatorze jours, la charge des frais de retour et la
 * garantie de deux ans sont les trois mentions dont l'absence coute le plus :
 * l'article L221-20 porte le delai de retractation a douze mois quand
 * l'information est incorrecte.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * Les quatre liens du pied de page, avec la section qu'ils doivent atteindre.
 *
 * LA LISTE EST ECRITE ICI PLUTOT QU'IMPORTEE DU COMPOSANT, deliberement : une
 * assertion qui lit la meme constante que le code verifie sa coherence avec
 * lui-meme et reste verte si les deux changent ensemble.
 */
const LIENS_PIED = [
  { libelle: "Mentions légales", titre: "Mentions légales" },
  { libelle: "Conditions de vente", titre: "Conditions générales de vente" },
  {
    libelle: "Confidentialité",
    titre: "Confidentialité et données personnelles",
  },
  { libelle: "Rétractation", titre: "Droit de rétractation" },
] as const;

/**
 * Les liens du pied vers la page d'aide, LS-123.
 *
 * ILS SONT DANS UNE LISTE SEPAREE parce qu'ils mènent à une AUTRE page : les
 * confondre avec les quatre precedents ferait passer le test tant qu'une seule
 * des deux pages existe.
 */
const LIENS_AIDE = [
  { libelle: "Livraison et retours", titre: "Livraison" },
  { libelle: "Questions fréquentes", titre: "Questions fréquentes" },
] as const;

test("les quatre liens du pied de page atteignent une page réelle", async ({
  page,
}) => {
  for (const lien of LIENS_PIED) {
    await page.goto("/");

    /*
     * LE LIEN EST CHERCHE DANS LE PIED, jamais dans toute la page : « Contact »
     * et « Rétractation » peuvent apparaitre ailleurs, et un selecteur global
     * trouverait le mauvais element sans que rien ne le dise.
     */
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: lien.libelle })
      .click();

    await expect(page).toHaveURL(/\/informations-legales/);

    await expect(
      page.getByRole("heading", { name: lien.titre, level: 2 }),
    ).toBeVisible();
  }
});

test("les deux liens d'aide du pied de page atteignent leur section", async ({
  page,
}) => {
  for (const lien of LIENS_AIDE) {
    await page.goto("/");

    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: lien.libelle })
      .click();

    await expect(page).toHaveURL(/\/aide/);

    await expect(
      page.getByRole("heading", { name: lien.titre, level: 2 }),
    ).toBeVisible();
  }
});

/**
 * LA PAGE D'AIDE N'ANNONCE AUCUN DELAI D'EXPEDITION, et ce test le VERIFIE
 * plutot que de faire confiance a la relecture.
 *
 * Les questions 38 a 42 de la fiche exploitante sont sans reponse : annoncer
 * « expedition sous 24 heures » sans pouvoir le tenir serait une pratique
 * commerciale trompeuse, articles L121-2 et suivants. Le jour ou le delai sera
 * connu, ce test devra etre reecrit, ce qui est le comportement voulu.
 */
test("la page d'aide n'invente aucun délai d'expédition", async ({ page }) => {
  await page.goto("/aide");

  const texte = (await page.getByRole("main").textContent()) ?? "";

  expect(texte).not.toMatch(/sous \d+ ?(heures?|h|jours?)/i);
  expect(texte).toMatch(/délai de préparation.*sera précisé/i);
});

test("la page d'aide affiche les trois modes et leurs tarifs", async ({
  page,
}) => {
  await page.goto("/aide#livraison");

  const section = page.locator("#livraison");
  const texte = (await section.textContent()) ?? "";

  /*
   * LES TROIS MODES D'ADR-025, et les deux tarifs distincts : un seul tarif
   * affiche signalerait que la page a ete ecrite en dur au lieu de lire la
   * configuration.
   */
  expect(texte).toMatch(/Point Relais/);
  expect(texte).toMatch(/Locker/);
  expect(texte).toMatch(/domicile/i);
  expect(texte).toMatch(/4,10/);
  expect(texte).toMatch(/4,99/);
});

test("la page d'aide ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/aide");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation d'accessibilité sur la page d'aide", async ({
  page,
}) => {
  await page.goto("/aide");

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});

/**
 * LE STATUT EST VERIFIE, PAS SEULEMENT L'ASPECT DE LA PAGE.
 *
 * Motif de LS-111 : un `loading.tsx` mal place laisse un 200 sur une page qui
 * devrait rendre 404, et le defaut est invisible a l'ecran. Ici l'inverse est
 * verifie, la page doit bien repondre 200.
 */
test("la page répond 200", async ({ page }) => {
  const reponse = await page.goto("/informations-legales");

  expect(reponse?.status()).toBe(200);
});

/**
 * LES TROIS MENTIONS DONT L'ABSENCE COUTE LE PLUS.
 *
 * L'article L221-20 porte le delai de retractation a DOUZE MOIS quand
 * l'information sur ce droit est incorrecte ou absente. Ces assertions portent
 * donc sur la substance des textes, jamais sur la seule presence d'un titre.
 */
test("les mentions obligatoires du droit de rétractation sont présentes", async ({
  page,
}) => {
  await page.goto("/informations-legales#retractation");

  const section = page.locator("#retractation");

  /*
   * LE DELAI EST CHERCHE SUR LE TEXTE COMPLET DE LA SECTION, jamais par
   * `getByText` sur un fragment : « quatorze jours » est dans un `<strong>`, ce
   * qui coupe le noeud de texte, et le selecteur ne trouvait donc pas la phrase
   * qui l'entoure. Un test qui echoue sur la MISE EN FORME d'une mention
   * obligatoire accuse le contenu a la place du selecteur.
   */
  const texteSection = (await section.textContent()) ?? "";

  /* Le delai, et son point de depart : la RECEPTION, jamais l'expedition. */
  expect(texteSection).toMatch(/quatorze jours/i);
  expect(texteSection).toMatch(/à compter de la réception/i);

  /*
   * LA CHARGE DES FRAIS DE RETOUR, article L221-23 : le client ne les supporte
   * QUE s'il en a ete informe, et la charge de la preuve pese sur le vendeur.
   */
  expect(texteSection).toMatch(/frais de retour sont à votre charge/i);

  /*
   * LA GARANTIE LEGALE DE CONFORMITE, article L217-3, DISTINGUEE de la
   * retractation : deux ans, et frais de retour a la charge du vendeur. Les
   * confondre est une source classique de litige, et facturer le retour sur un
   * defaut serait fautif.
   */
  expect(texteSection).toMatch(/deux ans/i);
  expect(texteSection).toMatch(/garantie légale de conformité/i);
});

/**
 * L'ABSENCE DE MEDIATEUR EST DITE, elle n'est pas masquee.
 *
 * L'exploitante n'en a designe aucun au 3 septembre 2026, LS-19. La section
 * doit donc annoncer une designation en cours plutot que de rester vide : une
 * section muette laisserait croire que l'obligation de l'article L612-1 est
 * remplie.
 *
 * CE TEST DEVIENDRA FAUX QUAND LE MEDIATEUR SERA DESIGNE, et c'est voulu : il
 * faudra alors verifier ses coordonnees, ce qui est le comportement cible.
 */
test("la section médiation dit son état tant qu'aucun médiateur n'est désigné", async ({
  page,
}) => {
  await page.goto("/informations-legales#cgv");

  await expect(
    page.getByRole("heading", { name: "Médiation de la consommation" }),
  ).toBeVisible();

  await expect(
    page.getByText(/adhésion à un dispositif de médiation.*en cours/i),
  ).toBeVisible();
});

/**
 * LA FICHE PRODUIT RENVOIE VERS LA PAGE, ce qu'elle ne faisait pas.
 *
 * LS-105 avait deliberement omis ce lien, la page n'existant pas : le poser
 * d'avance aurait rendu 404 sur l'ecran ou le client decide d'acheter.
 */
test("la fiche produit renvoie vers le détail de la rétractation", async ({
  page,
}) => {
  /*
   * LA FICHE VIENT DE LA FIXTURE, jamais du « premier lien du catalogue » : ce
   * selecteur-la trouvait un lien de navigation et non une fiche, donc le test
   * echouait sur une page qui ne portait pas le bloc legal.
   */
  await page.goto(`/produit/${CATALOGUE_TEST.enStock.slug}`);

  const lien = page.getByRole("link", {
    name: "Détail du droit de rétractation",
  });

  await expect(lien).toBeVisible();
  await lien.click();

  await expect(page).toHaveURL(/informations-legales#retractation/);
});

test("la page ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/informations-legales");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation d'accessibilité", async ({ page }) => {
  await page.goto("/informations-legales");

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});
