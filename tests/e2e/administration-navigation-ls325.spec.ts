/**
 * La navigation repensée de l'administration, LS-325, ADR-045 amendé le
 * 14 novembre 2026 : palette « Aller à… », actions directes et arc du jour
 * du tableau de bord.
 *
 * CE FICHIER NE REFAIT PAS `navigation-administration.spec.ts`, qui verrouille
 * la barre latérale, ses groupes et ses pastilles. Il couvre ce qui est neuf :
 * le clavier de la palette, le retour du focus, et le cadre du mouvement.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/** Les animations en cours, et celles qui ne finiraient jamais. */
async function animations(page: Page) {
  return page.evaluate(() => {
    const enCours = document
      .getAnimations()
      .filter((animation) => animation.playState === "running");
    return {
      enCours: enCours.length,
      sansFin: enCours.filter(
        (animation) => animation.effect?.getTiming().iterations === Infinity,
      ).length,
    };
  });
}

test.describe("administratrice", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("la palette s'ouvre au clic, filtre sans accents, et mène à la rubrique au clavier", async ({
    page,
  }) => {
    await page.goto("/administration");
    const declencheur = page.getByRole("button", { name: "Aller à…" });
    await declencheur.click();

    const palette = page.getByRole("dialog", {
      name: "Aller à une rubrique ou à une action",
    });
    await expect(palette).toBeVisible();
    const champ = palette.getByRole("combobox");
    await expect(champ).toBeFocused();

    // Sans rien taper : les actions directes d'abord, puis les rubriques.
    const options = palette.getByRole("option");
    await expect(options.first()).toContainText("Créer un produit");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");

    // « categories » trouve « Catégories », sans l'accent.
    await champ.fill("categories");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText("Catégories");

    // Un mot sans résultat le dit, dans une région d'état.
    await champ.fill("zzzz");
    await expect(options).toHaveCount(0);
    await expect(palette.getByRole("status")).toHaveText(
      "Aucune rubrique ne correspond. Essayez un autre mot.",
    );

    // « stock » mène à la rubrique dont c'est le NOM, pas à l'action dont la
    // précision cite le stock ; le compte des résultats est annoncé.
    await champ.fill("stock");
    await expect(options.first()).toContainText("Stocks et marchés");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await expect(palette.getByRole("status")).toHaveText("2 résultats");

    // Au clavier, l'option active reste dans la zone visible de la liste,
    // et le champ désigne bien l'option que la liste montre active.
    await champ.fill("");
    const liste = palette.getByRole("listbox");
    for (let pas = 0; pas < 15; pas += 1) await champ.press("ArrowDown");
    const activeAffichee = palette.locator(
      '[role="option"][aria-selected="true"]',
    );
    await expect(champ).toHaveAttribute(
      "aria-activedescendant",
      (await activeAffichee.getAttribute("id")) ?? "absent",
    );
    const [boiteListe, boiteOption] = await Promise.all([
      liste.boundingBox(),
      activeAffichee.boundingBox(),
    ]);
    expect(boiteOption!.y).toBeGreaterThanOrEqual(boiteListe!.y - 1);
    expect(boiteOption!.y + boiteOption!.height).toBeLessThanOrEqual(
      boiteListe!.y + boiteListe!.height + 1,
    );

    // Les flèches déplacent l'option active, annoncée au champ.
    await champ.fill("comm");
    await expect(options.first()).toContainText("Commandes");
    await champ.press("ArrowDown");
    await champ.press("ArrowUp");
    await expect(champ).toHaveAttribute(
      "aria-activedescendant",
      (await options.first().getAttribute("id")) ?? "absent",
    );
    await champ.press("Enter");
    await expect(page).toHaveURL(/\/administration\/commandes$/);
    await expect(
      page.getByRole("heading", { name: "Commandes", level: 1 }),
    ).toBeVisible();
    await expect(palette).toBeHidden();
  });

  /*
   * `ControlOrMeta` : Cmd+K sur un Mac, Ctrl+K ailleurs, comme le composant.
   * Sur le runner Linux, c'est Ctrl+K qui est exercé.
   */
  test("Le raccourci clavier ouvre la palette, Échap la ferme et rend le focus au bouton", async ({
    page,
  }) => {
    await page.goto("/administration/commandes");
    const declencheur = page.getByRole("button", { name: "Aller à…" });
    const palette = page.getByRole("dialog", {
      name: "Aller à une rubrique ou à une action",
    });

    /*
     * LE RACCOURCI EST REJOUÉ TANT QUE L'ÉTAT VOULU N'EST PAS ATTEINT. Deux
     * raisons mesurées : l'écouteur se pose à l'hydratation, qu'une première
     * frappe peut précéder, et une frappe de synthèse se perd parfois sous
     * charge. Mesuré hors charge sur trente répétitions à 320 et 1280 px :
     * 30 frappes reçues, 30 ouvertures, 30 retours de focus. La frappe n'est
     * rejouée que si l'état n'a pas basculé, jamais deux fois d'affilée.
     */
    const basculer = async (ouverte: boolean) => {
      await expect(async () => {
        if ((await palette.isVisible()) !== ouverte) {
          await page.keyboard.press("ControlOrMeta+k");
        }
        await (ouverte
          ? expect(palette).toBeVisible({ timeout: 1000 })
          : expect(palette).toBeHidden({ timeout: 1000 }));
      }).toPass({ timeout: 10_000 });
    };

    await declencheur.focus();
    await basculer(true);
    await expect(palette.getByRole("combobox")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(declencheur).toBeFocused();

    // Le même raccourci la rouvre, puis la referme quand elle est ouverte.
    await basculer(true);
    await basculer(false);
  });

  test("la palette ouverte tient dans l'écran et ses contrastes passent", async ({
    page,
  }) => {
    await page.goto("/administration");
    await page.getByRole("button", { name: "Aller à…" }).click();
    const palette = page.getByRole("dialog", {
      name: "Aller à une rubrique ou à une action",
    });
    await expect(palette).toBeVisible();
    const boite = await palette.boundingBox();
    const ecran = page.viewportSize()!;
    expect(boite!.x).toBeGreaterThanOrEqual(0);
    expect(boite!.x + boite!.width).toBeLessThanOrEqual(ecran.width);
    expect(boite!.y + boite!.height).toBeLessThanOrEqual(ecran.height);

    const resultat = await new AxeBuilder({ page })
      .include("dialog")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(resultat.violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
  });

  test("le tableau de bord porte ses actions directes, « À traiter » avant les chiffres", async ({
    page,
  }) => {
    await page.goto("/administration");
    await expect(
      page.getByRole("heading", { name: "Tableau de bord", level: 1 }),
    ).toBeVisible();

    const actions = page.getByRole("navigation", { name: "Actions directes" });
    await expect(actions.getByRole("link")).toHaveCount(4);
    for (const [nom, chemin] of [
      ["Créer un produit", "/administration/produits/nouveau"],
      ["Enregistrer une vente de marché", "/administration/stocks"],
      [
        "Changer le thème de la boutique",
        "/administration/parametres#theme-saisonnier",
      ],
      ["Régler une promotion", "/administration/parametres#promotion"],
    ] as const) {
      await expect(actions.getByRole("link", { name: nom })).toHaveAttribute(
        "href",
        chemin,
      );
    }

    // L'ordre de lecture : ce qui attend un geste, puis les indicateurs.
    // Les indicateurs arrivent sous un `<Suspense>` : attendre le contenu
    // réel, sans quoi la mesure porte sur l'armature de chargement.
    await expect(
      page.getByRole("heading", { name: "À traiter maintenant", level: 2 }),
    ).toBeVisible();
    await expect(page.getByText("Encaissé aujourd'hui")).toBeVisible();
    const ordre = await page.getByRole("main").evaluate((main) => {
      const texte = main.textContent ?? "";
      return texte.indexOf("À traiter maintenant") < texte.indexOf("Encaissé");
    });
    expect(ordre).toBe(true);

    // L'arc du jour est un décor : aucun texte dedans, rien d'annoncé.
    const ciel = page.locator("main header [data-moment]");
    await expect(ciel).toHaveAttribute("aria-hidden", "true");
    await expect(ciel).toHaveText("");

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );

    await actions.getByRole("link", { name: "Créer un produit" }).click();
    await expect(page).toHaveURL(/\/administration\/produits\/nouveau$/);
  });

  test.describe("mouvement autorisé", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    test("l'entrée du tableau de bord finit seule, aucune boucle", async ({
      page,
    }) => {
      await page.goto("/administration");
      await expect(page.locator("main header [data-moment]")).toBeVisible();
      // L'arc se trace et l'astre monte : rien d'infini, à aucun moment.
      expect((await animations(page)).sansFin).toBe(0);
      // Deux secondes au plus, ADR-045 amendé : ensuite, plus rien ne bouge.
      await expect
        .poll(async () => (await animations(page)).enCours, { timeout: 4000 })
        .toBe(0);
    });
  });

  test.describe("mouvement réduit", () => {
    test.use({ contextOptions: { reducedMotion: "reduce" } });

    test("rien ne s'anime, ni l'arc ni la palette", async ({ page }) => {
      await page.goto("/administration");
      await expect(page.locator("main header [data-moment]")).toBeVisible();
      expect((await animations(page)).enCours).toBe(0);
      await page.getByRole("button", { name: "Aller à…" }).click();
      await expect(page.getByRole("combobox")).toBeFocused();
      expect((await animations(page)).enCours).toBe(0);
    });
  });
});

test.describe("sans session", () => {
  test("la palette n'existe pas sur l'écran de connexion", async ({ page }) => {
    await page.goto("/administration/connexion");
    await expect(page.getByRole("button", { name: "Aller à…" })).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
