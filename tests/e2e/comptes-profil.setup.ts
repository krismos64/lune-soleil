/**
 * Amorce les six comptes de `compte-profil.spec.ts`, LS-168.
 *
 * POURQUOI UNE PREPARATION ET NON UNE INSCRIPTION DANS LE FICHIER DE TEST.
 * `compte-profil` a besoin d'un compte PAR LARGEUR, et de deux : un pour les
 * six tests ordinaires, un dedie au test qui consomme le mot de passe. Six
 * comptes, donc six inscriptions au tout premier passage.
 *
 * LES TROIS LARGEURS TOURNENT EN PARALLELE, dans trois processus distincts :
 * inscrire depuis le fichier de test envoie les six appels dans la meme
 * seconde, et `/sign-up/email` en accepte TROIS par minute et par IP. Mesure du
 * 7 septembre 2026 sur base neuve : « Too many requests », trois echecs.
 *
 * LE PROJET `preparation` EST DEVENU SEQUENTIEL POUR CELA, `workers: 1` dans
 * `playwright.config.ts`. IL NE L'ETAIT PAS : Playwright repartit les fichiers
 * d'un meme projet sur plusieurs travailleurs par defaut, et la premiere
 * version de ce fichier a echoue en 429 des son premier appel, « Running 3
 * tests using 3 workers », les cinq preparations inscrivant ensemble. Un
 * espacement ecrit ici ne vaut que si rien d'autre n'inscrit en meme temps.
 *
 * ------------------------------------------------------------------
 * L'ATTENTE N'A LIEU QUE SUR UNE BASE NEUVE, et c'est ce qui la distingue du
 * reessai espace que LS-168 supprime par ailleurs.
 *
 * Un reessai attend APRES avoir echoue, a chaque execution, sans jamais
 * supprimer la cause. Celle-ci attend AVANT de depasser, une seule fois dans la
 * vie de la base : des que les six comptes existent, une seule lecture en base
 * le constate et plus aucune inscription n'a lieu.
 *
 * EN REGIME ETABLI CE FICHIER NE FAIT AUCUN APPEL D'AUTHENTIFICATION, ni
 * inscription ni connexion : une requete SQL, et il rend la main en quelques
 * dizaines de millisecondes. Voir `comptesExistants` pour pourquoi la
 * verification ne peut PAS passer par une connexion.
 * ------------------------------------------------------------------
 *
 * IL POSE AUSSI L'ETAT DE SESSION DE CHAQUE LARGEUR, et c'est le second volet
 * de LS-168. `compte-profil` ouvrait la sienne dans son `beforeAll`, soit un
 * appel a `/sign-in/email` PAR LARGEUR, et ce fichier en fait trois autres qui
 * sont de vraies mesures : douze au total quand le plafond en accepte CINQ par
 * minute. Voir `fichierSessionProfil` dans `chemin-session.ts`.
 */
import "dotenv/config";

import { expect, test as preparation } from "@playwright/test";
import { Client } from "pg";

import {
  MOT_DE_PASSE_PROFIL,
  PROJETS_LARGEUR,
  adresseMotDePasseProfil,
  adresseProfil,
  fichierSessionProfil,
} from "./chemin-session";
import { inscrireEspace } from "./inscription-espacee";

/*
 * SIX INSCRIPTIONS ESPACEES FONT DEUX MINUTES DANS LE PIRE CAS, celui de la
 * base neuve. Le delai par defaut de trente secondes ne les couvrirait pas.
 */
preparation.setTimeout(300_000);

preparation("amorcer les comptes du profil", async ({ page, browser }) => {
  const adresses = PROJETS_LARGEUR.flatMap((projet) => [
    adresseProfil(projet),
    adresseMotDePasseProfil(projet),
  ]);

  const existants = await comptesExistants(adresses);

  for (const email of adresses) {
    if (existants.has(email)) {
      continue;
    }

    /*
     * L'INSCRIPTION PASSE PAR L'AIDE PARTAGEE, dont l'espacement est compte
     * GLOBALEMENT et non par fichier : les cinq preparations creent des comptes
     * sur une base neuve, et c'est leur TOTAL qui franchit les trois places par
     * minute. Voir `inscription-espacee.ts`.
     */
    await inscrireEspace(page, email, MOT_DE_PASSE_PROFIL, "Client profil");
  }

  /*
   * L'ETAT DE SESSION DE CHAQUE LARGEUR EST POSE ICI, voir
   * `fichierSessionProfil` pour la raison : `compte-profil` faisait DOUZE
   * connexions quand `/sign-in/email` en accepte CINQ par minute.
   *
   * SEULES LES LARGEURS DONT L'ETAT NE VAUT PLUS sont ouvertes, et en regime
   * etabli aucune ne l'est.
   */
  for (const projet of PROJETS_LARGEUR) {
    await ouvrirSessionProfil(browser, projet);
  }
});

/**
 * Ouvre la session de travail d'une largeur, si celle de l'execution
 * precedente ne vaut plus.
 *
 * UN CONTEXTE PAR LARGEUR, et non le contexte de la preparation : chaque etat
 * doit porter les cookies d'UN SEUL compte. Les poser tous sur le meme contexte
 * ferait que le dernier connecte ecraserait les precedents, et les trois
 * fichiers designeraient le meme compte.
 *
 * ELLE NE CONSOMME RIEN EN REGIME ETABLI : les sessions durent un jour depuis
 * ADR-027, donc l'etat enregistre par l'execution precedente est presque
 * toujours encore valide.
 */
async function ouvrirSessionProfil(
  browser: import("@playwright/test").Browser,
  projet: string,
): Promise<void> {
  const fichier = fichierSessionProfil(projet);

  if (await sessionEncoreValide(browser, fichier)) {
    return;
  }

  const contexte = await browser.newContext();

  try {
    const onglet = await contexte.newPage();

    const reponse = await onglet.request.post("/api/auth/sign-in/email", {
      data: {
        email: adresseProfil(projet),
        password: MOT_DE_PASSE_PROFIL,
      },
    });

    // ECHOUER ICI PLUTOT QUE DANS CHAQUE TEST : la vraie cause arrive en tete
    // de rapport, au lieu de « le formulaire est introuvable » a chaque largeur.
    expect(reponse.ok(), await reponse.text()).toBe(true);

    await contexte.storageState({ path: fichier });
  } finally {
    await contexte.close();
  }
}

/**
 * L'etat enregistre par une execution precedente ouvre-t-il encore l'espace
 * client ?
 *
 * TESTE SUR UNE ROUTE PROTEGEE ET NON SUR `/api/auth/get-session`. Cette
 * derniere rend 200 avec un corps vide pour une session absente ou expiree :
 * un test de `ok()` la declarerait valide a tort. `/compte` redirige vers la
 * connexion sans session, ce qui se distingue sans ambiguite. Meme motif que
 * les trois preparations de session.
 *
 * IL NE CONSOMME AUCUN PLAFOND, ce n'est pas une route d'authentification.
 */
async function sessionEncoreValide(
  browser: import("@playwright/test").Browser,
  fichier: string,
): Promise<boolean> {
  const fs = await import("node:fs/promises");

  /*
   * L'ABSENCE DE FICHIER EST LE CAS DE LA PREMIERE EXECUTION, et elle n'est pas
   * une erreur : il faut alors ouvrir la session sans bruit.
   */
  try {
    await fs.access(fichier);
  } catch {
    return false;
  }

  const contexte = await browser.newContext({ storageState: fichier });

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

/**
 * Lesquelles de ces adresses ont deja un compte ?
 *
 * ------------------------------------------------------------------
 * EN BASE ET NON PAR UNE CONNEXION, et ce choix est CONTRAINT.
 *
 * La premiere version testait chaque compte par `/sign-in/email`. Ce chemin est
 * plafonne a CINQ appels par minute et par IP, et il en faut SIX : le plafond
 * etait donc franchi a chaque execution, meme en regime etabli ou les six
 * comptes existent. Better Auth compte tous les appels qu'il traite, les
 * REUSSIS compris.
 *
 * Mesure du 7 septembre 2026 : compteur a 5/5 sur `/sign-in/email` alors que
 * les neuf comptes etaient bien en base, et la preparation echouait en 196 ms,
 * donc sur un refus de connexion et non sur une inscription.
 *
 * UNE LECTURE EN BASE NE CONSOMME AUCUN PLAFOND, et repond a la seule question
 * qui compte ici : le compte existe-t-il ? Elle ne verifie pas le mot de passe,
 * ce qui est sans importance, aucun test ne changeant celui des comptes de
 * profil, et celui du compte dedie etant restaure par le test qui le change.
 * ------------------------------------------------------------------
 *
 * UNE SEULE REQUETE POUR LES SIX, plutot qu'une par adresse : six connexions a
 * la base pour une question aussi simple seraient du gaspillage, et le tableau
 * est deja connu en entier.
 */
async function comptesExistants(adresses: string[]): Promise<Set<string>> {
  const url = process.env.DATABASE_URL;

  // ECHOUER PLUTOT QUE DE SAUTER LA PREPARATION. Un fichier qui se desactiverait
  // tout seul quand la base manque afficherait « aucun echec » pendant que rien
  // n'est prepare.
  expect(
    url,
    "DATABASE_URL absente : les comptes de profil ne peuvent pas etre amorces.",
  ).toBeTruthy();

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const resultat = await client.query<{ email: string }>(
      `SELECT email FROM utilisateur WHERE email = ANY($1::text[])`,
      [adresses],
    );

    return new Set(resultat.rows.map((ligne) => ligne.email));
  } finally {
    await client.end();
  }
}
