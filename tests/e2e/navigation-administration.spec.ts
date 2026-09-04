/**
 * Navigation de l'administration, de bout en bout. LS-162.
 *
 * CE FICHIER NAVIGUE PAR CLIC, ET C'EST TOUT SON INTERET. La suite existante
 * appelle `page.goto()` avec l'URL en dur sur chaque ecran : elle ne passe
 * jamais par une navigation reelle, et c'est precisement pour cela que
 * l'absence totale de menu n'a fait rougir aucune assertion pendant huit
 * stories. Un test qui atteint toujours sa cible directement ne peut pas
 * decouvrir qu'aucun chemin n'y mene.
 *
 * Motif « un defaut absent n'est pas un defaut empeche » : rien ne l'interdit,
 * rien ne le teste, et chaque story ajoute un ecran de plus sans le relier.
 *
 * `verifier-navigation-administration.sh` GARDE LA MEME EXIGENCE PAR LE TEXTE,
 * en confrontant les rubriques aux routes du depot dans les deux sens. Les deux
 * se completent : le script attrape l'ecran neuf des son ecriture, ce fichier
 * prouve que les liens fonctionnent vraiment.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

/**
 * Les rubriques attendues, avec le titre de l'ecran qu'elles atteignent.
 *
 * LA LISTE EST ECRITE ICI PLUTOT QU'IMPORTEE DU COMPOSANT, deliberement. Une
 * assertion qui lit la meme constante que le code verifie sa coherence avec
 * lui-meme et reste verte si les deux changent ensemble. Le titre attendu vient
 * de l'ECRAN, pas de la barre : c'est ce qui prouve que le lien mene bien la ou
 * son libelle l'annonce.
 */
const RUBRIQUES = [
  { libelle: "Tableau de bord", titre: "Tableau de bord" },
  { libelle: "Commandes", titre: "Commandes" },
  { libelle: "Expéditions", titre: "Expéditions" },
  { libelle: "Rétractations", titre: "Rétractations" },
  { libelle: "Messages", titre: "Messages" },
  { libelle: "Nouveau produit", titre: "Nouveau produit" },
  { libelle: "Catégories", titre: "Catégories du catalogue" },
  { libelle: "Stocks et marchés", titre: "Stocks et marchés" },
  { libelle: "Connexions", titre: "Journal des connexions" },
] as const;

/**
 * Ouvre le panneau de navigation quand il est replie, LS-181.
 *
 * SOUS 768 px LA BARRE EST DERRIERE UN BOUTON, et c'est voulu : onze rubriques
 * empilees mangeraient l'ecran entier avant le contenu, ce qui reproduirait
 * sous une autre forme le defaut que LS-162 a ferme. Au-dela, elle est une
 * colonne permanente et le bouton n'existe pas.
 *
 * CETTE FONCTION EXISTE PARCE QUE LA SUITE TOURNE AUX TROIS LARGEURS, 320, 390
 * et 1280. Le meme test doit passer dans les trois projets sans supposer
 * laquelle : `isVisible` decide au lieu de comparer une largeur, ce qui reste
 * juste si le point de bascule change.
 *
 * ELLE NE CACHE PAS UN ECHEC. Si le bouton est absent ET la barre invisible, le
 * clic suivant echouera en nommant la rubrique introuvable, ce qui est le bon
 * message : la barre est inatteignable.
 */
async function ouvrirLaBarreSiRepliee(page: import("@playwright/test").Page) {
  const bascule = page.getByRole("button", { name: "Menu", exact: true });

  if (await bascule.isVisible()) {
    await bascule.click();
  }
}

/**
 * LE TEST QUE LA STORY EXISTE POUR RENDRE POSSIBLE : atteindre chaque ecran
 * SANS JAMAIS SAISIR D'URL, critere 1.
 *
 * Un seul `goto`, sur l'accueil. Tout le reste passe par des clics, ce qui est
 * exactement le parcours de l'exploitante.
 */
test("chaque écran est atteignable au clic depuis l'accueil", async ({
  page,
}) => {
  await page.goto("/administration");

  for (const rubrique of RUBRIQUES) {
    /*
     * LE PANNEAU SE REFERME APRES CHAQUE CLIC sous 768 px, et c'est voulu :
     * laisser un menu ouvert par-dessus l'ecran qu'on vient d'atteindre
     * obligerait a le fermer a la main a chaque navigation. Il faut donc le
     * rouvrir a chaque tour, exactement comme l'exploitante le fait.
     */
    await ouvrirLaBarreSiRepliee(page);

    await page
      .getByRole("navigation", { name: "Sections de l'administration" })
      /*
       * LE LIEN SE CIBLE PAR LE DEBUT DE SON NOM, jamais par egalite stricte.
       * Une rubrique a pastille porte son compteur DANS son nom accessible,
       * « Commandes 3 (3 en attente) » : c'est voulu, un lecteur d'ecran doit
       * entendre ce qui attend. Une egalite stricte ne trouverait alors que
       * les rubriques sans pastille, et le test verdirait sur la moitie de la
       * barre en silence.
       */
      .getByRole("link", { name: new RegExp(`^${rubrique.libelle}`) })
      .click();

    await expect(
      page.getByRole("heading", { name: rubrique.titre, level: 1 }),
    ).toBeVisible();
  }
});

/**
 * L'ECRAN COURANT EST ANNONCE, critere 3.
 *
 * `aria-current="page"` PORTE L'INFORMATION et la couleur ne fait que
 * l'appuyer, `frontend-design.md` interdisant qu'une information passe par la
 * seule couleur. L'assertion vise donc l'attribut, jamais une classe ni une
 * couleur calculee : un test sur l'apparence resterait vert sur une barre
 * devenue muette pour un lecteur d'ecran.
 */
test("la rubrique de l'écran ouvert est annoncée comme courante", async ({
  page,
}) => {
  await page.goto("/administration/stocks");
  await ouvrirLaBarreSiRepliee(page);

  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  await expect(
    barre.getByRole("link", { name: /^Stocks et marchés/ }),
  ).toHaveAttribute("aria-current", "page");

  /*
   * ET UNE SEULE A LA FOIS. Sans cette seconde assertion, une barre qui
   * marquerait TOUTES les rubriques courantes passerait le test : le reperage
   * serait detruit et un lecteur d'ecran annoncerait sept pages courantes.
   */
  await expect(barre.locator('[aria-current="page"]')).toHaveCount(1);
});

/**
 * LE MARQUAGE SURVIT A UN ECRAN DE DETAIL.
 *
 * `/administration/commandes/<id>` est le detail d'une commande : la rubrique
 * « Commandes » doit y rester courante, sans quoi l'exploitante perd son
 * reperage des qu'elle ouvre une commande, c'est-a-dire dans son geste le plus
 * frequent. C'est ce que la comparaison par prefixe existe pour tenir.
 */
test("le détail d'une commande garde sa rubrique marquée", async ({ page }) => {
  await page.goto("/administration/commandes");

  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  /*
   * LE LIEN EST CIBLE PAR SON URL ET NON PAR SON LIBELLE, qui est le NUMERO de
   * la commande, `2026-000001`. Ancrer sur ce format lierait le test a la
   * numerotation d'ADR-031 : un changement de format ferait echouer un test de
   * navigation, ce qui accuserait le mauvais code.
   */
  await page
    .getByRole("main")
    .locator('a[href^="/administration/commandes/"]')
    .first()
    .click();

  await ouvrirLaBarreSiRepliee(page);

  await expect(barre.getByRole("link", { name: /^Commandes/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(barre.locator('[aria-current="page"]')).toHaveCount(1);
});

/**
 * LA BARRE N'APPARAIT PAS SANS SESSION D'ADMINISTRATION.
 *
 * Elle annoncerait sept ecrans protetes a qui n'y a pas acces : les pages les
 * refuseraient bien, mais l'affichage aurait deja divulgue la structure de
 * l'administration. Motif « fabriquer la preuve sans le role ».
 *
 * `storageState` VIDE, ET NON LA SESSION D'ADMINISTRATION du reste du fichier.
 */
test.describe("sans session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("la barre n'apparaît pas sur l'écran de connexion", async ({ page }) => {
    await page.goto("/administration/connexion");

    await expect(
      page.getByRole("navigation", { name: "Sections de l'administration" }),
    ).toHaveCount(0);
  });
});

test("la barre ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/administration/commandes");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * LA NAVIGATION AU CLAVIER, critere 3.
 *
 * Les sept rubriques doivent etre atteignables dans l'ordre, sans piege ni
 * saut. Le test tabule depuis le debut du document et releve l'ordre reel des
 * liens de la barre, plutot que de supposer qu'un `<ul>` de liens se comporte
 * bien : un `tabindex` positif pose ailleurs dans la page suffirait a le
 * casser.
 */
test("les rubriques se parcourent au clavier dans l'ordre", async ({
  page,
}) => {
  await page.goto("/administration/commandes");
  await ouvrirLaBarreSiRepliee(page);

  const libelles = RUBRIQUES.map((rubrique) => rubrique.libelle);
  const rencontres: string[] = [];

  /*
   * LA BORNE EXISTE POUR QUE L'ECHEC SOIT LISIBLE. Sans elle, une barre
   * inatteignable au clavier ferait tourner la boucle jusqu'au delai de
   * Playwright, et le message parlerait d'expiration plutot que de navigation.
   */
  for (let tabulation = 0; tabulation < 40; tabulation += 1) {
    await page.keyboard.press("Tab");

    const actif = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLAnchorElement)) return null;
      return element.closest("nav")?.getAttribute("aria-label") ===
        "Sections de l'administration"
        ? element.textContent?.trim()
        : null;
    });

    /*
     * LE LIBELLE EST ISOLE DU COMPTEUR. `textContent` concatene la pastille et
     * le texte reserve aux lecteurs d'ecran : « Commandes3 (3 en attente) ».
     * L'ordre de tabulation se verifie sur les LIBELLES, le contenu des
     * pastilles etant teste ailleurs et variable selon le jeu de donnees.
     */
    const libelle = libelles.find((attendu) => actif?.startsWith(attendu));

    if (libelle && !rencontres.includes(libelle)) {
      rencontres.push(libelle);
    }

    if (rencontres.length === libelles.length) break;
  }

  expect(rencontres).toEqual(libelles);
});

test("la barre ne porte aucune violation d'accessibilité", async ({ page }) => {
  await page.goto("/administration/commandes");
  await ouvrirLaBarreSiRepliee(page);

  const resultat = await new AxeBuilder({ page })
    .include('nav[aria-label="Sections de l\'administration"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/* ==========================================================================
 * LS-181, la barre laterale, les pastilles et le tableau de bord.
 * ========================================================================== */

/**
 * LA BARRE SE REPLIE SOUS 768 px ET RESTE PERMANENTE AU-DELA, critere 1.
 *
 * LE TEST NE COMPARE PAS UNE LARGEUR ECRITE EN DUR : il lit celle du viewport
 * et en deduit ce qu'il doit voir. Ecrire « a 320 px le bouton existe »
 * obligerait a trois tests presque identiques, et le projet mobile-390 les
 * jouerait tous les trois en n'en verifiant qu'un.
 *
 * LES DEUX SENS SONT VERIFIES. N'exiger que la presence du bouton en petit
 * ecran laisserait passer une barre qui resterait repliee a 1280 px, c'est-a-
 * dire un menu permanent devenu un menu cache sans que rien ne le dise.
 */
test("la barre est repliée sous 768 px et permanente au-delà", async ({
  page,
}) => {
  await page.goto("/administration");

  const largeur = page.viewportSize()?.width ?? 0;
  const bascule = page.getByRole("button", { name: "Menu", exact: true });
  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  if (largeur < 768) {
    await expect(bascule).toBeVisible();
    await expect(barre).toBeHidden();

    /*
     * ET ELLE S'OUVRE VRAIMENT. Sans cette assertion, un bouton inerte
     * passerait : la barre serait alors inatteignable en petit ecran, ce qui
     * est le defaut d'origine de LS-162 revenu par une autre porte.
     */
    await bascule.click();
    await expect(barre).toBeVisible();
  } else {
    await expect(bascule).toBeHidden();
    await expect(barre).toBeVisible();
  }
});

/**
 * LES PASTILLES VIENNENT DES DONNEES, critere 2.
 *
 * LE TEST COMPARE LA PASTILLE AU CONTENU REEL DE L'ECRAN qu'elle annonce,
 * jamais a un nombre attendu. Un nombre ecrit ici serait une seconde source de
 * verite : il faudrait le corriger a chaque evolution du jeu de donnees, et
 * une valeur codee en dur dans le COMPOSANT le satisferait tout autant.
 *
 * C'est ce qui distingue « la pastille affiche 3 » de « la pastille dit la
 * verite ». Seul le second tient le critere.
 */
test("la pastille des messages compte les messages réellement non lus", async ({
  page,
}) => {
  await page.goto("/administration/messages");
  await ouvrirLaBarreSiRepliee(page);

  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  const lien = barre.getByRole("link", { name: /^Messages/ });
  const texteLien = (await lien.textContent()) ?? "";
  const pastille = texteLien.match(/(\d+)/)?.[1];

  /*
   * L'ECRAN DES MESSAGES MARQUE LES NON LUS. La pastille doit valoir leur
   * nombre ; s'il n'y en a aucun, elle ne doit pas exister du tout, « 0 »
   * n'etant pas une information.
   */
  const nonLus = await page
    .getByRole("main")
    .getByText("Nouveau", { exact: true })
    .count();

  if (nonLus === 0) {
    expect(pastille).toBeUndefined();
  } else {
    expect(Number(pastille)).toBe(nonLus);
  }
});

/**
 * LE TABLEAU DE BORD NE DEBORDE PAS, critere 1.
 *
 * C'est l'ecran le plus dense de l'administration, quatre tuiles et un panneau
 * de liste : s'il tient a 320 px, les autres tiennent.
 */
test("le tableau de bord ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/administration");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * LE TABLEAU DE BORD NE PORTE AUCUNE VIOLATION D'ACCESSIBILITE.
 *
 * `axe-core` MESURE LE CONTRASTE SUR LE RENDU REEL, avec le fond effectivement
 * herite, ce que `verifier-contraste.sh` ne peut pas voir. Les deux sont
 * necessaires et aucun ne remplace l'autre : le script lit toute branche du
 * CSS, celui-ci ne voit que ce qui est rendu.
 */
test("le tableau de bord ne porte aucune violation d'accessibilité", async ({
  page,
}) => {
  await page.goto("/administration");

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/**
 * LES RUBRIQUES NON LIVREES NE SONT PAS DES LIENS, arbitrage du 4 septembre.
 *
 * ELLES ANNONCENT LA STRUCTURE COMPLETE DE L'OUTIL sans rien promettre qui
 * n'existe : un lien vers un ecran non livre rendrait un 404 a l'exploitante.
 * Le test verifie qu'elles sont VISIBLES et qu'aucune n'est cliquable, les
 * deux moities important autant.
 */
test("les rubriques à venir sont annoncées sans être cliquables", async ({
  page,
}) => {
  await page.goto("/administration");
  await ouvrirLaBarreSiRepliee(page);

  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  await expect(barre.getByText("Bientôt disponible")).toBeVisible();

  for (const libelle of ["Statistiques", "Clients", "Paramètres"]) {
    await expect(barre.getByText(libelle, { exact: true })).toBeVisible();
    await expect(
      barre.getByRole("link", { name: libelle, exact: true }),
    ).toHaveCount(0);
  }
});
