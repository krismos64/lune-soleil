/**
 * Catalogue en administration, de bout en bout. LS-99, criteres 4 et 6.
 *
 * CE QUE CE FICHIER PROUVE ET QUE RIEN D'AUTRE NE PROUVE. Les tests
 * d'integration exercent le service, ils ne disent pas qu'une PAGE appelle
 * `exigerAdministratrice`, ni qu'une SERVER ACTION le fait de son cote. Un ecran
 * qui oublierait l'appel les passerait tous.
 *
 * LE TEST D'APPEL DIRECT EST LE PLUS IMPORTANT DU FICHIER. Une Server Action est
 * un point d'entree HTTP : elle s'invoque sans jamais charger la page qui la
 * porte. Verifier la seule redirection de la page laisserait ce chemin ouvert,
 * defaut exact trouve en relecture de LS-89.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ECRANS = [
  { chemin: "/administration/categories", titre: "Catégories du catalogue" },
  { chemin: "/administration/produits/nouveau", titre: "Nouveau produit" },
  /*
   * L'EDITEUR DE FICHE PRODUIT, LS-100. L'identifiant est un UUID qui
   * n'existe pas, et c'est deliberé : la garde de role doit rediriger AVANT
   * toute lecture en base.
   *
   * Un ecran qui lirait le produit d'abord rendrait un 404 sur cet
   * identifiant, et une redirection sur un identifiant reel : la difference
   * entre les deux reponses dirait a un visiteur non autorise quels
   * identifiants existent. Le titre attendu est donc celui de la CONNEXION,
   * puisque aucune fiche ne doit etre atteinte.
   */
  {
    chemin: "/administration/produits/3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    titre: "Informations générales",
  },
];

for (const ecran of ECRANS) {
  test(`${ecran.chemin} refuse un visiteur sans session`, async ({ page }) => {
    await page.goto(ecran.chemin);

    await expect(page).toHaveURL(/\/administration\/connexion$/);

    // Le titre de l'ecran protege n'apparait nulle part : une redirection qui
    // laisserait le contenu rendu avant de naviguer serait une fuite.
    await expect(page.getByRole("heading", { name: ecran.titre })).toHaveCount(
      0,
    );
  });

  test(`la redirection depuis ${ecran.chemin} ne deborde pas horizontalement`, async ({
    page,
  }) => {
    await page.goto(ecran.chemin);
    await expect(page).toHaveURL(/\/administration\/connexion$/);

    const debordement = await page.evaluate(() => {
      const racine = document.documentElement;
      return racine.scrollWidth - racine.clientWidth;
    });

    expect(debordement).toBeLessThanOrEqual(0);
  });

  test(`la redirection depuis ${ecran.chemin} ne porte aucune violation d'accessibilite`, async ({
    page,
  }) => {
    await page.goto(ecran.chemin);
    await expect(page).toHaveURL(/\/administration\/connexion$/);

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });
}

/**
 * TEST NEGATIF DE SECURITE. Une Server Action invoquee DIRECTEMENT, sans passer
 * par le rendu de l'ecran, ne doit produire aucun effet.
 *
 * LA FORME DE L'APPEL. Next.js identifie une Server Action par l'en-tete
 * `Next-Action` portant son identifiant, produit au build. Cet identifiant
 * n'est pas connu d'ici, et le fabriquer rendrait le test dependant d'un detail
 * interne de Next.js. Ce test couvre donc plus large : aucun POST a ces routes,
 * quelle qu'en soit la forme, ne doit laisser de trace.
 *
 * L'ASSERTION PORTE SUR L'EFFET, PAS SUR LE CODE HTTP, et la premiere version
 * de ce test se trompait de cible. Un POST sans en-tete `Next-Action` est traite
 * par Next.js comme une navigation ordinaire : il redirige vers la connexion et
 * rend 200 au bout de la chaine. Exiger un code superieur ou egal a 300 faisait
 * donc rougir un comportement correct, et surtout mesurait le mauvais signal :
 * un 403 accompagne d'une ecriture serait un defaut, un 200 sans ecriture n'en
 * est pas un.
 *
 * CE QUI EST DONC VERIFIE : la reponse ne renvoie jamais la donnee soumise, et
 * l'ecran des categories, atteint ensuite, ne la porte pas davantage. Une
 * creation reussie apparaitrait dans l'un ou l'autre.
 */
const NOM_FABRIQUE = "Catégorie fabriquée par un test";

test("un POST direct sur les ecrans du catalogue ne produit aucun effet", async ({
  request,
}) => {
  for (const ecran of ECRANS) {
    const reponse = await request.post(ecran.chemin, {
      data: { nom: NOM_FABRIQUE },
      headers: { "content-type": "application/json" },
      failOnStatusCode: false,
    });

    // La reponse ne porte pas la donnee soumise : ni echo, ni liste rendue avec
    // la nouvelle categorie.
    const corps = await reponse.text();
    expect(corps).not.toContain(NOM_FABRIQUE);

    // ET AUCUN FORMULAIRE D'ADMINISTRATION N'EST SERVI EN REPONSE. Un POST qui
    // rendrait l'ecran protege plutot que la connexion livrerait le contenu que
    // la garde doit retenir.
    expect(corps).not.toContain("Catégories du catalogue");
    expect(corps).not.toContain("Créer le brouillon");
    // LS-100, l'editeur de fiche produit et ses gestes destructeurs.
    expect(corps).not.toContain("Sections de la fiche");
    expect(corps).not.toContain("Supprimer définitivement");
    // LS-101, les declinaisons, leurs prix et leur stock.
    expect(corps).not.toContain("Déclinaisons et prix");
    expect(corps).not.toContain("Ajouter la déclinaison");
    // LS-102, les photos et leur televersement.
    expect(corps).not.toContain("Photos de la fiche");
    expect(corps).not.toContain("Ajouter une photo");
    // LS-103, la publication et l'archivage.
    expect(corps).not.toContain("Publier la fiche");
    expect(corps).not.toContain("Archiver la fiche");
  }
});

/**
 * LA CREATION N'EST PAS ATTEIGNABLE SANS SESSION, verifie par l'ABSENCE des
 * commandes a l'ecran apres redirection.
 *
 * Distinct du test de redirection : celui-la constate l'URL, celui-ci constate
 * qu'aucun formulaire de creation n'est rendu, y compris masque. Un ecran qui
 * rendrait ses champs avant de rediriger les livrerait dans le HTML.
 */
test("aucun formulaire de catalogue n'est rendu sans session", async ({
  page,
}) => {
  for (const ecran of ECRANS) {
    await page.goto(ecran.chemin);
    await expect(page).toHaveURL(/\/administration\/connexion$/);

    await expect(page.getByLabel("Nom de la nouvelle catégorie")).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Nom du produit")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Créer le brouillon" }),
    ).toHaveCount(0);

    // LS-100. Le champ de contenu d'une section porte du texte redige par
    // l'exploitante : le rendre avant de rediriger le livrerait dans le HTML.
    await expect(page.getByLabel("Texte affiché")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ajouter la section" }),
    ).toHaveCount(0);

    // LS-101. Le stock et le prix sont des donnees d'exploitation : les rendre
    // avant de rediriger les livrerait dans le HTML a qui n'a pas de session.
    await expect(page.getByLabel("Prix en euros")).toHaveCount(0);
    await expect(page.getByLabel("Stock physique")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ajouter la déclinaison" }),
    ).toHaveCount(0);

    /*
     * LS-102. LE CHAMP DE FICHIER EST LE PLUS SENSIBLE DE CET ECRAN : rendu
     * sans session, il offrirait a n'importe qui un point de depot de fichiers
     * vers le volume des medias. Le bouton de suppression est verifie avec lui,
     * un media supprime emportant ses onze declinaisons du disque.
     */
    await expect(page.getByLabel("Ajouter une photo")).toHaveCount(0);
    await expect(page.getByLabel("Description de la photo")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Supprimer la photo" }),
    ).toHaveCount(0);

    /*
     * LS-103. LES DEUX BOUTONS DE TRANSITION D'ETAT sont les plus sensibles de
     * l'ecran apres le champ de fichier : publier rend une fiche visible dans
     * la boutique, archiver l'en retire. Les rendre sans session les offrirait
     * a qui charge l'URL.
     */
    await expect(
      page.getByRole("button", { name: "Publier la fiche" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Archiver la fiche" }),
    ).toHaveCount(0);
  }
});
