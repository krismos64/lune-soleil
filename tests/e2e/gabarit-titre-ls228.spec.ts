/**
 * Le gabarit de titre des deux espaces prives, LS-228.
 *
 * POURQUOI CE TEST EXISTE A COTE DU CONTROLE TEXTUEL.
 * `verifier-gabarit-titre.sh` lit des regles CSS : il voit qu'une regle heritee
 * est posee et que personne ne la repose. Il ne peut pas voir la police
 * REELLEMENT calculee, qu'une cascade, un ordre de chargement ou une
 * specificite inattendue pourraient encore changer.
 *
 * C'est le motif « controle textuel et test d'execution », deja en fiche sur ce
 * depot : les deux moities sont necessaires, aucune ne remplace l'autre. Le
 * defaut d'origine se mesurait precisement par `getComputedStyle` sur la
 * production, et aucune lecture de feuille de style ne l'avait montre en
 * dix-neuf jours.
 *
 * IL COUVRE LES DEUX ESPACES, et cette portee est le coeur du sujet : le defaut
 * vivait des deux cotes, sept titres sur quatorze. Un test ancre sur un seul
 * espace annoncerait « le gabarit tient » en n'ayant regarde qu'une moitie,
 * motif deja paye ici par `verifier-lien-evitement.sh`.
 *
 * LE DEBORDEMENT SE MESURE AVEC LE TITRE, jamais dans un test a part : un titre
 * plus grand est exactement ce qui pousse un ecran hors cadre a 320 px. Les
 * separer laisserait passer une regression ou le serif est bien pose ET la page
 * deborde.
 */
import { expect, test } from "@playwright/test";

import {
  FICHIER_SESSION,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * La premiere fonte de la pile `--ls-police-titre`. C'est la valeur que le
 * navigateur retient, et exactement celle qui disait `system-ui` sur les sept
 * ecrans fautifs releves le 13 septembre 2026.
 */
const SERIF_ATTENDU = "Iowan Old Style";

/**
 * Les ecrans a `h1` NU, sans aucune classe, sont volontairement dans la liste :
 * ce sont eux qu'une regle ancree sur une classe ne couvrirait pas, et ils
 * etaient quatre avant LS-228.
 */
const ECRANS_ADMINISTRATION = [
  "/administration",
  "/administration/commandes",
  "/administration/messages",
  "/administration/avis",
  "/administration/alertes",
  "/administration/stocks",
  "/administration/statistiques",
  "/administration/parametres",
  "/administration/retractations",
  "/administration/expeditions",
  "/administration/produits",
  "/administration/factures",
  "/administration/clients",
  "/administration/categories",
  "/administration/journal-connexions",
  "/administration/passkeys",
];

const ECRANS_COMPTE = [
  "/compte",
  "/compte/commandes",
  "/compte/adresses",
  "/compte/avis",
  "/compte/profil",
  "/compte/donnees",
];

async function verifierTitre(
  page: import("@playwright/test").Page,
  chemin: string,
): Promise<void> {
  await page.goto(chemin);

  const titre = page.locator("main h1").first();
  await expect(titre).toBeVisible();

  const police = await titre.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(police, `police du titre de ${chemin}`).toContain(SERIF_ATTENDU);

  const debordement = await debordementHorizontal(page);
  expect(debordement, `debordement de ${chemin}`).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
}

test.describe("Gabarit de titre, administration", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  for (const chemin of ECRANS_ADMINISTRATION) {
    test(`le titre de ${chemin} rend en serif`, async ({ page }) => {
      await verifierTitre(page, chemin);
    });
  }
});

test.describe("Gabarit de titre, espace client", () => {
  test.use({ storageState: FICHIER_SESSION });

  for (const chemin of ECRANS_COMPTE) {
    test(`le titre de ${chemin} rend en serif`, async ({ page }) => {
      await verifierTitre(page, chemin);
    });
  }
});

/*
 * LES BLOCS D'ÉTAT DES DEUX VUES D'ENSEMBLE, LS-228 critères 5 à 7.
 *
 * AUCUNE VALEUR EXACTE N'EST ATTENDUE : la base de bout en bout est partagée
 * entre fichiers et largeurs, et ses stocks bougent pendant la suite. Le test
 * vérifie ce qui ne dépend pas des voisins : les blocs existent, chaque valeur
 * est un nombre rendu depuis les données, l'état vide et l'état peuplé sont
 * cohérents entre eux, et rien ne déborde.
 */
test.describe("Blocs d'état, administration", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("le tableau de bord porte l'état du stock", async ({ page }) => {
    await page.goto("/administration");

    const panneau = page.getByRole("region", { name: "État du stock" });
    await expect(panneau).toBeVisible();

    for (const libelle of [
      "Pièces physiques",
      "Réservées par un paiement en cours",
      "Disponibles, hors réservations",
    ]) {
      const valeur = panneau.locator(`dt:text-is("${libelle}") + dd`);
      await expect(valeur).toHaveText(/^\d+$/);
    }

    const lien = panneau.getByRole("link", {
      name: "Voir les stocks et marchés",
    });
    expect((await lien.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });
});

test.describe("Blocs d'état, espace client", () => {
  test.use({ storageState: FICHIER_SESSION });

  test("la vue d'ensemble porte l'activité du compte", async ({ page }) => {
    await page.goto("/compte");

    const activite = page.getByRole("region", { name: "Mon activité" });
    await expect(activite).toBeVisible();

    const comptages = activite.getByRole("listitem");
    await expect(comptages).toHaveCount(3);
    for (const tuile of await comptages.all()) {
      await expect(tuile).toHaveText(/^\d+\s*\D+/);
    }

    // L'état vide et la carte sont exclusifs, et cohérents avec le compte.
    const nombreCommandes = Number(
      (await comptages.first().textContent())?.match(/^\d+/)?.[0],
    );
    const vide = activite.getByText("Aucune commande pour le moment.");
    const carte = activite.getByRole("link", { name: /^Commande / });
    if (nombreCommandes === 0) {
      await expect(vide).toBeVisible();
      await expect(carte).toHaveCount(0);
      const action = activite.getByRole("link", {
        name: "Découvrir les créations",
      });
      expect((await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
        44,
      );
    } else {
      await expect(carte).toBeVisible();
      await expect(vide).toHaveCount(0);
    }

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });
});
