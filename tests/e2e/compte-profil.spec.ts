/**
 * Le profil du client, aux trois largeurs. LS-60, critere 6.
 *
 * CHAQUE LARGEUR CREE SON PROPRE COMPTE, et c'est une condition de correction :
 * ce fichier CHANGE le mot de passe et l'adresse email, donc il consomme l'etat
 * du compte partage. Les trois largeurs se rendraient mutuellement inutilisable
 * la session ouverte par le projet `preparation`.
 *
 * L'INSCRIPTION EST DONC FAITE ICI, une par largeur, et le plafond de
 * `/sign-up/email` est de trois par minute et par IP : les trois preparations
 * le consomment deja entierement. Ce fichier porte donc un REESSAI ESPACE,
 * meme parade que `session-verifiee.setup.ts`, plutot que de neutraliser le
 * plafond, ce qui retirerait de la mesure une protection reelle.
 */
import "dotenv/config";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/** Seize caracteres, la longueur imposee a tous les comptes, ADR-023. */
const MOT_DE_PASSE = "phrase-de-passe1";

/*
 * SERIE : les tests de ce fichier partagent le compte de leur largeur, et
 * celui qui change le mot de passe rendrait les suivants incapables de se
 * connecter s'ils tournaient en parallele.
 */
test.describe.configure({ mode: "serial" });

let email: string;
let cookies: Awaited<
  ReturnType<import("@playwright/test").BrowserContext["cookies"]>
>;

/*
 * LE `beforeAll` A SON PROPRE DELAI, et il ne suffit pas de poser
 * `test.setTimeout` : celui-ci ne couvre QUE les tests, jamais les hooks.
 * Quatre reessais espaces de 21 s font 84 s, largement au-dela des 30 s par
 * defaut. Mesure : « "beforeAll" hook timeout of 30000ms exceeded ».
 */
test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);

  const contexte = await browser.newContext();
  const page = await contexte.newPage();

  email = `e2e-profil-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@exemple.test`;

  /*
   * REESSAI ESPACE SUR 429, voir l'entete. On n'attend QUE sur un 429, jamais
   * sur un refus de fond : reessayer une adresse deja prise echouerait quatre
   * fois pour la meme raison, en masquant la cause derriere une minute.
   */
  let reponse = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password: MOT_DE_PASSE, name: "Client profil" },
  });

  for (let essai = 1; essai < 5 && !reponse.ok(); essai += 1) {
    if (reponse.status() !== 429) {
      break;
    }

    await page.waitForTimeout(21_000);

    reponse = await page.request.post("/api/auth/sign-up/email", {
      data: { email, password: MOT_DE_PASSE, name: "Client profil" },
    });
  }

  expect(reponse.ok(), await reponse.text()).toBe(true);

  /*
   * LA SESSION EST OUVERTE UNE SEULE FOIS, ses cookies etant rejoues par chaque
   * test. `/sign-in/email` est plafonne a CINQ appels par minute et par IP :
   * une connexion par test, sept tests fois trois largeurs, le depassait
   * largement. Mesure : « Too many requests » sur les derniers tests.
   *
   * L'inscription a deja pose un cookie de session, `autoSignIn` valant son
   * defaut : aucune connexion supplementaire n'est meme necessaire ici.
   */
  cookies = await contexte.cookies();

  await contexte.close();
});

test.setTimeout(120_000);

/**
 * Rejoue la session ouverte par le `beforeAll`, sans appeler `/sign-in/email`.
 *
 * LE PLAFOND EST DE CINQ PAR MINUTE ET PAR IP, et une connexion par test le
 * depassait. Le desactiver en test retirerait de la mesure une protection
 * reelle : rejouer le cookie donne le meme etat sans consommer le quota.
 */
async function connecter(page: import("@playwright/test").Page): Promise<void> {
  await page.context().addCookies(cookies);
}

test("le profil s'atteint au clic depuis le compte", async ({ page }) => {
  await connecter(page);
  await page.goto("/compte");

  await page.getByRole("link", { name: "Gérer mes informations" }).click();

  await expect(
    page.getByRole("heading", { name: "Mon profil", exact: true }),
  ).toBeVisible();
});

test("les trois formulaires sont presents et distincts", async ({ page }) => {
  await connecter(page);
  await page.goto("/compte/profil");

  await expect(page.getByRole("heading", { name: "Nom" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Adresse email" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mot de passe" }),
  ).toBeVisible();

  /*
   * TROIS REGIONS LIVE NOMMEES DIFFEREMMENT : trois `status` anonymes
   * s'annonceraient identiquement, et le client ne saurait pas lequel des trois
   * gestes a abouti.
   */
  for (const nom of [
    "Enregistrement du nom",
    "Changement d'adresse email",
    "Changement de mot de passe",
  ]) {
    await expect(page.getByRole("status", { name: nom })).toHaveCount(1);
  }
});

test("changer son nom annonce le succes et deplace le focus", async ({
  page,
}) => {
  await connecter(page);
  await page.goto("/compte/profil");

  await page.getByLabel("Nom affiché").fill("Nom Modifié");
  await page.getByRole("button", { name: "Enregistrer mon nom" }).click();

  const annonce = page.getByRole("status", {
    name: "Enregistrement du nom",
  });
  await expect(annonce).toHaveText(/enregistré/);
  await expect(annonce).toBeFocused();
});

test("un mot de passe actuel faux est refuse sans rien changer", async ({
  page,
}) => {
  /*
   * LE TEST NEGATIF, critere 3. Le message doit distinguer « actuel incorrect »
   * de « nouveau trop court » : les confondre ferait ressaisir l'ancien a
   * quelqu'un dont le nouveau est simplement trop court.
   */
  await connecter(page);
  await page.goto("/compte/profil");

  await page.getByLabel("Mot de passe actuel").fill("mauvais-mot-pass");
  await page.getByLabel("Nouveau mot de passe").fill("autre-phrase-de1");
  await page.getByRole("button", { name: "Changer mon mot de passe" }).click();

  await expect(
    page.getByRole("status", { name: "Changement de mot de passe" }),
  ).toHaveText(/actuel est incorrect/);

  // L'ANCIEN FONCTIONNE TOUJOURS : un refus n'a rien change.
  const verification = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password: MOT_DE_PASSE },
  });
  expect(verification.ok()).toBe(true);
});

test("le profil ne deborde pas horizontalement", async ({ page }) => {
  await connecter(page);
  await page.goto("/compte/profil");

  await expect(
    page.getByRole("heading", { name: "Mon profil", exact: true }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation axe-core sur le profil", async ({ page }) => {
  await connecter(page);
  await page.goto("/compte/profil");

  await expect(
    page.getByRole("heading", { name: "Mon profil", exact: true }),
  ).toBeVisible();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/**
 * Ce test a SON PROPRE COMPTE, et c'est une condition de correction.
 *
 * Il CONSOMME le mot de passe : tout test qui le suivrait sur le meme compte ne
 * pourrait plus se connecter. `describe.serial` ordonne les tests d'un MEME
 * projet, jamais les projets entre eux, et les trois largeurs tournent en
 * parallele. Mesure : `mobile-390` lisait « ce changement a ete refuse » parce
 * qu'une autre largeur avait deja change le mot de passe.
 *
 * UNE INSCRIPTION DE PLUS, ET LE PLAFOND LE PERMET : trois largeurs fois deux
 * inscriptions font six appels, repartis sur la duree du fichier, avec le
 * reessai espace en filet.
 */
test("changer son mot de passe ferme les autres sessions", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);

  const emailDedie = `e2e-motdepasse-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@exemple.test`;

  let inscription = await page.request.post("/api/auth/sign-up/email", {
    data: { email: emailDedie, password: MOT_DE_PASSE, name: "Client mdp" },
  });

  for (let essai = 1; essai < 5 && !inscription.ok(); essai += 1) {
    if (inscription.status() !== 429) {
      break;
    }

    await page.waitForTimeout(21_000);

    inscription = await page.request.post("/api/auth/sign-up/email", {
      data: { email: emailDedie, password: MOT_DE_PASSE, name: "Client mdp" },
    });
  }

  expect(inscription.ok(), await inscription.text()).toBe(true);

  // UNE SECONDE SESSION, celle qu'on veut voir tomber.
  const autre = await browser.newContext();
  const autrePage = await autre.newPage();
  const ouverture = await autrePage.request.post("/api/auth/sign-in/email", {
    data: { email: emailDedie, password: MOT_DE_PASSE },
  });
  expect(ouverture.ok(), await ouverture.text()).toBe(true);

  await autrePage.goto("/compte");
  await expect(
    autrePage.getByRole("heading", { name: "Mon compte", exact: true }),
  ).toBeVisible();

  await page.goto("/compte/profil");
  await page.getByLabel("Mot de passe actuel").fill(MOT_DE_PASSE);
  await page.getByLabel("Nouveau mot de passe").fill("nouvelle-phrase1");
  await page.getByRole("button", { name: "Changer mon mot de passe" }).click();

  await expect(
    page.getByRole("status", { name: "Changement de mot de passe" }),
  ).toHaveText(/modifié/);

  /*
   * L'AUTRE SESSION EST TOMBEE : c'est le scenario du compte compromis, et sans
   * `revokeOtherSessions` l'intrus y resterait vingt-quatre heures.
   */
  await autrePage.goto("/compte");
  await expect(autrePage).toHaveURL(/\/compte\/connexion/);

  /*
   * ET LA SIENNE TIENT : le geste de securite ne met pas dehors celui qui le
   * fait. C'est ce que la premiere version cassait, en posant le cookie depuis
   * une Server Action.
   */
  await page.goto("/compte/profil");
  await expect(
    page.getByRole("heading", { name: "Mon profil", exact: true }),
  ).toBeVisible();

  await autre.close();
});
