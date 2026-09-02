/**
 * Le carnet d'adresses, aux trois largeurs. LS-59, critere 6, parcours 8.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent les gardes et l'ordre des ecritures sur base reelle, sept
 * mutations a l'appui ; ils ne disent rien de ce que la personne VOIT ni de ce
 * qu'elle peut ATTEINDRE.
 *
 * LA NAVIGATION SE FAIT AU CLIC, jamais par `goto` pour le premier acces : un
 * ecran qu'aucun lien ne designe est inatteignable, defaut rencontre deux fois
 * sur ce depot.
 *
 * CHAQUE LARGEUR TRAVAILLE SUR SON PROPRE LIBELLE. Les trois projets partagent
 * le compte, ouvert une fois par le projet `preparation` pour ne pas saturer le
 * plafond d'inscription, ET la base : sans ce marquage, la suppression d'une
 * largeur emporterait l'adresse qu'une autre vient de creer.
 */
import "dotenv/config";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

import {
  FICHIER_EMAIL_VERIFIE,
  FICHIER_SESSION_VERIFIEE,
} from "./chemin-session";
import { readFileSync } from "node:fs";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

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

/*
 * SERIE, ET C'EST UNE CONDITION DE CORRECTION : les trois largeurs partagent le
 * compte ET la base, et chaque test remet le carnet a zero. En parallele, le
 * nettoyage de l'une emporterait les adresses qu'une autre vient de creer.
 */
test.describe.configure({ mode: "serial" });

test.use({ storageState: FICHIER_SESSION_VERIFIEE });

/** Le libelle propre a cette largeur, voir l'entete. */
let marque: string;

/**
 * Le formulaire d'AJOUT, distinct de celui d'edition.
 *
 * LES DEUX COEXISTENT des qu'une carte passe en edition, et leurs champs
 * portent des `id` prefixes pour cette raison. Un `page.getByLabel` nu serait
 * ambigu, et Playwright refuserait le selecteur en mode strict.
 *
 * `getByRole("form")` NE MARCHE PAS : un `<form>` n'expose ce role QUE s'il
 * porte un nom accessible, `aria-label` ou `aria-labelledby`. Mesure a la
 * sonde, `getByRole("form")` rend 0 sur cette page. Le formulaire est donc
 * designe par la section qui le contient.
 */
function formulaireAjout(page: import("@playwright/test").Page) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: "Ajouter cette adresse" }),
  });
}

test.beforeEach(async ({}, infos) => {
  marque = `TEST-59-${infos.project.name}`;

  const { email } = JSON.parse(
    readFileSync(FICHIER_EMAIL_VERIFIE, "utf-8"),
  ) as {
    email: string;
  };

  /*
   * LE CARNET DE CETTE LARGEUR EST RECREE, jamais conserve ni simplement vide.
   *
   * LA PREMIERE VERSION SE CONTENTAIT DE SUPPRIMER, et les tests de debordement
   * comme d'`axe-core` mesuraient donc un ECRAN VIDE : ni carte, ni les trois
   * boutons de gestes, ni la ligne de confirmation, ni une adresse longue. Le
   * critere 6 demande un rendu verifie a 320 px, et rien de ce qui peut
   * deborder n'etait rendu. Motif du controle qui n'a jamais echoue sur le
   * defaut qu'il pretend attraper, releve par la revue frontend.
   *
   * DEUX ADRESSES, ET LA PREMIERE EST DURE : un libelle de 44 caracteres SANS
   * espace, une ligne1 longue, une `ligne2`. Le schema autorise 60 et 120
   * caracteres, et une valeur courte ne peut faire deborder aucun ecran.
   *
   * AUCUNE N'EST PAR DEFAUT au depart : c'est l'etat qui permet au test de
   * bascule d'exercer la pose, et A7 en fait un etat legitime.
   */
  await avecBase(async (client) => {
    /*
     * SEULES LES ADRESSES DE CETTE LARGEUR PARTENT, jamais tout le carnet.
     *
     * DEUX MESURES ONT CONDUIT ICI. Un nettoyage par libelle exact laissait
     * quatorze cartes s'accumuler, chaque execution ajoutant les siennes : les
     * selecteurs devenaient ambigus et le test de debordement mesurait un ecran
     * qu'aucun client ne verra. Un nettoyage TOTAL, lui, faisait se marcher
     * dessus les trois largeurs, qui tournent EN PARALLELE sur le meme compte :
     * l'une vidait le carnet pendant qu'une autre venait d'y lire des
     * identifiants, et le service repondait « cette adresse n'existe plus ».
     *
     * `describe.serial` N'Y SUFFIT PAS : il ordonne les tests d'un MEME projet,
     * jamais les projets entre eux. Le prefixe de largeur est ce qui les isole.
     */
    await client.query(
      `DELETE FROM adresse_carnet
       WHERE libelle LIKE $1
         AND utilisateur_id = (SELECT id FROM utilisateur WHERE email = $2)`,
      [`${marque}%`, email],
    );

    await client.query(
      `INSERT INTO adresse_carnet (id, utilisateur_id, libelle, nom_complet,
                                   ligne1, ligne2, code_postal, ville, pays,
                                   est_par_defaut)
       SELECT gen_random_uuid()::text, u.id, $1,
              'Marie-Christine de la Tour du Pin',
              '127 avenue des Pyrenees-Atlantiques',
              'Residence les Glycines, batiment C, appartement 42',
              '64000', 'Pau', 'FR', false
       FROM utilisateur u WHERE u.email = $2`,
      [`${marque}-ResidenceLesGlycinesBatimentCAppartement42`, email],
    );

    await client.query(
      `INSERT INTO adresse_carnet (id, utilisateur_id, libelle, nom_complet,
                                   ligne1, code_postal, ville, pays, est_par_defaut)
       SELECT gen_random_uuid()::text, u.id, $1, 'Client de test',
              '2 place Royale', '64000', 'Pau', 'FR', false
       FROM utilisateur u WHERE u.email = $2`,
      [`${marque}-Bureau`, email],
    );
  });
});

test("le carnet s'atteint au clic depuis le compte", async ({ page }) => {
  /*
   * AU CLIC ET NON PAR `goto` : sans ce lien, l'ecran n'existerait que pour qui
   * saisit l'URL, defaut exact de LS-162 et de `/compte/verification`.
   */
  await page.goto("/compte");

  await page.getByRole("link", { name: "Gérer mes adresses" }).click();

  await expect(
    page.getByRole("heading", { name: "Mon carnet d'adresses" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ajouter une adresse" }),
  ).toBeVisible();
});

test("ajouter une adresse la fait apparaitre dans le carnet", async ({
  page,
}) => {
  await page.goto("/compte/adresses");

  await formulaireAjout(page)
    .getByLabel("Libellé (facultatif)")
    .fill(`${marque}-Ajout`);
  await formulaireAjout(page)
    .getByLabel("Nom du destinataire")
    .fill("Client de test");
  await formulaireAjout(page)
    .getByLabel("Adresse", { exact: true })
    .fill("1 rue du Test");
  await formulaireAjout(page).getByLabel("Code postal").fill("64000");
  await formulaireAjout(page).getByLabel("Ville").fill("Pau");

  await page.getByRole("button", { name: "Ajouter cette adresse" }).click();

  /*
   * L'ANNONCE EST CHERCHEE PAR SON NOM ACCESSIBLE, deux regions `status`
   * coexistant sur cet ecran : celle du formulaire et celle de la liste.
   */
  await expect(
    page.getByRole("status", { name: "Enregistrement de l'adresse" }),
  ).toHaveText(/ajoutée/);

  await expect(page.getByText(`${marque}-Ajout`)).toBeVisible();
});

test("une saisie invalide est refusee sans quitter l'ecran", async ({
  page,
}) => {
  /*
   * `97400` EST UN CODE D'OUTRE-MER, refuse par decision de perimetre : le
   * tarif Mondial Relay d'ADR-025 ne le couvre pas. Le test emploie donc une
   * valeur que la regle refuse REELLEMENT, et non une valeur inventee.
   *
   * `novalidate` N'EST PAS POSE : le navigateur ne bloque rien ici, le format
   * du code postal n'etant contraint par aucun `pattern`. C'est bien le serveur
   * qui refuse, invariant 7.
   */
  await page.goto("/compte/adresses");

  await formulaireAjout(page)
    .getByLabel("Libellé (facultatif)")
    .fill(`${marque}-Ajout`);
  await formulaireAjout(page)
    .getByLabel("Nom du destinataire")
    .fill("Client de test");
  await formulaireAjout(page)
    .getByLabel("Adresse", { exact: true })
    .fill("1 rue du Test");
  await formulaireAjout(page).getByLabel("Code postal").fill("97400");
  await formulaireAjout(page).getByLabel("Ville").fill("Saint-Denis");

  await page.getByRole("button", { name: "Ajouter cette adresse" }).click();

  const annonce = page.getByRole("status", {
    name: "Enregistrement de l'adresse",
  });
  await expect(annonce).toHaveText(/codePostal|code postal/i);

  // LE FOCUS SE DEPLACE SUR LE COMPTE RENDU : sans cela, un utilisateur au
  // clavier ne saurait pas que sa saisie a ete refusee.
  await expect(annonce).toBeFocused();
});

test("definir une adresse par defaut la marque a l'ecran", async ({ page }) => {
  /*
   * ETAPE 3 DU PARCOURS 8, non couverte par la premiere version de ce fichier.
   * Les tests d'integration exercent l'ordre des ecritures ; celui-ci verifie
   * que le repere se DEPLACE a l'ecran, ce qu'aucun d'eux ne dit.
   */
  await page.goto("/compte/adresses");

  const carteBureau = page.getByRole("listitem").filter({
    hasText: `${marque}-Bureau`,
  });

  await carteBureau
    .getByRole("button", { name: /Définir .* comme adresse par défaut/ })
    .click();

  await expect(
    page.getByRole("status", { name: "Gestion du carnet d'adresses" }),
  ).toHaveText(/par défaut modifiée/);

  await expect(carteBureau.getByText("Adresse par défaut")).toBeVisible();
});

test("modifier une adresse annonce le succes sans perdre le focus", async ({
  page,
}) => {
  /*
   * ETAPE 4, ET LE DEFAUT QU'ELLE A REVELE. La premiere version posait le
   * message dans le formulaire d'edition PUIS le demontait : le texte n'etait
   * jamais rendu et le focus retombait sur `body`. C'est le motif « focus sur
   * element detache », deja en fiche depuis LS-101.
   *
   * Le message atterrit desormais dans la region live de la LISTE, qui survit a
   * la fermeture de l'edition.
   */
  await page.goto("/compte/adresses");

  const carteBureau = page.getByRole("listitem").filter({
    hasText: `${marque}-Bureau`,
  });

  await carteBureau.getByRole("button", { name: /Modifier/ }).click();

  const champVille = carteBureau.getByLabel("Ville");
  await expect(champVille).toBeVisible();
  await champVille.fill("Bayonne");

  await carteBureau
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();

  const annonce = page.getByRole("status", {
    name: "Gestion du carnet d'adresses",
  });
  await expect(annonce).toHaveText(/modifiée/);
  await expect(annonce).toBeFocused();

  /*
   * L'ASSERTION VISE LA CARTE DE CETTE LARGEUR, jamais la page entiere : les
   * trois largeurs partagent le compte et modifient chacune la leur, donc
   * « Bayonne » apparait trois fois et Playwright refuse le selecteur en mode
   * strict. Le carnet, lui, est bien a jour.
   */
  await expect(carteBureau.getByText("64000 Bayonne")).toBeVisible();
});

test("la suppression demande une confirmation avant d'agir", async ({
  page,
}) => {
  /*
   * ETAPE 5. LA CONFIRMATION DEMANDE UN GESTE DIFFERENT, jamais un second clic
   * au meme endroit : le test verifie que le premier clic n'a RIEN supprime,
   * sans quoi un double clic accidentel emporterait l'adresse.
   */
  await page.goto("/compte/adresses");

  const carteBureau = page.getByRole("listitem").filter({
    hasText: `${marque}-Bureau`,
  });

  await carteBureau.getByRole("button", { name: /^Supprimer / }).click();

  // RIEN N'EST SUPPRIME AU PREMIER CLIC.
  await expect(carteBureau).toBeVisible();
  await expect(
    carteBureau.getByText("Supprimer définitivement ?"),
  ).toBeVisible();

  await carteBureau
    .getByRole("button", { name: /Confirmer la suppression/ })
    .click();

  await expect(
    page.getByRole("status", { name: "Gestion du carnet d'adresses" }),
  ).toHaveText(/supprimée/);

  await expect(page.getByText(`${marque}-Bureau`)).toHaveCount(0);
});

test("le carnet ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/compte/adresses");
  await expect(
    page.getByRole("heading", { name: "Mon carnet d'adresses" }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation axe-core sur le carnet", async ({ page }) => {
  await page.goto("/compte/adresses");
  await expect(
    page.getByRole("heading", { name: "Mon carnet d'adresses" }),
  ).toBeVisible();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

test.describe("visiteur sans session", () => {
  /*
   * `storageState: undefined` ANNULE CELUI DU FICHIER, et c'est indispensable :
   * le `test.use` de tete s'applique a tout ce qui suit, y compris a un
   * `browser.newContext()` cree a la main. Ma premiere version creait un
   * contexte neuf en croyant l'isoler, et il heritait de la session : la page
   * s'affichait normalement et le test rougissait sur un comportement CORRECT.
   */
  test.use({ storageState: undefined });

  test("est renvoye vers la connexion", async ({ page }) => {
    await page.goto("/compte/adresses");

    /*
     * VERS LA CONNEXION CLIENT ET NON CELLE DE L'ADMINISTRATION : c'est
     * l'incoherence du 13 aout, corrigee par LS-54. Verifier seulement
     * l'absence du carnet laisserait passer une redirection vers le mauvais
     * ecran.
     */
    await expect(page).toHaveURL(/\/compte\/connexion/);
  });
});
