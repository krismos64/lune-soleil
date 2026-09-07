/**
 * Le profil du client, aux trois largeurs. LS-60 critere 6, puis LS-168.
 *
 * CHAQUE LARGEUR A SON PROPRE COMPTE, et c'est une condition de correction : ce
 * fichier CHANGE le mot de passe, donc il consomme l'etat du compte partage.
 * Les trois largeurs se rendraient mutuellement inutilisable la session ouverte
 * par le projet `preparation`.
 *
 * ------------------------------------------------------------------
 * CE QUE LS-168 A CORRIGE. Les comptes etaient CREES a chaque execution, avec
 * une adresse horodatee, deux fois par largeur : le `beforeAll` et le test du
 * mot de passe. SIX inscriptions par execution, quand `/sign-up/email` en
 * accepte TROIS par minute et par IP.
 *
 * La parade etait un reessai espace de 21 secondes. UN REESSAI REPARTIT LA
 * CONSOMMATION, IL NE LA SUPPRIME PAS : il allongeait le fichier de plusieurs
 * minutes et echouait quand meme sous charge, ce que la mesure du 7 septembre
 * 2026 confirme, « 1 failed » sur ce fichier a 320 px.
 *
 * LES ADRESSES SONT DONC FIXES, une paire par largeur, et les comptes
 * reutilises d'une execution a l'autre avec les TROIS PALIERS eprouves par
 * LS-111 et LS-113 : reutiliser, sinon se connecter, sinon s'inscrire. En
 * regime etabli, ce fichier ne fait AUCUNE inscription.
 *
 * LA CLE D'ISOLEMENT EST LE NOM DU PROJET Playwright, `mobile-320` et ses deux
 * voisins, et non la largeur du viewport : c'est le projet qui definit le
 * processus, donc la seule frontiere qui garantisse qu'aucune autre largeur ne
 * touche le meme compte.
 *
 * L'ETAT MODIFIE EST REMIS EN PLACE, et c'est ce qui rend l'adresse fixe
 * tenable. Deux champs seulement changent ici : le NOM, reecrit a chaque
 * execution donc sans importance, et le MOT DE PASSE, restaure par le test qui
 * le change. Aucun test ne touche l'adresse email, verifie sur les sept.
 * ------------------------------------------------------------------
 *
 * LE PLAFOND N'EST PAS DESACTIVE POUR AUTANT : le neutraliser en test
 * retirerait de la mesure une protection reelle. C'est la consommation qui
 * baisse, jamais la garde.
 */
import "dotenv/config";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";
import { Client } from "pg";

import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";
import {
  MOT_DE_PASSE_PROFIL,
  MOT_DE_PASSE_PROFIL_APRES,
  adresseMotDePasseProfil,
  adresseProfil,
  fichierSessionMotDePasse,
  fichierSessionProfil,
} from "./chemin-session";

/** Seize caracteres, la longueur imposee a tous les comptes, ADR-023. */
const MOT_DE_PASSE = MOT_DE_PASSE_PROFIL;

/**
 * La valeur posee par le test de changement, puis defaite par sa restauration.
 *
 * ELLE DOIT DIFFERER DE `MOT_DE_PASSE`, sans quoi le test « changer son mot de
 * passe ferme les autres sessions » demanderait de remplacer une valeur par
 * elle-meme : le formulaire pourrait le refuser, et surtout la mesure ne
 * prouverait plus rien du changement qu'elle annonce. Motif deja rencontre ici,
 * un test de refus qui cesse d'exercer son refus en gardant son nom.
 */
const MOT_DE_PASSE_APRES = MOT_DE_PASSE_PROFIL_APRES;

/*
 * LES DEUX FONCTIONS D'ADRESSE VIVENT DANS `chemin-session.ts`, LS-168.
 *
 * `comptes-profil.setup.ts` doit poser EXACTEMENT les memes adresses que celles
 * lues ici, sans quoi il amorcerait des comptes que ce fichier n'utilise pas et
 * la preparation serait silencieusement inutile. Une definition unique est la
 * seule forme qui ne puisse pas diverger.
 */

/*
 * SERIE : les tests de ce fichier partagent le compte de leur largeur, et
 * celui qui change le mot de passe rendrait les suivants incapables de se
 * connecter s'ils tournaient en parallele.
 */
test.describe.configure({ mode: "serial" });

/**
 * La largeur qui porte les deux tests de `/change-password`, LS-168.
 *
 * ------------------------------------------------------------------
 * POURQUOI CES DEUX TESTS NE TOURNENT PAS AUX TROIS LARGEURS.
 *
 * Ce fichier appelle `/change-password` DEUX fois, et les deux sont des mesures
 * irreductibles : le refus d'un mot de passe actuel faux, et le changement qui
 * ferme les autres sessions. Aux trois largeurs cela fait SIX appels par minute,
 * quand le plafond en accepte CINQ par IP, `src/lib/auth.ts`.
 *
 * AUCUNE DES SIX NE PEUT ETRE SUPPRIMEE ni deplacee vers la preparation :
 * contrairement a l'ouverture d'une session, un changement de mot de passe est
 * l'objet meme de la mesure. Et le plafond ne peut pas etre releve, le critere 2
 * de la story l'interdit : ce qui change est l'environnement de test, jamais la
 * protection. Better Auth compte par IP sans option par session, verifie via
 * Context7.
 *
 * UN DECALAGE A ETE ESSAYE PUIS ECARTE. Decaler chaque largeur de 25 s ne
 * changeait rien, les six appels restant dans la MEME fenetre glissante de 60 s,
 * seulement etales : c'est le piege que cette story corrige par ailleurs, sous
 * une autre forme. Le porter au-dela de la fenetre marchait, au prix de QUATRE
 * MINUTES d'attente pure par execution, payees par la CI et le controle
 * nocturne a chaque fois. Arbitrage de Christophe le 7 septembre 2026.
 *
 * LE MOTIF EXISTE DEJA DANS LE DEPOT : LS-113 a limite
 * `compte-reauthentification.spec.ts` a cette meme largeur, pour cette meme
 * raison. 320 px est la largeur CONTRAIGNANTE du projet.
 *
 * CE QUE L'ON PERD est la mesure du formulaire de mot de passe en 390 et
 * 1280 px. Son rendu reste couvert : les cinq autres tests de ce fichier
 * tournent aux trois largeurs, dont « les trois formulaires sont presents et
 * distincts », « le profil ne deborde pas horizontalement » et la verification
 * axe-core. Ce qui est restreint est le COMPORTEMENT du changement, qui ne
 * depend pas de la largeur.
 * ------------------------------------------------------------------
 */
const LARGEUR_CHANGEMENT_MOT_DE_PASSE = "mobile-320";

let email: string;
let cookies: Awaited<
  ReturnType<import("@playwright/test").BrowserContext["cookies"]>
>;

/**
 * Charge la session posee par la preparation, une fois pour tout le fichier.
 *
 * ------------------------------------------------------------------
 * LA SESSION EST LUE, PAS OUVERTE, LS-168.
 *
 * `comptes-profil.setup.ts` a cree le compte ET pose son etat de session avant
 * que ce projet demarre. Ouvrir la session ici coutait un appel a
 * `/sign-in/email` PAR LARGEUR, et ce fichier en fait trois autres qui sont de
 * VRAIES MESURES : douze appels au total, quand le plafond en accepte CINQ par
 * minute et par IP.
 *
 * LES COOKIES SONT REJOUES PAR CHAQUE TEST, exactement comme avant : seule leur
 * PROVENANCE change.
 * ------------------------------------------------------------------
 *
 * IL N'INSCRIT PLUS RIEN, et il ne doit pas : un compte manquant signalerait
 * que la preparation n'a pas tourne, ce qui est un defaut de configuration et
 * non un etat a rattraper ici. `storageState` echouera alors sur le fichier
 * absent, avec une cause lisible.
 */
test.beforeAll(async ({ browser }, infos) => {
  /*
   * L'ADRESSE EST DERIVEE DU NOM DU PROJET, voir l'entete : c'est le projet qui
   * definit le processus, donc la frontiere qui garantit l'isolement.
   */
  email = adresseProfil(infos.project.name);

  const contexte = await browser.newContext({
    storageState: fichierSessionProfil(infos.project.name),
  });

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

/**
 * Saute ce test hors de la largeur qui porte les appels a `/change-password`.
 *
 * `test.skip` ET NON UNE SORTIE SILENCIEUSE : Playwright marque alors le test
 * comme saute, avec sa raison, au lieu de le compter vert sans rien avoir
 * mesure. Un test qui se desactive en silence affiche « aucun echec » pendant
 * qu'il ne verifie rien.
 */
function seulementSurLaLargeurDeChangement(projet: string): void {
  test.skip(
    projet !== LARGEUR_CHANGEMENT_MOT_DE_PASSE,
    `Les appels a /change-password sont limites a ${LARGEUR_CHANGEMENT_MOT_DE_PASSE}, plafond de cinq par minute et par IP, LS-168.`,
  );
}

/**
 * Lit les cookies d'un etat de session pose par la preparation.
 *
 * UN CONTEXTE JETABLE, ferme aussitot : il ne sert qu'a decoder le fichier, et
 * le laisser ouvert retiendrait un navigateur pour rien.
 */
async function cookiesDe(
  browser: import("@playwright/test").Browser,
  fichier: string,
): Promise<Awaited<ReturnType<BrowserContext["cookies"]>>> {
  const contexte = await browser.newContext({ storageState: fichier });

  try {
    return await contexte.cookies();
  } finally {
    await contexte.close();
  }
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
}, infos) => {
  seulementSurLaLargeurDeChangement(infos.project.name);

  /*
   * LE TEST NEGATIF, critere 3. Le message doit distinguer « actuel incorrect »
   * de « nouveau trop court » : les confondre ferait ressaisir l'ancien a
   * quelqu'un dont le nouveau est simplement trop court.
   */
  await connecter(page);

  /*
   * L'EMPREINTE EST RELEVEE AVANT LE GESTE, c'est elle qui servira de temoin :
   * la relever apres seulement ne dirait rien, faute de point de comparaison.
   */
  const empreinteAvant = await releverEmpreinte(email);

  await page.goto("/compte/profil");

  await page.getByLabel("Mot de passe actuel").fill("mauvais-mot-pass");
  await page.getByLabel("Nouveau mot de passe").fill("autre-phrase-de1");
  await page.getByRole("button", { name: "Changer mon mot de passe" }).click();

  await expect(
    page.getByRole("status", { name: "Changement de mot de passe" }),
  ).toHaveText(/actuel est incorrect/);

  /*
   * L'ANCIEN FONCTIONNE TOUJOURS : un refus n'a rien change.
   *
   * ------------------------------------------------------------------
   * VERIFIE PAR L'EMPREINTE EN BASE ET NON PAR UNE CONNEXION, LS-168.
   *
   * La version precedente rejouait `/sign-in/email`, une fois par largeur. Ces
   * trois appels s'ajoutaient aux TROIS de `connexion-administration.spec.ts`,
   * qui soumet un formulaire de connexion a chaque largeur : six pour les cinq
   * places par minute. Mesure du 7 septembre 2026, deux echecs en 429.
   *
   * CE TEST-LA NE PEUT PAS CEDER SA PLACE : il mesure le refus d'identifiants
   * faux, code 401, et consommer le plafond est ce qu'il fait par nature. C'est
   * donc a celui-ci de liberer la marge.
   *
   * L'EMPREINTE INCHANGEE DIT EXACTEMENT LA MEME CHOSE. Le refus ne doit RIEN
   * avoir change : si l'empreinte relevee apres est celle d'avant, le mot de
   * passe d'origine ouvre toujours le compte. La lecture ne consomme aucun
   * plafond.
   * ------------------------------------------------------------------
   */
  expect(
    await releverEmpreinte(email),
    "Le refus a modifie l'empreinte du mot de passe : il aurait change quelque chose.",
  ).toBe(empreinteAvant);
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
}, infos) => {
  seulementSurLaLargeurDeChangement(infos.project.name);

  const emailDedie = adresseMotDePasseProfil(infos.project.name);

  /*
   * L'EMPREINTE EST RELEVEE AVANT TOUT CHANGEMENT : c'est elle qui sera reposee
   * en fin de test. La relever apres n'aurait aucun sens, la valeur d'origine
   * ayant alors disparu.
   *
   * ELLE VAUT AUSSI PREUVE QUE LE COMPTE EXISTE : `releverEmpreinte` echoue si
   * la ligne manque, avec un message qui nomme l'adresse. La preparation
   * `comptes-profil.setup.ts` l'a cree, ce test n'a plus a s'en charger.
   */
  const empreinteOrigine = await releverEmpreinte(emailDedie);

  /*
   * DEUX SESSIONS REELLEMENT DISTINCTES, ET C'EST TOUTE LA MESURE.
   *
   * `revokeOtherSessions` doit faire tomber l'une et laisser l'autre, donc
   * chacune doit avoir sa propre ligne `session`. Partager un cookie entre les
   * deux contextes les ferait tomber ENSEMBLE, et le test verdirait ou
   * rougirait sans plus rien dire du comportement.
   *
   * ------------------------------------------------------------------
   * ELLES SONT LUES ET NON OUVERTES, LS-168, et ma premiere correction s'est
   * trompee ici.
   *
   * J'avais garde les deux ouvertures en ecrivant qu'elles tiennent « parce que
   * les tests sont serialises ». `describe.serial` n'ordonne que les tests d'un
   * MEME projet : les trois largeurs atteignent ce test EN MEME TEMPS, ce qui
   * fait six appels sur les cinq places par minute de `/sign-in/email`. Mesure
   * du 7 septembre 2026, trois echecs en 74 ms sur la premiere des deux.
   *
   * `comptes-profil.setup.ts` pose donc ces deux etats, la preparation etant
   * sequentielle et pouvant espacer ses ouvertures.
   * ------------------------------------------------------------------
   */
  await page
    .context()
    .addCookies(
      await cookiesDe(browser, fichierSessionMotDePasse(infos.project.name, 1)),
    );

  const autre = await browser.newContext({
    storageState: fichierSessionMotDePasse(infos.project.name, 2),
  });
  const autrePage = await autre.newPage();

  await autrePage.goto("/compte");
  await expect(
    autrePage.getByRole("heading", { name: "Mon compte", exact: true }),
  ).toBeVisible();

  await page.goto("/compte/profil");
  await page.getByLabel("Mot de passe actuel").fill(MOT_DE_PASSE);
  await page.getByLabel("Nouveau mot de passe").fill(MOT_DE_PASSE_APRES);
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

  /*
   * L'EMPREINTE D'ORIGINE EST REPOSEE, et c'est ce qui rend l'adresse fixe
   * tenable : sans cette etape, la prochaine execution ne pourrait pas se
   * connecter, retomberait sur l'inscription, et le defaut que LS-168 corrige
   * reviendrait entier des la deuxieme execution.
   *
   * EN BASE ET NON PAR LE FORMULAIRE, et ce choix est CONTRAINT, pas
   * esthetique. `/change-password` est plafonnee a CINQ appels par minute et
   * par IP, `src/lib/auth.ts` : le formulaire est le chemin naturel, mais il en
   * consommerait un SECOND par largeur, six au total pour cinq places. La
   * restauration reintroduirait donc exactement le defaut qu'elle sert a
   * eviter, sous une autre route.
   *
   * REPOSER L'EMPREINTE PLUTOT QUE LA CALCULER : rien n'est hache ici, la
   * valeur relevee avant le changement est simplement remise. Aucun detail
   * d'implementation de Better Auth n'est fige, et une mise a jour qui
   * changerait l'algorithme n'aurait aucun effet sur ce code.
   */
  await reposerEmpreinte(emailDedie, empreinteOrigine);
});

/**
 * Releve l'empreinte du mot de passe telle qu'elle est stockee, avant le
 * changement, pour pouvoir la reposer apres.
 *
 * `provider_id = 'credential'` : un compte peut porter plusieurs lignes dans
 * `compte`, une par fournisseur d'identite. Seule celle du mot de passe porte
 * une empreinte, les autres l'ont a NULL.
 *
 * AUCUN MOT DE PASSE NE TRANSITE ICI, seulement son empreinte, qui n'ouvre
 * rien : elle n'est ni journalisee, ni affichee, ni ecrite sur disque.
 */
async function releverEmpreinte(email: string): Promise<string> {
  const client = await ouvrirConnexion();

  try {
    const resultat = await client.query<{ password: string | null }>(
      `SELECT c.password
         FROM compte c
         JOIN utilisateur u ON u.id = c.user_id
        WHERE u.email = $1 AND c.provider_id = 'credential'`,
      [email],
    );

    const empreinte = resultat.rows[0]?.password;

    /*
     * ECHOUER ICI PLUTOT QUE PLUS TARD. Sans empreinte relevee, la restauration
     * ne pourrait rien reposer, et le compte resterait sur la nouvelle valeur :
     * la prochaine execution echouerait LOIN de sa cause, exactement le defaut
     * de diagnostic que LS-168 cherche a supprimer.
     */
    expect(
      empreinte,
      `Aucune empreinte de mot de passe pour ${email} : la restauration serait impossible.`,
    ).toBeTruthy();

    return empreinte as string;
  } finally {
    await client.end();
  }
}

/**
 * Remet l'empreinte relevee avant le changement.
 *
 * L'`UPDATE` EST CIBLE SUR LA LIGNE `credential` DU SEUL COMPTE CONCERNE : une
 * clause trop large reposerait la meme empreinte sur d'autres comptes de test,
 * et le defaut ne se verrait qu'a l'execution suivante.
 */
async function reposerEmpreinte(
  email: string,
  empreinte: string,
): Promise<void> {
  const client = await ouvrirConnexion();

  try {
    const resultat = await client.query(
      `UPDATE compte
          SET password = $2
        WHERE provider_id = 'credential'
          AND user_id = (SELECT id FROM utilisateur WHERE email = $1)`,
      [email, empreinte],
    );

    /*
     * UNE LIGNE EXACTEMENT. Zero signifierait que la restauration n'a rien
     * fait, et le test resterait vert en laissant le compte inutilisable pour
     * la prochaine execution : un controle qui ne compte pas ses lignes ne
     * verifie rien, motif deja en fiche sur ce depot.
     */
    expect(
      resultat.rowCount,
      `La restauration de ${email} a touche ${resultat.rowCount} ligne(s) au lieu d'une.`,
    ).toBe(1);
  } finally {
    await client.end();
  }
}

/**
 * Ouvre une connexion sur la base que le serveur de test sert reellement.
 *
 * `DATABASE_URL` et non une base ephemere : le serveur Next.js lance par
 * `webServer` lit cette meme variable. Ecrire ailleurs reposerait l'empreinte
 * dans une base que l'application ne consulte jamais, et la restauration
 * resterait sans effet visible. Meme motif que
 * `session-administration.setup.ts`.
 */
async function ouvrirConnexion(): Promise<Client> {
  const url = process.env.DATABASE_URL;

  expect(
    url,
    "DATABASE_URL absente : le mot de passe du compte de profil ne peut pas etre restaure.",
  ).toBeTruthy();

  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}
