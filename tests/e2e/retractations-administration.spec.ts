/**
 * La rubrique Retractations de l'administration, LS-135. Parcours 5, etapes 6 a 9.
 *
 * CE QUE CE FICHIER PROUVE ET QUE `administration-connectee.spec.ts` NE PROUVE
 * PAS. Ce dernier mesure le debordement et l'accessibilite de l'ecran aux trois
 * largeurs, ce qui est necessaire et ne dit rien du COMPORTEMENT : il resterait
 * vert sur un ecran qui n'offrirait le remboursement qu'apres une preuve
 * d'expedition, c'est-a-dire sur l'infraction a l'article L221-24 que toute
 * cette story existe pour eviter.
 *
 * L'ASSERTION CENTRALE EST DONC QUE LES DEUX FAITS SONT OFFERTS EN PARALLELE.
 * La demande amorcee est `RETOUR_ATTENDU` avec son colis recu et AUCUNE preuve
 * d'expedition : le bouton « Rembourser » doit etre la. C'est le cas courant du
 * retour depose en point relais sans numero de suivi, et l'exiger bloquerait
 * indefiniment un droit qui est du.
 *
 * AUCUN REMBOURSEMENT N'EST DECLENCHE ICI, et c'est delibere : la suite de bout
 * en bout tourne sans cle Stripe, le paiement y etant *indisponible* plutot
 * qu'en panne. L'effet reel est prouve par les 23 tests d'integration, qui
 * exercent le service avec un fournisseur double.
 */
import { Client } from "pg";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  COMMANDE_FACTUREE_TEST,
  DEMANDE_RETRACTATION_TEST,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

/**
 * La carte de LA demande amorcee, jamais « la premiere de la liste ».
 *
 * CIBLER PAR NUMERO DE COMMANDE EST INDISPENSABLE ICI, et l'echec l'a montre :
 * la suite de LS-134 depose ses propres demandes, une par projet Playwright,
 * et un selecteur global en trouve quatre. Pire, il en trouverait un nombre
 * VARIABLE selon l'ordre d'execution, donc le test passerait ou non sans
 * qu'aucun code n'ait change.
 *
 * LA CARTE EST L'ELEMENT DE LISTE qui porte ce numero : tout ce que ces tests
 * cherchent est cherche DEDANS, ce qui les rend independants du contenu de la
 * base autour.
 */
function carteDemande(page: import("@playwright/test").Page) {
  return page
    .getByRole("listitem")
    .filter({ hasText: `Commande ${COMMANDE_FACTUREE_TEST.numero}` });
}

/**
 * LE TEST QUI PORTE L'OBLIGATION LEGALE.
 *
 * Un colis recu SANS preuve d'expedition ouvre le remboursement, article
 * L221-24 : « la date retenue etant celle du premier de ces faits ».
 */
test("un colis reçu sans preuve d'expédition ouvre le remboursement", async ({
  page,
}) => {
  await page.goto("/administration/retractations");

  await expect(
    page.getByRole("heading", { name: "Rétractations", level: 1 }),
  ).toBeVisible();

  /*
   * L'ETAT DE DEPART EST VERIFIE PLUTOT QUE SUPPOSE. Sans cette assertion, un
   * changement d'amorce ferait passer le test pour la mauvaise raison : sur une
   * demande deja remboursee, le bouton serait absent et l'assertion suivante
   * echouerait sans dire pourquoi.
   */
  const carte = carteDemande(page);

  await expect(carte).toHaveCount(1);
  await expect(carte.getByText("Preuve d'expédition")).toBeVisible();
  await expect(carte.getByText("Non fournie")).toBeVisible();

  /*
   * L'ASSERTION CENTRALE : le remboursement est offert alors qu'AUCUNE preuve
   * n'a ete fournie. Un ecran qui exigerait `EXPEDITION_PROUVEE` ferait rougir
   * cette ligne, et c'est exactement le defaut a empecher.
   */
  await expect(carte.getByRole("button", { name: "Rembourser" })).toBeEnabled();

  /*
   * LE MONTANT EST PRE-REMPLI, arbitrage du 3 septembre 2026, et il porte les
   * FRAIS DE PORT : le champ est modifiable pour une reduction sur piece
   * abimee, jamais vide.
   */
  const montant = carte.getByLabel("Montant à rembourser, en euros");
  await expect(montant).toBeVisible();
  await expect(montant).not.toHaveValue("");
});

/**
 * LES QUATRE GESTES COEXISTENT, ce qui prouve que l'ecran ne presente pas les
 * etapes 7a et 7b comme une sequence.
 */
test("les gestes de traitement sont tous atteignables", async ({ page }) => {
  await page.goto("/administration/retractations");

  const carte = carteDemande(page);

  await expect(
    carte.getByLabel("Numéro de suivi fourni par le client"),
  ).toBeVisible();

  await expect(
    carte.getByRole("button", { name: "Enregistrer la preuve" }),
  ).toBeVisible();

  await expect(carte.getByRole("button", { name: "Rembourser" })).toBeVisible();

  /*
   * LE REFUS EST REPLIE, jamais offert au meme rang que le remboursement : le
   * droit de retractation est INCONDITIONNEL, article L221-18, et un bouton
   * « Refuser » aussi visible que « Rembourser » suggererait un arbitrage qui
   * n'existe pas.
   */
  await carte.getByText("Refuser cette demande").click();

  await expect(carte.getByLabel("Motif du refus")).toBeVisible();
});

/**
 * LE REFUS SANS MOTIF EST BLOQUE A L'ECRAN, regle L2.
 *
 * LA GARDE QUI COMPTE EST DANS LE SERVICE, et les tests d'integration la
 * prouvent. Celle-ci evite un aller-retour inutile, et son absence rendrait le
 * bouton actif sur un formulaire vide.
 */
test("le refus reste fermé tant qu'aucun motif n'est saisi", async ({
  page,
}) => {
  await page.goto("/administration/retractations");

  const carte = carteDemande(page);

  await carte.getByText("Refuser cette demande").click();

  await expect(carte.getByRole("button", { name: "Refuser" })).toBeDisabled();

  await carte.getByLabel("Motif du refus").fill("TEST Motif de refus");

  await expect(carte.getByRole("button", { name: "Refuser" })).toBeEnabled();
});

/**
 * LE RENDU AUX TROIS LARGEURS, avec les champs de saisie DEPLOYES.
 *
 * LE REFUS EST OUVERT AVANT LA MESURE, et c'est ce qui la rend utile : replie,
 * son `textarea` n'est pas rendu, donc jamais mesure. Un `details` ferme cache
 * exactement ce qui deborde.
 */
test("l'écran ne déborde pas, formulaires déployés", async ({ page }) => {
  await page.goto("/administration/retractations");

  const carte = carteDemande(page);

  await carte.getByText("Refuser cette demande").click();
  await expect(carte.getByLabel("Motif du refus")).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * L'ACCESSIBILITE AVEC LES FORMULAIRES OUVERTS.
 *
 * `administration-connectee.spec.ts` passe deja `axe-core` sur cet ecran, mais
 * REPLIE : les champs du refus n'y sont pas dans le DOM, donc ni leur libelle
 * ni leur association ne sont analyses.
 */
test("aucune violation d'accessibilité, formulaires déployés", async ({
  page,
}) => {
  await page.goto("/administration/retractations");

  const carte = carteDemande(page);

  await carte.getByText("Refuser cette demande").click();
  await expect(carte.getByLabel("Motif du refus")).toBeVisible();

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});

/* ==========================================================================
 * LS-174, le numero d'avoir reste lisible apres rechargement.
 * ========================================================================== */

/**
 * Une demande REMBOURSEE portant son avoir, greffee par ce fichier seul.
 *
 * ELLE NE TOUCHE PAS LA DEMANDE PARTAGEE. `commande.setup.ts` amorce une
 * demande `RETOUR_ATTENDU` dont quatre tests ci-dessus dependent : la faire
 * passer en `REMBOURSEE` retirerait les gestes qu'ils mesurent. Ce fichier
 * greffe donc la sienne et la retire, motif de `factures-administration`.
 *
 * LES IDENTIFIANTS SONT FIXES ET RESERVES, comme toutes les fixtures du depot :
 * une valeur engendree a l'execution accumulerait des lignes a chaque passage.
 * Le suffixe porte le numero de la story.
 */
const DEMANDE_AVEC_AVOIR = {
  demandeId: "e1a2b3c4-1174-4aaa-8888-000000000001",
  avoirId: "e1a2b3c4-1174-4bbb-8888-000000000002",
  numeroAvoir: "A-TEST-0174",
  montantCentimes: 2400,
} as const;

async function avecClient<T>(
  travail: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    return await travail(client);
  } finally {
    await client.end();
  }
}

/*
 * ------------------------------------------------------------------
 * LES TESTS DE LS-174 VIVENT DANS LEUR PROPRE `describe`, ET C'EST OBLIGATOIRE.
 *
 * Leur amorce fait passer la demande partagee en `REMBOURSEE` pour lui attacher
 * un avoir. Un `beforeAll` de FICHIER l'appliquerait aussi aux cinq tests
 * ci-dessus, qui mesurent les gestes offerts sur une demande `RETOUR_ATTENDU` :
 * ils ne trouveraient plus ni bouton de remboursement ni formulaire de refus.
 *
 * Mesure du 7 septembre 2026 : cinq echecs sur cinq, dont trois au delai de
 * test faute de trouver un element qui n'existait plus.
 *
 * Playwright borne un `beforeAll` a son bloc, donc l'etat partage n'est modifie
 * que pendant ces quatre tests, et le `afterAll` le rend ensuite.
 * ------------------------------------------------------------------
 */
test.describe("le numéro d'avoir survit au rechargement, LS-174", () => {
  test.beforeAll(async () => {
    await avecClient(async (client) => {
      /*
       * UNE SEULE DEMANDE, ET C'EST LE SCHEMA QUI L'IMPOSE.
       * `DemandeRetractation.commandeId` est UNIQUE : une commande porte au plus
       * une demande. Le depot ne compte qu'UNE commande facturee de test, et en
       * amorcer une seconde dupliquerait cinquante lignes pour un seul champ.
       *
       * ELLE NE TOUCHE PAS LA DEMANDE PARTAGEE, qui vit sur cette meme commande :
       * celle-ci est `RETOUR_ATTENDU` et quatre tests ci-dessus en dependent. Ce
       * fichier REMPLACE donc temporairement son statut, et le `afterAll` le
       * remet. Motif de `factures-administration`, qui greffe et retire son avoir.
       */
      await client.query(
        `UPDATE demande_retractation
       SET statut = 'REMBOURSEE'::"StatutRetractation",
           montant_rembourse_centimes = $2
       WHERE id = $1`,
        [
          DEMANDE_RETRACTATION_TEST.demandeId,
          DEMANDE_AVEC_AVOIR.montantCentimes,
        ],
      );

      /*
       * L'INSTANTANE EST RECOPIE DE LA FACTURE, jamais reconstruit : un avoir
       * porte SON PROPRE instantane derive de celui de la facture, invariant 3, et
       * le schema qui le relit refuse une forme partielle.
       */
      await client.query(
        `INSERT INTO avoir (id, facture_id, demande_retractation_id, numero,
                          montant_centimes, motif, instantane_legal, chemin_pdf,
                          emis_a)
       SELECT $1, id, $2, $3, $4, 'TEST LS-174', instantane_legal,
              'factures/test-ls174.pdf', now()
       FROM facture WHERE id = $5
       ON CONFLICT (id) DO NOTHING`,
        [
          DEMANDE_AVEC_AVOIR.avoirId,
          DEMANDE_RETRACTATION_TEST.demandeId,
          DEMANDE_AVEC_AVOIR.numeroAvoir,
          DEMANDE_AVEC_AVOIR.montantCentimes,
          COMMANDE_FACTUREE_TEST.factureId,
        ],
      );
    });
  });

  test.afterAll(async () => {
    await avecClient(async (client) => {
      /*
       * L'AVOIR PART AVANT LE STATUT : la cle etrangere est en `SetNull`, donc
       * l'ordre inverse laisserait un avoir orphelin que l'ecran des factures
       * compterait.
       */
      await client.query(`DELETE FROM avoir WHERE id = $1`, [
        DEMANDE_AVEC_AVOIR.avoirId,
      ]);

      /*
       * LA DEMANDE PARTAGEE RETROUVE SON ETAT, `RETOUR_ATTENDU` avec son colis
       * recu : c'est celui dont les quatre tests ci-dessus dependent, et le
       * laisser `REMBOURSEE` les ferait echouer a l'execution suivante.
       */
      await client.query(
        `UPDATE demande_retractation
       SET statut = 'RETOUR_ATTENDU'::"StatutRetractation",
           montant_rembourse_centimes = NULL
       WHERE id = $1`,
        [DEMANDE_RETRACTATION_TEST.demandeId],
      );
    });
  });

  /**
   * CRITERE 2, ET C'EST LE DEFAUT QUE LA STORY FERME.
   *
   * Le numero d'avoir n'apparaissait que dans la region live suivant le
   * remboursement, et disparaissait au premier rechargement. Ce test charge la
   * page A FROID, sans avoir rien declenche : c'est exactement la situation de
   * l'exploitante qui revient sur l'ecran devant une reclamation.
   */
  test("le numéro d'avoir est lisible après rechargement, avec son lien", async ({
    page,
  }) => {
    await page.goto("/administration/retractations");

    const carte = carteDemande(page);

    /*
     * LE NOM EST CHERCHE PAR MOTIF, jamais par egalite : il porte la NATURE de
     * la cible en plus du numero, « Avoir A-TEST-0174, télécharger le PDF »,
     * WCAG 2.4.4. Une egalite stricte se casserait au premier ajustement de
     * cette mention sans qu'aucun defaut reel n'existe.
     */
    const lien = carte.getByRole("link", {
      name: new RegExp(`Avoir ${DEMANDE_AVEC_AVOIR.numeroAvoir}`),
    });

    await expect(lien).toBeVisible();

    /*
     * LA DESTINATION EST DANS LE NOM, assertion a part : sans elle, le motif
     * ci-dessus resterait vert si la mention disparaissait, et le lien
     * s'annoncerait a nouveau comme une simple reference comptable. « Avoir
     * A-2026-0001 » nomme un OBJET, pas une destination : qui liste les liens
     * de la page n'apprendrait pas qu'il telecharge un fichier. Meme choix que
     * `.telecharger` de l'ecran des factures, releve par `ls-frontend-revue`.
     */
    await expect(lien).toHaveAccessibleName(/télécharger le PDF/);

    /*
     * LA CIBLE EST LA ROUTE D'ADMINISTRATION, jamais celle de l'espace client :
     * cette derniere est gardee par une session CLIENTE et rendrait 404 ici.
     */
    await expect(lien).toHaveAttribute(
      "href",
      `/administration/factures/${DEMANDE_AVEC_AVOIR.avoirId}`,
    );

    /*
     * LA CIBLE TACTILE TIENT 44 px, `frontend-design.md`. Mesuree et non
     * supposee : `inline-flex` la rend reelle, `display: inline` la laisserait a
     * la hauteur de la ligne de texte, motif mesure en LS-190 ou des liens
     * faisaient 18 px.
     */
    const boite = await lien.boundingBox();
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  /**
   * CRITERE 2 SUR L'AUTRE BRANCHE, regle F8 : le PDF a echoue, le document existe.
   *
   * C'est le NUMERO qu'on cherche devant une reclamation, le fichier vient apres :
   * un ecran qui n'afficherait rien faute de PDF perdrait l'information meme que
   * la story rend lisible.
   *
   * IL BASCULE `chemin_pdf` PLUTOT QUE D'AMORCER UN SECOND AVOIR, et le schema y
   * oblige : `DemandeRetractation.commandeId` est UNIQUE, une commande ne porte
   * qu'une demande, et le depot ne compte qu'une commande facturee de test. Le
   * test remet la valeur d'origine, y compris s'il echoue.
   */
  test("un avoir sans PDF affiche son numéro, sans lien mort", async ({
    page,
  }) => {
    await avecClient(async (client) => {
      await client.query(`UPDATE avoir SET chemin_pdf = NULL WHERE id = $1`, [
        DEMANDE_AVEC_AVOIR.avoirId,
      ]);
    });

    try {
      await page.goto("/administration/retractations");

      const carte = carteDemande(page);

      await expect(
        carte.getByText(
          `Avoir ${DEMANDE_AVEC_AVOIR.numeroAvoir}, PDF à regénérer depuis la commande`,
        ),
      ).toBeVisible();

      /*
       * LE TEXTE DIT QUOI FAIRE, et non seulement que le PDF manque : « PDF
       * indisponible » seul laisserait croire a une perte definitive, alors que
       * la generation se relance depuis la commande. Motif ecrit par l'ecran des
       * factures, que ma premiere version avait recopie a moitie.
       */
      /*
       * LE TEXTE DIT QUOI FAIRE, assertion a part : « PDF indisponible » seul
       * laisserait croire a une perte definitive, alors que la generation se
       * relance depuis la commande. Sans cette assertion, revenir au texte
       * ampute ne ferait rougir personne.
       */
      await expect(
        carte.getByText(/à regénérer depuis la commande/),
      ).toBeVisible();

      /*
       * AUCUN LIEN, et c'est l'assertion qui porte le critere : un lien ici
       * rendrait 404, la route refusant de servir une piece sans fichier.
       */
      await expect(
        carte.getByRole("link", {
          name: new RegExp(DEMANDE_AVEC_AVOIR.numeroAvoir),
        }),
      ).toHaveCount(0);
    } finally {
      /*
       * `finally` ET NON UNE LIGNE EN FIN DE TEST : un echec d'assertion laisserait
       * sinon `chemin_pdf` nul, et les tests suivants de ce fichier, comme la
       * prochaine execution, mesureraient une branche qu'ils ne visent pas.
       */
      await avecClient(async (client) => {
        await client.query(
          `UPDATE avoir SET chemin_pdf = 'factures/test-ls174.pdf' WHERE id = $1`,
          [DEMANDE_AVEC_AVOIR.avoirId],
        );
      });
    }
  });

  /**
   * CRITERE 3, une demande sans avoir n'affiche RIEN de plus.
   *
   * Un libelle vide, « Avoir : » suivi de rien, ferait croire a un defaut
   * d'affichage sur l'ecran le plus consulte en cas de litige.
   *
   * CE N'EST PAS LE CAS `AVOIR_NON_EMIS`, contrairement a ce que ce commentaire
   * a d'abord affirme : quand l'emission echoue, `avoir.ts` leve apres avoir
   * pose l'alerte, donc `montantRembourseCentimes` reste nul et le bloc ENTIER
   * disparait. L'etat exerce ici est celui d'un remboursement dont l'avoir n'est
   * PAS rattache, que le service ne produit pas aujourd'hui : ce test garde la
   * branche d'affichage, il ne reproduit pas un etat metier. Releve par
   * `ls-frontend-revue` le 7 septembre 2026.
   *
   * L'AVOIR EST RETIRE LE TEMPS DU TEST plutot que de viser une autre demande :
   * celles que `compte-retractation.spec.ts` depose ne sont pas garanties
   * presentes, et un test qui passerait faute de cible ne prouverait rien.
   */
  test("une demande sans avoir n'affiche aucun libellé d'avoir", async ({
    page,
  }) => {
    await avecClient(async (client) => {
      await client.query(
        `UPDATE avoir SET demande_retractation_id = NULL WHERE id = $1`,
        [DEMANDE_AVEC_AVOIR.avoirId],
      );
    });

    try {
      await page.goto("/administration/retractations");

      const carte = carteDemande(page);

      /*
       * LA CARTE EST LA, ET C'EST LA MOITIE DE L'ASSERTION : sans elle, un ecran
       * vide satisferait le `toHaveCount(0)` qui suit, motif « contrôle satisfait
       * par l'absence » deja rencontre sur ce depot.
       */
      await expect(carte).toBeVisible();
      await expect(carte.getByText(/Avoir/)).toHaveCount(0);
    } finally {
      await avecClient(async (client) => {
        await client.query(
          `UPDATE avoir SET demande_retractation_id = $2 WHERE id = $1`,
          [DEMANDE_AVEC_AVOIR.avoirId, DEMANDE_RETRACTATION_TEST.demandeId],
        );
      });
    }
  });

  /**
   * LE RENDU NE DEBORDE PAS AVEC LE NUMERO D'AVOIR, invariant 10.
   *
   * Le numero ajoute treize caracteres a la ligne du montant, sur un ecran concu
   * a partir de 320 px : c'est precisement le genre d'ajout qui deborde, motif
   * mesure en LS-171 sur un libelle voisin de cet ecran.
   */
  test("la carte portant un avoir ne déborde pas horizontalement", async ({
    page,
  }) => {
    await page.goto("/administration/retractations");

    await expect(carteDemande(page)).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });
});
