/**
 * Etats non nominaux des ecrans d'administration, LS-113.
 *
 * ------------------------------------------------------------------
 * CE QUE CE FICHIER PROUVE ET QUE RIEN D'AUTRE NE PROUVE.
 *
 * LS-111 a livre le MOYEN d'observer ces ecrans, une session d'administration
 * partagee, et a couvert leur rendu nominal. Les etats non nominaux restaient
 * entiers : `frontend-design.md` en impose cinq, vide, chargement, erreur
 * serveur, pending et disabled, et la suite en couvrait ZERO.
 *
 * LA SUITE NE CLIQUAIT SUR AUCUN BOUTON D'ADMINISTRATION. Tous portent
 * `disabled={enCours}`, aucun test ne l'exercait : le double clic sur une
 * Server Action n'etait couvert nulle part, et le message de refus le plus long
 * de l'editeur n'etait jamais affiche.
 *
 * LE CHARGEMENT EST COUVERT AILLEURS, `chargement-administration.spec.ts`,
 * LS-188. Ce fichier porte les quatre autres, plus le SUCCES, que la liste des
 * etats obligatoires ne nomme pas mais dont `frontend-design.md` interdit la
 * forme optimiste : « jamais de faux succes optimiste ». Ajoute apres la revue
 * de LS-113, qui a releve qu'aucun clic REUSSI n'etait exerce.
 * ------------------------------------------------------------------
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  FICHIER_SESSION_ADMINISTRATION,
  PRODUIT_TEST,
  PRODUIT_VIDE,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const FICHE_VIDE = `/administration/produits/${PRODUIT_VIDE.produitId}`;
const FICHE_CONTROLE = `/administration/produits/${PRODUIT_TEST.produitId}`;

test.describe("etats non nominaux de l'administration", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  /*
   * ------------------------------------------------------------------
   * CRITERE 1, les etats vides rendus ET assertes.
   *
   * TROIS ICI, DEUX EN TEST DE COMPOSANT. Les deux etats « aucune categorie »
   * demandent une liste GLOBALEMENT vide, que la fixture ne peut pas produire
   * puisqu'elle insere toujours une categorie ; ils vivent dans
   * `tests/composant/etats-vides-catalogue.test.tsx`.
   *
   * LES TROIS D'ICI ETAIENT ATTEINTS PAR ACCIDENT sur la fiche de controle,
   * sans qu'aucune assertion ne les nomme : le message pouvait disparaitre sans
   * que rien ne rougisse. Le second produit de controle, vide de tout, les rend
   * intentionnels.
   * ------------------------------------------------------------------
   */
  test("les trois etats vides de l'editeur sont rendus et nommes", async ({
    page,
  }, infos) => {
    test.skip(
      infos.project.name !== "mobile-320",
      "lit des textes, pas une mise en page : une seule largeur suffit",
    );

    await page.goto(FICHE_VIDE);

    await expect(page.getByText(/Aucune déclinaison en vente/)).toBeVisible();
    await expect(page.getByText(/Aucune photo pour l'instant/)).toBeVisible();
    await expect(
      page.getByText(/Cette fiche ne porte plus aucune section/),
    ).toBeVisible();
  });

  test("la fiche qui porte une declinaison n'affiche pas l'etat vide", async ({
    page,
  }, infos) => {
    /*
     * LE CAS NEGATIF EST LA MOITIE DU CRITERE. Sans lui, un composant qui
     * afficherait « aucune déclinaison » EN PERMANENCE passerait le test
     * ci-dessus : le message serait la, et l'assertion verte, sur un ecran faux.
     */
    test.skip(
      infos.project.name !== "mobile-320",
      "lit un texte, pas une mise en page : une seule largeur suffit",
    );

    await page.goto(FICHE_CONTROLE);

    await expect(page.getByText(/Aucune déclinaison en vente/)).toBeHidden();

    /*
     * LA SECTION EST POSEE PAR LA FIXTURE POUR CE CAS PRECIS. Sans elle, aucune
     * fiche du depot n'en porte : l'assertion n'aurait nulle part ou se
     * mesurer, et un composant affichant le message en permanence resterait
     * invisible. Relevé par la revue de LS-113.
     */
    await expect(
      page.getByText(/Cette fiche ne porte plus aucune section/),
    ).toBeHidden();
  });

  test("aucun debordement a 320 px sur la fiche vide", async ({ page }) => {
    /*
     * MESURE SUR LES TROIS LARGEURS, contrairement aux tests de texte : c'est
     * un rendu, et la fiche vide a une mise en page differente de la fiche
     * pleine, trois blocs y etant remplaces par des messages.
     */
    await page.goto(FICHE_VIDE);
    await expect(page.getByText(/Aucune photo pour l'instant/)).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  /*
   * ------------------------------------------------------------------
   * CRITERES 2 ET 3, l'etat pending et le message de refus.
   *
   * UN SEUL CLIC LES PRODUIT TOUS LES DEUX, et c'est ce qui rend ce test
   * central. La fiche vide n'est pas publiable : cliquer « Publier la fiche »
   * desactive le bouton pendant l'aller-retour, puis affiche le refus serveur
   * avec ses motifs, le texte le plus long de l'editeur.
   * ------------------------------------------------------------------
   */
  test("publier une fiche incomplete desactive le bouton puis affiche le refus", async ({
    page,
  }, infos) => {
    test.skip(
      infos.project.name !== "mobile-320",
      "un clic serveur par projet triplerait la charge pour la meme mesure",
    );

    await page.goto(FICHE_VIDE);

    const publier = page.getByRole("button", { name: "Publier la fiche" });
    await expect(publier).toBeEnabled();

    await publier.click();

    /*
     * LE MESSAGE DE REFUS EST LA PREUVE QUE L'ALLER-RETOUR A EU LIEU. Assertir
     * `toBeDisabled` seul serait une course perdue d'avance : la fenetre dure le
     * temps d'un appel serveur, et un test qui la rate passerait au vert en
     * n'ayant rien mesure. Le refus, lui, reste a l'ecran.
     *
     * `role="alert"` EST DESIGNE PAR SON TEXTE et non par le role nu :
     * l'annonceur de route de Next.js porte aussi `role="alert"`, et un
     * selecteur nu trouverait deux elements. Motif deja en fiche.
     */
    const refus = page.getByText(/La fiche n'est pas complète/);
    await expect(refus).toBeVisible();

    /*
     * LES MOTIFS SONT REPRIS DANS LE MESSAGE, revue de LS-103 : la liste
     * visuelle vit au-dessus et change hors de toute region live, donc un
     * lecteur d'ecran n'entendrait que « la fiche n'est pas complète ».
     */
    await expect(refus).toContainText(/Ajoutez au moins une déclinaison/);
    await expect(refus).toContainText(/Ajoutez au moins une photo/);

    /*
     * LE BOUTON EST REDEVENU ACTIF, ce qui prouve que `enCours` a bien ete
     * relache : un bouton reste desactive apres un refus bloquerait
     * l'exploitante sur un ecran dont elle vient de lire quoi corriger.
     */
    await expect(publier).toBeEnabled();
  });

  test("le message de refus ne deborde pas a 320 px", async ({ page }) => {
    /*
     * C'EST LE TEXTE LE PLUS LONG DE L'EDITEUR, donc le meilleur candidat au
     * debordement, et il n'etait jamais affiche : quatre libelles concatenes
     * dans une seule region.
     */
    await page.goto(FICHE_VIDE);
    await page.getByRole("button", { name: "Publier la fiche" }).click();
    await expect(page.getByText(/La fiche n'est pas complète/)).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  /*
   * ------------------------------------------------------------------
   * L'ETAT DE SUCCES, ET POURQUOI IL COMPTE AUTANT QUE L'ERREUR.
   *
   * `frontend-design.md` interdit le faux succes optimiste : un message de
   * reussite ne doit paraitre qu'APRES la confirmation du serveur. Les deux
   * ecrans portent un `role="status"` de succes, et aucun test ne les exercait :
   * un composant qui afficherait « Catégorie créée. » avant l'aller-retour
   * passerait toutes les assertions de ce depot.
   *
   * LE TEST NETTOIE DERRIERE LUI, la fixture etant partagee : la categorie
   * creee est supprimee dans le meme test, sans quoi chaque execution en
   * laisserait une de plus et le compte de l'ecran deriverait.
   * ------------------------------------------------------------------
   */
  test("creer une categorie annonce le succes, et la suppression aussi", async ({
    page,
  }, infos) => {
    test.skip(
      infos.project.name !== "mobile-320",
      "un aller-retour serveur par projet triplerait la charge pour la meme mesure",
    );

    await page.goto("/administration/categories");

    /*
     * LE NOM PORTE LE PREFIXE `TEST` comme toutes les donnees de controle, et un
     * horodatage : deux executions rapprochees creeraient sinon deux categories
     * de meme nom, et le slug est unique.
     */
    const nom = `TEST Succès LS-113 ${Date.now()}`;

    await page.getByLabel("Nom de la nouvelle catégorie").fill(nom);
    await page.getByRole("button", { name: "Ajouter" }).click();

    /*
     * LE MESSAGE EST DANS UNE REGION `status`, donc annonce a un lecteur
     * d'ecran. Le chercher par son role plutot que par son texte seul verifie
     * les deux d'un coup : ce qui est dit, et le fait que ce soit annonce.
     */
    await expect(
      page.getByRole("status").filter({ hasText: "Catégorie créée." }),
    ).toBeVisible();

    /*
     * LA CATEGORIE EXISTE VRAIMENT, et pas seulement son message : un composant
     * optimiste afficherait le succes sans que la ligne apparaisse.
     */
    await expect(
      page.getByRole("listitem").filter({ hasText: nom }),
    ).toBeVisible();

    /*
     * NETTOYAGE, la fixture etant partagee entre les executions : sans lui,
     * chaque passage laisserait une categorie de plus et le compte deriverait.
     *
     * LE BOUTON EST DESIGNE PAR SON NOM ACCESSIBLE, `Supprimer <nom>`, ce qui
     * vise la bonne ligne sans dependre de la structure du DOM.
     */
    await page.getByRole("button", { name: `Supprimer ${nom}` }).click();

    /*
     * LE SUCCES SERVEUR D'ABORD, LA DISPARITION ENSUITE, ET L'ORDRE COMPTE.
     *
     * LA CREATION SUIT DEJA CE MOTIF vingt lignes plus haut, la suppression
     * etait le seul geste du fichier a en manquer. Sans cette attente
     * intermediaire, l'assertion suivante court apres un aller-retour serveur
     * complet : re-rendu de la page `force-dynamic`, PLUS celui du layout et de
     * ses neuf comptages.
     *
     * ELLE NE RALENTIT RIEN dans le cas nominal, une assertion rendant la main
     * des que sa condition est vraie. Elle SEPARE en revanche deux causes
     * d'echec que la version precedente confondait : « le serveur n'a pas
     * repondu » et « la liste ne s'est pas rafraichie ».
     */
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: `Catégorie ${nom} supprimée.` }),
    ).toBeVisible();

    /*
     * LA LIGNE DE LISTE EST VISEE, ET NON LE TEXTE NU. Le message de succes de
     * la suppression REPREND le nom de la categorie, « Catégorie X supprimée » :
     * un `getByText(nom)` le trouverait et l'assertion echouerait sur une
     * suppression parfaitement reussie. Piege rencontre en ecrivant ce test.
     */
    await expect(
      page.getByRole("listitem").filter({ hasText: nom }),
    ).toBeHidden();
  });

  /*
   * ------------------------------------------------------------------
   * CRITERE 4, le panneau d'archivage ouvert, mesure et passe a AxeBuilder.
   *
   * IL PORTE `role="alertdialog"`, `aria-labelledby`, `aria-describedby`,
   * `tabIndex={-1}` et une gestion d'`Escape` : autant d'attributs qu'aucun
   * test ne verifiait, sur un panneau monte conditionnellement que la suite
   * n'ouvrait jamais.
   * ------------------------------------------------------------------
   */
  test("le panneau d'archivage s'ouvre, se ferme par Echap et ne deborde pas", async ({
    page,
  }) => {
    await page.goto(FICHE_CONTROLE);

    await page.getByRole("button", { name: "Archiver la fiche" }).click();

    const panneau = page.getByRole("alertdialog");
    await expect(panneau).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );

    /*
     * `Escape` FERME LE PANNEAU, et c'est une exigence d'accessibilite et non
     * un confort : un panneau modal dont on ne sort qu'a la souris piege qui
     * navigue au clavier.
     */
    await page.keyboard.press("Escape");
    await expect(panneau).toBeHidden();
  });

  test("le panneau d'archivage ne porte aucune violation d'accessibilite", async ({
    page,
  }, infos) => {
    test.skip(
      infos.project.name !== "mobile-320",
      "axe-core analyse l'arbre d'accessibilite, identique aux trois largeurs",
    );

    await page.goto(FICHE_CONTROLE);
    await page.getByRole("button", { name: "Archiver la fiche" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });

  /*
   * ------------------------------------------------------------------
   * CRITERE 5, les deux ecrans proteges manquants.
   *
   * `journal-connexions.spec.ts` EXISTE DEPUIS LE TICKET, mais il ne couvre que
   * le REFUS sans session : le rendu AVEC session n'etait vu par personne.
   * L'ecart est signale plutot que resolu en silence.
   *
   * LE JOURNAL EST L'ECRAN LE PLUS EXPOSE AU DEBORDEMENT A 320 px : dates,
   * adresses IP et agents utilisateurs sont des chaines longues et insecables.
   * ------------------------------------------------------------------
   */
  const ECRANS_PROTEGES = [
    {
      chemin: "/administration/journal-connexions",
      titre: "Journal des connexions",
    },
    {
      chemin: "/administration/reauthentification",
      titre: "Confirmer votre identité",
    },
  ];

  for (const ecran of ECRANS_PROTEGES) {
    test(`${ecran.chemin} est rendu avec session et ne deborde pas`, async ({
      page,
    }) => {
      await page.goto(ecran.chemin);

      await expect(
        page.getByRole("heading", { level: 1, name: ecran.titre }),
      ).toBeVisible();

      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
        TOLERANCE_DEBORDEMENT_PX,
      );
    });

    test(`${ecran.chemin} ne porte aucune violation d'accessibilite`, async ({
      page,
    }, infos) => {
      test.skip(
        infos.project.name !== "mobile-320",
        "axe-core analyse l'arbre d'accessibilite, identique aux trois largeurs",
      );

      await page.goto(ecran.chemin);
      await expect(
        page.getByRole("heading", { level: 1, name: ecran.titre }),
      ).toBeVisible();

      const resultat = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(resultat.violations).toEqual([]);
    });
  }
});
