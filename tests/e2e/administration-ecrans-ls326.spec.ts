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
  ["/administration", "ensemble", "Tableau de bord"],
  ["/administration/alertes", "ensemble", "Alertes"],
  ["/administration/statistiques", "ensemble", "Statistiques"],
  ["/administration/commandes", "ventes", "Commandes"],
  ["/administration/expeditions", "ventes", "Expéditions"],
  ["/administration/retractations", "ventes", "Rétractations"],
  ["/administration/factures", "ventes", "Factures et avoirs"],
  ["/administration/messages", "clients", "Messages"],
  ["/administration/avis", "clients", "Avis"],
  ["/administration/clients", "clients", "Clients"],
  ["/administration/produits", "catalogue", "Produits"],
  ["/administration/categories", "catalogue", "Catégories"],
  ["/administration/stocks", "catalogue", "Stocks et marchés"],
  ["/administration/parametres", "reglages", "Paramètres"],
  ["/administration/passkeys", "reglages", "Vos passkeys"],
  ["/administration/journal-connexions", "reglages", "Connexions"],
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
    // Une couleur par famille, la même sur tous ses écrans, cinq en tout.
    for (const [famille, vues] of couleurs) {
      expect([...vues], famille).toHaveLength(1);
    }
    const distinctes = new Set(
      [...couleurs.values()].map((vues) => [...vues][0]),
    );
    expect(distinctes.size).toBe(5);
    expect(distinctes.has("rgba(0, 0, 0, 0)")).toBe(false);
  });

  test("un écran de détail garde le repère de sa liste", async ({ page }) => {
    await page.goto("/administration/produits/nouveau");
    const repere = page.locator("p[data-famille]");
    await expect(repere).toHaveAttribute("data-famille", "catalogue");
    await expect(repere).toContainText("Produits");
  });

  test("Paramètres : le sommaire dit l'état de chaque réglage et y mène sous le bandeau", async ({
    page,
  }) => {
    await page.goto("/administration/parametres");
    const sommaire = page.getByRole("navigation", {
      name: "Réglages de la boutique",
    });
    const liens = sommaire.getByRole("link");
    await expect(liens).toHaveCount(4);
    for (const [nom, ancre] of [
      ["Livraison et alertes", "#tarifs"],
      ["Thème saisonnier", "#theme-saisonnier"],
      ["Promotion", "#promotion"],
      ["Période annoncée", "#periode-promotion"],
    ] as const) {
      const lien = sommaire.getByRole("link", { name: new RegExp(`^${nom}`) });
      await expect(lien).toHaveAttribute("href", ancre);
      // Chaque ancre désigne une section qui existe.
      await expect(page.locator(ancre)).toHaveCount(1);
    }
    // L'état est écrit, pas seulement le nom du réglage.
    await expect(sommaire).toContainText("Aucune promotion active");
    await expect(sommaire).toContainText(/Relais \d+,\d{2}\s€/);

    // L'ancre amène la section SOUS le bandeau collant, pas dessous lui.
    await sommaire.getByRole("link", { name: /^Promotion/ }).click();
    await expect(page).toHaveURL(/#promotion$/);
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
