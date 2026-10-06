/**
 * Thèmes de Noël, LS-277, ADR-045 et ADR-046 amendés. Remplace le test du
 * thème unique de LS-267.
 *
 * LA BASE DE BOUT EN BOUT EST PARTAGÉE PAR LES QUATRE LARGEURS : y activer un
 * thème pour de bon changerait l'accueil sous les pieds des autres fichiers.
 * Le rendu est donc exercé par l'APERÇU, que seule une session administratrice
 * obtient ; l'enregistrement des thèmes et la migration sont prouvés en
 * intégration, `theme-saisonnier.sequential.test.ts`.
 */
import { expect, test, type Page } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";

const THEMES = [
  { valeur: "NOEL_1", attribut: "noel_1" },
  { valeur: "NOEL_2", attribut: "noel_2" },
] as const;

const accueil = (theme: string) => `/?apercu-theme=${theme}`;
const catalogue = (theme: string) => `/catalogue?apercu-theme=${theme}`;

/** Animations en cours, et parmi elles celles qui ne sont pas des décors continus. */
async function animations(page: Page) {
  return page.evaluate(() => {
    const enCours = document
      .getAnimations()
      .filter((animation) => animation.playState === "running");
    const horsContinu = enCours.filter((animation) => {
      const cible = (animation.effect as KeyframeEffect | null)?.target;
      return !(cible instanceof Element && cible.closest("[data-continu]"));
    });
    return { enCours: enCours.length, horsContinu: horsContinu.length };
  });
}

async function debordement(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.describe("aperçu de l'administratrice", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  for (const { valeur, attribut } of THEMES) {
    test(`${valeur} : l'accueil s'habille, le titre ne change pas`, async ({
      page,
    }) => {
      await page.goto(accueil(valeur));
      const main = page.locator("main");
      await expect(main).toHaveAttribute("data-theme", attribut);
      await expect(page.getByText("Fêtes de fin d'année")).toBeVisible();
      await expect(
        page.getByRole("status", { name: "Aperçu du thème" }),
      ).toContainText("il n'est pas appliqué");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "La lumière d'un bijou, le geste d'une main.",
        }),
      ).toBeVisible();
      expect(await debordement(page)).toBeLessThanOrEqual(0);
      // Aucune promesse de prix, de date ni de livraison dans le thème.
      await expect(main).not.toContainText(/avant Noël|-\s?\d+ ?%/);
      // Aucun bouton imbriqué dans un lien.
      await expect(page.locator("main a button")).toHaveCount(0);
    });

    test(`${valeur} : le catalogue s'habille, décor hors des photographies`, async ({
      page,
    }) => {
      await page.goto(catalogue(valeur));
      await expect(page.locator("main")).toHaveAttribute(
        "data-theme",
        attribut,
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "Le catalogue" }),
      ).toBeVisible();
      await expect(
        page.getByText("Chacun peut devenir un cadeau."),
      ).toBeVisible();
      expect(await debordement(page)).toBeLessThanOrEqual(0);

      /*
       * RIEN N'EST POSÉ SUR UNE PHOTOGRAPHIE, ADR-046 : pour chaque carte, le
       * nœud, le ruban et les flocons des coins sont hors du cadre de l'image.
       * Mesuré à l'état final, mouvement réduit.
       */
      const cartes = page.locator("main ul > li:has(a[href^='/produit/'])");
      // La grille arrive derrière `Suspense` : compter avant son arrivée
      // rendait zéro carte, le premier jet de ce test.
      await expect(cartes.first()).toBeVisible();
      const nombre = await cartes.count();
      expect(nombre).toBeGreaterThan(0);
      for (let rang = 0; rang < Math.min(nombre, 4); rang += 1) {
        const carte = cartes.nth(rang);
        const image = await carte
          .locator("a[href^='/produit/'] > div")
          .first()
          .boundingBox();
        expect(image).toBeTruthy();
        const decors = carte.locator(
          '[class*="noeudCarte"], [class*="rubanCarte"], [class*="floconCoin"]',
        );
        expect(await decors.count()).toBe(6);
        for (let d = 0; d < 6; d += 1) {
          const boite = await decors.nth(d).boundingBox();
          expect(boite).toBeTruthy();
          const chevauche =
            boite!.x < image!.x + image!.width &&
            boite!.x + boite!.width > image!.x &&
            boite!.y < image!.y + image!.height &&
            boite!.y + boite!.height > image!.y;
          expect(chevauche, `décor ${d} de la carte ${rang}`).toBe(false);
        }
      }
      await expect(page.locator("main a button")).toHaveCount(0);
    });

    test(`${valeur} : en mouvement réduit, rien ne bouge et pas de bouton de pause`, async ({
      page,
    }) => {
      for (const chemin of [accueil(valeur), catalogue(valeur)]) {
        await page.goto(chemin);
        await expect(page.getByText("Fêtes de fin d'année")).toBeVisible();
        expect((await animations(page)).enCours, chemin).toBe(0);
        await expect(
          page.getByRole("button", { name: /animations/ }),
        ).toHaveCount(0);
        const flocons = page.locator('[class*="__flocon"]');
        expect(await flocons.count()).toBeGreaterThan(0);
        await expect(flocons.first()).toBeHidden();
      }
    });
  }

  /*
   * LA BANDE SUCRE D'ORGE BORDE LE BAS DU BANDEAU, sur toute sa largeur, et la
   * zone décor ne passe jamais sous le texte. Le premier jet cassait la grille
   * de 900 à 1280 px, la bande devenant une case, relevé par
   * `ls-frontend-revue`.
   */
  test("le bandeau du catalogue garde sa disposition", async ({ page }) => {
    await page.goto(catalogue("NOEL_1"));
    const bandeau = await page
      .locator('[class*="bandeauNoel"]')
      .first()
      .boundingBox();
    const bande = await page
      .locator('[class*="bandeauNoel"] [class*="sucreOrge"]')
      .first()
      .boundingBox();
    const texte = await page
      .locator('[class*="texteBandeau"]')
      .first()
      .boundingBox();
    const decor = await page
      .locator('[class*="decorBandeau"]')
      .first()
      .boundingBox();
    expect(bandeau && bande && texte && decor).toBeTruthy();
    expect(
      Math.abs(bande!.y + bande!.height - (bandeau!.y + bandeau!.height)),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(bande!.width - bandeau!.width)).toBeLessThanOrEqual(1);
    // La zone décor est au-dessus du texte, ou à sa droite : jamais dessous.
    expect(decor!.y).toBeLessThan(texte!.y + texte!.height);
  });

  test("le ruban du paquet est centré sur son image", async ({ page }) => {
    await page.goto(accueil("NOEL_1"));
    const image = await page
      .locator('[class*="paquetImage"]')
      .first()
      .boundingBox();
    const ruban = await page
      .locator('[class*="paquetRuban"]')
      .first()
      .boundingBox();
    expect(image && ruban).toBeTruthy();
    const centre = (b: { x: number; width: number }) => b.x + b.width / 2;
    expect(Math.abs(centre(ruban!) - centre(image!))).toBeLessThanOrEqual(1);
  });

  test("NOEL_2 : titre et accroche en blanc sur le bandeau rouge", async ({
    page,
  }) => {
    await page.goto(accueil("NOEL_2"));
    for (const element of [
      page.getByRole("heading", { level: 1 }),
      page.getByText(/choisie pour quelqu'un/),
    ]) {
      expect(
        await element.evaluate((noeud) => getComputedStyle(noeud).color),
      ).toBe("rgb(255, 255, 255)");
    }
  });

  test("NOEL_1 : titre et boutons gardent leurs couleurs", async ({ page }) => {
    await page.goto(accueil("NOEL_1"));
    const titre = await page
      .getByRole("heading", { level: 1 })
      .evaluate((noeud) => getComputedStyle(noeud).color);
    await page.goto("/");
    const titreOrdinaire = await page
      .getByRole("heading", { level: 1 })
      .evaluate((noeud) => getComputedStyle(noeud).color);
    expect(titre).toBe(titreOrdinaire);
  });

  /*
   * SANS SCRIPT, LE BOUTON DE PAUSE N'EXISTE PAS : rien ne doit donc tourner
   * sans fin, WCAG 2.2.2. Le premier jet laissait neige, boules et rayons
   * tourner, relevé par `ls-frontend-revue`. Mesuré en mouvement autorisé, le
   * seul où une animation peut exister.
   */
  test("sans script, les thèmes sont complets et rien ne tourne sans fin", async ({
    browser,
  }) => {
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      storageState: FICHIER_SESSION_ADMINISTRATION,
      reducedMotion: "no-preference",
    });
    const page = await contexte.newPage();
    const sansFin = async () => {
      const cdp = await contexte.newCDPSession(page);
      await cdp.send("Runtime.enable");
      const { result } = await cdp.send("Runtime.evaluate", {
        expression: `document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getTiming().iterations === Infinity).length`,
        returnByValue: true,
      });
      await cdp.detach();
      return result.value as number;
    };
    for (const { valeur } of THEMES) {
      await page.goto(accueil(valeur));
      await expect(page.getByText("Fêtes de fin d'année")).toBeVisible();
      expect(await sansFin(), `accueil ${valeur}`).toBe(0);
      await page.goto(catalogue(valeur));
      await expect(
        page.getByText("Chacun peut devenir un cadeau."),
      ).toBeVisible();
      expect(await sansFin(), `catalogue ${valeur}`).toBe(0);
    }
    await contexte.close();
  });

  test.describe("mouvement autorisé", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    test("la neige reste dans l'emblème", async ({ page }) => {
      await page.goto(accueil("NOEL_1"));
      const cadre = page.locator('[class*="__cadre"][data-borne]').first();
      await expect(cadre).toHaveAttribute("data-borne", "joue");

      // Aucun flocon ne sort du cadre de l'emblème : la neige ne passe jamais
      // sur le titre ni sur un bouton.
      await page.waitForTimeout(1500);
      const boiteCadre = await cadre.boundingBox();
      const neige = await cadre
        .locator('[class*="__neige"]')
        .first()
        .boundingBox();
      expect(boiteCadre && neige).toBeTruthy();
      expect(neige!.x).toBeGreaterThanOrEqual(boiteCadre!.x - 1);
      expect(neige!.x + neige!.width).toBeLessThanOrEqual(
        boiteCadre!.x + boiteCadre!.width + 1,
      );
    });

    /*
     * CHAQUE ÉLÉMENT BORNÉ, SUR LES DEUX PAGES, et pas le premier seulement :
     * le test de LS-268 n'en visait qu'un, trou relevé deux fois. Passé la
     * borne, seuls les décors `data-continu` tournent encore, ADR-045 amendé.
     */
    for (const chemin of [accueil("NOEL_1"), catalogue("NOEL_2")]) {
      test(`${chemin} : passé la borne, seuls les décors continus durent`, async ({
        page,
      }) => {
        // Jusqu'à cinq secondes par élément borné hors de l'écran.
        test.setTimeout(90_000);
        await page.goto(chemin);
        await page
          .locator('[class*="__flocon"]')
          .first()
          .waitFor({ state: "attached" });
        const bornes = page.locator("main [data-borne]");
        const nombre = await bornes.count();
        expect(nombre).toBeGreaterThan(2);
        for (let rang = 0; rang < nombre; rang += 1) {
          const borne = bornes.nth(rang);
          // Un décor masqué à cette largeur, la neige des marges sous
          // 1240 px, n'entre jamais dans l'écran : il n'a rien à borner.
          if (!(await borne.isVisible())) continue;
          await borne.scrollIntoViewIfNeeded();
          await expect(borne).toHaveAttribute("data-borne", "fin", {
            timeout: 7_000,
          });
        }
        // De retour en haut, l'observateur repasse la zone à `joue` : le
        // mouvement continu reprend, la mesure attend qu'il ait repris.
        await bornes.first().scrollIntoViewIfNeeded();
        await expect
          .poll(async () => (await animations(page)).enCours)
          .toBeGreaterThan(0);
        await expect(bornes.first()).toHaveAttribute("data-borne", "fin", {
          timeout: 7_000,
        });
        expect((await animations(page)).horsContinu).toBe(0);
      });
    }

    for (const { valeur } of THEMES) {
      test(`${valeur} : le bouton de pause fige tout, sur les deux pages`, async ({
        page,
      }) => {
        for (const chemin of [accueil(valeur), catalogue(valeur)]) {
          await page.goto(chemin);
          const pause = page.getByRole("button", {
            name: "Mettre en pause les animations",
          });
          await expect(pause).toBeVisible();
          await expect(pause).toHaveAttribute("aria-pressed", "false");
          await page.waitForTimeout(800);
          expect((await animations(page)).enCours).toBeGreaterThan(0);

          await pause.click();
          const relancer = page.getByRole("button", {
            name: "Relancer les animations",
          });
          await expect(relancer).toHaveAttribute("aria-pressed", "true");
          await expect
            .poll(async () => (await animations(page)).enCours)
            .toBe(0);

          // Le choix vaut pour la visite.
          await page.reload();
          await expect(
            page.getByRole("button", { name: "Relancer les animations" }),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Relancer les animations" })
            .click();
        }
      });
    }
  });

  test("l'écran des paramètres propose les deux thèmes et leurs aperçus", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");
    const groupe = page.getByRole("group", { name: "Thème saisonnier" });
    await expect(
      groupe.getByRole("radio", { name: /Aucun thème/ }),
    ).toBeChecked();
    await expect(
      groupe.getByRole("radio", { name: /Noël 1 \(sobre\)/ }),
    ).toBeVisible();
    await expect(
      groupe.getByRole("radio", { name: /Noël 2 \(franc\)/ }),
    ).toBeVisible();
    const liensAccueil = groupe.getByRole("link", { name: "l'accueil" });
    await expect(liensAccueil).toHaveCount(2);
    await expect(liensAccueil.nth(0)).toHaveAttribute(
      "href",
      accueil("NOEL_1"),
    );
    await expect(liensAccueil.nth(1)).toHaveAttribute(
      "href",
      accueil("NOEL_2"),
    );

    // Réappliquer « aucun thème » ne change rien d'autre que le message :
    // c'est le retour au thème par défaut, sans toucher l'état partagé.
    await page.getByRole("button", { name: "Appliquer ce thème" }).click();
    await expect(
      page.getByRole("status", { name: "État du thème saisonnier" }),
    ).toContainText("Habillage ordinaire rétabli");
  });
});

test.describe("visiteur", () => {
  for (const { valeur } of THEMES) {
    test(`un lien d'aperçu ${valeur} ne change rien pour un visiteur`, async ({
      page,
    }) => {
      await page.goto(accueil(valeur));
      await expect(page.locator("main")).not.toHaveAttribute(
        "data-theme",
        /.+/,
      );
      await expect(
        page.getByRole("status", { name: "Aperçu du thème" }),
      ).toHaveCount(0);
      await expect(page.getByText("Fêtes de fin d'année")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /animations/ }),
      ).toHaveCount(0);
      await page.goto(catalogue(valeur));
      await expect(
        page.getByText("Chacun peut devenir un cadeau."),
      ).toHaveCount(0);
    });
  }
});
