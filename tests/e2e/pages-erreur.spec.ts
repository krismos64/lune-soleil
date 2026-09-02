/**
 * Pages d'erreur publiques, de bout en bout. LS-146.
 *
 * CE QUI EST VERIFIE ICI EST LE CODE DE STATUT, ET NON L'APPARENCE DE LA PAGE.
 * C'est le critere 6 de la story, et il porte sur un defaut precis : un
 * `loading.tsx` ajoute sur une route qui appelle `notFound()` fait commencer le
 * streaming Suspense AVANT que l'appel soit atteint, et Next.js laisse alors le
 * statut a 200 en se contentant d'ajouter un `noindex`.
 *
 * La page rendue est visuellement IDENTIQUE dans les deux cas : un test qui
 * cherche le titre « Cette page n'existe pas » reste vert pendant qu'un moteur
 * de recherche indexe une page inexistante en 200. Le SEO est prioritaire sur
 * ce projet, et un statut faux est un defaut de CORRECTION quand un ecran fige
 * n'est qu'un defaut de confort.
 *
 * `verifier-loading-et-404.sh` GARDE LE MEME INVARIANT PAR LE TEXTE, en
 * interdisant un `loading.tsx` a cote d'un `notFound()`. Les deux se
 * completent : le script attrape le fichier avant qu'il soit ecrit, ce test
 * attrape le statut quelle qu'en soit la cause.
 *
 * LES DEUX 404 DE LA FICHE PRODUIT SONT DEJA COUVERTS par
 * `fiche-produit.spec.ts`, brouillon et slug inconnu, depuis LS-111. Ils ne
 * sont pas repris ici : ce fichier porte l'URL SANS ROUTE, que rien ne
 * verifiait, et le rendu des trois pages neuves.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/*
 * UNE URL QUI NE CORRESPOND A AUCUNE ROUTE. Elle est volontairement plausible :
 * un lien partage vers une rubrique disparue ressemble a cela, pas a une chaine
 * aleatoire.
 */
const URL_SANS_ROUTE = "/collections/anciennes-creations";

test("une URL sans route rend un 404 reel et non un 200 habille", async ({
  page,
}) => {
  const reponse = await page.goto(URL_SANS_ROUTE);

  /*
   * L'ASSERTION DE STATUT PASSE AVANT CELLE DU CONTENU, deliberement. Si les
   * deux echouaient, c'est le statut qu'il faut lire en premier : une page
   * correcte servie en 200 est le defaut silencieux que cette story ferme.
   */
  expect(reponse?.status()).toBe(404);

  await expect(
    page.getByRole("heading", { name: "Cette page n'existe pas", level: 1 }),
  ).toBeVisible();
});

test("la page 404 porte l'en-tete, le pied de page et une sortie", async ({
  page,
}) => {
  await page.goto(URL_SANS_ROUTE);

  /*
   * L'EN-TETE ET LE PIED NE SONT PAS HERITES ICI. Ils vivent dans le layout du
   * groupe `(boutique)`, que `app/not-found.tsx` ne traverse pas : la page les
   * compose elle-meme. Les verifier est donc utile, ce n'est pas une redite du
   * test de l'accueil.
   */
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();

  /*
   * LA SORTIE DOIT MENER QUELQUE PART DE REEL. Un 404 qui ne propose que
   * l'accueil laisse repartir de zero ; le catalogue est la reponse utile a
   * « la piece que je cherchais n'est plus la ».
   */
  const versCatalogue = page.getByRole("link", { name: "Voir les créations" });
  await expect(versCatalogue).toBeVisible();

  await versCatalogue.click();
  await expect(page).toHaveURL(/\/catalogue$/);
});

test("la page 404 ne deborde pas horizontalement", async ({ page }) => {
  await page.goto(URL_SANS_ROUTE);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("la page 404 ne porte aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto(URL_SANS_ROUTE);

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/**
 * LE TITRE DE L'ONGLET, qui n'a rien de decoratif sur cette page.
 *
 * Sans metadata propre, la 404 herite du titre de la boutique : un lien mort
 * partage s'annoncerait alors comme la boutique elle-meme, dans l'onglet comme
 * dans l'apercu de partage.
 */
test("la page 404 porte son propre titre", async ({ page }) => {
  await page.goto(URL_SANS_ROUTE);

  await expect(page).toHaveTitle(/introuvable/i);
});

/**
 * AUCUN DETAIL TECHNIQUE NE FUIT, invariant 9.
 *
 * Une trace d'exception, un nom de fichier du serveur ou un identifiant de
 * diagnostic sur une page publique renseignent sur l'infrastructure sans aider
 * le visiteur. Le depot etant public, ce test vaut aussi pour ce qu'il empeche
 * d'ecrire plus tard.
 */
test("la page 404 n'expose aucun detail technique", async ({ page }) => {
  const reponse = await page.goto(URL_SANS_ROUTE);
  const html = (await reponse?.text()) ?? "";

  for (const fuite of [
    "at Object.",
    "node_modules",
    "PrismaClient",
    "digest",
    "webpack",
  ]) {
    expect(html).not.toContain(fuite);
  }
});
