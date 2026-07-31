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

  const debordement = await page.evaluate(() => {
    const racine = document.documentElement;
    return racine.scrollWidth - racine.clientWidth;
  });

  expect(debordement).toBeLessThanOrEqual(0);
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
  const reponseConnexion = page.waitForResponse(
    (reponse) =>
      reponse.url().includes("/api/auth/sign-in/email") &&
      reponse.request().method() === "POST",
  );

  await page.getByLabel("Adresse email").fill("inconnu@exemple.fr");
  await page.getByLabel("Mot de passe").fill("un-mot-de-passe1");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();

  expect((await reponseConnexion).status()).toBe(401);

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
