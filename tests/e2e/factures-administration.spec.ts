/**
 * Ecran « Factures et avoirs » de l'administration, de bout en bout. LS-184.
 *
 * CE QUE CE FICHIER PROUVE ET QUE RIEN D'AUTRE NE PROUVE. Un test d'integration
 * exercerait le service ; il ne dirait pas que la PAGE appelle
 * `exigerAdministratrice`, ni que la ROUTE de telechargement le fait de son
 * cote. Un ecran qui oublierait l'appel les passerait tous.
 *
 * LA ROUTE PDF EST LE POINT LE PLUS SENSIBLE. C'est un point d'entree HTTP qui
 * sert un document comptable portant un nom, une adresse et des montants :
 * verifier la seule redirection de la page laisserait ce chemin ouvert, defaut
 * exact trouve en relecture de LS-89 sur les Server Actions.
 *
 * L'ECRAN EST EN LECTURE SEULE, ET UN TEST LE VERIFIE. L'invariant 4 interdit
 * qu'une facture soit modifiee ou supprimee : le jour ou quelqu'un ajouterait un
 * bouton d'action ici, ce fichier doit rougir.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const ECRAN = "/administration/factures";

/*
 * UN IDENTIFIANT QUI N'EXISTE PAS, et c'est delibere : la garde de role doit
 * refuser AVANT toute lecture en base. Une route qui lirait la piece d'abord
 * rendrait le meme 404, donc ce test seul ne distingue pas les deux ordres ;
 * c'est la lecture du code qui le fait, et le commentaire de la route l'ecrit.
 * Ce qui est mesure ici est qu'aucun document ne sort sans session.
 */
const PIECE_INEXISTANTE = "3f2504e0-4f89-41d3-9a0c-0305e82c3310";

test.describe("sans session", () => {
  test("l'ecran redirige vers la connexion sans rien rendre", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    await expect(page).toHaveURL(/\/administration\/connexion$/);

    /*
     * LE TITRE N'APPARAIT NULLE PART. Une redirection qui laisserait le contenu
     * rendu avant de naviguer serait une fuite, et la liste porte des noms de
     * clients et des montants.
     */
    await expect(
      page.getByRole("heading", { name: "Factures et avoirs" }),
    ).toHaveCount(0);
  });

  test("la route de telechargement refuse en 404, jamais en 403", async ({
    request,
  }) => {
    const reponse = await request.get(`${ECRAN}/${PIECE_INEXISTANTE}`, {
      maxRedirects: 0,
    });

    /*
     * 404 ET NON 403, ET NON UNE REDIRECTION. Un 403 confirmerait que la piece
     * existe ; une redirection produirait un PDF corrompu, le navigateur
     * enregistrant la page de connexion sous le nom du document.
     */
    expect(reponse.status()).toBe(404);
    expect(reponse.headers()["content-type"]).not.toContain("application/pdf");
  });
});

test.describe("connectee en administration", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("l'ecran s'atteint au clic depuis la barre, jamais par l'URL seule", async ({
    page,
  }) => {
    /*
     * AU CLIC ET NON PAR `goto`, motif de C33 : un ecran qu'aucun lien ne
     * designe est inatteignable en pratique, et un test qui y arrive par URL ne
     * le verrait jamais. C'est le defaut que LS-162 a ferme cote administration,
     * et `verifier-navigation-administration.sh` le verifie de son cote sur les
     * chemins ; ici on verifie le lien reel.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/administration");

    await page
      .getByRole("navigation", { name: "Sections de l'administration" })
      .getByRole("link", { name: "Factures et avoirs" })
      .click();

    await expect(page).toHaveURL(/\/administration\/factures$/);
    await expect(
      page.getByRole("heading", { name: "Factures et avoirs", level: 1 }),
    ).toBeVisible();
  });

  test("les trois comptages et la mention de franchise sont presents", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    await expect(page.getByText("Factures", { exact: true })).toBeVisible();
    await expect(page.getByText("Avoirs", { exact: true })).toBeVisible();
    await expect(page.getByText("Total de la période")).toBeVisible();

    /*
     * LA MENTION DE FRANCHISE EST CELLE DES DOCUMENTS EMIS, article 293 B du
     * CGI. Cet ecran ne decide d'aucune obligation juridique, il redit ce que
     * l'instantane legal porte deja.
     */
    await expect(page.getByText(/293 B/)).toBeVisible();
  });

  test("le filtre de periode est serialise dans l'URL et marque son etat", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    const filtres = page.getByRole("navigation", {
      name: "Filtrer par période",
    });

    await filtres.getByRole("link", { name: "Ce mois-ci" }).click();

    /*
     * L'ETAT DANS L'URL EST CE QUI FAIT MARCHER LE RETOUR NAVIGATEUR, critere 4.
     * Un filtre garde dans l'etat React seul serait perdu au retour, et le lien
     * ne se partagerait pas.
     */
    await expect(page).toHaveURL(/\?periode=mois$/);

    await expect(
      filtres.getByRole("link", { name: "Ce mois-ci" }),
    ).toHaveAttribute("aria-current", "page");

    await expect(
      filtres.getByRole("link", { name: "Tout" }),
    ).not.toHaveAttribute("aria-current", "page");

    await page.goBack();

    await expect(page).toHaveURL(/\/administration\/factures$/);
    await expect(filtres.getByRole("link", { name: "Tout" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  /*
   * UNE PERIODE INCONNUE NE CASSE RIEN. L'invariant 7 veut que la chaine de
   * l'URL n'atteigne jamais la requete : elle sert a retrouver une entree de la
   * table des periodes, et une valeur inconnue retombe sur « Tout ».
   */
  test("une periode inconnue dans l'URL retombe sur Tout", async ({ page }) => {
    await page.goto(`${ECRAN}?periode=juillet-2026`);

    await expect(
      page.getByRole("heading", { name: "Factures et avoirs", level: 1 }),
    ).toBeVisible();

    await expect(
      page
        .getByRole("navigation", { name: "Filtrer par période" })
        .getByRole("link", { name: "Tout" }),
    ).toHaveAttribute("aria-current", "page");
  });

  /*
   * L'ECRAN EST EN LECTURE SEULE, critere 5, ET CE TEST EST SA GARDE.
   *
   * L'invariant 4 interdit qu'une facture soit modifiee ou supprimee. Le jour
   * ou quelqu'un ajouterait un bouton d'action sur cet ecran, ce test rougit :
   * c'est le seul controle automatique qui porte cette propriete, aucun script
   * textuel ne sachant dire qu'un ecran DOIT rester sans action.
   */
  test("aucun bouton d'action n'existe dans le contenu de cet ecran", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    /*
     * L'ASSERTION EST ANCREE SUR `main`, ET IL LE FAUT. Une recherche sur la
     * page entiere trouve le bouton « Se déconnecter » de la barre laterale,
     * rendu par le layout sur les quinze ecrans de l'administration : le test
     * echouait donc sur un ecran pourtant correct, en accusant le gabarit.
     *
     * CE QUI EST MESURE EST BIEN LE CONTENU. Une Server Action de cet ecran s'y
     * afficherait forcement, un formulaire ne vivant pas dans la barre.
     */
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
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

  test("une piece inexistante rend 404 et jamais un PDF vide", async ({
    request,
  }) => {
    const reponse = await request.get(`${ECRAN}/${PIECE_INEXISTANTE}`);

    /*
     * 404 PLUTOT QU'UN CORPS VIDE EN 200. Un PDF de zero octet enregistre sous
     * le nom du document ferait croire a un fichier corrompu, et l'exploitante
     * chercherait le defaut du mauvais cote.
     */
    expect(reponse.status()).toBe(404);
  });
});
