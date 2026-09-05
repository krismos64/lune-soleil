/**
 * La frontiere d'erreur de l'administration, traversee pour de vrai. LS-191.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE FICHIER PROVOQUE UNE ERREUR PLUTOT QUE DE RENDRE `error.tsx`.
 *
 * Le critere 6 de la story l'exige, et il a raison : « une frontiere qu'aucun
 * test ne traverse est une intention, pas une garantie ». Un test unitaire qui
 * rendrait le composant isolement verifierait son contenu et rien d'autre. Il
 * resterait VERT si le fichier etait place au mauvais endroit, au-dessus du
 * layout par exemple, c'est-a-dire sur exactement le defaut que la story
 * repare : la perte de la barre de navigation.
 *
 * Ce qui est mesure ici n'est donc pas le rendu du composant, mais SA POSITION
 * DANS L'ARBRE : la barre survit parce que la frontiere est SOUS le layout.
 * ------------------------------------------------------------------
 *
 * `administration/echec-rendu` EST UNE PAGE QUI LEVE A DESSEIN, ouverte par la
 * seule variable `AUTORISER_ECHEC_RENDU` que `playwright.config.ts` pose. Elle
 * rend 404 partout ailleurs, ce que ce fichier NE PEUT PAS verifier : la
 * variable y est justement posee. Deux autres controles s'en chargent,
 * `tests/unitaire/route-echec.test.ts` qui appelle la page sans la variable, et
 * `scripts/verifier-route-echec.sh` qui garde l'ordre de ses deux
 * instructions.
 *
 * UNE SEULE LARGEUR POUR LA PLUPART DES ASSERTIONS. Elles lisent du texte et
 * des roles, jamais un rendu : les rejouer a trois largeurs triplerait la duree
 * pour trois fois la meme verification. Motif « plafond de debit et suite
 * e2e », en fiche. Le debordement, lui, se mesure bien aux trois largeurs, et
 * c'est le seul test qui les emprunte.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const ECRAN_QUI_ECHOUE = "/administration/echec-rendu";

/*
 * LA REGION EST DESIGNEE PAR SON NOM, jamais par `getByRole("alert")` nu.
 *
 * `role="alert"` EST AMBIGU dans une application Next.js : l'annonceur de route
 * `__next-route-announcer__` en porte un lui aussi, pour signaler les
 * changements de page aux lecteurs d'ecran. Un selecteur nu trouve donc DEUX
 * elements et echoue en « strict mode violation », sur un ecran parfaitement
 * rendu. Motif deja en fiche sur ce depot.
 */
const REGION_ERREUR = { name: "Erreur de l'administration" } as const;

test.describe("frontiere d'erreur de l'administration", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  /*
   * LE TEST CENTRAL DE LA STORY, critere 2.
   *
   * Avant LS-191, cette erreur remontait a `app/global-error.tsx`, qui REMPLACE
   * le layout racine : l'exploitante perdait la barre, donc tout moyen d'aller
   * ailleurs sans saisir une URL. La barre presente ici prouve que la frontiere
   * est bien sous le layout.
   */
  test("la barre de navigation survit a une erreur de rendu", async ({
    page,
  }) => {
    await page.goto(ECRAN_QUI_ECHOUE);

    /*
     * LE BOUTON « Menu » EST LA PREMIERE PREUVE. LS-181 replie la barre
     * derriere lui sous le point de bascule : a 320 px c'est lui qui est
     * visible, pas les rubriques.
     *
     * Le bouton et la barre viennent du MEME layout : si la frontiere d'erreur
     * remontait au-dessus de lui, ni l'un ni l'autre ne serait rendu. C'est
     * bien la position de la frontiere dans l'arbre qui est mesuree.
     */
    await expect(page.getByRole("button", { name: /menu/i })).toBeVisible();

    /*
     * LA BARRE EST OUVERTE PUIS LUE, plutot que cherchee repliee.
     *
     * Le `<nav>` est TOUJOURS dans le document, seule sa classe change : un
     * `toBeAttached` semblait donc suffire, et il echoue. Un element masque par
     * CSS n'expose PAS son role ARIA, donc `getByRole("navigation")` ne le
     * trouve pas tant que le panneau est replie. Chercher un role sur un
     * element cache est une mesure fausse, pas un defaut du code.
     *
     * L'ouvrir au clic verifie AUSSI que la barre reste UTILISABLE apres
     * l'erreur, ce qui est l'objet de la story : une barre presente mais figee
     * laisserait l'exploitante sans issue tout aussi surement qu'une barre
     * absente.
     */
    await page.getByRole("button", { name: /menu/i }).click();

    await expect(
      page.getByRole("navigation", { name: /sections de l'administration/i }),
    ).toBeVisible();

    /*
     * UNE RUBRIQUE PRECISE, et non le seul conteneur. Une barre rendue vide
     * passerait les assertions ci-dessus tout en laissant l'exploitante sans
     * issue.
     */
    await expect(
      page.getByRole("link", { name: /commandes/i }).first(),
    ).toBeVisible();
  });

  test("l'ecran d'erreur dit ce qui se passe, en francais", async ({
    page,
  }) => {
    await page.goto(ECRAN_QUI_ECHOUE);

    const region = page.getByRole("alert", REGION_ERREUR);

    await expect(region).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /n'a pas pu s'afficher/i }),
    ).toBeVisible();

    /*
     * CE QUI RASSURE EST VERIFIE, pas seulement la presence d'un message. La
     * premiere question devant un ecran de gestion en panne est « ai-je perdu
     * quelque chose », et c'est a elle que la page doit repondre.
     */
    await expect(region).toContainText(/aucune donnée n'est perdue/i);
  });

  /*
   * CRITERE 3. Le message brut d'une erreur porte souvent un nom de table, une
   * requete ou un chemin serveur. Le texte jete par la page qui leve est connu :
   * il ne doit apparaitre nulle part dans le rendu.
   */
  test("aucun detail technique n'atteint l'ecran", async ({ page }) => {
    await page.goto(ECRAN_QUI_ECHOUE);

    const corps = page.locator("body");

    await expect(corps).not.toContainText("Echec de rendu provoque");
    await expect(corps).not.toContainText(/at .*\.tsx/);
    await expect(corps).not.toContainText(/webpack|node_modules|prisma/i);
  });

  /*
   * CRITERE 4, la moitie visible. L'autre moitie, la ligne de journal, est
   * ecrite par `src/instrumentation.ts` cote serveur : le `digest` est le champ
   * qui relie les deux, et c'est pourquoi il doit etre AFFICHE.
   *
   * IL EST REFUSE SUR LES PAGES PUBLIQUES et affiche ici, ecart delibere :
   * cet ecran n'est vu que par l'exploitante, a qui l'identifiant sert a citer
   * l'incident exact.
   */
  test("l'identifiant de correlation est affiche pour etre cite", async ({
    page,
  }) => {
    await page.goto(ECRAN_QUI_ECHOUE);

    await expect(page.getByText(/référence à citer/i)).toBeVisible();
    await expect(page.locator("code")).not.toBeEmpty();
  });

  /*
   * CRITERE 1. `reset()` rejoue le rendu du segment. La page relevant a chaque
   * fois, l'ecran d'erreur revient : ce qui est verifie est que le bouton
   * EXISTE et reste utilisable, pas que l'erreur disparaisse.
   */
  test("le bouton de reessai est present et actionnable", async ({ page }) => {
    await page.goto(ECRAN_QUI_ECHOUE);

    const reessayer = page.getByRole("button", { name: /réessayer/i });
    await expect(reessayer).toBeEnabled();
    await reessayer.click();

    await expect(
      page.getByRole("heading", { name: /n'a pas pu s'afficher/i }),
    ).toBeVisible();
  });

  test("le lien de sortie mene au tableau de bord", async ({ page }) => {
    await page.goto(ECRAN_QUI_ECHOUE);

    await page.getByRole("link", { name: /tableau de bord/i }).click();

    await expect(page).toHaveURL(/\/administration$/);
  });

  /*
   * CRITERE 7. L'ecran d'erreur est un rendu comme un autre : il se mesure aux
   * quatre largeurs de l'invariant 10. `mesure-rendu.ts` porte la mesure, les
   * trois projets Playwright portent les largeurs.
   */
  test("aucun debordement horizontal", async ({ page }) => {
    await page.goto(ECRAN_QUI_ECHOUE);
    await expect(page.getByRole("alert", REGION_ERREUR)).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  /*
   * LA BASCULE 768 px, relevee par `ls-frontend-revue`.
   *
   * Les projets Playwright couvrent 320, 390 et 1280 depuis LS-68, quand
   * `CLAUDE.md` invariant 10 en enonce quatre. L'ecart est anterieur et LS-166
   * le porte ; il se comble ici sur ce seul ecran, comme LS-121 l'a fait pour
   * les commandes.
   *
   * 768 px EST PRECISEMENT LE POINT DE BASCULE DU GABARIT dans lequel cet ecran
   * s'insere : `navigation-administration.module.css` y passe la barre en
   * colonne de 250 px et `layout.module.css` met le gabarit en ligne. La
   * colonne de contenu tombe alors a environ 518 px, la plus etroite de toutes
   * les configurations, et c'est la qu'une mise en page cede.
   *
   * `setViewportSize` DANS LE TEST, ET NON UN QUATRIEME PROJET : un projet de
   * plus allongerait d'un tiers une suite dont le cout est deja mesure. Ce test
   * REDIMENSIONNE donc, ce qui a un effet de bord connu, il ECRASE la largeur du
   * projet courant : joue par les trois projets, il mesurerait trois fois 768 px
   * pour un cout triple. C'est le defaut trouve en LS-136, en fiche. Il est donc
   * limite a un seul projet.
   */
  test("aucun debordement au point de bascule de 768 px", async ({
    page,
  }, infos) => {
    test.skip(
      infos.project.name !== "mobile-320",
      "redimensionne, donc un seul projet suffit : le rejouer ailleurs mesurerait trois fois la meme largeur",
    );

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(ECRAN_QUI_ECHOUE);
    await expect(page.getByRole("alert", REGION_ERREUR)).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test("aucune violation d'accessibilite", async ({ page }) => {
    await page.goto(ECRAN_QUI_ECHOUE);
    await expect(page.getByRole("alert", REGION_ERREUR)).toBeVisible();

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });
});
