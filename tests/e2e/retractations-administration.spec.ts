/**
 * La rubrique Retractations de l'administration, LS-135. Parcours 5, etapes 6 a 9.
 *
 * CE QUE CE FICHIER PROUVE ET QUE `administration-connectee.spec.ts` NE PROUVE
 * PAS. Ce dernier mesure le debordement et l'accessibilite de l'ecran aux trois
 * largeurs, ce qui est necessaire et ne dit rien du COMPORTEMENT : il resterait
 * vert sur un ecran qui n'offrirait le remboursement qu'apres une preuve
 * d'expedition, c'est-a-dire sur l'infraction a l'article L221-24 que toute
 * cette story existe pour eviter.
 *
 * L'ASSERTION CENTRALE EST DONC QUE LES DEUX FAITS SONT OFFERTS EN PARALLELE.
 * La demande amorcee est `RETOUR_ATTENDU` avec son colis recu et AUCUNE preuve
 * d'expedition : le bouton « Rembourser » doit etre la. C'est le cas courant du
 * retour depose en point relais sans numero de suivi, et l'exiger bloquerait
 * indefiniment un droit qui est du.
 *
 * AUCUN REMBOURSEMENT N'EST DECLENCHE ICI, et c'est delibere : la suite de bout
 * en bout tourne sans cle Stripe, le paiement y etant *indisponible* plutot
 * qu'en panne. L'effet reel est prouve par les 23 tests d'integration, qui
 * exercent le service avec un fournisseur double.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  COMMANDE_FACTUREE_TEST,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

/**
 * La carte de LA demande amorcee, jamais « la premiere de la liste ».
 *
 * CIBLER PAR NUMERO DE COMMANDE EST INDISPENSABLE ICI, et l'echec l'a montre :
 * la suite de LS-134 depose ses propres demandes, une par projet Playwright,
 * et un selecteur global en trouve quatre. Pire, il en trouverait un nombre
 * VARIABLE selon l'ordre d'execution, donc le test passerait ou non sans
 * qu'aucun code n'ait change.
 *
 * LA CARTE EST L'ELEMENT DE LISTE qui porte ce numero : tout ce que ces tests
 * cherchent est cherche DEDANS, ce qui les rend independants du contenu de la
 * base autour.
 */
function carteDemande(page: import("@playwright/test").Page) {
  return page
    .getByRole("listitem")
    .filter({ hasText: `Commande ${COMMANDE_FACTUREE_TEST.numero}` });
}

/**
 * LE TEST QUI PORTE L'OBLIGATION LEGALE.
 *
 * Un colis recu SANS preuve d'expedition ouvre le remboursement, article
 * L221-24 : « la date retenue etant celle du premier de ces faits ».
 */
test("un colis reçu sans preuve d'expédition ouvre le remboursement", async ({
  page,
}) => {
  await page.goto("/administration/retractations");

  await expect(
    page.getByRole("heading", { name: "Rétractations", level: 1 }),
  ).toBeVisible();

  /*
   * L'ETAT DE DEPART EST VERIFIE PLUTOT QUE SUPPOSE. Sans cette assertion, un
   * changement d'amorce ferait passer le test pour la mauvaise raison : sur une
   * demande deja remboursee, le bouton serait absent et l'assertion suivante
   * echouerait sans dire pourquoi.
   */
  const carte = carteDemande(page);

  await expect(carte).toHaveCount(1);
  await expect(carte.getByText("Preuve d'expédition")).toBeVisible();
  await expect(carte.getByText("Non fournie")).toBeVisible();

  /*
   * L'ASSERTION CENTRALE : le remboursement est offert alors qu'AUCUNE preuve
   * n'a ete fournie. Un ecran qui exigerait `EXPEDITION_PROUVEE` ferait rougir
   * cette ligne, et c'est exactement le defaut a empecher.
   */
  await expect(carte.getByRole("button", { name: "Rembourser" })).toBeEnabled();

  /*
   * LE MONTANT EST PRE-REMPLI, arbitrage du 3 septembre 2026, et il porte les
   * FRAIS DE PORT : le champ est modifiable pour une reduction sur piece
   * abimee, jamais vide.
   */
  const montant = carte.getByLabel("Montant à rembourser, en euros");
  await expect(montant).toBeVisible();
  await expect(montant).not.toHaveValue("");
});

/**
 * LES QUATRE GESTES COEXISTENT, ce qui prouve que l'ecran ne presente pas les
 * etapes 7a et 7b comme une sequence.
 */
test("les gestes de traitement sont tous atteignables", async ({ page }) => {
  await page.goto("/administration/retractations");

  const carte = carteDemande(page);

  await expect(
    carte.getByLabel("Numéro de suivi fourni par le client"),
  ).toBeVisible();

  await expect(
    carte.getByRole("button", { name: "Enregistrer la preuve" }),
  ).toBeVisible();

  await expect(carte.getByRole("button", { name: "Rembourser" })).toBeVisible();

  /*
   * LE REFUS EST REPLIE, jamais offert au meme rang que le remboursement : le
   * droit de retractation est INCONDITIONNEL, article L221-18, et un bouton
   * « Refuser » aussi visible que « Rembourser » suggererait un arbitrage qui
   * n'existe pas.
   */
  await carte.getByText("Refuser cette demande").click();

  await expect(carte.getByLabel("Motif du refus")).toBeVisible();
});

/**
 * LE REFUS SANS MOTIF EST BLOQUE A L'ECRAN, regle L2.
 *
 * LA GARDE QUI COMPTE EST DANS LE SERVICE, et les tests d'integration la
 * prouvent. Celle-ci evite un aller-retour inutile, et son absence rendrait le
 * bouton actif sur un formulaire vide.
 */
test("le refus reste fermé tant qu'aucun motif n'est saisi", async ({
  page,
}) => {
  await page.goto("/administration/retractations");

  const carte = carteDemande(page);

  await carte.getByText("Refuser cette demande").click();

  await expect(carte.getByRole("button", { name: "Refuser" })).toBeDisabled();

  await carte.getByLabel("Motif du refus").fill("TEST Motif de refus");

  await expect(carte.getByRole("button", { name: "Refuser" })).toBeEnabled();
});

/**
 * LE RENDU AUX TROIS LARGEURS, avec les champs de saisie DEPLOYES.
 *
 * LE REFUS EST OUVERT AVANT LA MESURE, et c'est ce qui la rend utile : replie,
 * son `textarea` n'est pas rendu, donc jamais mesure. Un `details` ferme cache
 * exactement ce qui deborde.
 */
test("l'écran ne déborde pas, formulaires déployés", async ({ page }) => {
  await page.goto("/administration/retractations");

  const carte = carteDemande(page);

  await carte.getByText("Refuser cette demande").click();
  await expect(carte.getByLabel("Motif du refus")).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * L'ACCESSIBILITE AVEC LES FORMULAIRES OUVERTS.
 *
 * `administration-connectee.spec.ts` passe deja `axe-core` sur cet ecran, mais
 * REPLIE : les champs du refus n'y sont pas dans le DOM, donc ni leur libelle
 * ni leur association ne sont analyses.
 */
test("aucune violation d'accessibilité, formulaires déployés", async ({
  page,
}) => {
  await page.goto("/administration/retractations");

  const carte = carteDemande(page);

  await carte.getByText("Refuser cette demande").click();
  await expect(carte.getByLabel("Motif du refus")).toBeVisible();

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});
