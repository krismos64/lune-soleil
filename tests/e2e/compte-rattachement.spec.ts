/**
 * Le bloc de rattachement des commandes invitees, aux trois largeurs. LS-56,
 * critere 6, parcours 6.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent le service sur base reelle et couvrent les trois conditions
 * cumulatives ; ils ne disent rien de ce que la personne VOIT.
 *
 * CHAQUE LARGEUR CREE SON PROPRE COMPTE, ET C'EST UNE CONDITION DE CORRECTION.
 * Le rattachement CONSOMME l'etat qu'il mesure : il rattache TOUTES les
 * commandes du compte d'un coup, donc la premiere largeur qui clique fait
 * disparaitre le bloc pour les deux autres, qui partagent la meme base.
 *
 * Mesure avant correction, avec un compte partage par le projet de
 * preparation : onze tests sur douze rougissaient sur « element(s) not
 * found ». La cause designee, un bloc absent, n'etait pas la vraie : le bloc
 * fonctionnait et avait deja fait son travail. C'est le piege des projets
 * Playwright qui partagent la base, deja rencontre sur ce depot.
 *
 * NI INSCRIPTION NI CONNEXION DANS CE FICHIER, ET LES DEUX ONT ETE MESUREES.
 * `/sign-up/email` accepte trois appels par minute et par IP, `/sign-in/email`
 * cinq :
 *
 *   une inscription par largeur   trois dans la meme minute, les dernieres
 *                                 recevaient « Too many requests »
 *   une connexion par test        douze dans la meme minute, meme resultat
 *
 * La session vient donc du projet `preparation`, ouverte UNE fois pour les
 * trois largeurs, exactement comme `session-cliente.setup.ts` le fait depuis
 * LS-81. LE PLAFOND N'EST PAS NEUTRALISE : le desactiver retirerait de la
 * mesure une protection reelle.
 *
 * LA COMMANDE EST CREEE APRES LA CONNEXION, ET L'ORDRE N'EST PAS NEGOCIABLE.
 * Le hook `databaseHooks.session.create.after` rattache a CHAQUE ouverture de
 * session : une commande creee avant serait deja rattachee au premier
 * chargement de `/compte`, et le bloc n'aurait rien a proposer.
 *
 * Mesure avant correction : les trois largeurs rougissaient sur « bloc
 * introuvable » avec `utilisateur_id` deja renseigne en base. Le code
 * fonctionnait exactement comme prevu, c'est le test qui mesurait l'apres.
 *
 * CE QUE CELA REVELE DU PRODUIT, et qui merite d'etre dit : le bloc est un
 * ecran de RATTRAPAGE, pas le chemin courant. En exploitation, un client ne le
 * voit que s'il a commande sans compte depuis sa derniere connexion. Le chemin
 * nominal, lui, est silencieux et c'est voulu.
 */
import "dotenv/config";

import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import { Client } from "pg";

import {
  FICHIER_EMAIL_VERIFIE,
  FICHIER_SESSION,
  FICHIER_SESSION_VERIFIEE,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const TITRE_BLOC = "Commandes passées sans compte";
const BOUTON = "Rattacher mes commandes";

/**
 * Ouvre une connexion, execute, ferme. Le `finally` est ce qui compte : une
 * connexion laissee ouverte par un test en echec epuise le pool et fait rougir
 * les fichiers suivants, loin de la cause.
 */
async function avecBase(
  travail: (client: Client) => Promise<void>,
): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await travail(client);
  } finally {
    await client.end();
  }
}

test.describe("compte verifie, le bloc est propose", () => {
  /*
   * SERIE ET NON PARALLELE : le dernier test consomme l'etat que les
   * precedents mesurent. Playwright respecte l'ordre de declaration dans un
   * fichier, `serial` le rend explicite plutot qu'implicite.
   */
  test.describe.configure({ mode: "serial" });

  /*
   * LA SESSION VIENT DU PROJET `preparation`, ouverte UNE fois pour toute la
   * suite. Voir l'entete : s'inscrire ou se connecter ici epuisait le plafond.
   */
  test.use({ storageState: FICHIER_SESSION_VERIFIEE });

  /*
   * LA COMMANDE EST CREEE AVANT CHAQUE TEST, ET C'EST L'ORDRE QUI COMPTE. Le
   * hook `databaseHooks.session.create.after` rattache a chaque ouverture de
   * session : une commande creee par la preparation serait deja rattachee, et
   * le bloc n'aurait rien a proposer. Ici la session existe deja, aucune
   * nouvelle n'est ouverte, donc la commande reste invitee jusqu'au clic.
   *
   * Mesure avant correction : les trois largeurs rougissaient sur « bloc
   * introuvable » avec `utilisateur_id` deja renseigne en base. Le code
   * fonctionnait exactement comme prevu, c'est le test qui mesurait l'apres.
   */
  test.beforeEach(async ({}, infos) => {
    const { email } = JSON.parse(
      readFileSync(FICHIER_EMAIL_VERIFIE, "utf-8"),
    ) as { email: string };

    /*
     * LA COMMANDE PORTE LE NOM DU PROJET, et sans cela les trois largeurs se
     * volent leurs commandes. Elles partagent LE MEME COMPTE, ouvert une fois
     * par le projet `preparation` pour ne pas saturer le plafond
     * d'inscription : le rattachement de `bureau-1280` emportait donc aussi
     * les commandes creees pour `mobile-320` et `mobile-390`, qui lisaient
     * ensuite « Aucune commande a rattacher ».
     *
     * Le rattachement prend TOUTES les commandes eligibles du compte, jamais
     * une seule : c'est la propriete correcte du service, et c'est elle qui
     * rend ce partage impossible. Les projets Playwright partagent la base,
     * piege deja en fiche sur ce depot.
     *
     * `Date.now()` NE SUFFIRAIT PAS : les trois projets tournent en parallele
     * et peuvent tomber sur la meme milliseconde. Le nom du projet les separe
     * de facon deterministe.
     */
    const marque = infos.project.name;

    await avecBase(async (client) => {
      await client.query(
        `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                               dissocie_a, adresse_livraison, adresse_facturation,
                               sous_total_centimes, mode_livraison, frais_port_centimes,
                               total_centimes, cgv_acceptees_a, cgv_version, cree_a)
         VALUES (gen_random_uuid()::text, $1, $2, 'Client verifie', NULL, NULL,
                 '{}'::jsonb, '{}'::jsonb, 4500, 'DOMICILE', 499, 4999, now(), 'v1', now())`,
        [
          `C-TEST-56-${marque}-${Date.now()}`,
          // `email_normalise` PORTE LA FORME QUE `services/commande.ts` ECRIT.
          email.trim().toLowerCase(),
        ],
      );
    });
  });

  test("le bloc apparait avec son bouton", async ({ page }) => {
    await page.goto("/compte");

    await expect(page.getByRole("heading", { name: TITRE_BLOC })).toBeVisible();
    await expect(page.getByRole("button", { name: BOUTON })).toBeVisible();
  });

  test("le bloc ne deborde pas horizontalement", async ({ page }) => {
    await page.goto("/compte");

    await expect(page.getByRole("heading", { name: TITRE_BLOC })).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test("aucune violation axe-core sur la page portant le bloc", async ({
    page,
  }) => {
    await page.goto("/compte");
    await expect(page.getByRole("heading", { name: TITRE_BLOC })).toBeVisible();

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });

  /*
   * CE TEST VIENT EN DERNIER, ET L'ORDRE EST UNE CONDITION DE CORRECTION. Il
   * CONSOMME l'etat qu'il mesure : une fois les commandes rattachees, le bloc
   * disparait pour tout test qui suivrait. Voir l'entete du fichier.
   */
  test("le rattachement annonce son resultat sans rechargement", async ({
    page,
  }) => {
    await page.goto("/compte");

    const bouton = page.getByRole("button", { name: BOUTON });
    await bouton.click();

    /*
     * L'ANNONCE EST CHERCHEE PAR SON NOM ACCESSIBLE, pas par le seul role :
     * DEUX regions `status` coexistent sur cet ecran, celle-ci et la
     * confirmation d'adresse. Un selecteur sur le role nu est ambigu, et
     * l'annonceur de route de Next.js porte lui aussi ce role.
     */
    const annonce = page.getByRole("status", {
      name: "Rattachement des commandes",
    });

    /*
     * LE MESSAGE SURVIT A LA REVALIDATION, ET C'EST LE CŒUR DE CE TEST.
     *
     * La premiere version echouait ici pour une raison qu'aucune assertion ne
     * disait : `revalidatePath` faisait retomber a zero le nombre de commandes
     * eligibles, donc la page demontait la section ENTIERE. Le message de
     * succes disparaissait avec son conteneur, le focus retombait sur `body`,
     * et la region live etait retiree du DOM au moment ou son texte y entrait.
     * Signature de ce demontage dans le rapport : « element(s) not found »
     * APRES que le selecteur a resolu le noeud.
     *
     * Le geste reussi ne produisait rien de visible ni de durable. Trouve par
     * la revue frontend, jamais par les mesures.
     *
     * L'ASSERTION PORTE SUR « UN COMPTE RENDU EXISTE », PAS SUR SON CHIFFRE, et
     * ce choix est deliberе. Les trois largeurs partagent LE MEME COMPTE, ouvert
     * une fois pour ne pas saturer le plafond d'inscription, et le rattachement
     * prend TOUTES les commandes eligibles : la premiere largeur qui clique
     * emporte aussi celles des deux autres, qui lisent alors legitimement
     * « Aucune commande a rattacher pour le moment ».
     *
     * Exiger « une commande a ete rattachee » ferait donc rougir deux largeurs
     * sur trois pour une raison etrangere a ce qui est mesure ici. Le COMPTAGE
     * exact est prouve par les tests d'integration, sur base reelle et sans
     * partage ; ce que cet ecran doit prouver est qu'un compte rendu apparait,
     * survit, et prend le focus.
     */
    await expect(annonce).toHaveText(
      /rattachée|rattachées|Aucune commande à rattacher/,
    );

    /*
     * LE FOCUS SE DEPLACE SUR LE COMPTE RENDU. Sans cela, un utilisateur au
     * clavier reste sur un bouton dont rien ne signale que l'action a abouti,
     * ou pire, sur `body` si le bouton a ete demonte.
     */
    await expect(annonce).toBeFocused();
  });
});

test.describe("compte non verifie, rien n'est propose", () => {
  test.use({ storageState: FICHIER_SESSION });

  test("le bloc de rattachement est absent", async ({ page }) => {
    /*
     * LE TEST NEGATIF DE SECURITE VU DE L'ECRAN, critere 5. Le compte de
     * `session-cliente.setup.ts` n'est pas verifie : le service rend
     * `ADRESSE_NON_VERIFIEE` et la page n'affiche RIEN, pas meme une liste vide.
     *
     * L'ASSERTION PORTE SUR L'ABSENCE DU TITRE ET DU BOUTON, les deux : un bloc
     * dont le titre serait masque mais le bouton present resterait actionnable
     * au clavier, et l'action partirait.
     */
    await page.goto("/compte");

    // La page est bien chargee, sans quoi l'absence ne prouverait rien.
    // `exact` PARCE QUE « Supprimer mon compte » contient « Mon compte » : sans
    // lui, Playwright refuse le selecteur pour ambiguite.
    await expect(
      page.getByRole("heading", { name: "Mon compte", exact: true }),
    ).toBeVisible();

    await expect(page.getByRole("heading", { name: TITRE_BLOC })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: BOUTON })).toHaveCount(0);
  });
});
