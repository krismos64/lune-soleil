/**
 * Ecran des donnees personnelles, aux trois largeurs. LS-62, critere 7.
 *
 * CE QUE CE FICHIER MESURE ET QUE LES TESTS D'INTEGRATION NE MESURENT PAS.
 * Ceux-la prouvent que l'export est garde et qu'il ne contient rien d'autrui.
 * Ils ne disent rien de ce que la personne VOIT : que l'ecran est atteignable
 * depuis le compte, que le refus de la route est un refus et non un fichier
 * vide, et que le rendu tient a 320 px.
 *
 * AUCUN TEST D'ICI N'ETABLIT DE PREUVE D'IDENTITE, meme condition que
 * `compte-reauthentification.spec.ts` et pour la meme raison : une preuve ouvre
 * la garde quinze minutes sur la session PARTAGEE, et
 * `compte-suppression-connecte.spec.ts` verrait alors sa suppression REUSSIR la
 * ou il attend un refus. Mesure du 2 septembre 2026, 33 tests en echec sur
 * quatre fichiers.
 *
 * CE QUI EST DONC MESURE ICI, C'EST LE REFUS, et ce n'est pas un pis-aller :
 * c'est l'etat NOMINAL de cet ecran. Une personne qui arrive sur son compte n'a
 * jamais de preuve recente, celle-ci ne s'obtenant qu'en la demandant. Le
 * chemin complet, preuve puis export, est couvert par
 * `droits-rgpd.sequential.test.ts` sur base reelle.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.use({ storageState: FICHIER_SESSION });

test("l'ecran s'atteint au clic depuis le compte, jamais par l'URL seule", async ({
  page,
}) => {
  await page.goto("/compte");

  await expect(
    page.getByRole("heading", { name: "Mon compte", exact: true }),
  ).toBeVisible();

  /*
   * AU CLIC ET NON PAR `goto`. C'est le motif de C33 transpose cote boutique :
   * un ecran qu'aucun lien ne designe est inatteignable en pratique, et un test
   * qui y arrive par URL ne le verrait jamais. Le defaut s'est produit trois
   * fois sur ce depot, dont `/compte/verification` avant LS-54.
   */
  await page.getByRole("link", { name: "Voir mes données" }).click();

  await expect(
    page.getByRole("heading", { name: "Mes données personnelles" }),
  ).toBeVisible();
});

test("l'ecran annonce ce que le fichier contient et ce qu'il ne contient pas", async ({
  page,
}) => {
  await page.goto("/compte/donnees");

  /*
   * CE QUE LE FICHIER CONTIENT, ANNONCE AVANT LE CLIC. Sans cette liste, une
   * personne exerçant son droit d'acces n'a aucun moyen de verifier que la
   * reponse est complete : c'est ce qui rend l'article 15 verifiable pour elle.
   */
  await expect(page.getByText(/vos adresses enregistrées/i)).toBeVisible();
  await expect(page.getByText(/l'historique de vos connexions/i)).toBeVisible();

  // ET CE QU'IL NE CONTIENT PAS : un mot de passe absent peut se lire comme un
  // oubli, le dire evite la reclamation.
  await expect(
    page.getByText(/ne contient jamais votre mot de passe/i),
  ).toBeVisible();
});

test("le refus de la route est un refus, jamais un fichier vide", async ({
  page,
}) => {
  /*
   * LA MESURE CENTRALE DE CE FICHIER. La session est valide mais aucune preuve
   * n'a ete etablie : la route DOIT refuser.
   *
   * `page.goto` ET NON `page.request.get`, ET LA NUANCE A COUTE TROIS ECHECS.
   * Le cookie de session porte l'attribut `Secure` et le serveur de test sert
   * en HTTP : le navigateur le transmet quand meme sur une origine locale, le
   * contexte de requete d'API l'applique STRICTEMENT et ne l'envoie pas. La
   * route rendait donc 401, « connectez-vous », au lieu du 403 attendu.
   *
   * Le test aurait pu etre « corrige » en attendant 401 : ce serait avoir mesure
   * une absence de session la ou la propriete visee est le refus d'une session
   * VALIDE mais sans preuve. Un test vert sur le mauvais chemin.
   *
   * `page.goto` NE DECLENCHE PAS DE TELECHARGEMENT ICI, le refus rendant du
   * texte brut et non `content-disposition`. Sur le chemin nominal il en
   * declencherait un, raison de plus pour ne mesurer que le refus.
   *
   * CE QU'UN DEFAUT PRODUIRAIT : un 200 avec un corps vide, ou pire un 200 avec
   * les donnees. Le premier se lirait comme « je n'ai pas de donnees », le
   * second serait la faille.
   */
  const reponse = await page.goto("/compte/donnees/export");

  expect(reponse?.status()).toBe(403);

  const corps = await reponse!.text();
  expect(corps).toMatch(/confirmez votre identité/i);

  /*
   * ET LE CORPS NE PORTE AUCUNE DONNEE. Un refus qui fuiterait le document dans
   * son message d'erreur serait pire qu'une absence de garde, le statut faisant
   * croire que rien n'est sorti.
   */
  expect(corps).not.toContain("genereLe");
});

test("sans session, la route refuse en 401 et non en 403", async ({
  browser,
}) => {
  /*
   * LES DEUX REFUS SE DISTINGUENT, ET C'EST VOULU. Sans session il faut se
   * reconnecter, avec une session sans preuve il faut confirmer son identite :
   * deux gestes differents, deux statuts differents, sinon l'ecran ne peut pas
   * dire quoi faire.
   *
   * LE CONTEXTE HERITE DE LA SESSION, ET SON OUBLI A COUTE TROIS ECHECS.
   * `test.use` pose `storageState` sur TOUT le fichier, y compris sur les
   * contextes ouverts par `browser.newContext()` : un contexte neuf porte donc
   * le cookie et n'est pas anonyme du tout. Le test recevait 403, « confirmez
   * votre identite », c'est-a-dire la reponse d'une session VALIDE, et mesurait
   * exactement le contraire de ce qu'il annonce.
   *
   * La route, elle, etait correcte depuis le debut : mesuree au `curl` sans
   * cookie, elle rend bien 401.
   *
   * `clearCookies()` PLUTOT QUE `storageState: undefined`, que le type de
   * Playwright refuse : l'option attend un chemin ou un etat, jamais l'absence.
   * Vider les cookies apres coup produit le meme etat et compile.
   *
   * CE QUE CE TEST FERME AUSSI : la route ne doit RIEN servir a un visiteur
   * anonyme, quel que soit le statut. Un 401 qui porterait le document serait
   * la fuite complete.
   */
  const anonyme = await browser.newContext();
  await anonyme.clearCookies();

  const page = await anonyme.newPage();

  const reponse = await page.goto("/compte/donnees/export");

  expect(reponse?.status()).toBe(401);
  expect(await reponse!.text()).not.toContain("genereLe");

  await anonyme.close();
});

test("le refus mene a l'ecran de confirmation d'identite", async ({ page }) => {
  await page.goto("/compte/donnees");

  /*
   * LE CHEMIN POUR LEVER LE REFUS EXISTE, lecon de LS-164 : un message qui
   * reclame une confirmation sans qu'aucun ecran ne la permette est une impasse,
   * et c'est exactement le defaut que LS-164 a corrige.
   */
  const lien = page.getByRole("link", { name: /Confirmer mon identité/i });
  await expect(lien).toBeVisible();

  await lien.click();

  await expect(page).toHaveURL(/\/compte\/reauthentification/);

  /*
   * ET L'ECRAN DIT POURQUOI, la cle `donnees` etant portee par l'URL. Un
   * « confirmez votre identite » sans motif se lit comme une panne ou un piege.
   */
  await expect(
    page.getByText(/avant de télécharger vos données/i),
  ).toBeVisible();
});

test("les autres droits sont expliques et mènent quelque part", async ({
  page,
}) => {
  await page.goto("/compte/donnees");

  // LA RECTIFICATION SE FAIT AILLEURS, et le dire evite une demande par email
  // que la procedure interne devrait traiter a la main.
  await expect(
    page.getByRole("link", { name: /modifiez vos informations/i }),
  ).toBeVisible();

  /*
   * CE QUE LA SUPPRESSION FAIT VRAIMENT. Laisser croire a un effacement total
   * produirait une reclamation fondee sur une attente que la loi ne permet pas
   * de satisfaire : article 17 paragraphe 3 point b, et L123-22 du code de
   * commerce, dix ans.
   */
  await expect(page.getByText(/conservées dix ans/i)).toBeVisible();
});

test("l'ecran ne deborde pas et ne porte aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto("/compte/donnees");

  await expect(
    page.getByRole("heading", { name: "Mes données personnelles" }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});
