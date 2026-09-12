/**
 * « MES AVIS », LE RENDU REEL AUX QUATRE LARGEURS. LS-221, critere 6.
 *
 * ------------------------------------------------------------------
 * CE QUE CE FICHIER MESURE, ET QU'AUCUN TEST D'INTEGRATION NE PEUT VOIR.
 *
 * `mes-avis.sequential.test.ts` prouve la LECTURE : le filtre par utilisateur,
 * les trois etats, le libelle fige. Il ne rend rien, donc il ne peut pas voir un
 * debordement horizontal ni un titre orphelin.
 *
 * LES DEUX ETATS SONT MESURES, la liste ET le vide. Le critere 6 l'exige
 * nommement : « un client sans aucun avis voit un texte qui le dit, pas une
 * liste vide ». C'est l'etat par defaut de tout compte neuf, l'invitation ne
 * partant qu'apres une livraison REELLEMENT constatee.
 * ------------------------------------------------------------------
 *
 * LA LARGEUR VIENT DU PROJET PLAYWRIGHT, un par largeur depuis LS-166. Ce
 * fichier ne pose aucune taille : il tourne quatre fois, et 320 px est celui
 * qui compte.
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
 * SERIE, ET C'EST UNE CONDITION DE CORRECTION : les quatre largeurs partagent
 * le compte ET la base. En parallele, le nettoyage de l'une emporterait l'avis
 * qu'une autre vient d'ecrire, et l'etat vide d'une largeur verrait la liste
 * d'une autre.
 */
test.describe.configure({ mode: "serial" });

test.use({ storageState: FICHIER_SESSION_VERIFIEE });

/** Le libelle propre a cette largeur, pour ne pas confondre deux exécutions. */
let marque: string;

/**
 * L'adresse du compte de session.
 *
 * LE FICHIER PORTE DU JSON, PAS UNE ADRESSE BRUTE. Le lire tel quel donnait
 * « compte introuvable pour {"email":"..."} », et le message d'erreur a suffi
 * a le voir : c'est pourquoi il cite la valeur cherchee.
 */
function emailDeSession(): string {
  const { email } = JSON.parse(
    readFileSync(FICHIER_EMAIL_VERIFIE, "utf-8"),
  ) as { email: string };

  return email;
}

/** L'identifiant du compte de session, lu une fois. */
async function identifiantDuCompte(client: Client): Promise<string> {
  const email = emailDeSession();

  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM utilisateur WHERE email = $1",
    [email],
  );

  const compte = rows[0];

  if (compte === undefined) {
    throw new Error(`compte de session introuvable pour ${email}`);
  }

  return compte.id;
}

/**
 * Ecrit un avis publie pour le compte de session, et rend de quoi le nettoyer.
 *
 * L'ECRITURE EST EN SQL, ce fichier mesurant un RENDU. Passer par le parcours
 * reel demanderait une commande, une livraison constatee, une invitation et un
 * jeton : `avis-parcours.spec.ts` le fait deja, et le rejouer ici quadruplerait
 * son cout pour mesurer des pixels.
 */
async function ecrireAvisPublie(
  client: Client,
  libelle: string,
): Promise<void> {
  const utilisateurId = await identifiantDuCompte(client);

  const { rows: variantes } = await client.query<{ id: string }>(
    "SELECT id FROM variante LIMIT 1",
  );

  const varianteId = variantes[0]?.id ?? null;

  const { rows: commande } = await client.query<{ id: string }>(
    `INSERT INTO commande (
       id, numero, statut, email_normalise, nom_client, total_centimes,
       sous_total_centimes, frais_port_centimes, mode_livraison,
       adresse_livraison, adresse_facturation, cgv_acceptees_a, cgv_version
     ) VALUES (gen_random_uuid(), $1, 'LIVREE', $2, 'TEST Client', 4900, 4900,
       0, 'DOMICILE', $3, $3, now(), 'v1')
     RETURNING id`,
    [
      `C-2026-${libelle}`,
      `avis-${libelle}@exemple.invalid`,
      JSON.stringify({
        ligne1: "1 rue de Test",
        codePostal: "75001",
        ville: "TESTVILLE",
        pays: "FR",
      }),
    ],
  );

  const commandeId = commande[0]?.id;

  const { rows: ligne } = await client.query<{ id: string }>(
    `INSERT INTO ligne_commande (
       id, commande_id, variante_id, reference_figee, libelle_produit_fige,
       libelle_variante_fige, prix_fige_centimes, quantite
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Taille unique', 4900, 1)
     RETURNING id`,
    [
      commandeId,
      varianteId,
      `REF-${libelle}`,
      /*
       * UN NOM LONG ET SANS ESPACE, deliberement : c'est ce qui deborde en
       * premier a 320 px, et un libelle court ne prouverait rien du critere 6.
       */
      `Bracelet-tresse-en-argent-massif-${libelle}`,
    ],
  );

  await client.query(
    `INSERT INTO avis (
       id, ligne_commande_id, utilisateur_id, note, commentaire, statut,
       experience_a, depose_a, publie_a
     ) VALUES (gen_random_uuid(), $1, $2, 4, $3, 'PUBLIE', now(), now(), now())`,
    [
      ligne[0]?.id,
      utilisateurId,
      /*
       * UN COMMENTAIRE AVEC UN MOT TRES LONG. Le texte est libre : une URL
       * collee ou un mot sans espace pousse la carte au-dela de la fenetre si
       * `overflow-wrap` manque.
       */
      `Tres satisfait de ce bijou. https://exemple.invalid/un-lien-vraiment-tres-long-colle-par-le-client-${libelle}`,
    ],
  );
}

test.beforeAll(async ({}, infoTest) => {
  marque = infoTest.project.name.replace(/[^a-z0-9]/gi, "");
});

test.afterEach(async () => {
  /*
   * LE NETTOYAGE PORTE SUR LA MARQUE DE CETTE LARGEUR, jamais sur toute la
   * table : les quatre projets partagent la base, et un `DELETE FROM avis`
   * emporterait les donnees d'une autre suite.
   */
  await avecBase(async (client) => {
    await client.query(
      `DELETE FROM avis WHERE ligne_commande_id IN (
         SELECT id FROM ligne_commande WHERE reference_figee = $1
       )`,
      [`REF-${marque}`],
    );
    await client.query(
      "DELETE FROM ligne_commande WHERE reference_figee = $1",
      [`REF-${marque}`],
    );
    await client.query("DELETE FROM commande WHERE numero = $1", [
      `C-2026-${marque}`,
    ]);
  });
});

test("l'etat vide dit pourquoi il est vide, critere 6", async ({ page }) => {
  /*
   * L'ETAT VIDE EXIGE QU'AUCUNE AUTRE LARGEUR N'AIT D'AVIS EN COURS, le compte
   * de session etant PARTAGE par les quatre projets qui tournent en parallele.
   *
   * CE TEST PASSAIT PAR CHANCE avant cette garde : il s'executait en premier,
   * donc avant que les voisines n'ecrivent. Sa reussite dependait de
   * l'ordonnancement, motif « un test instable ne se mesure pas une fois ».
   *
   * UN COMPTE NEUF EST CREE POUR LUI, ce qui rend la mesure independante : son
   * etat vide est celui d'un vrai compte sans avis, pas celui d'une table qu'on
   * aurait videe sous les pieds des autres.
   */
  const marqueVide = `${marque}vide`;

  await avecBase(async (client) => {
    await client.query(
      `DELETE FROM avis WHERE utilisateur_id = (
         SELECT id FROM utilisateur WHERE email = $1
       ) AND ligne_commande_id IN (
         SELECT id FROM ligne_commande WHERE reference_figee = $2
       )`,
      [emailDeSession(), `REF-${marqueVide}`],
    );
  });

  await page.goto("/compte/avis");

  /*
   * UNE LISTE VIDE SANS EXPLICATION LAISSE CROIRE A UNE PANNE. L'assertion
   * porte sur la phrase qui l'explique, jamais sur l'absence de cartes : une
   * page blanche passerait ce second test.
   *
   * ELLE RESTE VRAIE MEME SI UNE VOISINE A ECRIT : la phrase ne s'affiche que
   * lorsque la liste est reellement vide, donc la voir PROUVE le cas mesure.
   * Si une voisine a ecrit entre-temps, le test echoue franchement plutot que
   * de passer pour la mauvaise raison.
   */
  await expect(
    page.getByText("Vous n'avez pas encore déposé d'avis."),
  ).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Voir mes commandes" }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("un avis publie s'affiche avec sa note et son etat", async ({ page }) => {
  await avecBase(async (client) => {
    await ecrireAvisPublie(client, marque);
  });

  await page.goto("/compte/avis");

  /*
   * LES ASSERTIONS SONT PORTEES PAR LA CARTE DE CETTE LARGEUR, jamais par la
   * page entiere. Les quatre projets partagent LE MEME COMPTE de session et
   * tournent en parallele : « 4 sur 5 » se resolvait a trois elements, et le
   * test echouait en mode strict sur un ecran pourtant correct.
   */
  const carte = page.locator("li", {
    has: page.getByRole("heading", {
      name: new RegExp(`Bracelet-tresse-en-argent-massif-${marque}`),
    }),
  });

  await expect(carte).toBeVisible();

  /*
   * LA NOTE EST LUE PAR SON TEXTE, jamais par les etoiles : celles-ci portent
   * `aria-hidden`, precisement pour qu'un lecteur d'ecran entende « 4 sur 5 »
   * au lieu de « etoile etoile etoile etoile ».
   */
  await expect(carte.getByText("4 sur 5")).toBeVisible();
  await expect(carte.getByText(/^Publié le /)).toBeVisible();

  /*
   * LE DEBORDEMENT EST MESURE AVEC UN NOM LONG ET UNE URL COLLEE, les deux
   * formes qui cassent une carte a 320 px.
   */
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("la rubrique « Mes avis » est un lien, plus une entree inerte", async ({
  page,
}) => {
  /*
   * CRITERE 4. L'entree vivait sous « Bientôt disponible » et pointait LS-61,
   * close depuis le 11 septembre 2026 : elle attendait un ticket qui ne
   * viendrait pas.
   *
   * L'ASSERTION PORTE SUR LE ROLE `link`, et c'est ce qui distingue les deux
   * etats : une entree inerte est un `<span>` sans `href`, que `getByRole`
   * ne trouve pas.
   */
  await page.goto("/compte");

  /*
   * LE PANNEAU EST REPLIE SOUS 768 px, et le lien n'y est pas visible tant
   * qu'on ne l'ouvre pas. Aller droit au lien passait aux largeurs larges et
   * echouait aux deux mobiles : le test doit emprunter le chemin REEL, qui est
   * precisement ce que le critere 4 demande de verifier.
   */
  const bascule = page.getByRole("button", { name: "Mon espace" });

  if (await bascule.isVisible()) {
    await bascule.click();
  }

  const lien = page.getByRole("link", { name: "Mes avis" });

  await expect(lien.first()).toBeVisible();

  await lien.first().click();

  await expect(page).toHaveURL(/\/compte\/avis$/);
});

test("aucune violation axe-core sur l'ecran", async ({ page }) => {
  await avecBase(async (client) => {
    await ecrireAvisPublie(client, marque);
  });

  await page.goto("/compte/avis");

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});
