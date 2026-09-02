/**
 * Ecrans d'authentification client, de bout en bout. LS-54.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS : que
 * les ECRANS existent, s'atteignent par une navigation reelle et tiennent a
 * 320 px. Les tests d'integration exercent Better Auth et la garde de session,
 * jamais le fait qu'une page les invoque ni qu'un lien y mene.
 *
 * IL N'INSCRIT PERSONNE, ET C'EST DELIBERE.
 *
 * `/sign-up/email` est plafonne a trois appels par minute et par adresse IP,
 * ADR-027, et ces tests sont rejoues sur TROIS largeurs. Une inscription reelle
 * ici consommerait le plafond a chaque passage et ferait rougir un fichier
 * VOISIN, defaut deja mesure en LS-81 : `session-cliente.setup.ts` porte le
 * recit complet, une premiere version s'inscrivait depuis les tests et faisait
 * rendre 429 a `connexion-administration`, qui attend un 401.
 *
 * L'INSCRIPTION REELLE EST DONC COUVERTE PAR L'INTEGRATION,
 * `inscription-client.sequential.test.ts`, ou elle s'exerce sur la vraie base
 * sans passer par le reseau ni par le plafond. Ici on couvre les ecrans, la
 * navigation et le rendu.
 *
 * LA SESSION CLIENTE PARTAGEE VIENT DU PROJET `preparation`, un seul compte
 * inscrit pour toute la suite.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * Les trois ecrans livres par LS-54, avec le titre qui les identifie.
 *
 * TABLE PLUTOT QUE TROIS TESTS RECOPIES : un ecran ajoute plus tard s'inscrit
 * ici, et les trois controles de rendu le couvrent sans etre reecrits.
 */
const ECRANS_PUBLICS = [
  { chemin: "/compte/inscription", titre: "Créer un compte" },
  { chemin: "/compte/connexion", titre: "Se connecter" },
  { chemin: "/compte/mot-de-passe-oublie", titre: "Mot de passe oublié" },
  /*
   * SANS JETON, LS-55 : la page rend son ecran de refus, qui est un etat
   * NOMINAL et non une erreur. On y arrive en ouvrant un lien expire ou deja
   * consomme, cas frequent puisque le jeton ne sert qu'une fois.
   */
  {
    chemin: "/compte/nouveau-mot-de-passe",
    titre: "Ce lien n'est plus valable",
  },
] as const;

test.describe("les ecrans d'authentification sont servis", () => {
  for (const ecran of ECRANS_PUBLICS) {
    test(`${ecran.chemin} rend son titre`, async ({ page }) => {
      const reponse = await page.goto(ecran.chemin);

      // LE STATUT EST VERIFIE ET PAS SEULEMENT LE TITRE : une page rendue en
      // 500 avec un titre correct existe, LS-146 l'a mesure sur les 404.
      expect(reponse?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: ecran.titre, level: 1 }),
      ).toBeVisible();
    });

    test(`${ecran.chemin} ne deborde pas horizontalement`, async ({ page }) => {
      await page.goto(ecran.chemin);

      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
        TOLERANCE_DEBORDEMENT_PX,
      );
    });

    test(`${ecran.chemin} ne porte aucune violation d'accessibilite`, async ({
      page,
    }) => {
      await page.goto(ecran.chemin);

      const resultat = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(resultat.violations).toEqual([]);
    });
  }
});

/**
 * LA NAVIGATION SE FAIT AU CLIC, jamais par `goto`, et c'est la lecon de
 * LS-162 : huit ecrans d'administration ont vecu sans qu'aucun ne renvoie vers
 * un autre, invisible parce que chaque test atteignait sa cible par une URL en
 * dur. Un ecran qu'aucun lien ne designe n'existe pas pour un visiteur.
 */
test.describe("les ecrans s'atteignent sans saisir d'URL", () => {
  test("l'en-tete mene a la connexion depuis l'accueil", async ({ page }) => {
    await page.goto("/");

    // DANS `banner` ET NON `.first()` : l'ordre du DOM n'est pas une garantie,
    // et ce test porte sur l'EN-TETE nommement.
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Se connecter" })
      .click();

    await expect(page).toHaveURL(/\/compte\/connexion$/);
    await expect(
      page.getByRole("heading", { name: "Se connecter", level: 1 }),
    ).toBeVisible();
  });

  test("la connexion mene a l'inscription, et retour", async ({ page }) => {
    await page.goto("/compte/connexion");

    await page.getByRole("link", { name: "En créer un" }).click();
    await expect(page).toHaveURL(/\/compte\/inscription$/);

    /*
     * LE RETOUR COMPTE AUTANT QUE L'ALLER : un parcours a sens unique enferme
     * qui s'est trompe d'ecran.
     *
     * LE LIEN EST CHERCHE DANS `main` ET NON DANS TOUTE LA PAGE. L'en-tete
     * porte le meme libelle quand aucune session n'est ouverte, et Playwright
     * refuse a juste titre un selecteur qui designe deux elements. Viser le
     * contenu prouve que la bascule VIT DANS L'ECRAN, ce qu'un clic sur
     * l'en-tete ne dirait pas.
     */
    await page
      .getByRole("main")
      .getByRole("link", { name: "Se connecter" })
      .click();
    await expect(page).toHaveURL(/\/compte\/connexion$/);
  });
});

/**
 * Parcours « mot de passe oublie », LS-55.
 *
 * LE FORMULAIRE N'EST PAS SOUMIS AVEC UNE VRAIE ADRESSE : `/request-password-reset`
 * est plafonne a trois appels par minute et par adresse IP, ADR-027, et ces
 * tests sont rejoues sur trois largeurs. Le comportement de la demande, message
 * identique que l'adresse existe ou non, est prouve en integration ou il ne
 * traverse pas le reseau.
 */
test.describe("le parcours de mot de passe oublie s'atteint sans URL", () => {
  test("la connexion mene a la demande de reinitialisation", async ({
    page,
  }) => {
    await page.goto("/compte/connexion");

    await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();

    await expect(page).toHaveURL(/\/compte\/mot-de-passe-oublie$/);
    await expect(
      page.getByRole("heading", { name: "Mot de passe oublié", level: 1 }),
    ).toBeVisible();
  });

  test("un lien sans jeton propose d'en redemander un", async ({ page }) => {
    await page.goto("/compte/nouveau-mot-de-passe");

    /*
     * LE CHEMIN DE SORTIE EST CE QUI COMPTE. Un ecran de refus sans issue
     * laisse la personne bloquee avec un lien mort et aucune idee de la suite.
     */
    await page.getByRole("link", { name: "Demander un nouveau lien" }).click();
    await expect(page).toHaveURL(/\/compte\/mot-de-passe-oublie$/);
  });

  test("un jeton invalide rend le meme refus qu'un jeton absent", async ({
    page,
  }) => {
    await page.goto("/compte/nouveau-mot-de-passe?error=INVALID_TOKEN");

    await expect(
      page.getByRole("heading", {
        name: "Ce lien n'est plus valable",
        level: 1,
      }),
    ).toBeVisible();

    // AUCUN CHAMP DE SAISIE : proposer le formulaire puis refuser a la
    // soumission ferait choisir un mot de passe pour rien.
    await expect(page.locator("input[type=password]")).toHaveCount(0);
  });
});

/**
 * LE CRITERE 3 VU DE L'INTERFACE, et il porte l'arbitrage du 2 septembre 2026.
 *
 * La session partagee est celle d'un compte NON VERIFIE : `sendOnSignUp` envoie
 * le lien, personne ne l'ouvre jamais dans la suite. Ces tests prouvent donc
 * qu'un compte non verifie navigue normalement, ce que `requireEmailVerification`
 * a `true` interdirait.
 */
test.describe("un compte non verifie accede a son espace", () => {
  /*
   * `test.use` DANS LE DESCRIBE ET NON EN TETE DE FICHIER : les tests
   * precedents ont besoin de l'ABSENCE de session, l'en-tete devant proposer
   * « Se connecter ». Poser la session pour tout le fichier les ferait passer
   * pour la mauvaise raison, ou echouer.
   */
  test.use({ storageState: FICHIER_SESSION });

  test("l'espace client s'affiche sans verification prealable", async ({
    page,
  }) => {
    await page.goto("/compte");

    // AUCUNE REDIRECTION vers un ecran de verification bloquant.
    await expect(page).toHaveURL(/\/compte$/);
    await expect(
      page.getByRole("heading", { name: "Mon compte", level: 1 }),
    ).toBeVisible();
  });

  test("l'ecran de verification propose de renvoyer le lien", async ({
    page,
  }) => {
    await page.goto("/compte/verification");

    await expect(
      page.getByRole("heading", { name: "Votre compte est créé", level: 1 }),
    ).toBeVisible();

    /*
     * LE BOUTON DE RENVOI EST CE QUE LS-82 NOMMAIT COMME MANQUANT : « le
     * parcours autour, ecran d'attente, renvoi du lien, message quand l'email
     * n'arrive pas ». Sa presence est la preuve que le parcours est complet.
     *
     * IL N'EST PAS CLIQUE : un clic enverrait un vrai message par le SMTP OVH
     * a chaque passage, sur trois largeurs, et consommerait le quota de 200 par
     * heure du MX Plan pour ne rien prouver de plus que l'integration.
     */
    await expect(
      page.getByRole("button", { name: "Recevoir un nouveau lien" }),
    ).toBeVisible();
  });

  test("l'en-tete propose le compte plutot que la connexion", async ({
    page,
  }) => {
    await page.goto("/");

    // LE LIBELLE EST L'ETAT VISIBLE DE LA SESSION. Un « Se connecter » affiche
    // a qui l'est deja se lit comme une deconnexion silencieuse.
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Mon compte" }),
    ).toBeVisible();
  });

  /*
   * L'ECRAN DE VERIFICATION EST ATTEIGNABLE DEPUIS `/compte`, revue frontend du
   * 2 septembre 2026.
   *
   * Il ne l'etait PAS a la premiere version : sa seule reference dans tout
   * `src/` etait la redirection qui suit l'inscription. Une fois quitte par
   * « Aller a mon compte », on ne pouvait plus jamais y revenir sans saisir
   * l'URL, alors que le scenario meme de cet ecran est « le message n'arrive
   * pas », donc le retour.
   *
   * LE TEST NAVIGUE AU CLIC pour cette raison : les six autres tests de ce
   * fichier atteignaient la page par `goto`, et aucun ne pouvait voir qu'aucun
   * chemin n'y menait. C'est la lecon de LS-162, rejouee cote boutique.
   */
  test("le compte mene a l'ecran de verification", async ({ page }) => {
    await page.goto("/compte");

    await page.getByRole("link", { name: "Confirmer mon adresse" }).click();

    await expect(page).toHaveURL(/\/compte\/verification$/);
    await expect(
      page.getByRole("heading", { name: "Votre compte est créé", level: 1 }),
    ).toBeVisible();
  });

  test("le compte propose de fermer la session", async ({ page }) => {
    await page.goto("/compte");

    /*
     * `signOut` etait exporte depuis LS-70 SANS AUCUN APPELANT : un client sur
     * un appareil partage n'avait aucun moyen de fermer sa session, sinon
     * supprimer son compte.
     *
     * LE BOUTON N'EST PAS CLIQUE : il detruirait la session partagee par toute
     * la suite, et le projet `preparation` ne la rouvre qu'une fois.
     */
    await expect(
      page.getByRole("button", { name: "Se déconnecter" }),
    ).toBeVisible();
  });

  test("l'ecran de verification ne deborde pas horizontalement", async ({
    page,
  }) => {
    await page.goto("/compte/verification");

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test("l'ecran de verification ne porte aucune violation d'accessibilite", async ({
    page,
  }) => {
    await page.goto("/compte/verification");

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });
});
