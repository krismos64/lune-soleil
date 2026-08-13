/**
 * L'ecran de suppression vu par une personne connectee, aux trois largeurs.
 * LS-81 critere 7, LS-89 critere 5. Prolonge `compte-suppression.spec.ts`, qui
 * ne couvrait que la page de refus.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent le service sur base reelle : ils ne disent rien de ce que
 * la personne VOIT. Le critere demande un rendu verifie a 320 px, « y compris
 * l'etat d'erreur d'une preuve refusee », et cet etat est precisement celui
 * qu'on n'atteint jamais en developpement, puisqu'il demande une session valide
 * SANS preuve fraiche.
 *
 * C'EST L'ETAT NOMINAL DE L'ECRAN, ET C'EST CONTRE-INTUITIF. Une personne qui
 * arrive sur `/compte` n'a jamais de preuve recente : la reauthentification ne
 * s'obtient qu'en la demandant. Le message de refus est donc ce que TOUT LE
 * MONDE voit au premier clic, pas un cas de bord.
 *
 * LA SESSION EST CREEE PAR L'API et non par le formulaire : aucun ecran de
 * connexion client n'existe encore, il appartient a LS-54. Le compte est cree
 * par `/api/auth/sign-up/email`, le vrai point d'entree, ce qui evite d'ecrire
 * en base une ligne que Better Auth n'aurait pas produite.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION } from "./chemin-session";

/**
 * LA SESSION VIENT DU PROJET `preparation`, ouverte UNE fois pour toute la
 * suite. Voir `session-cliente.setup.ts` : s'inscrire depuis ces tests
 * consommait le plafond de `/sign-up/email` et faisait rendre 429 a un test
 * voisin qui attend 401.
 *
 * `storageState` est declare ICI et non sur les projets : les autres fichiers
 * verifient qu'un visiteur ANONYME est refuse, et leur donner une session les
 * ferait passer pour la mauvaise raison, ou echouer.
 */
test.use({ storageState: FICHIER_SESSION });

test("l'ecran de suppression ne deborde pas horizontalement", async ({
  page,
}) => {
  await page.goto("/compte");

  await expect(
    page.getByRole("heading", { name: "Mon compte", exact: true }),
  ).toBeVisible();

  const debordement = await page.evaluate(() => {
    const racine = document.documentElement;
    return racine.scrollWidth - racine.clientWidth;
  });

  expect(debordement).toBeLessThanOrEqual(0);
});

test("l'etat d'erreur d'une preuve refusee reste lisible et ne deborde pas", async ({
  page,
}) => {
  await page.goto("/compte");

  // LE PARCOURS REEL, ET NON UN ETAT FABRIQUE. La session est valide mais
  // aucune preuve d'identite n'a ete etablie : c'est la garde de LS-81 qui
  // produit ce message, pas un affichage force par le test.
  await page.getByLabel(/saisissez SUPPRIMER/i).fill("SUPPRIMER");
  await page.getByRole("button", { name: /Supprimer définitivement/i }).click();

  /**
   * L'ALERTE DU FORMULAIRE, ET NON N'IMPORTE LAQUELLE. Next.js insere son
   * propre `role="alert"`, `__next-route-announcer__`, qui annonce les
   * changements de route aux lecteurs d'ecran. Un `getByRole("alert")` nu en
   * trouve donc deux, et la version precedente de ce test echouait dessus.
   */
  const alerte = page.locator("form [role='alert']");
  await expect(alerte).toBeVisible();
  await expect(alerte).toContainText(/confirmez votre identité/i);

  // LE COMPTE EST TOUJOURS LA. Le message pourrait s'afficher sur une
  // suppression pourtant effectuee : recharger la page le prouve, une session
  // dont le compte est parti ne rendrait plus l'espace client.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Mon compte", exact: true }),
  ).toBeVisible();

  const debordement = await page.evaluate(() => {
    const racine = document.documentElement;
    return racine.scrollWidth - racine.clientWidth;
  });

  expect(debordement).toBeLessThanOrEqual(0);
});

test("le bouton reste inatteignable tant que le mot n'est pas recopie", async ({
  page,
}) => {
  await page.goto("/compte");

  const bouton = page.getByRole("button", {
    name: /Supprimer définitivement/i,
  });

  // L'ETAT DESACTIVE FAIT PARTIE DU RENDU A VERIFIER : c'est lui qui empeche le
  // second clic au meme endroit sur une action irreversible.
  await expect(bouton).toBeDisabled();

  await page.getByLabel(/saisissez SUPPRIMER/i).fill("SUPPRIM");
  await expect(bouton).toBeDisabled();

  await page.getByLabel(/saisissez SUPPRIMER/i).fill("SUPPRIMER");
  await expect(bouton).toBeEnabled();
});

test("l'ecran connecte ne porte aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto("/compte");

  await expect(
    page.getByRole("heading", { name: "Mon compte", exact: true }),
  ).toBeVisible();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});
