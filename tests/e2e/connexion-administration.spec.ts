/**
 * Ecran de connexion de l'administration, de bout en bout. LS-70.
 *
 * CE QUE CES TESTS PROUVENT : la page se sert, ne deborde pas a 320 px, reste
 * accessible, et surtout que l'administration REFUSE un visiteur sans session.
 * Ce dernier point est le seul qui se verifie ici et nulle part ailleurs : le
 * test d'integration exerce `exigerAdministratrice` en appelant la fonction,
 * celui-ci exerce la ROUTE, donc le fait que la page l'appelle vraiment.
 *
 * La difference n'est pas theorique. Un composant serveur qui oublierait
 * d'appeler la garde passerait tous les tests d'integration : la fonction
 * gardee est correcte, elle n'est simplement jamais invoquee.
 *
 * LA PASSKEY N'EST PAS EXERCEE. WebAuthn exige un authentificateur virtuel
 * pilote par CDP, dependant du navigateur, et ADR-021 impose de toute facon un
 * enregistrement avec l'exploitante sur ses propres appareils. Ce qui est
 * testable ici est la presence et l'ordre des deux methodes.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { FICHIER_SESSION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test("l'administration renvoie vers la connexion sans session", async ({
  page,
}) => {
  await page.goto("/administration");

  // LE POINT DECISIF : l'URL finale est celle de la connexion. Verifier
  // seulement que la page ne montre pas de donnee sensible ne distinguerait
  // pas un refus d'une page vide.
  await expect(page).toHaveURL(/\/administration\/connexion$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Administration",
  );
});

/**
 * L'ecran des passkeys renvoie AUSSI vers la connexion, LS-175.
 *
 * POURQUOI CES TESTS EN PLUS DE CELUI CI-DESSUS.
 * `verifier-gardes-administration.sh` ne releve que les Server Actions, jamais
 * les PAGES : mesure du 10 septembre 2026, son motif cherche
 * `exigerAdministratrice` dans les fichiers d'actions. La garde d'une page
 * d'administration ne repose donc sur aucun controle textuel.
 *
 * CET ECRAN MERITE LE SIEN parce qu'il liste des MOYENS D'ACCES. Une garde
 * absente n'y divulguerait pas une commande ou un prix, mais les appareils par
 * lesquels l'administration s'ouvre.
 */
test("l'ecran des passkeys renvoie vers la connexion sans session", async ({
  page,
}) => {
  await page.goto("/administration/passkeys");

  // LE POINT DECISIF EST L'URL FINALE. Verifier l'absence de la liste ne
  // distinguerait pas un refus d'un compte sans aucune passkey enregistree,
  // qui rend lui aussi un ecran sans element.
  await expect(page).toHaveURL(/\/administration\/connexion$/);
});

/**
 * LE TEST QUI COMPTE VRAIMENT, et le premier ne le remplace pas.
 *
 * MESURE PAR MUTATION LE 10 SEPTEMBRE 2026 : en remplacant
 * `exigerAdministratrice` par `lireIdentite`, c'est-a-dire en n'exigeant plus
 * qu'une session au lieu du ROLE, le test sans session reste VERT. Les deux
 * gardes redirigent un visiteur anonyme, elles ne different que sur un client
 * connecte.
 *
 * C'est exactement le defaut que l'ecran de reauthentification a corrige en
 * relecture, LS-89 : un client inscrit sur la boutique franchissait une route
 * d'administration avec sa propre session. Ici, il listerait les passkeys de
 * son compte depuis `/administration`, et surtout la garde serait fausse pour
 * la prochaine page qui recopierait ce motif.
 */
test.describe("une session cliente n'ouvre pas l'ecran des passkeys", () => {
  test.use({ storageState: FICHIER_SESSION });

  test("le role est exige, pas seulement une session", async ({ page }) => {
    await page.goto("/administration/passkeys");

    await expect(page).toHaveURL(/\/administration\/connexion$/);
  });
});

test("la connexion propose la passkey en premier, le mot de passe en secours", async ({
  page,
}) => {
  await page.goto("/administration/connexion");

  const actionPasskey = page.getByRole("button", {
    name: "Se connecter avec une passkey",
  });
  await expect(actionPasskey).toBeVisible();

  // Le formulaire de mot de passe est REPLIE au depart, ADR-021 : la passkey
  // est le chemin nominal, le mot de passe le secours. Les presenter a egalite
  // pousserait vers la methode la plus faible.
  await expect(page.getByLabel("Mot de passe")).toBeHidden();

  await page
    .getByRole("button", { name: "Utiliser le mot de passe de secours" })
    .click();
  await expect(page.getByLabel("Adresse email")).toBeVisible();
  await expect(page.getByLabel("Mot de passe")).toBeVisible();
});

test("le formulaire de connexion ne deborde pas horizontalement", async ({
  page,
}) => {
  await page.goto("/administration/connexion");

  // Mesure au repos ET formulaire deplie : le champ email est l'element le
  // plus large de la page, un `width: 100%` sans `box-sizing: border-box` le
  // ferait deborder de son remplissage, invisible tant que le repli le cache.
  await page
    .getByRole("button", { name: "Utiliser le mot de passe de secours" })
    .click();
  await expect(page.getByLabel("Adresse email")).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("l'ecran de connexion ne porte aucune violation d'accessibilite serieuse", async ({
  page,
}) => {
  await page.goto("/administration/connexion");
  await page
    .getByRole("button", { name: "Utiliser le mot de passe de secours" })
    .click();
  await expect(page.getByLabel("Adresse email")).toBeVisible();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

test("un identifiant faux produit un message d'erreur annonce", async ({
  page,
}) => {
  // La reprise apres un 429 attend une fenetre de limitation entiere, ce qui
  // depasse les trente secondes par defaut de Playwright.
  test.setTimeout(120_000);

  await page.goto("/administration/connexion");
  await page
    .getByRole("button", { name: "Utiliser le mot de passe de secours" })
    .click();

  /*
   * LA REPONSE DU SERVEUR EST CAPTUREE, et pas seulement le rendu.
   *
   * Ce test a d'abord verdi POUR LA MAUVAISE RAISON : `BETTER_AUTH_URL`
   * designait un autre port que celui servi, Better Auth rejetait la requete
   * en « Invalid origin », protection CSRF, AVANT toute verification
   * d'identifiant. Le message d'erreur s'affichait donc bien, sans que le
   * chemin teste ait ete emprunte une seule fois.
   *
   * L'assertion sur le code 401 est ce qui separe les deux cas : un refus
   * d'origine rend 403. Sans elle, la configuration pourrait rederiver et le
   * test resterait vert.
   */
  /**
   * UN 429 SE RATTRAPE, ET NE SE CONFOND PAS AVEC LE 401 ATTENDU.
   *
   * `/sign-in/email` est plafonne a cinq tentatives par minute et par adresse
   * IP, LS-92, et Better Auth tient en plus un compteur global par IP. Les
   * trois projets de largeur tentent chacun cette connexion : deux executions
   * rapprochees de la suite franchissent donc le plafond, et ce test echouait
   * alors sur « Expected 401, Received 429 ».
   *
   * MESURE FAITE LE 13 AOUT 2026, sur la suite SANS les fichiers de LS-81 :
   * l'instabilite preexiste, elle n'a pas ete introduite par eux. Elle est
   * simplement devenue visible quand le tempo de la suite a change.
   *
   * L'attente est explicite et le 401 reste exige : accepter le 429 comme
   * resultat valable retirerait l'assertion qui distingue un refus
   * d'identifiants d'un refus d'origine, ce que le commentaire ci-dessus
   * explique etre la raison d'etre de ce test.
   */
  const soumettre = async () => {
    const reponse = page.waitForResponse(
      (reponse) =>
        reponse.url().includes("/api/auth/sign-in/email") &&
        reponse.request().method() === "POST",
    );

    await page.getByLabel("Adresse email").fill("inconnu@exemple.fr");
    await page.getByLabel("Mot de passe").fill("un-mot-de-passe1");
    await page
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();

    return (await reponse).status();
  };

  let statut = await soumettre();

  if (statut === 429) {
    // La fenetre de limitation dure soixante secondes.
    await page.waitForTimeout(62_000);
    statut = await soumettre();
  }

  expect(statut).toBe(401);

  // `role="alert"` et non une couleur : l'erreur doit parvenir au lecteur
  // d'ecran. Chercher l'element par son ROLE, pas par sa classe, c'est ce qui
  // rend le test sensible a la perte de l'annonce.
  //
  // `filter` est necessaire : Next.js pose son propre `role="alert"` sur
  // l'annonceur de route, `__next-route-announcer__`, vide et toujours
  // present. Sans ce filtre le selecteur en trouve deux et echoue en mode
  // strict, sans rien dire de l'alerte reelle.
  const alerte = page.getByRole("alert").filter({ hasText: "La connexion" });
  await expect(alerte).toBeVisible();

  // Le message ne dit PAS si le compte existe : distinguer « compte inconnu »
  // de « mot de passe incorrect » confirmerait l'adresse de l'exploitante.
  await expect(alerte).toHaveText(
    "La connexion a échoué. Vérifiez vos identifiants et réessayez.",
  );

  // Et l'echec laisse sur place, sans session.
  await expect(page).toHaveURL(/\/administration\/connexion$/);
});

/**
 * LE CONTENU EST CENTRE SUR GRAND ECRAN, defaut trouve en apercu visuel.
 *
 * LA MESURE DE DEBORDEMENT NE VOIT PAS CE DEFAUT, et c'est pourquoi ce test
 * existe : la borne `max-width: 42ch` portait sur le seul `.conteneur` du
 * formulaire, sans `margin: 0 auto` ni borne sur la page. Rien ne debordait,
 * les trois projets restaient verts, et l'ecran collait au bord gauche a
 * 1280 px pendant que le titre s'etendait seul sur toute la largeur.
 *
 * A 320 ET 390 px LA BORNE N'EST JAMAIS ATTEINTE : le contenu occupe toute la
 * largeur, les marges gauche et droite valent le seul remplissage, et le test
 * passerait sans rien prouver. Il est donc restreint a `bureau-1280`, la seule
 * largeur ou le centrage est observable.
 *
 * LA TOLERANCE EST DE 1 px, pour l'arrondi sous-pixel d'une largeur impaire.
 */
test("le contenu de la connexion est centre sur grand ecran", async ({
  page,
}, infos) => {
  test.skip(
    infos.project.name !== "bureau-1280",
    "Le centrage ne s'observe qu'au-dela de la borne de 42ch.",
  );

  await page.goto("/administration/connexion");

  const marges = await page
    .getByRole("main")
    .evaluate((element: HTMLElement) => {
      const rectangle = element.getBoundingClientRect();
      return {
        gauche: rectangle.left,
        droite: document.documentElement.clientWidth - rectangle.right,
      };
    });

  // Les deux marges sont egales, ET non nulles : les comparer seulement
  // laisserait passer un `main` occupant toute la largeur, ou elles valent
  // zero de chaque cote.
  expect(marges.gauche).toBeGreaterThan(0);
  expect(Math.abs(marges.gauche - marges.droite)).toBeLessThanOrEqual(1);
});

/**
 * NI BARRE NI LIEN D'EVITEMENT SANS LE ROLE, LS-194, critere 3.
 *
 * LE LAYOUT SORT PAR UN RETOUR ANTICIPE quand la session ne porte pas
 * `ADMINISTRATRICE`, et le lien d'evitement est rendu APRES ce retour. Ce test
 * garde cet ordre, qu'une reorganisation du layout deferait sans bruit : un
 * lien pose au-dessus du test de role s'afficherait ici, et pointerait vers une
 * cible `#contenu` que cet ecran ne porte pas.
 *
 * UN LIEN D'EVITEMENT SANS CIBLE EST PIRE QUE PAS DE LIEN. Il occupe la
 * premiere position de tabulation, et ne mene nulle part.
 *
 * CE N'EST PAS UNE PROTECTION, et rien ici ne le pretend : les pages restent
 * gardees par `exigerAdministratrice`, teste juste au-dessus. C'est une
 * question d'affichage coherent.
 */
test("l'écran de connexion ne porte ni barre ni lien d'évitement", async ({
  page,
}) => {
  await page.goto("/administration/connexion");

  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Sections de l'administration" }),
  ).toHaveCount(0);

  /* Le corollaire : aucune ancre `#contenu` n'est rendue sur cet ecran. */
  await expect(page.locator("#contenu")).toHaveCount(0);
});
