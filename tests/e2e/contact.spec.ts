/**
 * Formulaire de contact public, rendu aux trois largeurs. LS-97.
 *
 * AUCUNE SESSION ICI, et le declarer sans `storageState` verifie au passage que
 * la page ne demande aucune authentification : une garde ajoutee par erreur
 * ferait rougir tout ce fichier. C'est le point de cette story, ecrire a la
 * boutique ne demande pas de compte.
 *
 * CE FICHIER NE SOUMET JAMAIS LE FORMULAIRE, et c'est deliberé. Un envoi
 * reussi ecrirait un message que rien ne nettoie, et la rubrique
 * d'administration mesurerait alors trois cartes au lieu des deux qu'elle
 * amorce : le test suivant deviendrait dependant de l'ordre d'execution.
 *
 * LE CHEMIN D'ECRITURE EST PROUVE AILLEURS, par les quinze tests d'integration
 * de `message-contact.sequential.test.ts`, qui travaillent sur base ephemere.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test("la page de contact s'affiche sans session", async ({ page }) => {
  await page.goto("/contact");

  await expect(page).toHaveURL(/\/contact$/);
  await expect(
    page.getByRole("heading", { name: "Nous écrire", level: 1 }),
  ).toBeVisible();

  /*
   * LES QUATRE CHAMPS SONT ATTEINTS PAR LEUR LIBELLE, ce qui prouve du meme
   * coup que chaque `label` est associe a son champ : `getByLabel` echoue si
   * l'association est rompue.
   */
  await expect(page.getByLabel("Votre nom")).toBeVisible();
  await expect(page.getByLabel("Votre adresse email")).toBeVisible();
  await expect(page.getByLabel("Sujet")).toBeVisible();
  await expect(page.getByLabel("Votre message")).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Envoyer le message" }),
  ).toBeEnabled();
});

/**
 * LE CHAMP PIEGE EST INATTEIGNABLE AUX PERSONNES, et c'est ce que ce test
 * verifie plutot que sa simple presence.
 *
 * UN PIEGE MAL POSE ATTRAPE LES MAUVAISES PERSONNES : masque visuellement mais
 * laisse dans l'ordre de tabulation, il devient un champ fantome que seules les
 * personnes au clavier ou au lecteur d'ecran rencontrent, donc remplissent. Le
 * refus silencieux les frapperait, elles, et pas les robots.
 */
test("le champ piège est hors d'atteinte au clavier et au lecteur d'écran", async ({
  page,
}) => {
  await page.goto("/contact");

  const piege = page.locator('input[name="site"]');

  // Il existe dans le HTML : c'est ce qui le rend credible pour un script.
  await expect(piege).toHaveCount(1);

  // Hors de l'ordre de tabulation.
  await expect(piege).toHaveAttribute("tabindex", "-1");

  // Hors de l'arbre d'accessibilite, donc jamais annonce.
  const cache = await piege.evaluate(
    (champ) => champ.closest("[aria-hidden='true']") !== null,
  );
  expect(cache).toBe(true);

  /*
   * IL N'EST PAS MASQUE PAR `display: none` NI `visibility: hidden`, les deux
   * proprietes qu'un script anti-piege verifie en premier : elles le
   * signaleraient aussi surement qu'une etiquette.
   */
  const masquage = await piege.evaluate((champ) => {
    const style = getComputedStyle(champ);
    return { display: style.display, visibility: style.visibility };
  });
  expect(masquage.display).not.toBe("none");
  expect(masquage.visibility).not.toBe("hidden");
});

/**
 * LE COMPTEUR DE CARACTERES N'EST PAS DANS UNE REGION LIVE.
 *
 * L'y mettre annoncerait chaque frappe a la synthese vocale, ce qui rend la
 * saisie d'un message de plusieurs lignes insupportable. Il reste une aide
 * visuelle, rattachee au champ par `aria-describedby` : il est donc LU au
 * moment ou le champ prend le focus, une seule fois.
 */
test("le compteur de caractères n'est pas annoncé à chaque frappe", async ({
  page,
}) => {
  await page.goto("/contact");

  const aide = page.locator("#aide-corps");
  await expect(aide).toBeVisible();

  const live = await aide.evaluate((element) => ({
    ariaLive: element.getAttribute("aria-live"),
    role: element.getAttribute("role"),
    dansUneRegion: element.closest("[aria-live], [role='status']") !== null,
  }));

  expect(live.ariaLive).toBeNull();
  expect(live.role).toBeNull();
  expect(live.dansUneRegion).toBe(false);
});

test("la page de contact ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/contact");
  await expect(
    page.getByRole("heading", { name: "Nous écrire", level: 1 }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * LE DEBORDEMENT EST MESURE AVEC UN TEXTE LONG DANS LA ZONE DE SAISIE.
 *
 * Une zone de texte vide ne deborde jamais : c'est son CONTENU qui la pousse,
 * et un mot sans espace, une URL collee par exemple, est le cas ou une mise en
 * page cede. Mesurer a vide laisserait ce cas entier.
 */
test("un texte long dans la zone de saisie ne fait pas déborder la page", async ({
  page,
}) => {
  await page.goto("/contact");

  await page
    .getByLabel("Votre message")
    .fill(`https://exemple.test/${"x".repeat(200)}`);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("la page de contact ne porte aucune violation d'accessibilité", async ({
  page,
}) => {
  await page.goto("/contact");
  await expect(
    page.getByRole("heading", { name: "Nous écrire", level: 1 }),
  ).toBeVisible();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/**
 * LE LIEN DU PIED DE PAGE MENE ICI, et non vers une ancre d'une page non
 * livree.
 *
 * Il pointait vers `/aide#contact` avant cette story, page que LS-123 porte et
 * qui n'existe pas : le seul chemin vers le formulaire etait de connaitre son
 * URL. Le meme motif que LS-162 sur l'administration, cote public.
 */
test("le lien Contact du pied de page mène au formulaire", async ({ page }) => {
  await page.goto("/catalogue");

  await page.getByRole("link", { name: "Contact", exact: true }).click();

  await expect(page).toHaveURL(/\/contact$/);
  await expect(
    page.getByRole("heading", { name: "Nous écrire", level: 1 }),
  ).toBeVisible();
});
