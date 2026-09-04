/**
 * Ecran « Factures et avoirs » de l'administration, de bout en bout. LS-184.
 *
 * CE QUE CE FICHIER PROUVE ET QUE RIEN D'AUTRE NE PROUVE. Un test d'integration
 * exercerait le service ; il ne dirait pas que la PAGE appelle
 * `exigerAdministratrice`, ni que la ROUTE de telechargement le fait de son
 * cote. Un ecran qui oublierait l'appel les passerait tous.
 *
 * LA ROUTE PDF EST LE POINT LE PLUS SENSIBLE. C'est un point d'entree HTTP qui
 * sert un document comptable portant un nom, une adresse et des montants :
 * verifier la seule redirection de la page laisserait ce chemin ouvert, defaut
 * exact trouve en relecture de LS-89 sur les Server Actions.
 *
 * L'ECRAN EST EN LECTURE SEULE, ET UN TEST LE VERIFIE. L'invariant 4 interdit
 * qu'une facture soit modifiee ou supprimee : le jour ou quelqu'un ajouterait un
 * bouton d'action ici, ce fichier doit rougir.
 */
import { Client } from "pg";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  COMMANDE_FACTUREE_TEST,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const ECRAN = "/administration/factures";

/*
 * UN IDENTIFIANT QUI N'EXISTE PAS, et c'est delibere : la garde de role doit
 * refuser AVANT toute lecture en base. Une route qui lirait la piece d'abord
 * rendrait le meme 404, donc ce test seul ne distingue pas les deux ordres ;
 * c'est la lecture du code qui le fait, et le commentaire de la route l'ecrit.
 * Ce qui est mesure ici est qu'aucun document ne sort sans session.
 */
const PIECE_INEXISTANTE = "3f2504e0-4f89-41d3-9a0c-0305e82c3310";

/**
 * L'avoir que ce fichier pose, et que la base de test ne porte pas.
 *
 * POURQUOI IL FAUT LE POSER ICI. `commande.setup.ts` amorce UNE facture, sans
 * `chemin_pdf` et sans avoir : la branche `.sansPdf` etait donc la seule jamais
 * rendue, et ni le lien de telechargement, ni le badge d'avoir, ni le montant
 * negatif n'atteignaient axe-core ni la mesure de debordement.
 *
 * Le defaut n'etait pas dans le rendu, il etait dans la PREUVE : les etats que
 * les criteres 2 et 3 demandent de verifier n'etaient couverts qu'en
 * integration, cote service, jamais a l'ecran. Trouve par la revue d'interface.
 *
 * LA FIXTURE PARTAGEE N'EST PAS MODIFIEE, et c'est deliberе : elle sert cinq
 * autres fichiers, dont l'ecran de remboursement qui compte les avoirs de cette
 * facture. Ce fichier greffe ses donnees et les retire, donc reste maitre de ce
 * qu'il mesure sans changer ce que les autres voient.
 */
const AVOIR_TEST = {
  id: "e1a2b3c4-1184-4aaa-8888-000000000001",
  numero: "A-TEST-0184",
  montantCentimes: 1200,
} as const;

const CHEMIN_PDF_TEST = "factures/test-ls184.pdf";

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

test.beforeAll(async () => {
  await avecClient(async (client) => {
    /*
     * LE CHEMIN N'A PAS BESOIN DE DESIGNER UN FICHIER REEL. Ce qui est mesure
     * ici est le RENDU du lien, pas le telechargement : la route qui sert le
     * fichier est couverte par son propre test, et un chemin sans fichier y
     * rend le meme 404 qu'une piece absente, ce qui est le comportement voulu.
     */
    await client.query(`UPDATE facture SET chemin_pdf = $2 WHERE id = $1`, [
      COMMANDE_FACTUREE_TEST.factureId,
      CHEMIN_PDF_TEST,
    ]);

    /*
     * L'INSTANTANE EST RECOPIE DE LA FACTURE, jamais reconstruit : un avoir
     * porte SON PROPRE instantane derive de celui de la facture, invariant 3,
     * et le schema qui le relit est un `strictObject` qui refuse une forme
     * partielle. Recopier est donc a la fois juste et sur.
     */
    await client.query(
      `INSERT INTO avoir (id, facture_id, numero, montant_centimes, motif,
                          instantane_legal, chemin_pdf, emis_a)
       SELECT $1, id, $2, $3, 'TEST correction LS-184', instantane_legal,
              NULL, now()
       FROM facture WHERE id = $4
       ON CONFLICT (id) DO NOTHING`,
      [
        AVOIR_TEST.id,
        AVOIR_TEST.numero,
        AVOIR_TEST.montantCentimes,
        COMMANDE_FACTUREE_TEST.factureId,
      ],
    );
  });
});

test.afterAll(async () => {
  await avecClient(async (client) => {
    await client.query(`DELETE FROM avoir WHERE id = $1`, [AVOIR_TEST.id]);
    await client.query(`UPDATE facture SET chemin_pdf = NULL WHERE id = $1`, [
      COMMANDE_FACTUREE_TEST.factureId,
    ]);
  });
});

test.describe("sans session", () => {
  test("l'ecran redirige vers la connexion sans rien rendre", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    await expect(page).toHaveURL(/\/administration\/connexion$/);

    /*
     * LE TITRE N'APPARAIT NULLE PART. Une redirection qui laisserait le contenu
     * rendu avant de naviguer serait une fuite, et la liste porte des noms de
     * clients et des montants.
     */
    await expect(
      page.getByRole("heading", { name: "Factures et avoirs" }),
    ).toHaveCount(0);
  });

  test("la route de telechargement refuse en 404, jamais en 403", async ({
    request,
  }) => {
    const reponse = await request.get(`${ECRAN}/${PIECE_INEXISTANTE}`, {
      maxRedirects: 0,
    });

    /*
     * 404 ET NON 403, ET NON UNE REDIRECTION. Un 403 confirmerait que la piece
     * existe ; une redirection produirait un PDF corrompu, le navigateur
     * enregistrant la page de connexion sous le nom du document.
     */
    expect(reponse.status()).toBe(404);
    expect(reponse.headers()["content-type"]).not.toContain("application/pdf");
  });
});

test.describe("connectee en administration", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("l'ecran s'atteint au clic depuis la barre, jamais par l'URL seule", async ({
    page,
  }) => {
    /*
     * AU CLIC ET NON PAR `goto`, motif de C33 : un ecran qu'aucun lien ne
     * designe est inatteignable en pratique, et un test qui y arrive par URL ne
     * le verrait jamais. C'est le defaut que LS-162 a ferme cote administration,
     * et `verifier-navigation-administration.sh` le verifie de son cote sur les
     * chemins ; ici on verifie le lien reel.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/administration");

    await page
      .getByRole("navigation", { name: "Sections de l'administration" })
      .getByRole("link", { name: "Factures et avoirs" })
      .click();

    await expect(page).toHaveURL(/\/administration\/factures$/);
    await expect(
      page.getByRole("heading", { name: "Factures et avoirs", level: 1 }),
    ).toBeVisible();
  });

  test("les trois comptages et la mention de franchise sont presents", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    await expect(page.getByText("Factures", { exact: true })).toBeVisible();
    await expect(page.getByText("Avoirs", { exact: true })).toBeVisible();
    await expect(page.getByText("Total de la période")).toBeVisible();

    /*
     * LA MENTION DE FRANCHISE EST CELLE DES DOCUMENTS EMIS, article 293 B du
     * CGI. Cet ecran ne decide d'aucune obligation juridique, il redit ce que
     * l'instantane legal porte deja.
     */
    await expect(page.getByText(/293 B/)).toBeVisible();
  });

  test("le filtre de periode est serialise dans l'URL et marque son etat", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    const filtres = page.getByRole("navigation", {
      name: "Filtrer par période",
    });

    await filtres.getByRole("link", { name: "Ce mois-ci" }).click();

    /*
     * L'ETAT DANS L'URL EST CE QUI FAIT MARCHER LE RETOUR NAVIGATEUR, critere 4.
     * Un filtre garde dans l'etat React seul serait perdu au retour, et le lien
     * ne se partagerait pas.
     */
    await expect(page).toHaveURL(/\?periode=mois$/);

    await expect(
      filtres.getByRole("link", { name: "Ce mois-ci" }),
    ).toHaveAttribute("aria-current", "page");

    await expect(
      filtres.getByRole("link", { name: "Tout" }),
    ).not.toHaveAttribute("aria-current", "page");

    await page.goBack();

    await expect(page).toHaveURL(/\/administration\/factures$/);
    await expect(filtres.getByRole("link", { name: "Tout" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  /*
   * UNE PERIODE INCONNUE NE CASSE RIEN. L'invariant 7 veut que la chaine de
   * l'URL n'atteigne jamais la requete : elle sert a retrouver une entree de la
   * table des periodes, et une valeur inconnue retombe sur « Tout ».
   */
  test("une periode inconnue dans l'URL retombe sur Tout", async ({ page }) => {
    await page.goto(`${ECRAN}?periode=juillet-2026`);

    await expect(
      page.getByRole("heading", { name: "Factures et avoirs", level: 1 }),
    ).toBeVisible();

    await expect(
      page
        .getByRole("navigation", { name: "Filtrer par période" })
        .getByRole("link", { name: "Tout" }),
    ).toHaveAttribute("aria-current", "page");
  });

  /*
   * L'ECRAN EST EN LECTURE SEULE, critere 5, ET CE TEST EST SA GARDE.
   *
   * L'invariant 4 interdit qu'une facture soit modifiee ou supprimee. Le jour
   * ou quelqu'un ajouterait un bouton d'action sur cet ecran, ce test rougit :
   * c'est le seul controle automatique qui porte cette propriete, aucun script
   * textuel ne sachant dire qu'un ecran DOIT rester sans action.
   */
  test("aucun bouton d'action n'existe dans le contenu de cet ecran", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    /*
     * L'ASSERTION EST ANCREE SUR `main`, ET IL LE FAUT. Une recherche sur la
     * page entiere trouve le bouton « Se déconnecter » de la barre laterale,
     * rendu par le layout sur les quinze ecrans de l'administration : le test
     * echouait donc sur un ecran pourtant correct, en accusant le gabarit.
     *
     * CE QUI EST MESURE EST BIEN LE CONTENU. Une Server Action de cet ecran s'y
     * afficherait forcement, un formulaire ne vivant pas dans la barre.
     */
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  });

  /*
   * LES DEUX BRANCHES DE PDF SONT RENDUES, ET C'EST CE QUI MANQUAIT.
   *
   * La fixture pose un `chemin_pdf` sur la facture partagee et un avoir sans
   * PDF : les deux etats du critere 3 coexistent donc a l'ecran, le lien et la
   * mention d'indisponibilite, et l'assertion d'accessibilite plus bas les
   * traverse tous les deux.
   */
  test("le lien de telechargement porte le numero dans son nom accessible", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    /*
     * LE NOM ACCESSIBLE PORTE LE NUMERO, exigence WCAG « Link Purpose ». Sans
     * lui, une liste de vingt pieces offre vingt liens nommes « Télécharger le
     * PDF » : un lecteur d'ecran qui liste les liens de la page ne peut pas les
     * distinguer, et l'utilisateur ne sait pas lequel il active.
     */
    const lien = page.getByRole("link", {
      name: `Télécharger le PDF ${COMMANDE_FACTUREE_TEST.numeroFacture}`,
    });

    await expect(lien).toBeVisible();
    await expect(lien).toHaveAttribute(
      "href",
      `${ECRAN}/${COMMANDE_FACTUREE_TEST.factureId}`,
    );

    /*
     * ZONE TACTILE DE 44 px, minimum de `frontend-design.md`. Un lien de texte
     * fait sinon la hauteur de sa ligne, environ 24 px.
     */
    const boite = await lien.boundingBox();

    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("un avoir se distingue par son libelle, son signe et sa facture d'origine", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    const carteAvoir = page
      .getByRole("listitem")
      .filter({ hasText: AVOIR_TEST.numero });

    /*
     * LE TYPE EST DIT PAR UN LIBELLE, jamais par la seule couleur ni par le
     * seul prefixe du numero : « A-TEST-0184 » se distingue de « F-TEST-0160 »
     * a la lecture attentive, ce qui n'est pas une distinction accessible.
     */
    await expect(carteAvoir.getByText("Avoir", { exact: true })).toBeVisible();

    /*
     * LE MONTANT EST NEGATIF A L'ECRAN. Il est stocke POSITIF en base,
     * `chk_facture_avoir_borne` le comparant au total de la facture : c'est la
     * lecture qui lui donne son sens comptable, et sans le signe un
     * remboursement se lirait comme une recette.
     */
    await expect(carteAvoir.getByText(/-\s?12,00/)).toBeVisible();

    /*
     * L'AVOIR DIT LA FACTURE QU'IL CORRIGE, critere 2 : la liste etant
     * chronologique, les deux pieces peuvent etre eloignees de plusieurs
     * ecrans, et un avoir isole de sa facture ne veut rien dire.
     */
    await expect(
      carteAvoir.getByText(
        `Corrige la facture ${COMMANDE_FACTUREE_TEST.numeroFacture}`,
      ),
    ).toBeVisible();

    /*
     * SON PDF EST ABSENT, ET C'EST UN ETAT AFFICHE et non une erreur : le
     * document existe et reste numerote, seul son rendu a echoue, LS-129.
     */
    await expect(carteAvoir.getByText(/PDF indisponible/)).toBeVisible();
  });

  test("l'ecran ne deborde pas et ne porte aucune violation d'accessibilite", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });

  test("une piece inexistante rend 404 et jamais un PDF vide", async ({
    request,
  }) => {
    const reponse = await request.get(`${ECRAN}/${PIECE_INEXISTANTE}`);

    /*
     * 404 PLUTOT QU'UN CORPS VIDE EN 200. Un PDF de zero octet enregistre sous
     * le nom du document ferait croire a un fichier corrompu, et l'exploitante
     * chercherait le defaut du mauvais cote.
     */
    expect(reponse.status()).toBe(404);
  });
});
