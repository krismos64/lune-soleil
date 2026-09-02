/**
 * Ouvre UNE session cliente VERIFIEE pour toute la suite. LS-56.
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
 * dernieres recevaient « Too many requests ». C'est exactement le defaut que
 * `session-cliente.setup.ts` documente pour LS-81, sous une forme neuve.
 *
 * L'inscription a donc lieu UNE fois au total, avant que la moindre mesure
 * commence. LE PLAFOND N'EST PAS NEUTRALISE POUR AUTANT : le desactiver en
 * test retirerait de la mesure une protection reelle.
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
} from "./chemin-session";

import { writeFileSync } from "node:fs";

/**
 * Nombre de tentatives d'inscription, et pourquoi il en faut plusieurs.
 *
 * `/sign-up/email` accepte TROIS appels par minute et par IP, toutes
 * preparations confondues. `session-cliente.setup.ts` en consomme un, celui-ci
 * un second : deux suffisent en temps normal. Mais les deux projets de
 * preparation tournent en PARALLELE, et une suite relancee dans la minute
 * qui suit trouve le compteur deja entame.
 *
 * Le reessai espace est donc la seule parade qui ne neutralise pas le plafond.
 * Le desactiver en test retirerait de la mesure une protection reelle, et la
 * suite ne dirait plus rien du comportement servi en production.
 */
const TENTATIVES = 4;
const ATTENTE_MS = 21_000;

preparation.setTimeout(120_000);

preparation("ouvrir une session cliente verifiee", async ({ page }) => {
  const email = `e2e-rattachement-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@exemple.test`;

  let reponse = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password: MOT_DE_PASSE_VERIFIE, name: "Client verifie" },
  });

  for (let essai = 1; essai < TENTATIVES && !reponse.ok(); essai += 1) {
    /*
     * ON N'ATTEND QUE SUR UN 429, jamais sur un refus de fond : reessayer une
     * adresse deja prise ou un mot de passe trop court echouerait quatre fois
     * pour la meme raison, en masquant la cause derriere une minute d'attente.
     */
    if (reponse.status() !== 429) {
      break;
    }

    await page.waitForTimeout(ATTENTE_MS);

    reponse = await page.request.post("/api/auth/sign-up/email", {
      data: { email, password: MOT_DE_PASSE_VERIFIE, name: "Client verifie" },
    });
  }

  // ECHOUER ICI PLUTOT QUE DANS CHAQUE TEST : la vraie cause arrive en tete de
  // rapport, au lieu de « le bloc est introuvable » a chaque largeur.
  expect(reponse.ok(), await reponse.text()).toBe(true);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      `UPDATE utilisateur SET email_verifie = true WHERE email = $1`,
      [email],
    );
  } finally {
    await client.end();
  }

  /*
   * L'ADRESSE EST ECRITE SUR DISQUE, les fichiers de largeur ne pouvant pas
   * lire une variable de ce module : Playwright execute chaque projet dans son
   * propre processus. Meme motif que le cookie de commande de LS-118.
   */
  writeFileSync(FICHIER_EMAIL_VERIFIE, JSON.stringify({ email }), "utf-8");

  await page.context().storageState({ path: FICHIER_SESSION_VERIFIEE });
});
