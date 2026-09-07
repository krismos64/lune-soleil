/**
 * L'historique des commandes et l'acces aux documents, aux trois largeurs.
 * LS-57, critere 6.
 *
 * CE QUE CE FICHIER PROUVE ET QUE LES TESTS D'INTEGRATION NE PROUVENT PAS. Ces
 * derniers exercent les gardes sur base reelle, sept mutations a l'appui ; ils
 * ne disent rien de ce que la personne VOIT ni de ce qu'elle peut ATTEINDRE.
 *
 * LA NAVIGATION SE FAIT AU CLIC, jamais par `goto`, et c'est la lecon de
 * LS-162 puis de `/compte/verification` : un ecran qu'aucun lien ne designe est
 * inatteignable, et un test qui y arrive par son URL ne peut pas le voir.
 *
 * LE TEST NEGATIF DE SECURITE EST ICI AUSSI, sous sa forme d'ecran : la
 * commande d'un tiers rend 404 et non 403, un 403 revelant son existence.
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

test.use({ storageState: FICHIER_SESSION_VERIFIEE });

/**
 * La commande de ce fichier porte le nom du PROJET, et sans cela les trois
 * largeurs se marchent dessus : elles partagent le meme compte, ouvert une
 * fois par le projet `preparation` pour ne pas saturer le plafond
 * d'inscription, ET la meme base. Piege deja en fiche sur ce depot.
 */
let numero: string;

/**
 * La commande qui rend le panneau « Documents et actions » ENTIER, LS-190.
 *
 * ELLE EXISTE PARCE QUE `numero` NE LE PEUT PAS. La commande principale de ce
 * fichier n'ecrit pas `statut`, donc elle prend le defaut du schema,
 * `EN_ATTENTE_PAIEMENT`. Or `STATUTS_RETRACTABLES` exclut nommement cette
 * valeur : sur elle, le panneau ne rend QUE son groupe de contact et son etat
 * « facture a venir ».
 *
 * Consequence relevee par la revue frontend de LS-190 : le selecteur
 * `.groupeActions + .groupeActions` n'etait exerce par AUCUN test, aux trois
 * largeurs comprises. Le separateur entre groupes n'avait jamais ete rendu.
 *
 * C'est le motif que `chemin-session.ts` documente deja pour
 * `COMMANDE_FACTUREE_TEST` : mesurer un ecran qui ne rend jamais la branche
 * interessante ne prouve rien.
 */
let numeroComplet: string;

test.beforeEach(async ({}, infos) => {
  const { email } = JSON.parse(
    readFileSync(FICHIER_EMAIL_VERIFIE, "utf-8"),
  ) as { email: string };

  numero = `C-TEST-57-${infos.project.name}`;
  numeroComplet = `C-TEST-190-${infos.project.name}`;

  await avecBase(async (client) => {
    /*
     * LA COMMANDE EST RECREEE A CHAQUE EXECUTION, jamais conservee.
     *
     * `ON CONFLICT DO NOTHING` seul ne suffisait pas : une fixture DURCIE ne
     * remplaçait jamais l'ancienne, restee en base depuis l'execution
     * precedente, et onze tests rougissaient en cherchant des valeurs que la
     * ligne conservee ne portait pas. La cause designee, un rendu fautif,
     * n'etait pas la vraie.
     *
     * LES LIGNES PARTENT AVANT LA COMMANDE, `ligne_commande` etant en
     * `RESTRICT` : l'ordre inverse leve une violation de cle etrangere.
     */
    await client.query(
      `DELETE FROM ligne_commande WHERE commande_id IN (
         SELECT id FROM commande WHERE numero = $1)`,
      [numero],
    );
    await client.query(`DELETE FROM commande WHERE numero = $1`, [numero]);

    /*
     * LA COMMANDE EST RATTACHEE DES SA CREATION, `utilisateur_id` renseigne :
     * ce fichier mesure l'HISTORIQUE, pas le rattachement, qui a son propre
     * fichier. Une commande invitee n'apparaitrait pas ici, et le test
     * rougirait sur un comportement correct.
     *
     * `ON CONFLICT` SUR LE NUMERO, unique : la relance suivante reutilise la
     * ligne plutot que d'echouer, meme motif que `commande.setup.ts`.
     */
    /*
     * LA FIXTURE EST VOLONTAIREMENT DURE, ET C'EST CE QUI FAIT LA VALEUR DU
     * TEST DE DEBORDEMENT. La premiere version portait « Client verifie »,
     * « 1 rue du Test » et 49,99 € : un test qui mesure le debordement sur des
     * valeurs courtes ne peut pas voir le defaut qu'il pretend attraper, motif
     * du controle qui n'a jamais echoue. Releve par la revue frontend.
     *
     * Trois durcissements, chacun visant une colonne differente a 320 px :
     *
     *   nom de produit  quarante caracteres SANS espace, le seul cas qu'aucun
     *                   `overflow-wrap` par defaut ne casse
     *   montants        trois chiffres avant la virgule, 1 234,56 €
     *   adresse         une `ligne2`, un nom long, un pays ecrit en toutes
     *                   lettres
     */
    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             dissocie_a, adresse_livraison, adresse_facturation,
                             sous_total_centimes, mode_livraison, frais_port_centimes,
                             total_centimes, cgv_acceptees_a, cgv_version, cree_a)
       SELECT gen_random_uuid()::text, $1, u.email,
              'Marie-Christine de la Tour du Pin', u.id, NULL,
              '{"nom": "Marie-Christine de la Tour du Pin",
                "ligne1": "127 avenue des Pyrenees-Atlantiques",
                "ligne2": "Residence les Glycines, batiment C, appartement 42",
                "codePostal": "64000", "ville": "Pau", "pays": "France"}'::jsonb,
              '{}'::jsonb, 123456, 'DOMICILE', 700, 124156, now(), 'v1', now()
       FROM utilisateur u WHERE u.email = $2
`,
      [numero, email],
    );

    /*
     * UNE LIGNE AU LIBELLE LONG SANS ESPACE. `varianteId` reste nul, la
     * colonne etant nullable pour que la ligne survive a sa variante : ce
     * fichier mesure un RENDU, il n'a pas besoin d'un produit au catalogue.
     */
    await client.query(
      `INSERT INTO ligne_commande (id, commande_id, variante_id, reference_figee,
                                   libelle_produit_fige, libelle_variante_fige,
                                   prix_fige_centimes, quantite)
       SELECT gen_random_uuid()::text, c.id, NULL, 'REF-TEST-0057',
              'CollierAurorePendentifLapisLazuliDoreAlOrFin',
              'chaine de 45 centimetres, fermoir mousqueton',
              123456, 1
       FROM commande c WHERE c.numero = $1
`,
      [numero],
    );

    /*
     * LA SECONDE COMMANDE, QUI REND LE PANNEAU ENTIER, LS-190.
     *
     * `LIVREE` SUFFIT, ET `livre_a` N'EST PAS ECRIT ICI. Ma premiere version le
     * posait sur `commande` : la colonne n'existe pas, elle vit sur
     * `Expedition`, V11. L'INSERT levait « column livre_a does not exist ».
     *
     * Elle etait de toute facon inutile : `commandePeutOuvrirUneRetractation`
     * ne regarde QUE le statut, et c'est la page cible qui explique ensuite le
     * delai. Verifier ce que la garde lit vaut mieux que deduire ce qu'elle
     * devrait lire.
     *
     * L'ORDRE DE SUPPRESSION SUIT CELUI DE LA COMMANDE PRINCIPALE, avec la
     * facture en plus : elle est en `RESTRICT` sur la commande, donc elle part
     * AVANT elle, et les lignes avant tout le reste.
     */
    await client.query(
      `DELETE FROM facture WHERE commande_id IN (
         SELECT id FROM commande WHERE numero = $1)`,
      [numeroComplet],
    );
    await client.query(
      `DELETE FROM ligne_commande WHERE commande_id IN (
         SELECT id FROM commande WHERE numero = $1)`,
      [numeroComplet],
    );
    await client.query(`DELETE FROM commande WHERE numero = $1`, [
      numeroComplet,
    ]);

    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             dissocie_a, adresse_livraison, adresse_facturation,
                             sous_total_centimes, mode_livraison, frais_port_centimes,
                             total_centimes, cgv_acceptees_a, cgv_version, cree_a,
                             statut)
       SELECT gen_random_uuid()::text, $1, u.email, 'Client de test', u.id, NULL,
              '{"nom": "Client de test", "ligne1": "1 rue du Test",
                "codePostal": "64000", "ville": "Pau", "pays": "France"}'::jsonb,
              '{}'::jsonb, 4500, 'DOMICILE', 499, 4999, now(), 'v1', now(),
              'LIVREE'
       FROM utilisateur u WHERE u.email = $2
`,
      [numeroComplet, email],
    );

    await client.query(
      `INSERT INTO ligne_commande (id, commande_id, variante_id, reference_figee,
                                   libelle_produit_fige, libelle_variante_fige,
                                   prix_fige_centimes, quantite)
       SELECT gen_random_uuid()::text, c.id, NULL, 'REF-TEST-0190',
              'Collier Aurore', 'chaine de 45 cm', 4500, 1
       FROM commande c WHERE c.numero = $1
`,
      [numeroComplet],
    );

    /*
     * LA FACTURE PORTE UN `chemin_pdf`, donc le groupe 1 rend son LIEN de
     * telechargement et non sa branche « document indisponible ». Le fichier
     * n'existe pas sur le disque, et c'est sans importance : ce test mesure le
     * RENDU du panneau, jamais le service du PDF, qui a ses propres tests.
     */
    await client.query(
      `INSERT INTO facture (id, commande_id, numero, montant_total_centimes,
                            instantane_legal, chemin_pdf)
       SELECT gen_random_uuid()::text, c.id, $2, 4999, '{}'::jsonb,
              'factures/2026/test-ls190.pdf'
       FROM commande c WHERE c.numero = $1
`,
      [numeroComplet, `F-TEST-190-${numeroComplet.slice(-9)}`],
    );
  });
});

test("l'historique s'atteint au clic depuis le compte", async ({ page }) => {
  /*
   * AU CLIC ET NON PAR `goto`. Sans ce lien, `/compte/commandes` serait
   * inatteignable autrement qu'en saisissant l'URL, defaut exact de LS-162 et
   * de `/compte/verification`. Un test qui y arrive par son URL ne peut pas
   * voir ce defaut.
   */
  await page.goto("/compte");

  await page.getByRole("link", { name: "Voir mes commandes" }).click();

  await expect(
    page.getByRole("heading", { name: "Mes commandes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Commande ${numero}` }),
  ).toBeVisible();
});

test("le detail s'atteint au clic et affiche les montants figes", async ({
  page,
}) => {
  await page.goto("/compte/commandes");

  await page.getByRole("link", { name: `Commande ${numero}` }).click();

  await expect(
    page.getByRole("heading", { name: `Commande ${numero}` }),
  ).toBeVisible();

  /*
   * LES MONTANTS VIENNENT DES COLONNES FIGEES, invariant 3 : 123456 + 700 =
   * 124156. Trois chiffres avant la virgule, ce qui exerce la colonne de
   * montants a 320 px.
   *
   * L'ESPACE EST INSECABLE dans la sortie de `Intl.NumberFormat`, motif deja en
   * fiche : `getByText` avec une chaine portant un espace ordinaire ne
   * trouverait rien. Le motif souple evite d'ecrire le caractere en dur.
   */
  /*
   * `.first()` PARCE QUE LE SOUS-TOTAL APPARAIT DEUX FOIS, dans la ligne
   * d'article et dans le recapitulatif : la commande ne porte qu'un exemplaire.
   * C'est le rendu attendu, et un selecteur strict le refusait pour ambiguite.
   */
  await expect(page.getByText(/1\s?234,56/).first()).toBeVisible();
  await expect(page.getByText(/1\s?241,56/)).toBeVisible();

  // L'ADRESSE FIGEE EST CELLE DU JOUR DE LA COMMANDE, jamais le carnet actuel,
  // et sa `ligne2` doit apparaitre.
  await expect(page.getByText("127 avenue des Pyrenees")).toBeVisible();
  await expect(page.getByText(/Residence les Glycines/)).toBeVisible();
});

test("aucune facture n'est annoncee avant le paiement", async ({ page }) => {
  /*
   * TROIS ETATS DISTINCTS a l'ecran, et celui-ci est le premier : la commande
   * est `EN_ATTENTE_PAIEMENT`, aucune facture n'existe. Le dire explicitement
   * evite qu'un client croie a un oubli.
   */
  await page.goto("/compte/commandes");
  await page.getByRole("link", { name: `Commande ${numero}` }).click();

  await expect(
    page.getByText("La facture sera disponible ici une fois le paiement"),
  ).toBeVisible();
});

test("la commande d'un tiers rend 404 et non 403", async ({ page }) => {
  /*
   * TEST NEGATIF DE SECURITE, critere 4, vu de l'ecran. L'identifiant est
   * syntaxiquement valide et ne designe aucune commande de ce compte.
   *
   * 404 ET NON 403 : un 403 signifierait « cette commande existe mais vous n'y
   * avez pas droit », ce qui revele son existence. Le refus est indiscernable
   * d'une commande inexistante, invariant 2.
   */
  const reponse = await page.goto(
    "/compte/commandes/00000000-0000-4000-8000-000000000000",
  );

  expect(reponse?.status()).toBe(404);
});

test("la facture d'un tiers rend 404, jamais le fichier", async ({ page }) => {
  const reponse = await page.request.get(
    "/compte/commandes/00000000-0000-4000-8000-000000000000/facture",
  );

  expect(reponse.status()).toBe(404);
  // AUCUN PDF NE SORT : verifier le seul statut laisserait passer une reponse
  // 404 qui porterait malgre tout le document.
  expect(reponse.headers()["content-type"]).not.toContain("application/pdf");
});

test("l'historique ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/compte/commandes");
  await expect(
    page.getByRole("heading", { name: "Mes commandes", exact: true }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * LE PANNEAU « DOCUMENTS ET ACTIONS », LS-190.
 *
 * CE QU'IL PROUVE ET QU'AUCUN CONTROLE TEXTUEL NE PEUT PROUVER :
 * `verifier-contraste.sh` mesure les paires declarees dans le CSS, il ne dit
 * pas que le panneau RENDU porte bien ce fond. Un selecteur mal ecrit, une
 * regle plus specifique, un module CSS mal importe, et le panneau s'afficherait
 * transparent avec du texte noir sur creme : les jetons resteraient conformes
 * et le rendu serait faux.
 *
 * LE FOND EST LU SUR L'ELEMENT RENDU, en `rgb()` puisque c'est ce que
 * `getComputedStyle` rend, jamais le nom du jeton.
 *
 *   #5f4519 = rgb(95, 69, 25)   --ls-primary
 *   #ffffff = rgb(255, 255, 255) --ls-text-on-primary, 8,93:1 mesure
 *
 * LE CONTACT EST TOUJOURS PRESENT, sans condition : c'est le seul groupe qui ne
 * depend d'aucun etat, et il porte le numero de commande pour que le message
 * arrive rattache a la bonne commande.
 */
test("le panneau Documents et actions porte son fond mesure et le contact", async ({
  page,
}) => {
  await page.goto("/compte/commandes");
  await page.getByRole("link", { name: `Commande ${numero}` }).click();

  const panneau = page.getByRole("region", { name: "Documents et actions" });
  await expect(panneau).toBeVisible();

  const rendu = await panneau.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fond: s.backgroundColor, texte: s.color };
  });

  expect(rendu.fond, "le panneau doit porter --ls-primary").toBe(
    "rgb(95, 69, 25)",
  );
  expect(rendu.texte, "son texte doit etre --ls-text-on-primary").toBe(
    "rgb(255, 255, 255)",
  );

  /*
   * LE NUMERO EST DANS LE PANNEAU, et pas seulement dans le titre de page : un
   * client qui copie le message doit emporter la reference avec lui.
   */
  await expect(panneau).toContainText(numero);
  await expect(
    panneau.getByRole("link", { name: "Nous écrire" }),
  ).toBeVisible();
});

/**
 * LE PANNEAU ENTIER, SES TROIS GROUPES ET SON SEPARATEUR, LS-190.
 *
 * CE QUE CE TEST AJOUTE AU PRECEDENT, et pourquoi les deux existent : celui-ci
 * passe par la commande LIVREE ET FACTUREE, seule a rendre les trois groupes.
 * Le test voisin mesure le panneau MINIMAL, un seul groupe, qui est l'etat le
 * plus frequent avant paiement.
 *
 * SANS LUI, `.groupeActions + .groupeActions` N'ETAIT EXERCE PAR RIEN : le
 * separateur entre groupes n'avait jamais ete rendu, aux trois largeurs
 * comprises. Releve par la revue frontend de LS-190.
 *
 * LE DEBORDEMENT EST MESURE ICI AUSSI, et c'est le cas dur : trois groupes, un
 * numero de facture et un montant, la ou le panneau minimal ne porte qu'une
 * phrase d'attente.
 */
test("le panneau entier rend ses trois groupes et leur separateur", async ({
  page,
}) => {
  await page.goto("/compte/commandes");
  await page.getByRole("link", { name: `Commande ${numeroComplet}` }).click();

  const panneau = page.getByRole("region", { name: "Documents et actions" });
  await expect(panneau).toBeVisible();

  // Les trois groupes, chacun par ce qui le distingue.
  await expect(
    panneau.getByRole("link", { name: /Télécharger la facture/ }),
  ).toBeVisible();
  await expect(
    panneau.getByRole("link", { name: "Déclarer ma rétractation" }),
  ).toBeVisible();
  await expect(
    panneau.getByRole("link", { name: "Nous écrire" }),
  ).toBeVisible();

  /*
   * LE SEPARATEUR EST LU SUR LE DEUXIEME GROUPE, celui qui porte le
   * `border-top` : le premier ne l'a pas, la regle etant `+`. Un panneau qui
   * rendrait ses groupes sans les separer passerait les trois assertions
   * ci-dessus.
   */
  const separateurs = await panneau.evaluate((el) => {
    const groupes = [...el.querySelectorAll(":scope > div")];
    return groupes.map((g) => getComputedStyle(g).borderTopWidth);
  });

  expect(separateurs.length, "le panneau doit rendre trois groupes").toBe(3);
  expect(separateurs[0], "le premier groupe n'a pas de trait au-dessus").toBe(
    "0px",
  );
  expect(separateurs[1], "le deuxieme groupe porte le separateur").toBe("1px");
  expect(separateurs[2], "le troisieme aussi").toBe("1px");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("le detail ne deborde pas horizontalement", async ({ page }) => {
  await page.goto("/compte/commandes");
  await page.getByRole("link", { name: `Commande ${numero}` }).click();

  // DIAGNOSTIC LS-171 : quelle page est reellement mesuree ?
  await expect(
    page.getByRole("heading", { level: 1, name: `Commande ${numero}` }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation axe-core sur les deux ecrans", async ({ page }) => {
  await page.goto("/compte/commandes");
  await expect(
    page.getByRole("heading", { name: "Mes commandes", exact: true }),
  ).toBeVisible();

  const liste = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(liste.violations).toEqual([]);

  await page.getByRole("link", { name: `Commande ${numero}` }).click();
  await expect(
    page.getByRole("heading", { name: `Commande ${numero}` }),
  ).toBeVisible();

  const detail = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(detail.violations).toEqual([]);
});
