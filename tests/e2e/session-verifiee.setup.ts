/**
 * Ouvre UNE session cliente VERIFIEE pour toute la suite. LS-56, puis LS-168.
 *
 * POURQUOI UNE TROISIEME SESSION. `session-cliente.setup.ts` cree un compte NON
 * verifie, et c'est ce qui lui donne sa valeur : `compte-authentification`
 * mesure le rappel de verification, qui disparait des que l'adresse est
 * confirmee. Le bloc de rattachement, lui, n'apparait QUE sur un compte
 * verifie, condition 1 du parcours 6. Les deux etats sont mutuellement
 * exclusifs a l'ecran, un seul compte ne peut pas servir les deux mesures.
 *
 * POURQUOI UN PROJET DE PREPARATION ET NON UN `beforeAll` PAR LARGEUR.
 * Premiere tentative mesuree : trois inscriptions dans la meme minute, une par
 * largeur, et `/sign-up/email` plafonne a trois par minute et par IP. Les
 * dernieres recevaient « Too many requests ».
 *
 * ------------------------------------------------------------------
 * CE QUE LS-168 A CORRIGE, ET POURQUOI LE REESSAI NE SUFFISAIT PAS.
 *
 * L'adresse portait un horodatage, `e2e-rattachement-${Date.now()}-...`, donc
 * CHAQUE execution creait un compte neuf et consommait une des trois places par
 * minute de `/sign-up/email`. La parade etait un REESSAI espace de 21 secondes,
 * jusqu'a quatre fois.
 *
 * UN REESSAI REPARTIT LA CONSOMMATION, IL NE LA SUPPRIME PAS. Il allongeait la
 * preparation de 84 secondes dans le pire cas, et echouait quand meme des que
 * la suite etait relancee dans la minute : le compteur etait deja entame a
 * l'arrivee. C'est exactement le defaut que LS-113 avait ferme sur
 * `session-cliente.setup.ts`, reste entier ici faute d'avoir ete relu.
 *
 * L'ADRESSE EST DONC FIXE, et le compte reutilise d'une execution a l'autre,
 * avec les TROIS PALIERS deja eprouves par `session-cliente.setup.ts` (LS-113)
 * et `session-administration.setup.ts` (LS-111) : reutiliser l'etat sur disque,
 * sinon se connecter, sinon s'inscrire. En regime etabli, une execution ne fait
 * AUCUN appel d'authentification, et le reessai devient sans objet.
 *
 * AUCUN TEST NE DETRUIT CE COMPTE NI NE CHANGE SES IDENTIFIANTS, verifie avant
 * de figer l'adresse sur les cinq fichiers qui la lisent : `compte-adresses`,
 * `compte-retractation`, `compte-rattachement`, `compte-commandes` et
 * `compte-profil`. Ils creent des commandes et des adresses, jamais un compte.
 * ------------------------------------------------------------------
 *
 * LE PLAFOND N'EST PAS DESACTIVE POUR AUTANT : le neutraliser en test
 * retirerait de la mesure une protection reelle, et la suite ne dirait plus
 * rien du comportement servi en production. C'est la consommation qui baisse,
 * jamais la garde.
 *
 * LE COMPTE EST CREE PAR L'API, puis verifie EN BASE. Le lien de verification
 * part par email et aucun test de bout en bout ne peut le lire : le forcer en
 * base est le seul chemin. Ce que cela ne contourne pas, c'est la REGLE, portee
 * par le service et exercee par `tests/integration/rattachement-commandes`.
 *
 * AUCUNE COMMANDE N'EST CREEE ICI, et c'est le point le plus facile a rater.
 * Le hook `databaseHooks.session.create.after` rattache a CHAQUE ouverture de
 * session : une commande creee ici serait deja rattachee au premier chargement
 * de `/compte`, et le bloc n'aurait rien a proposer. Chaque test cree donc la
 * sienne APRES avoir pose son cookie.
 */
import "dotenv/config";

import { expect, test as preparation } from "@playwright/test";
import { Client } from "pg";

import {
  FICHIER_SESSION_VERIFIEE,
  MOT_DE_PASSE_VERIFIE,
  FICHIER_EMAIL_VERIFIE,
  EMAIL_VERIFIE,
} from "./chemin-session";

import { writeFileSync } from "node:fs";

preparation.setTimeout(120_000);

preparation("ouvrir une session cliente verifiee", async ({ page }) => {
  /*
   * L'ADRESSE EST ECRITE SUR DISQUE DANS TOUS LES CAS, y compris quand le
   * palier 1 evite toute authentification.
   *
   * ELLE EST FIXE DEPUIS LS-168, donc le fichier porte toujours la meme valeur,
   * mais les cinq fichiers de largeur qui le LISENT ne doivent pas dependre
   * d'une execution anterieure pour le trouver : un depot fraichement clone
   * n'en a aucun, et `readFileSync` leverait avant la premiere mesure.
   */
  writeFileSync(
    FICHIER_EMAIL_VERIFIE,
    JSON.stringify({ email: EMAIL_VERIFIE }),
    "utf-8",
  );

  /*
   * PALIER 1 : L'ETAT DE L'EXECUTION PRECEDENTE VAUT-IL ENCORE ?
   *
   * Les sessions durent un jour depuis ADR-027 : l'etat enregistre par
   * l'execution precedente est presque toujours encore valide, et ce palier
   * evite alors tout appel d'authentification.
   *
   * LA VERIFICATION EN BASE EST REJOUEE AVANT, et l'ordre compte : sur une base
   * reinitialisee entre deux executions, l'etat sur disque peut rester valide
   * alors que le drapeau `email_verifie` a disparu avec la ligne. Le bloc de
   * rattachement ne s'afficherait pas, et rien ne designerait la cause. Meme
   * motif que `preparerBase` dans `session-administration.setup.ts`.
   */
  await marquerVerifie();

  if (await sessionEncoreValide(page)) {
    return;
  }

  /*
   * PALIERS 2 ET 3 : SE CONNECTER, SINON S'INSCRIRE.
   *
   * L'ORDRE EST DELIBERE : la connexion d'abord, l'inscription seulement si
   * elle echoue. L'inverse consommerait une place du plafond d'inscription a
   * chaque execution rien que pour apprendre que le compte existe, ce qui est
   * exactement le defaut que LS-168 corrige.
   *
   * `/sign-in/email` EST PLAFONNE A CINQ PAR MINUTE et compte separement des
   * trois de `/sign-up/email` : le palier 2 est donc nettement moins contraint
   * que le palier 3.
   */
  let reponse = await page.request.post("/api/auth/sign-in/email", {
    data: { email: EMAIL_VERIFIE, password: MOT_DE_PASSE_VERIFIE },
  });

  if (!reponse.ok()) {
    reponse = await page.request.post("/api/auth/sign-up/email", {
      data: {
        email: EMAIL_VERIFIE,
        password: MOT_DE_PASSE_VERIFIE,
        name: "Client verifie",
      },
    });

    /*
     * LE COMPTE VIENT D'ETRE CREE, IL FAUT LE VERIFIER MAINTENANT. L'appel
     * ci-dessus n'a touche aucune ligne, l'utilisateur n'existant pas encore :
     * sans ce second passage, la toute premiere execution sur une base neuve
     * servirait un compte NON verifie, et le bloc de rattachement resterait
     * invisible pour une raison sans rapport avec ce qu'il mesure.
     */
    if (reponse.ok()) {
      await marquerVerifie();
    }
  }

  // ECHOUER ICI PLUTOT QUE DANS CHAQUE TEST : la vraie cause arrive en tete de
  // rapport, au lieu de « le bloc est introuvable » a chaque largeur.
  expect(reponse.ok(), await reponse.text()).toBe(true);

  await page.context().storageState({ path: FICHIER_SESSION_VERIFIEE });
});

/**
 * Force le drapeau de verification sur le compte, en base.
 *
 * IDEMPOTENT ET SANS EFFET SI LE COMPTE N'EXISTE PAS ENCORE : l'`UPDATE` touche
 * alors zero ligne, ce qui est le cas normal du tout premier passage.
 *
 * `DATABASE_URL` ET NON UNE BASE EPHEMERE : le serveur Next.js lance par
 * `webServer` lit cette meme variable. Ecrire ailleurs poserait le drapeau dans
 * une base que l'application ne consulte jamais.
 */
async function marquerVerifie(): Promise<void> {
  const url = process.env.DATABASE_URL;

  // ECHOUER PLUTOT QUE DE SAUTER LA PREPARATION. Un fichier qui se desactiverait
  // tout seul quand la base manque afficherait « aucun echec » pendant que rien
  // n'est verifie.
  expect(
    url,
    "DATABASE_URL absente : la session verifiee ne peut pas etre preparee.",
  ).toBeTruthy();

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(
      `UPDATE utilisateur SET email_verifie = true WHERE email = $1`,
      [EMAIL_VERIFIE],
    );
  } finally {
    await client.end();
  }
}

/**
 * L'etat de session enregistre par une execution precedente ouvre-t-il encore
 * l'espace client ?
 *
 * TESTE SUR UNE ROUTE PROTEGEE ET NON SUR `/api/auth/get-session`. Cette
 * derniere rend 200 avec un corps vide pour une session absente ou expiree :
 * un test de `ok()` la declarerait valide a tort. `/compte` redirige vers la
 * connexion sans session, ce qui se distingue sans ambiguite.
 *
 * IL NE CONSOMME AUCUN PLAFOND, ce n'est pas une route d'authentification.
 */
async function sessionEncoreValide(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  const fs = await import("node:fs/promises");

  /*
   * L'ABSENCE DE FICHIER EST LE CAS DE LA PREMIERE EXECUTION, et elle n'est pas
   * une erreur : il faut alors passer aux paliers suivants sans bruit.
   */
  try {
    await fs.access(FICHIER_SESSION_VERIFIEE);
  } catch {
    return false;
  }

  const contexte = await page.context().browser()?.newContext({
    storageState: FICHIER_SESSION_VERIFIEE,
  });

  if (!contexte) {
    return false;
  }

  try {
    const onglet = await contexte.newPage();
    const reponse = await onglet.goto("/compte");

    return (
      reponse !== null &&
      reponse.ok() &&
      onglet.url().includes("/compte") &&
      !onglet.url().includes("/connexion")
    );
  } finally {
    await contexte.close();
  }
}
