/**
 * Ouvre UNE session cliente pour toute la suite de bout en bout. LS-81, LS-89,
 * puis LS-113.
 *
 * POURQUOI CE PROJET DE PREPARATION EXISTE, ET LE DEFAUT QU'IL CORRIGE. Les
 * tests de l'ecran de suppression ont besoin d'une session, et aucun ecran de
 * connexion client n'existait alors, LS-54. La premiere version s'inscrivait
 * depuis les tests eux-memes, ce qui a produit un defaut plus grave que celui
 * qu'elle mesurait :
 *
 *   - `/sign-up/email` est plafonne a trois appels par minute et par adresse IP,
 *     et Better Auth tient EN PLUS un compteur global par IP, LS-92
 *   - les trois projets de largeur s'inscrivaient chacun dans la meme minute
 *   - le compteur ainsi consomme faisait rendre 429 a un test VOISIN,
 *     `connexion-administration`, qui attend un 401 sur un identifiant faux
 *
 * ------------------------------------------------------------------
 * CE QUE LS-113 A CORRIGE, ET POURQUOI LA PREMIERE CORRECTION NE SUFFISAIT PAS.
 *
 * « L'inscription a lieu une fois » valait POUR UNE EXECUTION, jamais entre
 * deux : l'adresse portait un horodatage, donc chaque relance creait un compte
 * neuf et consommait une des TROIS places par minute de `/sign-up/email`.
 *
 * TROIS EXECUTIONS RAPPROCHEES SUFFISAIENT A BLOQUER LA SUITE ENTIERE, et le
 * defaut se voyait loin de sa cause : la preparation echouait en 429, Playwright
 * marquait tous les tests « non executes », et un script de mutation concluait
 * « le test est aveugle » sur des tests parfaitement voyants. Mesure faite une
 * dizaine de fois le 5 septembre 2026 en ecrivant LS-113.
 *
 * L'ADRESSE EST DONC FIXE, et le compte reutilise d'une execution a l'autre,
 * exactement comme `session-administration.setup.ts` le fait depuis LS-111.
 *
 * TROIS PALIERS, DU MOINS COUTEUX AU PLUS COUTEUX : reutiliser l'etat sur
 * disque, sinon se connecter, sinon s'inscrire. En regime etabli, une execution
 * ne fait AUCUN appel d'authentification.
 *
 * AUCUN TEST NE DETRUIT CE COMPTE, verifie avant de figer l'adresse :
 * `compte-suppression-connecte.spec.ts` mesure le REFUS de suppression faute de
 * preuve d'identite, et assertit explicitement que le compte est toujours la.
 * Aucun test ne change non plus son adresse ni son mot de passe. Un compte
 * jetable n'etait donc pas une necessite, seulement une facilite.
 * ------------------------------------------------------------------
 *
 * LE PLAFOND N'EST PAS DESACTIVE POUR AUTANT : le neutraliser en test retirerait
 * de la mesure une protection reelle, et la suite ne dirait plus rien du
 * comportement servi en production. C'est la consommation qui baisse, pas la
 * garde.
 */
import { expect, test as preparation } from "@playwright/test";

import { FICHIER_SESSION, MOT_DE_PASSE_CLIENT } from "./chemin-session";

/**
 * LA VALEUR VIENT DU MODULE PARTAGE DEPUIS LS-164 : les tests de
 * reauthentification doivent ressaisir ce mot de passe, et deux litteraux
 * distincts divergeraient sans que rien ne le signale.
 */
const MOT_DE_PASSE = MOT_DE_PASSE_CLIENT;

/**
 * Adresse FIXE du compte client de test, LS-113.
 *
 * ELLE PORTE LE PREFIXE `e2e-`, que la retrogradation de
 * `session-administration.setup.ts` cible : un compte de test ne doit jamais
 * garder un role sur une base de developpement.
 *
 * LE NOM RESTE `suppression`, celui de l'ecran pour lequel cette session a ete
 * creee en LS-81, pour ne pas rendre les traces existantes illisibles.
 */
const EMAIL_CLIENT = "e2e-suppression@exemple.test";

preparation("ouvrir une session cliente partagee", async ({ page }) => {
  /*
   * PALIER 1 : L'ETAT DE L'EXECUTION PRECEDENTE VAUT-IL ENCORE ?
   *
   * Les sessions durent un jour depuis ADR-027 : l'etat enregistre par
   * l'execution precedente est presque toujours encore valide, et ce palier
   * evite alors tout appel d'authentification.
   */
  if (await sessionEncoreValide(page)) {
    return;
  }

  /*
   * PALIERS 2 ET 3 : SE CONNECTER, SINON S'INSCRIRE.
   *
   * L'ORDRE EST DELIBERE : la connexion d'abord, l'inscription seulement si
   * elle echoue. L'inverse consommerait une place du plafond d'inscription a
   * chaque execution rien que pour apprendre que le compte existe, ce qui est
   * exactement le defaut que LS-113 corrige.
   *
   * `/sign-in/email` EST PLAFONNE A CINQ PAR MINUTE et compte separement des
   * trois de `/sign-up/email` : le palier 2 est donc nettement moins contraint
   * que le palier 3.
   */
  let reponse = await page.request.post("/api/auth/sign-in/email", {
    data: { email: EMAIL_CLIENT, password: MOT_DE_PASSE },
  });

  if (!reponse.ok()) {
    reponse = await page.request.post("/api/auth/sign-up/email", {
      data: {
        email: EMAIL_CLIENT,
        password: MOT_DE_PASSE,
        name: "Client de test",
      },
    });
  }

  // ECHOUER ICI PLUTOT QUE DANS CHAQUE TEST. Les douze tests dependants sont
  // alors marques comme non executes, avec la vraie cause en tete de rapport,
  // au lieu d'echouer plus loin sur « le formulaire est introuvable ».
  expect(reponse.ok(), await reponse.text()).toBe(true);

  await page.context().storageState({ path: FICHIER_SESSION });
});

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
    await fs.access(FICHIER_SESSION);
  } catch {
    return false;
  }

  const contexte = await page.context().browser()?.newContext({
    storageState: FICHIER_SESSION,
  });

  if (!contexte) {
    return false;
  }

  try {
    const onglet = await contexte.newPage();
    const reponse = await onglet.goto("/compte");
    const valide =
      reponse !== null &&
      reponse.ok() &&
      onglet.url().includes("/compte") &&
      !onglet.url().includes("/connexion");

    if (valide) {
      /*
       * L'ETAT EST RECOPIE TEL QUEL. Il est deja sur disque et vient d'etre
       * prouve valide : le reecrire depuis ce contexte ne changerait rien, et
       * ne pas le toucher evite d'ecrire un fichier pendant qu'un autre projet
       * pourrait le lire.
       */
      return true;
    }

    return false;
  } finally {
    await contexte.close();
  }
}
