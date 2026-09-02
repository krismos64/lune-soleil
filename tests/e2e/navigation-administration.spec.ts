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
  { libelle: "Commandes", titre: "Commandes" },
  { libelle: "Expéditions", titre: "Expéditions" },
  { libelle: "Messages", titre: "Messages" },
  { libelle: "Nouveau produit", titre: "Nouveau produit" },
  { libelle: "Catégories", titre: "Catégories du catalogue" },
  { libelle: "Stocks", titre: "Stocks et marchés" },
  { libelle: "Connexions", titre: "Journal des connexions" },
] as const;

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
    await page
      .getByRole("navigation", { name: "Sections de l'administration" })
      .getByRole("link", { name: rubrique.libelle })
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

  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  await expect(barre.getByRole("link", { name: "Stocks" })).toHaveAttribute(
    "aria-current",
    "page",
  );

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

  await expect(barre.getByRole("link", { name: "Commandes" })).toHaveAttribute(
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

    if (actif && !rencontres.includes(actif)) {
      rencontres.push(actif);
    }

    if (rencontres.length === libelles.length) break;
  }

  expect(rencontres).toEqual(libelles);
});

test("la barre ne porte aucune violation d'accessibilité", async ({ page }) => {
  await page.goto("/administration/commandes");

  const resultat = await new AxeBuilder({ page })
    .include('nav[aria-label="Sections de l\'administration"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});
