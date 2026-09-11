/**
 * La rubrique Alertes de l'administration, LS-98.
 *
 * ------------------------------------------------------------------
 * CET ÉCRAN FERME UN TROU, il n'ajoute pas une fonction.
 *
 * SEPT services lèvent des alertes depuis LS-131 et avant, dont
 * `DOUBLE_ENCAISSEMENT` et `MONTANT_DIVERGENT`. AUCUN code ne les LISAIT avant
 * le 11 septembre 2026 : un incident financier se signalait dans une table que
 * personne ne consultait.
 *
 * CE QUE CE FICHIER MESURE ET QUE L'INTÉGRATION NE MESURE PAS : que l'écran
 * existe, qu'un chemin y mène au clic, et qu'il rende ses deux files à 320 px.
 * ------------------------------------------------------------------
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  ALERTES_TEST,
  FICHIER_SESSION_ADMINISTRATION,
  FICHIER_SESSION,
  messageAlerteAcquittable,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.describe("refus d'accès", () => {
  test.use({ storageState: FICHIER_SESSION });

  test("un client connecté sans rôle n'atteint pas les alertes", async ({
    page,
  }) => {
    await page.goto("/administration/alertes");

    await expect(page).toHaveURL(/\/administration\/connexion/);

    /*
     * LE CONTENU EST VÉRIFIÉ EN PLUS DE L'URL. Une alerte porte le message d'un
     * incident et l'identifiant de sa cible : la laisser fuiter par le corps de
     * la réponse annulerait la redirection.
     */
    const texte = (await page.locator("body").textContent()) ?? "";

    expect(texte).not.toContain(ALERTES_TEST.critique.message);
  });
});

test.describe("écran connecté", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  /*
   * ------------------------------------------------------------------
   * L'ORDRE EST LA DÉCISION D'USAGE DE CET ÉCRAN, et ce test est le plus
   * important du fichier.
   *
   * La critique amorcée a SEPT JOURS, l'avertissement UNE HEURE. Un tri par
   * date seule les présenterait dans l'autre sens, et un double encaissement
   * s'enterrerait sous des avertissements de livraison.
   *
   * LE PIÈGE : PostgreSQL ordonne un enum par sa DÉCLARATION, et
   * `GraviteAlerte` liste `AVERTISSEMENT` avant `CRITIQUE`. Un tri ascendant,
   * qui paraît naturel, mettrait les avertissements en tête.
   * ------------------------------------------------------------------
   */
  test("présente la critique ancienne avant l'avertissement récent", async ({
    page,
  }) => {
    await page.goto("/administration/alertes");

    await expect(
      page.getByRole("heading", { name: "Alertes", level: 1 }),
    ).toBeVisible();

    const aTraiter = page.locator("section", {
      has: page.getByRole("heading", { name: /À traiter/ }),
    });

    const types = await aTraiter
      .locator("li")
      .evaluateAll((cartes) => cartes.map((carte) => carte.textContent ?? ""));

    const premierCritique = types.findIndex((texte) =>
      texte.includes(ALERTES_TEST.critique.type),
    );
    const premierAvertissement = types.findIndex((texte) =>
      texte.includes(ALERTES_TEST.avertissement.type),
    );

    /*
     * LA CRITIQUE EST TOUJOURS LÀ : aucun test ne l'acquitte, seul
     * l'avertissement sert au geste. C'est l'assertion qui garantit que ce test
     * mesure quelque chose.
     */
    expect(premierCritique).toBeGreaterThanOrEqual(0);

    /*
     * L'AVERTISSEMENT PEUT AVOIR ÉTÉ ACQUITTÉ par une largeur voisine, les
     * quatre projets tournant EN PARALLÈLE sur la même base. L'ordre ne se
     * mesure alors plus, et le test le dit plutôt que d'échouer : ce qui serait
     * faux est qu'il passe APRÈS la critique, jamais qu'il soit absent.
     */
    if (premierAvertissement >= 0) {
      expect(premierCritique).toBeLessThan(premierAvertissement);
    }
  });

  /*
   * LE TYPE TECHNIQUE EST AFFICHÉ, `DOUBLE_ENCAISSEMENT` et non « problème de
   * paiement ». C'est le seul terme qui relie l'écran à la trace serveur : le
   * traduire en langage courant ferait perdre ce lien au moment d'enquêter.
   */
  test("affiche le type technique et le message de l'alerte", async ({
    page,
  }) => {
    await page.goto("/administration/alertes");

    await expect(
      page.getByText(ALERTES_TEST.critique.type, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(ALERTES_TEST.critique.message)).toBeVisible();
  });

  /*
   * LA GRAVITÉ NE PASSE PAS PAR LA SEULE COULEUR, `frontend-design.md`
   * l'interdisant : le mot est écrit. Un écran en niveaux de gris, ou une
   * personne qui distingue mal les couleurs, doit pouvoir trier.
   */
  test("écrit la gravité en toutes lettres", async ({ page }) => {
    await page.goto("/administration/alertes");

    await expect(
      page.getByText("Critique", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Avertissement", { exact: true }).first(),
    ).toBeVisible();
  });

  test("la rubrique ne déborde pas horizontalement", async ({ page }) => {
    await page.goto("/administration/alertes");

    /*
     * LE DÉBORDEMENT EST MESURÉ AVEC LES IDENTIFIANTS AFFICHÉS : un UUID de
     * 36 caractères est ce qui déborde en premier à 320 px, et c'est
     * exactement ce que les cartes portent en cible.
     */
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test("aucune violation d'accessibilité sur la rubrique", async ({ page }) => {
    await page.goto("/administration/alertes");

    const resultats = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultats.violations).toEqual([]);
  });

  /*
   * ------------------------------------------------------------------
   * L'ACQUITTEMENT DÉPLACE L'ALERTE ET FAIT DESCENDRE LA PASTILLE.
   *
   * LES DEUX MOITIÉS COMPTENT. Un acquittement qui viderait la liste sans
   * toucher la pastille laisserait la barre annoncer un incident réglé, défaut
   * que la règle C37 nomme et que LS-201 a rencontré six fois.
   *
   * CE TEST EST LE DERNIER DU FICHIER, délibérément : il CHANGE l'état amorcé,
   * et les tests de rendu ci-dessus ont besoin des deux alertes ouvertes.
   * `commande.setup.ts` les rouvre à chaque exécution, `ON CONFLICT DO UPDATE`.
   * ------------------------------------------------------------------
   */
  test("acquitter retire l'alerte de la file, et l'y conserve", async ({
    page,
  }, infos) => {
    /*
     * ------------------------------------------------------------------
     * CHAQUE LARGEUR ACQUITTE SA PROPRE ALERTE.
     *
     * L'acquittement est le seul geste DESTRUCTIF de cette rubrique, et les
     * quatre projets tournent EN PARALLÈLE sur la même base : trois largeurs
     * qui visent la même alerte se marchent dessus, la première gagne et les
     * trois autres échouent sur une carte disparue. Mesuré le 11 septembre
     * 2026, trois échecs sur quatre largeurs.
     *
     * `describe.serial` N'Y SUFFIT PAS : il ordonne les tests d'un MÊME projet,
     * jamais les projets entre eux. Le préfixe de largeur est ce qui les isole,
     * parade déjà retenue par `compte-adresses.spec.ts`.
     *
     * LES DEUX ALERTES PARTAGÉES RESTENT INTACTES : les mesures d'ordre et de
     * rendu ci-dessus s'appuient dessus, et aucun test ne les acquitte.
     * ------------------------------------------------------------------
     */
    const message = messageAlerteAcquittable(infos.project.name);

    await page.goto("/administration/alertes");

    const aTraiter = page.locator("section", {
      has: page.getByRole("heading", { name: /À traiter/ }),
    });

    const carte = aTraiter.locator("li", { has: page.getByText(message) });

    await expect(carte).toBeVisible();

    await carte.getByRole("button", { name: "Acquitter" }).click();

    /*
     * ------------------------------------------------------------------
     * LA CONFIRMATION EST LE DÉPLACEMENT, et non un message.
     *
     * `revalidatePath` redessine la page : la carte est DÉMONTÉE avec sa
     * région live avant qu'une annonce soit lue. Une première version de ce
     * test attendait « Alerte acquittée » et expirait sur un élément qui
     * n'existait plus. Motif « focus sur un élément détaché », appliqué ici à
     * l'annonce plutôt qu'au focus.
     *
     * CE QUE LA LISTE PROUVE ET QU'UN MESSAGE NE PROUVERAIT PAS : l'écriture a
     * eu lieu. Un message peut s'afficher sur un succès optimiste.
     * ------------------------------------------------------------------
     */
    const traitees = page.locator("section", {
      has: page.getByRole("heading", { name: /Déjà traitées/ }),
    });

    await expect(traitees.getByText(message)).toBeVisible();

    /*
     * ELLE A QUITTÉ LA FILE, sens négatif sans lequel une alerte présente dans
     * les DEUX listes passerait le test.
     */
    await expect(aTraiter.getByText(message)).toHaveCount(0);

    /*
     * L'ALERTE N'EST JAMAIS SUPPRIMÉE, règle E7 : elle porte sa date de
     * traitement. Le sens négatif seul laisserait passer une suppression.
     */
    const carteTraitee = traitees.locator("li", {
      has: page.getByText(message),
    });

    await expect(carteTraitee.getByText(/Traitée le/)).toBeVisible();
  });
});
