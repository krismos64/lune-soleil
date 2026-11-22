/**
 * La couche commune des écrans de l'administration, LS-326, ADR-045 amendé le
 * 14 novembre 2026 : couleur par famille, repère d'écran, sommaire de
 * Paramètres, repère d'état des lignes.
 *
 * LA TABLE DES ÉCRANS EST ÉCRITE ICI et non importée de la barre latérale :
 * c'est un composant client, qui tire ses feuilles de style. Le test
 * `navigation-administration.spec.ts` garde, lui, la barre contre ses routes.
 */
import { expect, test, type Page } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const ECRANS = [
  ["/administration", "accueil", "Accueil"],
  ["/administration/alertes", "accueil", "Accueil"],
  ["/administration/statistiques", "statistiques", "Statistiques"],
  ["/administration/commandes", "commandes", "Commandes"],
  ["/administration/expeditions", "commandes", "Commandes"],
  ["/administration/retractations", "retours", "Retours et factures"],
  ["/administration/factures", "retours", "Retours et factures"],
  ["/administration/messages", "clients", "Clients et avis"],
  ["/administration/avis", "clients", "Clients et avis"],
  ["/administration/clients", "clients", "Clients et avis"],
  ["/administration/produits", "catalogue", "Catalogue"],
  ["/administration/categories", "catalogue", "Catalogue"],
  ["/administration/stocks", "catalogue", "Catalogue"],
  ["/administration/parametres", "reglages", "Réglages"],
  ["/administration/passkeys", "reglages", "Réglages"],
  ["/administration/journal-connexions", "reglages", "Réglages"],
] as const;

/** La couleur du trait sous le titre : celle de la famille de l'écran. */
async function couleurDuTitre(page: Page): Promise<string> {
  return page
    .getByRole("heading", { level: 1 })
    .first()
    .evaluate((titre) => getComputedStyle(titre, "::after").backgroundColor);
}

test.describe("administratrice", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("chaque écran porte son repère et la couleur de sa famille, sans débordement", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const couleurs = new Map<string, Set<string>>();
    for (const [chemin, famille, libelle] of ECRANS) {
      await page.goto(chemin);
      const repere = page.locator("p[data-famille]");
      await expect(repere, chemin).toHaveAttribute("data-famille", famille);
      await expect(repere, chemin).toContainText(libelle);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
        chemin,
      ).toBeVisible();
      const couleur = await couleurDuTitre(page);
      couleurs.set(famille, (couleurs.get(famille) ?? new Set()).add(couleur));
      expect(await debordementHorizontal(page), chemin).toBeLessThanOrEqual(
        TOLERANCE_DEBORDEMENT_PX,
      );
    }
    // Une couleur par famille, la même sur tous ses écrans, sept en tout.
    for (const [famille, vues] of couleurs) {
      expect([...vues], famille).toHaveLength(1);
    }
    const distinctes = new Set(
      [...couleurs.values()].map((vues) => [...vues][0]),
    );
    expect(distinctes.size).toBe(7);
    expect(distinctes.has("rgba(0, 0, 0, 0)")).toBe(false);
  });

  /*
   * AUCUN MOT DU REPÈRE N'EST COUPÉ, nocturne du 15 novembre 2026. À 768 px,
   * le rappel « Ctrl K » ne laissait que 74 px au texte sous DejaVu Sans :
   * `overflow-wrap: anywhere` coupait « Paramètres » ou « Commandes » en plein
   * mot sans aucun débordement, donc sans qu'aucune mesure le voie, et
   * « Administration », écrit en plus petit, débordait de 14 px. Chaque mot
   * doit tenir sur une seule ligne, les noms de plusieurs mots se repliant
   * entre deux mots.
   */
  test("aucun mot du repère n'est coupé en deux lignes", async ({ page }) => {
    test.setTimeout(180_000);
    for (const [chemin] of ECRANS) {
      await page.goto(chemin);
      const coupes = await page
        .locator("p[data-famille]")
        .evaluate((repere) => {
          const fautifs: string[] = [];
          const parcours = document.createTreeWalker(
            repere,
            NodeFilter.SHOW_TEXT,
          );
          for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
            const texte = n.textContent ?? "";
            for (const mot of texte.matchAll(/\S+/g)) {
              const plage = document.createRange();
              plage.setStart(n, mot.index);
              plage.setEnd(n, mot.index + mot[0].length);
              const lignes = new Set(
                [...plage.getClientRects()].map((r) => Math.round(r.top)),
              );
              if (lignes.size > 1) fautifs.push(mot[0]);
            }
          }
          return fautifs;
        });
      expect(coupes, chemin).toEqual([]);
    }
  });

  /*
   * LE RAPPEL DU RACCOURCI ATTEND 1100 PX, même nocturne : c'est lui qui
   * prenait au repère la place de ses mots, de 768 à 1099 px. Le raccourci
   * marche à toute largeur, seul son rappel est masqué.
   */
  test("le rappel du raccourci n'apparaît qu'à partir de 1100 px", async ({
    page,
  }) => {
    await page.goto("/administration");
    const rappel = page
      .getByRole("button", { name: "Aller à…" })
      .locator("kbd");
    const largeur = page.viewportSize()?.width ?? 0;
    if (largeur >= 1100) {
      await expect(rappel).toBeVisible();
    } else {
      await expect(rappel).toBeHidden();
    }
    await page.setViewportSize({ width: 1099, height: 900 });
    await expect(rappel).toBeHidden();
  });

  test("un écran de détail garde le repère de sa liste", async ({ page }) => {
    await page.goto("/administration/produits/nouveau");
    const repere = page.locator("p[data-famille]");
    await expect(repere).toHaveAttribute("data-famille", "catalogue");
    await expect(repere).toContainText("Catalogue");
  });

  test("Paramètres : le sommaire dit l'état de chaque réglage et ouvre sa section", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");
    const sommaire = page.getByRole("navigation", {
      name: "Réglages de la boutique",
    });
    const liens = sommaire.getByRole("link");
    /*
     * TROIS SECTIONS DEPUIS LA REFONTE DU 22 NOVEMBRE 2026, chacune ouverte
     * par son entrée ; la promotion et sa période vivent avec l'ambiance.
     */
    await expect(liens).toHaveCount(3);
    for (const [nom, cible] of [
      ["Livraison", "/administration/parametres"],
      ["Ambiance et promotion", "/administration/parametres?section=ambiance"],
      ["Notifications", "/administration/parametres?section=notifications"],
    ] as const) {
      await expect(
        sommaire.getByRole("link", { name: new RegExp(`^${nom}`) }),
      ).toHaveAttribute("href", cible);
    }
    // L'état est écrit, pas seulement le nom du réglage.
    await expect(sommaire).toContainText("aucune promotion active");
    await expect(sommaire).toContainText(/Relais \d+,\d{2}\s€/);
    await expect(
      sommaire.getByRole("link", { name: /^Livraison/ }),
    ).toHaveAttribute("aria-current", "page");

    await sommaire
      .getByRole("link", { name: /^Ambiance et promotion/ })
      .click();
    await expect(page).toHaveURL(/section=ambiance$/);
    await expect(page.locator("#promotion")).toHaveCount(1);
    await expect(page.locator("#tarifs")).toHaveCount(0);

    // Le lien du tableau de bord amène la promotion SOUS le bandeau collant.
    await page.goto("/administration/parametres?section=ambiance#promotion");
    const section = page.locator("#promotion");
    await expect(section).toBeInViewport();
    const [haut, bandeau] = await Promise.all([
      section.evaluate((el) => el.getBoundingClientRect().top),
      page
        .locator("p[data-famille]")
        .evaluate((el) => el.parentElement!.getBoundingClientRect().bottom),
    ]);
    expect(haut).toBeGreaterThanOrEqual(bandeau - 1);
  });

  test("une ligne de commande porte un repère d'état qui double son badge", async ({
    page,
  }) => {
    await page.goto("/administration/commandes");
    const lignes = page.getByRole("main").locator("li[data-etat]");
    await expect(lignes.first()).toBeVisible();
    const paires = await lignes.evaluateAll((elements) =>
      elements.map((el) => ({
        ton: el.getAttribute("data-etat") ?? "",
        badge: el.querySelector("span")?.textContent?.trim() ?? "",
      })),
    );
    const TON: Record<string, string> = {
      "En attente de paiement": "attente",
      Confirmée: "cours",
      "En préparation": "cours",
      Expédiée: "fait",
      Livrée: "fait",
      Annulée: "ecarte",
    };
    expect(paires.length).toBeGreaterThan(0);
    for (const { ton, badge } of paires) {
      // Le badge écrit existe toujours : la couleur ne dit rien seule.
      expect(TON[badge], `badge « ${badge} »`).toBe(ton);
    }
  });

  test.describe("mouvement autorisé", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    test("une liste ne porte aucune boucle, et tout s'arrête en une seconde", async ({
      page,
    }) => {
      await page.goto("/administration/commandes");
      await expect(
        page.getByRole("heading", { name: "Commandes", level: 1 }),
      ).toBeVisible();
      const etat = () =>
        page.evaluate(() => {
          const enCours = document
            .getAnimations()
            .filter((animation) => animation.playState === "running");
          return {
            enCours: enCours.length,
            sansFin: enCours.filter(
              (a) => a.effect?.getTiming().iterations === Infinity,
            ).length,
          };
        });
      expect((await etat()).sansFin).toBe(0);
      await expect
        .poll(async () => (await etat()).enCours, { timeout: 3000 })
        .toBe(0);
    });
  });

  test.describe("mouvement réduit", () => {
    test.use({ contextOptions: { reducedMotion: "reduce" } });

    test("rien ne s'anime à l'arrivée sur un écran", async ({ page }) => {
      await page.goto("/administration/commandes");
      await expect(
        page.getByRole("heading", { name: "Commandes", level: 1 }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((animation) => animation.playState === "running").length,
        ),
      ).toBe(0);
    });
  });
});
