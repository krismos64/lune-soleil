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

/*
 * LES DEUX ROUTES A JETON SIGNE, LS-134 et LS-61.
 *
 * ELLES SONT LE CAS LE PLUS EXPOSE DE LA REGLE C32 : toutes deux appellent
 * `notFound()` sur un jeton qui ne resout rien, et toutes deux vivent sous un
 * segment dynamique ou un `loading.tsx` pose par mégarde ferait rendre 200.
 * Le statut est alors FAUX sans que la page change d'aspect, donc invisible a
 * l'oeil comme en revue de diff.
 *
 * LA VALEUR EST SYNTAXIQUEMENT PLAUSIBLE mais non signee : elle traverse la
 * verification de forme et echoue sur la SIGNATURE, ce qui exerce le chemin
 * reel plutot que le rejet trivial d'une chaine vide.
 */
const JETON_INVALIDE = "valeur-forgee-non-signee.signature-inventee";

for (const route of ["/retractation", "/avis"] as const) {
  test(`${route} rend un 404 reel sur un jeton non signe`, async ({ page }) => {
    const reponse = await page.goto(`${route}/${JETON_INVALIDE}`);

    /*
     * 404 ET NON 403, invariant 2 : un « acces refuse » confirmerait qu'une
     * commande existe derriere ce jeton. Les deux routes rendent donc la meme
     * chose a un inconnu qu'a une valeur forgee.
     */
    expect(reponse?.status()).toBe(404);
  });
}

/*
 * LE SIGNALEMENT D'AVIS, LS-77, article L111-7-2.
 *
 * ELLE DESIGNE SON AVIS PAR UN PARAMETRE DE REQUETE et non par un segment, donc
 * les deux formes de defaut se testent : parametre absent, et identifiant qui ne
 * resout aucun avis PUBLIE. Les deux doivent rendre 404, jamais un 200 portant
 * un formulaire inutilisable.
 *
 * `notFound()` ET NON UNE PAGE DE REFUS : accepter un signalement sur un avis
 * non publie confirmerait son existence a quelqu'un qui n'a pas pu le lire, ce
 * qui ferait de cet ecran un oracle sur la file de moderation.
 */
test("/avis/signaler rend un 404 reel sans parametre", async ({ page }) => {
  const reponse = await page.goto("/avis/signaler");

  expect(reponse?.status()).toBe(404);
});

test("/avis/signaler rend un 404 reel sur un avis inconnu", async ({
  page,
}) => {
  const reponse = await page.goto(
    "/avis/signaler?avis=00000000-0000-4000-8000-000000000000",
  );

  expect(reponse?.status()).toBe(404);
});

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

/**
 * `/admin` mene a la connexion de l'administration, LS-175.
 *
 * POURQUOI CE TEST. Une redirection de `next.config.ts` ne casse RIEN quand elle
 * disparait : `/admin` rendrait un 404 ordinaire, et aucun autre test ne le
 * verrait. Elle existe pour une personne unique qui l'emploie sur son signet,
 * donc son absence se decouvrirait le jour ou elle en a besoin.
 */
test("/admin mene a la connexion de l'administration", async ({ page }) => {
  await page.goto("/admin");

  // L'URL FINALE EST LE POINT DECISIF. Verifier le contenu ne distinguerait pas
  // une redirection d'une page qui rendrait le meme formulaire ailleurs.
  await expect(page).toHaveURL(/\/administration\/connexion$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Administration",
  );
});

/**
 * LA REDIRECTION N'ACCORDE RIEN, invariant 2.
 *
 * Un raccourci qui contournerait la garde serait exactement le defaut qu'une
 * URL courte vers une administration invite a commettre. La page de destination
 * exige une session au role `ADMINISTRATRICE` : sans session, elle rend son
 * ecran de connexion et rien d'autre.
 */
test("/admin n'ouvre aucun ecran d'administration sans session", async ({
  page,
}) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/administration\/connexion$/);
  // Aucune rubrique de la barre d'administration n'est rendue : elle n'existe
  // que pour une session au bon role.
  await expect(
    page.getByRole("link", { name: "Tableau de bord" }),
  ).toBeHidden();
});
