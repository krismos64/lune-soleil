/**
 * Le gabarit de l'espace client et sa barre laterale. LS-180.
 *
 * CE FICHIER MESURE 768 px, QU'AUCUN AUTRE NE MESURE. `playwright.config.ts`
 * porte trois projets de largeur, 320, 390 et 1280, et le manque de 768 est
 * ticketé par LS-166. Or 768 est EXACTEMENT le point de bascule de cette barre :
 * en dessous elle est repliee dans un panneau, au-dessus elle est une colonne
 * permanente. Les trois largeurs existantes mesurent donc les deux etats et
 * JAMAIS la frontiere entre eux, c'est-a-dire le seul endroit ou une erreur
 * d'une unite se voit.
 *
 * POURQUOI PAS UN QUATRIEME PROJET DE LARGEUR, qui serait la reponse evidente.
 * Il rejouerait les 240 tests de la suite a une largeur de plus, faisant passer
 * chaque appel de trois a quatre : LS-177 vient precisement de sortir trois
 * controles longs de la pull request pour ramener une PR de code de 24 a
 * 14 minutes. Ce fichier pose ses propres viewports, ce qui coute trois
 * navigations au lieu de 240 tests. La largeur 768 pour TOUTE la suite reste le
 * sujet de LS-166.
 *
 * LE VIEWPORT EST POSE PAR TEST, `page.setViewportSize`, et non par
 * `test.use()` : les trois projets de largeur rejouent ce fichier eux aussi, et
 * un `test.use` global y serait ecrase par la configuration du projet. Poser la
 * taille DANS le test la rend independante du projet qui l'execute, donc
 * mesuree trois fois a l'identique plutot qu'une fois par hasard.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { FICHIER_SESSION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.use({ storageState: FICHIER_SESSION });

/**
 * La barre laterale, ET RIEN D'AUTRE DE LA PAGE.
 *
 * TOUTE RECHERCHE DE RUBRIQUE PASSE PAR ICI, ET C'EST OBLIGATOIRE. Playwright
 * apparie les noms accessibles PAR SOUS-CHAINE : `getByRole("link", { name:
 * "Mes commandes" })` trouve aussi la tuile « Voir mes commandes » de la vue
 * d'ensemble, qui contient ces deux mots. Sans cet ancrage, le test echoue en
 * violation de mode strict sur une page pourtant correcte.
 *
 * `exact: true` NE SUFFIRAIT PAS ICI. Il fermerait bien ce cas precis, mais la
 * barre et le contenu porteront toujours des libelles voisins : ancrer sur le
 * repere de navigation dit ce qu'on mesure, la BARRE, plutot que de bricoler
 * chaque assertion.
 */
function barre(page: Page) {
  return page.getByRole("navigation", { name: "Sections de mon espace" });
}

/**
 * La largeur a partir de laquelle la barre devient une colonne permanente.
 *
 * ELLE EST ECRITE UNE FOIS ICI ET DOIT VALOIR CELLE DU CSS. Les deux fichiers
 * ne peuvent pas partager une constante, une media query n'acceptant pas de
 * variable CSS dans sa condition : c'est une valeur en double, et le seul
 * remede est que le test echoue si elle diverge, ce qu'il fait.
 */
const BASCULE_PX = 768;

test("sous la bascule, la barre est repliee derriere un bouton", async ({
  page,
}) => {
  await page.setViewportSize({ width: BASCULE_PX - 1, height: 800 });
  await page.goto("/compte");

  const bouton = page.getByRole("button", { name: "Mon espace" });
  await expect(bouton).toBeVisible();

  /*
   * LA BARRE EST HORS DE L'ARBRE D'ACCESSIBILITE, pas seulement invisible.
   *
   * `toBeHidden` NE SUFFIRAIT PAS A PROUVER CE QUI COMPTE. Le CSS emploie
   * `display: none` plutot qu'une hauteur nulle pour une raison precise : un
   * panneau masque doit sortir de l'ORDRE DE TABULATION, sans quoi cinq liens
   * et le bouton de deconnexion se prennent au clavier avant d'atteindre le
   * contenu. C'est le lien de navigation qu'on interroge, donc, et non la boite.
   */
  await expect(
    barre(page).getByRole("link", { name: "Mes commandes" }),
  ).toHaveCount(0);

  await bouton.click();

  await expect(
    barre(page).getByRole("link", { name: "Mes commandes" }),
  ).toBeVisible();
});

test("a la bascule exactement, la barre est une colonne permanente", async ({
  page,
}) => {
  await page.setViewportSize({ width: BASCULE_PX, height: 800 });
  await page.goto("/compte");

  /*
   * A 768 px PILE, ET C'EST LE POINT DE CE FICHIER. `min-width: 768px` inclut
   * 768 : ecrire `min-width: 769px` par erreur, ou mesurer la bascule a 767,
   * laisserait un ecran de tablette exactement a la frontiere avec une barre
   * repliee ET un bouton masque par la media query, donc AUCUNE navigation.
   * Aucune des trois largeurs de la configuration ne peut voir ce cas.
   */
  await expect(
    barre(page).getByRole("link", { name: "Mes commandes" }),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Mon espace" })).toBeHidden();
});

test("l'entree courante est marquee autrement que par la seule couleur", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/compte/commandes");

  /*
   * `aria-current="page"` EST L'ASSERTION, et c'est le critere 2 de la story.
   * Le fond beige et le filet vertical ne sont que des renforts visuels :
   * `frontend-design.md` interdit qu'une information passe par la seule
   * couleur, et un attribut est ce qu'un lecteur d'ecran peut annoncer.
   */
  await expect(
    barre(page).getByRole("link", { name: "Mes commandes" }),
  ).toHaveAttribute("aria-current", "page");

  /*
   * LA VUE D'ENSEMBLE NE DOIT PAS ETRE MARQUEE ICI, et c'est le piege que la
   * barre d'administration a rencontre avec `/administration` : tout chemin de
   * l'espace client commence par `/compte`, donc une comparaison par prefixe
   * marquerait la vue d'ensemble courante sur TOUS les ecrans.
   */
  await expect(
    barre(page).getByRole("link", { name: "Vue d'ensemble" }),
  ).not.toHaveAttribute("aria-current", "page");
});

test("un ecran sans rubrique ne marque aucune entree de la barre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  /*
   * LE PIEGE DE `/compte`, MESURE SUR UN ECRAN QUI N'EST AUCUNE RUBRIQUE.
   *
   * `/compte/verification` est sous `/compte` sans etre sous aucune des cinq
   * rubriques. Si `estRubriqueCliente` comparait par prefixe sans traiter
   * `/compte` a part, « Vue d'ensemble » y serait marquee courante, et elle le
   * serait sur TOUS les ecrans de l'espace : la barre dirait en permanence que
   * l'on est sur la vue d'ensemble, donc ne dirait plus rien.
   *
   * DEUX VERSIONS DE CE TEST ONT ETE ECARTEES, et les deux echecs valaient
   * mieux que le vert facile qui aurait suivi :
   *
   *   - cliquer une commande reelle SE SAUTAIT quand la session partagee n'en
   *     portait aucune, donc ne prouvait rien. Motif « un test ignore passe la
   *     CI », que `verifier-tests-non-ignores.sh` ne voit pas sur un
   *     `test.skip` conditionnel
   *   - viser une URL inexistante pour obtenir un 404 profond NE RENDAIT PAS LA
   *     BARRE : `not-found.tsx` vit a la racine de `app/`, donc hors du layout
   *     de `compte/`. L'hypothese etait fausse et le test l'a montre
   *
   * CETTE VERSION NE POSE AUCUNE DONNEE et ne depend d'aucun autre fichier, ni
   * de l'ordre d'execution, cause des trois echecs de rendu PDF de LS-183.
   */
  await page.goto("/compte/verification");

  await expect(
    barre(page).getByRole("link", { name: "Vue d'ensemble" }),
  ).not.toHaveAttribute("aria-current", "page");

  await expect(
    barre(page).getByRole("link", { name: "Mes commandes" }),
  ).not.toHaveAttribute("aria-current", "page");
});

test("les ecrans d'authentification ne portent pas la barre", async ({
  page,
  context,
}) => {
  /*
   * SANS SESSION, ET C'EST TOUT L'OBJET DE CE TEST. Le layout decide d'afficher
   * la barre sur la seule presence d'une session : un visiteur anonyme sur
   * `/compte/connexion` ne doit pas se voir proposer cinq liens vers des ecrans
   * proteges, ce qui annoncerait la structure de l'espace a qui n'y a pas acces.
   *
   * CE N'EST PAS UNE PROTECTION, et le layout le dit : cacher la barre ne garde
   * rien, chaque page porte son `exigerSession`. C'est une coherence de
   * parcours, et elle se mesure quand meme.
   *
   * LES COOKIES SONT EFFACES PLUTOT QU'UN CONTEXTE NEUF OUVERT. `test.use` pose
   * la session partagee sur tout ce fichier, il faut donc s'en defaire ici.
   * `browser.newContext()` etait la premiere version et ELLE ECHOUAIT : un
   * contexte cree a la main N'HERITE PAS de `baseURL`, donc `goto("/compte/…")`
   * n'avait aucune origine a resoudre et la page ne se chargeait pas. L'erreur
   * se lisait « element(s) not found » sur un `h1` pourtant present dans le
   * code, ce qui accusait le rendu au lieu de la navigation.
   */
  await context.clearCookies();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/compte/connexion");

  await expect(
    page.getByRole("heading", { name: "Se connecter", level: 1 }),
  ).toBeVisible();

  await expect(
    page.getByRole("navigation", { name: "Sections de mon espace" }),
  ).toHaveCount(0);
});

test("le gabarit ne deborde pas et reste accessible a la bascule", async ({
  page,
}) => {
  await page.setViewportSize({ width: BASCULE_PX, height: 800 });
  await page.goto("/compte");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  /*
   * AXE-CORE A 768 px, LARGEUR QU'AUCUN AUTRE FICHIER NE MESURE. Le contraste
   * depend du rendu reel, et la barre laterale n'existe en colonne qu'ici :
   * `verifier-contraste.sh` mesure les paires colocalisees du CSS, jamais un
   * fond herite du JSX.
   */
  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});
