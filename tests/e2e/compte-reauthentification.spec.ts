/**
 * Reauthentification client, aux trois largeurs. LS-164.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent le service sur base reelle : ils disent que la preuve
 * s'ecrit, jamais qu'une personne peut l'ATTEINDRE. Or le defaut de LS-164 etait
 * exactement celui-la, la garde fonctionnait et le chemin pour la lever
 * n'existait pas. Seul un parcours au CLIC le mesure.
 *
 * AUCUN TEST D'ICI N'ETABLIT DE PREUVE D'IDENTITE, ET C'EST UNE CONDITION DE
 * CORRECTION, pas une facilite. Une preuve ouvre la garde des actions sensibles
 * QUINZE MINUTES durant, sur la session partagee par le projet `preparation` :
 * `compte-suppression-connecte.spec.ts` clique alors « Supprimer
 * definitivement » et REUSSIT, la ou il attend le refus qui est l'etat nominal
 * de son ecran. Le compte part, et tous les fichiers qui partagent cette
 * session s'effondrent, loin de leur cause.
 *
 * MESURE EN INTEGRATION CONTINUE le 2 septembre 2026 : 33 tests en echec sur
 * QUATRE fichiers, dont trois que LS-164 ne touche pas.
 *
 * INVISIBLE EN LANCANT CE FICHIER SEUL, ce qui explique qu'il soit passe : la
 * session est recreee a chaque execution, et plus rien n'en depend ensuite.
 *
 * TROIS PARADES ESSAYEES ET ECARTEES, toutes trois mesurees :
 *
 *   - UN COMPTE PAR LARGEUR, la parade de `compte-profil.spec.ts`. Elle coute
 *     TROIS inscriptions la ou `/sign-up/email` en accepte trois par minute et
 *     par IP, deja consommees par les preparations : « Too many requests »
 *     malgre quatre reessais espaces de 21 s
 *   - UNE QUATRIEME SESSION PARTAGEE, un setup de plus. Elle n'en coute qu'une,
 *     mais `playwright.config.ts` avertit que « la marge du plafond est
 *     desormais NULLE », et la mesure lui donne raison
 *   - EFFACER LA PREUVE EN BASE apres chaque test. Sans effet : les trois
 *     largeurs tournent EN PARALLELE, et pendant que l'une detient sa preuve
 *     une autre clique « Supprimer » et reussit. Une course, pas un oubli
 *
 * CE QUI COUVRE LE CRITERE 3, la garde effectivement ouverte par la
 * confirmation : `tests/integration/reauthentification-client.sequential.test.ts`,
 * sur base reelle, ou aucune session n'est partagee avec quoi que ce soit. Ce
 * fichier-ci couvre ce que lui ne peut pas voir, le CHEMIN vers l'ecran et son
 * rendu aux trois largeurs.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION, MOT_DE_PASSE_FAUX } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.use({ storageState: FICHIER_SESSION });

test("le refus de suppression mene a l'ecran de confirmation, critere 2", async ({
  page,
}) => {
  await page.goto("/compte");

  /*
   * ATTENDRE LE TITRE AVANT DE SAISIR, comme `compte-suppression-connecte.spec.ts`.
   * Sans cette attente, `fill` court apres un champ que la page n'a pas encore
   * rendu et le test expire sur « waiting for getByLabel », ce qui se lit comme
   * un champ absent alors que la page arrivait. Mesure du 2 septembre 2026 :
   * echec a 390 et 1280 px, vert a 320.
   */
  await expect(
    page.getByRole("heading", { name: "Mon compte", exact: true }),
  ).toBeVisible();

  // LE MESSAGE VIENT DE LA GARDE, pas d'un etat force : la session est valide
  // et aucune preuve d'identite n'a ete etablie, ce qui est l'etat nominal.
  await page.getByLabel(/saisissez SUPPRIMER/i).fill("SUPPRIMER");
  await page.getByRole("button", { name: /Supprimer définitivement/i }).click();

  const alerte = page.locator("form [role='alert']");
  await expect(alerte).toContainText(/confirmez votre identité/i);

  /*
   * LE LIEN EST LA MESURE CENTRALE DE CETTE STORY. Avant LS-164 le message
   * s'affichait seul : la personne lisait « confirmez votre identite » sans
   * qu'aucun element de la page ne le permette.
   */
  const lien = page.getByRole("link", { name: /Confirmer mon identité/i });
  await expect(lien).toBeVisible();

  await lien.click();

  // ET IL MENE A L'ESPACE CLIENT, jamais a l'administration : c'est le defaut
  // que la story corrige, `/administration/reauthentification` refusant un
  // client puis le renvoyant vers la connexion de l'administration.
  await expect(page).toHaveURL(/\/compte\/reauthentification/);
  await expect(page).not.toHaveURL(/\/administration/);

  await expect(
    page.getByRole("heading", { name: "Confirmer votre identité" }),
  ).toBeVisible();
});

test("un mot de passe faux est refuse, reste lisible et ne deborde pas", async ({
  page,
}) => {
  await page.goto("/compte/reauthentification?retour=compte");

  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE_FAUX);
  await page.getByRole("button", { name: /Confirmer mon identité/i }).click();

  /**
   * L'ALERTE DU COMPOSANT, ET NON N'IMPORTE LAQUELLE. Next.js insere son propre
   * `role="alert"`, `__next-route-announcer__`, qui annonce les changements de
   * route : un `getByRole("alert")` nu en trouve deux, defaut deja rencontre
   * sur `compte-suppression-connecte.spec.ts`.
   */
  const alerte = page.locator("main [role='alert']");
  await expect(alerte).toContainText(/La vérification a échoué/i);

  // LE REFUS NE DIT PAS CE QUI A ECHOUE : ni « compte inconnu », ni la longueur
  // attendue. Un message qui distingue renseigne sur ce que le serveur accepte.
  await expect(alerte).not.toContainText(/compte inconnu/i);

  // ON RESTE SUR L'ECRAN : rediriger sur un refus ferait perdre le contexte.
  await expect(page).toHaveURL(/\/compte\/reauthentification/);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  /*
   * L'ACCESSIBILITE EST MESUREE SUR L'ETAT D'ERREUR, et pas seulement au repos :
   * c'est la branche ou le lisere change, LS-164 ayant ajoute
   * `[data-etat="erreur"]` a `.confirmation`. Mesurer le seul etat nominal
   * laisserait ce contraste hors de portee d'axe-core, motif rencontre trois
   * fois sur ce depot.
   */
  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

test("un retour inconnu retombe sur l'espace client, jamais sur une URL fournie", async ({
  page,
}) => {
  /*
   * TEST NEGATIF DE SECURITE, LA REDIRECTION OUVERTE. Le parametre porte ici une
   * URL absolue vers un domaine tiers : si l'ecran l'employait tel quel, la
   * confirmation renverrait hors du site depuis un lien parti du notre, donc
   * avec sa confiance, et juste apres une saisie de mot de passe.
   *
   * La table de destinations ne connait que des CLES : cette valeur est inconnue,
   * donc ignoree, et la page retombe sur `compte`.
   */
  await page.goto(
    "/compte/reauthentification?retour=https://exemple-malveillant.test/piege",
  );

  /*
   * LA DESTINATION SE LIT SANS SOUMETTRE, ET CE N'EST PAS UN CONTOURNEMENT.
   * Elle est resolue au RENDU SERVEUR : la page choisit sa cle, en tire le motif
   * affiche et le chemin passe au composant. Le texte visible est donc le
   * temoin direct de ce choix.
   *
   * NE PAS SOUMETTRE ICI evite en outre d'etablir une preuve dont le test
   * suivant devrait tenir compte, ce fichier s'executant en serie.
   */
  await expect(
    page.getByText(/avant de supprimer votre compte/i),
  ).toBeVisible();

  // Le chemin etranger n'apparait nulle part dans la page, ni en lien ni en
  // attribut : la table ne l'a jamais retenu.
  await expect(page.locator("[href*='exemple-malveillant']")).toHaveCount(0);
});

test("l'ecran ne deborde pas et ne porte aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto("/compte/reauthentification?retour=compte");

  await expect(
    page.getByRole("heading", { name: "Confirmer votre identité" }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});
