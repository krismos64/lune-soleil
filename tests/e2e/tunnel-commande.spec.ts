/**
 * Tunnel de commande de bout en bout, LS-115. Etape 3b du parcours 1.
 *
 * AUCUNE DONNEE DU PROTOTYPE, interdit du projet. Les pieces viennent de
 * `CATALOGUE_TEST`, prefixees `TEST`.
 *
 * LE TRANSPORTEUR EST EN PANNE PENDANT TOUS CES TESTS, et ce n'est pas une
 * simulation artificielle : le compte Mondial Relay n'est pas ouvert, LS-27 et
 * LS-18, donc `fournisseurPointsRetrait` leve. C'est exactement le cas d'erreur
 * du parcours 1, et il se trouve etre l'etat reel du systeme aujourd'hui.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const CHEMIN_FICHE = `/produit/${CATALOGUE_TEST.enStock.slug}`;

/** Remplit l'etape des coordonnees et passe a la suivante. */
async function remplirCoordonnees(page: import("@playwright/test").Page) {
  await page.getByLabel("Nom et prénom").fill("Camille Dupont");
  await page.getByLabel("Adresse email").fill("camille.dupont@exemple.test");
  await page.getByRole("button", { name: "Continuer" }).click();
}

/**
 * Choisit le domicile a l'etape 3 et passe a la suivante.
 *
 * COCHER EST OBLIGATOIRE : depuis la correction du 25 aout 2026, aucun mode
 * n'est preselectionne et le bouton reste inactif tant que rien n'est retenu.
 * Un test qui cliquait sans cocher attendait donc un bouton desactive.
 */
async function choisirDomicile(page: import("@playwright/test").Page) {
  await page.getByRole("radio", { name: "À domicile" }).check();

  /*
   * ATTENDRE QUE LE BOUTON SOIT ACTIF AVANT DE CLIQUER. Il porte
   * `disabled={enCours || mode === null}` : entre le `check()` et le rendu
   * React qui leve `disabled`, il existe une fenetre ou le clic part sur un
   * bouton inerte. Elle est invisible en local et se voit en integration
   * continue, plus lente : neuf echecs sur trois tests le 25 aout 2026, zero
   * en local.
   */
  await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
  await page.getByRole("button", { name: "Continuer" }).click();
}

/** Remplit l'etape de l'adresse et passe a la suivante. */
async function remplirAdresse(page: import("@playwright/test").Page) {
  await page.getByLabel("Adresse", { exact: true }).fill("12 rue des Ateliers");
  await page.getByLabel("Code postal").fill("35000");
  await page.getByLabel("Ville").fill("Rennes");
  await page.getByRole("button", { name: "Continuer" }).click();
}

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();

  await page.goto(CHEMIN_FICHE);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(
    page.getByRole("status", { name: "Ajout au panier" }),
  ).toHaveText("Ajouté au panier.");
});

test("un panier vide ne peut pas entrer dans le tunnel", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/commande");

  /* Le visiteur est renvoye au panier plutot que de remplir quatre etapes. */
  await expect(page).toHaveURL(/\/panier$/);
});

test("la zone desservie est annoncee des l'entree du tunnel", async ({
  page,
}) => {
  await page.goto("/commande");

  /*
   * L221-14 ALINEA 3 : les restrictions de livraison s'indiquent « au plus tard
   * au debut du processus de commande », donc pas au recapitulatif. Etabli par
   * LS-86, voir `.claude/rules/legal.md`.
   */
  await expect(
    page.getByText("Livraison en France métropolitaine, Corse comprise."),
  ).toBeVisible();
});

test("les quatre etapes s'enchainent et le focus suit le titre", async ({
  page,
}) => {
  await page.goto("/commande");

  await expect(
    page.getByRole("heading", { name: "Vos coordonnées" }),
  ).toBeVisible();

  await remplirCoordonnees(page);

  await expect(
    page.getByRole("heading", { name: "Votre adresse de livraison" }),
  ).toBeVisible();

  /*
   * LE FOCUS EST SUR LE TITRE, critere 7 et LS-85. Sans `tabIndex={-1}` sur le
   * titre, `focus()` ne fait rien et le focus retombe sur `body` : la page
   * defile peut-etre, mais personne au lecteur d'ecran ne sait qu'elle a
   * change, et axe-core ne le voit pas non plus.
   */
  await expect(
    page.getByRole("heading", { name: "Votre adresse de livraison" }),
  ).toBeFocused();

  await remplirAdresse(page);

  await expect(
    page.getByRole("heading", { name: "Votre mode de livraison" }),
  ).toBeFocused();
});

test("une saisie invalide est annoncee et ne fait pas avancer", async ({
  page,
}) => {
  await page.goto("/commande");

  await page.getByLabel("Nom et prénom").fill("Camille Dupont");
  await page.getByLabel("Adresse email").fill("camille.dupont@exemple.test");
  await page.getByLabel("Téléphone").fill("00");
  await page.getByRole("button", { name: "Continuer" }).click();

  /*
   * REGION LIVE `alert` ET NON `status`, critere 8 : une erreur de saisie
   * interrompt la personne, c'est precisement ce que `alert` fait.
   *
   * ELLE EST NOMMEE, et c'est necessaire : Next.js pose son propre
   * `role="alert"` pour annoncer les changements de route, et un selecteur non
   * qualifie resout vers deux elements. Le nom rend la region identifiable pour
   * le test comme pour un lecteur d'ecran, qui distingue alors les erreurs de
   * saisie de l'annonce de navigation.
   */
  await expect(
    page.getByRole("alert", { name: "Erreurs de saisie" }),
  ).toContainText("Téléphone");

  /* Et l'etape n'a pas change : un echec ne fait jamais avancer. */
  await expect(
    page.getByRole("heading", { name: "Vos coordonnées" }),
  ).toBeVisible();
});

test("le transporteur indisponible laisse commander a domicile", async ({
  page,
}) => {
  await page.goto("/commande");
  await remplirCoordonnees(page);
  await remplirAdresse(page);

  /*
   * LE CRITERE 6, LE PLUS IMPORTANT DE LA STORY. La liste des points ne
   * s'affiche pas, le message est explicite et sans jargon, et le domicile
   * reste choisissable : une panne degrade le choix au lieu de fermer la vente.
   */
  await expect(page.getByRole("status")).toContainText(
    "momentanément indisponible",
  );

  await expect(page.getByRole("radio", { name: "À domicile" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Point Relais" })).toHaveCount(
    0,
  );

  await choisirDomicile(page);

  await expect(
    page.getByRole("heading", { name: "Vérifier votre commande" }),
  ).toBeVisible();
});

test("le recapitulatif porte le montant et la mention imposee", async ({
  page,
}) => {
  await page.goto("/commande");
  await remplirCoordonnees(page);
  await remplirAdresse(page);
  await choisirDomicile(page);

  await expect(
    page.getByRole("heading", { name: "Vérifier votre commande" }),
  ).toBeVisible();

  /* L221-14 alinea 1 : les caracteristiques essentielles et le prix. */
  await expect(page.getByText("Sous-total")).toBeVisible();

  /*
   * L221-14 ALINEA 2 : la mention est imposee SUR LE BOUTON lui-meme. « Payer »
   * ou « Valider » seuls ne satisfont pas l'exigence. Etabli par LS-86.
   */
  await expect(
    page.getByRole("button", { name: "Commander avec obligation de paiement" }),
  ).toBeVisible();

  /*
   * L'ADRESSE EST RAPPELEE. Aucun texte ne l'impose, ni L221-14 ni L221-5 ni
   * L111-1 : c'est une decision d'ergonomie du 25 aout 2026, et ce test la
   * verrouille sans en faire une obligation legale.
   */
  await expect(page.getByText("12 rue des Ateliers")).toBeVisible();
  await expect(page.getByText("35000 Rennes")).toBeVisible();
});

test("le recapitulatif n'est pas atteignable sur une saisie vide", async ({
  page,
}) => {
  /*
   * DEFAUT CORRIGE LE 25 AOUT 2026, releve par `ls-frontend-revue`. Avant la
   * garde de progression, cette URL rendait un recapitulatif d'apparence
   * complete, avec un total juste et le bouton legal, mais sans nom, sans email
   * et sans adresse : une commande sans destinataire, atteignable par un simple
   * lien partage.
   */
  await page.goto("/commande?etape=recapitulatif");

  await expect(
    page.getByRole("heading", { name: "Vos coordonnées" }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Commander avec obligation de paiement" }),
  ).toHaveCount(0);
});

test("le recapitulatif exige un mode de livraison choisi", async ({ page }) => {
  /*
   * DEFAUT CORRIGE LE 25 AOUT 2026, releve par `ls-critical-reviewer`. La garde
   * de progression ne testait que les etapes 1 et 2 : en sautant l'etape 3, le
   * recapitulatif affichait « À domicile » avec ses frais de port et le bouton
   * legal, alors que personne n'avait choisi ce mode. Sur un panier sous la
   * franchise cela facturait 4,99 EUR au lieu de 4,10 EUR, et LS-117 aurait
   * ecrit une commande DOMICILE non voulue que le CHECK ne peut pas attraper.
   */
  await page.goto("/commande");
  await remplirCoordonnees(page);
  await remplirAdresse(page);

  /*
   * L'ETAPE 3 EST ATTEINTE MAIS AUCUN MODE N'EST COCHE. On attend d'y etre
   * avant de sauter au recapitulatif : sans cela le `goto` peut partir pendant
   * que la Server Action de l'adresse ecrit encore son cookie, et la page
   * repondrait alors sur une saisie incomplete.
   */
  await expect(
    page.getByRole("heading", { name: "Votre mode de livraison" }),
  ).toBeVisible();

  await page.goto("/commande?etape=recapitulatif");

  /* La garde ramene a l'etape 3, le mode n'ayant jamais ete retenu. */
  await expect(
    page.getByRole("heading", { name: "Votre mode de livraison" }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Commander avec obligation de paiement" }),
  ).toHaveCount(0);
});

test("aucun mode n'est preselectionne a l'etape de livraison", async ({
  page,
}) => {
  await page.goto("/commande");
  await remplirCoordonnees(page);
  await remplirAdresse(page);

  /*
   * AUCUN MODE PAR DEFAUT : le bouton reste inactif tant que rien n'est coche.
   * Preselectionner ferait choisir a la place du visiteur, ce qui est
   * exactement le defaut que le mode nullable ferme.
   */
  await expect(
    page.getByRole("radio", { name: "À domicile" }),
  ).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();

  await page.getByRole("radio", { name: "À domicile" }).check();

  await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
});

test("une etape franchie se rouvre depuis le fil", async ({ page }) => {
  /*
   * Sans ce lien, corriger une faute d'adresse depuis le recapitulatif imposait
   * de repasser par le panier ou d'editer l'URL a la main.
   */
  await page.goto("/commande");
  await remplirCoordonnees(page);

  await expect(
    page.getByRole("heading", { name: "Votre adresse de livraison" }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Vos coordonnées Revenir à cette étape." })
    .click();

  await expect(
    page.getByRole("heading", { name: "Vos coordonnées" }),
  ).toBeVisible();

  /* Et la saisie est retrouvee, pas perdue. */
  await expect(page.getByLabel("Nom et prénom")).toHaveValue("Camille Dupont");
});

test("le tunnel ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/commande");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  await remplirCoordonnees(page);
  await remplirAdresse(page);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  await choisirDomicile(page);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le tunnel ne porte aucune violation d'accessibilite serieuse", async ({
  page,
}) => {
  await page.goto("/commande");
  await remplirCoordonnees(page);
  await remplirAdresse(page);
  await choisirDomicile(page);

  /*
   * ATTENDRE LE TITRE DE L'ETAPE AVANT D'ANALYSER, et ce n'est pas une
   * complaisance envers le test.
   *
   * Mesure le 25 aout 2026 : pendant une navigation client de Next.js, le
   * `<title>` du document est momentanement VIDE avant d'etre repose. Analyser
   * dans cette fenetre faisait remonter `document-title` trois fois sur cinq,
   * et le test s'arretait en realite a l'etape `livraison`, pas au
   * recapitulatif. Attendre le titre place l'analyse la ou un visiteur se
   * trouve reellement, une fois la page etablie.
   */
  await expect(
    page.getByRole("heading", { name: "Vérifier votre commande" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Votre commande/);

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const resume = resultat.violations.map(
    (violation) => `${violation.id} (${violation.impact}) : ${violation.help}`,
  );

  expect(resume).toEqual([]);
});

/*
 * CE QUE CE TEST PROUVE ET QU'`axe-core` NE PROUVE PAS, critere 5 de LS-85.
 *
 * `axe-core` verifie l'absence de violations ; il ne dit rien de ce qu'une
 * personne ENTEND. Une region live anonyme, un titre qui ne suit pas l'etape,
 * un bouton dont le nom ne decrit pas l'effet : rien de tout cela n'est une
 * violation, et tout cela rend le parcours inutilisable sans l'ecran.
 *
 * L'assertion porte sur l'arbre d'accessibilite tel que le navigateur le
 * calcule, c'est-a-dire la source meme que lit un lecteur d'ecran. Elle a ete
 * ecrite d'apres une CAPTURE du parcours reel, `locator.ariaSnapshot()`, et non
 * d'apres ce qu'on esperait y trouver : la capture du 1er septembre 2026 a
 * revele deux regions `status` sans nom, sur le panier et sur ce tunnel, que
 * quatre mois de tests verts n'avaient pas vues.
 *
 * ELLE NE REMPLACE PAS UNE ECOUTE HUMAINE au lecteur d'ecran, qui reste a faire
 * et qu'aucun outil ne simule. Elle attrape ce qui se degrade en silence entre
 * deux ecoutes.
 */
test("le parcours annonce chaque etape a un lecteur d'ecran", async ({
  page,
}) => {
  await page.goto("/commande");

  /*
   * ATTENDRE LE FOCUS PLUTOT QUE LA VISIBILITE. Une capture prise pendant la
   * transition montre le titre de l'etape PRECEDENTE avec le fil de la
   * suivante, et l'assertion echouerait sur un artefact de mesure. Constate le
   * 1er septembre 2026 en capturant l'arbre sans cette attente.
   */
  await remplirCoordonnees(page);
  await expect(
    page.getByRole("heading", { name: "Votre adresse de livraison" }),
  ).toBeFocused();

  await remplirAdresse(page);
  await expect(
    page.getByRole("heading", { name: "Votre mode de livraison" }),
  ).toBeFocused();

  /*
   * L'ETAPE DE LIVRAISON, transporteur en panne. Les etapes franchies sont
   * devenues des liens NOMMES, ce qui permet d'y revenir sans voir l'ecran, et
   * l'indisponibilite est annoncee par une region live qui porte son nom.
   */
  await expect(page.locator("main")).toMatchAriaSnapshot(`
    - list "Progression de la commande":
      - listitem:
        - text: "1"
        - link "Vos coordonnées Revenir à cette étape."
      - listitem:
        - text: "2"
        - link "Votre adresse de livraison Revenir à cette étape."
      - listitem: 3 Votre mode de livraison
      - listitem: 4 Vérifier votre commande
    - heading "Votre mode de livraison" [level=1]
    - alert "Erreurs de saisie"
    - status "Disponibilité des points de retrait": /momentanément indisponible/
    - group "Mode de livraison":
      - text: Mode de livraison
      - radio "À domicile"
      - text: À domicile
    - button "Continuer" [disabled]
  `);

  await choisirDomicile(page);
  await expect(
    page.getByRole("heading", { name: "Vérifier votre commande" }),
  ).toBeFocused();
});

/*
 * LA PAGE DE CONFIRMATION, LS-117.
 *
 * ELLE S'ATTEINT DIRECTEMENT PAR SON URL, sans derouler le tunnel : elle ne lit
 * rien en base et n'affiche que ce que le parametre porte. Passer par un achat
 * complet exigerait une base ecrite depuis un test de rendu, ce que le projet
 * evite.
 *
 * SANS CES DEUX TESTS ELLE N'ETAIT GARDEE PAR RIEN, et deux defauts
 * d'accessibilite y sont passes : l'ancre du lien d'evitement absente et le
 * focus jamais deplace. Releve par `ls-frontend-revue` le 25 aout 2026, motif
 * « un defaut absent n'est pas un defaut empeche ».
 */
const URL_CONFIRMATION = "/commande/confirmation?numero=C-2026-0001";

test("la confirmation de commande ne deborde pas horizontalement", async ({
  page,
}) => {
  await page.goto(URL_CONFIRMATION);

  await expect(
    page.getByRole("heading", { name: "Votre commande est enregistrée" }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("la confirmation porte la cible du lien d'evitement et recoit le focus", async ({
  page,
}) => {
  await page.goto(URL_CONFIRMATION);

  await expect(
    page.getByRole("heading", { name: "Votre commande est enregistrée" }),
  ).toBeVisible();

  /*
   * LE FOCUS EST SUR LE CONTENU, pas sur `body`. Un `body` focalise signifie que
   * la personne au lecteur d'ecran ne sait pas que la page a change : c'est
   * exactement ce que produisait la page avant correction, sans qu'aucune erreur
   * ne soit levee ni qu'`axe-core` ne le voie.
   */
  await expect(page.locator("main#contenu")).toBeFocused();
});

test("la confirmation ne porte aucune violation d'accessibilite serieuse", async ({
  page,
}) => {
  await page.goto(URL_CONFIRMATION);

  await expect(
    page.getByRole("heading", { name: "Votre commande est enregistrée" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Votre commande/);

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const resume = resultat.violations.map(
    (violation) => `${violation.id} (${violation.impact}) : ${violation.help}`,
  );

  expect(resume).toEqual([]);
});
