/**
 * Ecran « Clients » de l'administration, de bout en bout. LS-185.
 *
 * CE QUE CE FICHIER PROUVE ET QUE RIEN D'AUTRE NE PROUVE. Un test d'integration
 * exercerait le service ; il ne dirait pas que la PAGE appelle
 * `exigerAdministratrice` avant tout rendu. Sur cet ecran, la garde est la
 * seule protection du fichier client entier : un client inscrit qui l'atteindrait
 * lirait le nom, l'adresse et l'historique de tous les autres.
 *
 * LA RECHERCHE LIBRE EST UN ECART ASSUME A ADR-027, arbitrage de Christophe du
 * 5 septembre 2026, ecrit dans `.claude/familles-sans-action.txt`, dans le
 * traitement T11 du registre et dans le service. Ces tests mesurent ce qui a
 * ete decide, ils ne le rediscutent pas.
 *
 * LE TEST DE FUITE EST LE PLUS IMPORTANT DU FICHIER. Il verifie qu'aucune
 * donnee ne sort avant la redirection : un ecran qui rendrait son contenu puis
 * naviguerait aurait deja tout divulgue.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  FICHIER_SESSION,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const ECRAN = "/administration/clients";

test.describe("sans le role", () => {
  test("un visiteur anonyme est redirige sans qu'aucune donnee ne sorte", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    await expect(page).toHaveURL(/\/administration\/connexion$/);

    await expect(
      page.getByRole("heading", { name: "Clients", level: 1 }),
    ).toHaveCount(0);

    /*
     * NI LE CHAMP DE RECHERCHE NI UNE ADRESSE EMAIL. Le titre seul ne suffirait
     * pas a prouver l'absence de fuite : une page qui rendrait sa liste avant
     * de rediriger aurait deja envoye les octets, et c'est le contenu qui
     * compte, pas l'en-tete.
     */
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByText(/@/)).toHaveCount(0);
  });

  /*
   * UN CLIENT CONNECTE EST REFUSE COMME UN ANONYME, et c'est le test qui
   * compte le plus sur cet ecran.
   *
   * `exigerSession` ne suffirait pas ici : un client inscrit sur la boutique
   * porte une session parfaitement valide. Seul le ROLE decide, et une page qui
   * se contenterait de la session ouvrirait le fichier de tous les clients a
   * n'importe lequel d'entre eux. Motif « fabriquer la preuve sans le role ».
   */
  test("un client connecte est refuse, la session ne suffit pas", async ({
    browser,
  }) => {
    /*
     * LE CHEMIN VIENT DE `chemin-session`, jamais ecrit en dur : les deux
     * fichiers de session sont nommes a un seul endroit, et un renommage
     * casserait ici en silence.
     *
     * `baseURL` EST PASSEE EXPLICITEMENT. Un contexte cree a la main N'EN HERITE
     * PAS, defaut mesure en LS-180 : `goto` n'avait alors aucune origine a
     * resoudre, et l'erreur se lisait « element not found » sur un titre
     * pourtant present, ce qui accusait le rendu au lieu de la navigation.
     */
    const contexte = await browser.newContext({
      storageState: FICHIER_SESSION,
      baseURL: test.info().project.use.baseURL ?? "",
    });
    const page = await contexte.newPage();

    await page.goto(ECRAN);

    await expect(page).toHaveURL(/\/administration\/connexion$/);
    await expect(
      page.getByRole("heading", { name: "Clients", level: 1 }),
    ).toHaveCount(0);

    await contexte.close();
  });
});

test.describe("connectee en administration", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("l'ecran s'atteint au clic depuis la barre, jamais par l'URL seule", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/administration");

    await page
      .getByRole("navigation", { name: "Sections de l'administration" })
      .getByRole("link", { name: "Clients" })
      .click();

    await expect(page).toHaveURL(/\/administration\/clients$/);
    await expect(
      page.getByRole("heading", { name: "Clients", level: 1 }),
    ).toBeVisible();
  });

  test("la recherche est serialisee dans l'URL et le retour la defait", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    await page.getByRole("searchbox").fill("zzz-aucun-client-zzz");
    await page.getByRole("button", { name: "Rechercher" }).click();

    /*
     * L'ETAT DANS L'URL EST CE QUI FAIT MARCHER LE RETOUR NAVIGATEUR. Un
     * formulaire en `POST` ou une Server Action garderait le terme dans l'etat
     * du navigateur : le retour ne le retrouverait pas, et un resultat ne se
     * partagerait pas par son lien.
     */
    await expect(page).toHaveURL(/\?recherche=zzz-aucun-client-zzz$/);

    /*
     * LE CHAMP GARDE SA VALEUR APRES NAVIGATION, `defaultValue` etant relu du
     * parametre : un champ vide apres recherche ferait croire que la recherche
     * n'a pas eu lieu.
     */
    await expect(page.getByRole("searchbox")).toHaveValue(
      "zzz-aucun-client-zzz",
    );

    /*
     * L'ETAT VIDE DIT SA CAUSE. « Aucun compte » sur une recherche ferait
     * croire que la boutique n'en a aucun, alors que le terme suffit a
     * l'expliquer.
     */
    await expect(page.getByText(/Aucun compte ne correspond/)).toBeVisible();

    await page.getByRole("link", { name: "Afficher tous les comptes" }).click();

    await expect(page).toHaveURL(/\/administration\/clients$/);
    await expect(page.getByRole("searchbox")).toHaveValue("");
  });

  /*
   * UN TERME INCONNU NE CASSE RIEN, ET N'EST JAMAIS INTERPRETE. Prisma passe le
   * terme en parametre lie, jamais en concatenation : ce test le constate sur
   * une chaine qui serait une injection si la requete etait construite par
   * assemblage de texte.
   */
  test("un terme qui ressemble a une injection est traite comme du texte", async ({
    page,
  }) => {
    await page.goto(`${ECRAN}?recherche=%27%3B+DROP+TABLE+utilisateur%3B+--`);

    await expect(
      page.getByRole("heading", { name: "Clients", level: 1 }),
    ).toBeVisible();

    await expect(page.getByText(/Aucun compte ne correspond/)).toBeVisible();
  });

  /*
   * L'ECRAN NE MODIFIE RIEN, ET CE TEST EST SA GARDE.
   *
   * La suppression d'un compte appartient a son titulaire, LS-95, et reste une
   * action sensible de la famille `IDENTIFIANTS`. Le jour ou quelqu'un
   * ajouterait un bouton de suppression ici, ce test rougit : aucun script
   * textuel ne sait dire qu'un ecran DOIT rester sans action.
   *
   * LE BOUTON DE RECHERCHE EST LE SEUL ATTENDU, et il ne modifie rien : le
   * formulaire est en `GET`, il navigue.
   */
  test("le seul bouton du contenu est celui de la recherche", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    const boutons = page.getByRole("main").getByRole("button");

    await expect(boutons).toHaveCount(1);
    await expect(boutons).toHaveAccessibleName("Rechercher");
  });

  test("l'ecran ne deborde pas et ne porte aucune violation d'accessibilite", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });
});
