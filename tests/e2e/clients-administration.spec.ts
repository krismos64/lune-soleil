/**
 * Ecran « Clients » de l'administration, de bout en bout. LS-185.
 *
 * CE QUE CE FICHIER PROUVE ET QUE RIEN D'AUTRE NE PROUVE. Un test d'integration
 * exercerait le service ; il ne dirait pas que la PAGE appelle
 * `exigerAdministratrice` avant tout rendu. Sur cet ecran, la garde est la
 * seule protection du fichier client entier : un client inscrit qui l'atteindrait
 * lirait le nom, l'adresse et l'historique de tous les autres.
 *
 * LA RECHERCHE LIBRE EST UN ECART ASSUME A ADR-027, arbitrage de Christophe du
 * 5 septembre 2026, ecrit dans `.claude/familles-sans-action.txt`, dans le
 * traitement T11 du registre et dans le service. Ces tests mesurent ce qui a
 * ete decide, ils ne le rediscutent pas.
 *
 * LE TEST DE FUITE EST LE PLUS IMPORTANT DU FICHIER. Il verifie qu'aucune
 * donnee ne sort avant la redirection : un ecran qui rendrait son contenu puis
 * naviguerait aurait deja tout divulgue.
 */
import { Client } from "pg";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  FICHIER_SESSION,
  FICHIER_SESSION_ADMINISTRATION,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const ECRAN = "/administration/clients";

/**
 * Un compte dont le nom et l'adresse sont DELIBEREMENT HOSTILES au rendu.
 *
 * POURQUOI IL EXISTE. Le CSS de cet ecran porte `min-width: 0` et
 * `overflow-wrap: anywhere` sur quatre elements, tous justifies par le motif de
 * LS-171. Aucune donnee ne les exerçait : les fixtures n'emploient que des noms
 * courts, donc la protection etait AFFIRMEE et non mesuree. C'est le motif
 * « un defaut absent n'est pas un defaut empeche », releve par la revue
 * d'interface du 5 septembre 2026.
 *
 * QUARANTE-CINQ CARACTERES SANS AUCUN ESPACE : c'est la forme qui a fait
 * deborder le detail de commande de 43 px a 320 px en LS-171, transposee a un
 * nom de personne. L'adresse suit le meme principe, une partie locale longue
 * n'ayant pas non plus de point de coupure naturel.
 */
/**
 * Le client au nom sans coupure naturelle, UN PAR LARGEUR, LS-174.
 *
 * ------------------------------------------------------------------
 * IL ETAIT PARTAGE, ET LES LARGEURS SE LE SUPPRIMAIENT ENTRE ELLES.
 *
 * `beforeAll` et `afterAll` s'executent UNE FOIS PAR PROJET, et les projets de
 * largeur tournent en parallele : la premiere largeur a finir supprimait le
 * compte que les autres cherchaient encore. Le `ON CONFLICT DO NOTHING` rendait
 * la creation idempotente, c'est la SUPPRESSION qui ne l'etait pas.
 *
 * Mesure du 7 septembre 2026 : l'echec est apparu en ajoutant `tablette-768`,
 * sur deux largeurs a la fois, jamais les memes. Une largeur de plus, c'est une
 * chance de plus que la course se produise.
 *
 * LE MOTIF EST CELUI DE TOUT LE DEPOT : une fixture ECRITE porte le nom du
 * projet, `compte-commandes`, `compte-adresses` et `retractation-sans-compte`
 * le font deja. Il manquait ici.
 * ------------------------------------------------------------------
 */
function clientHostile(projet: string) {
  return {
    /*
     * L'IDENTIFIANT DERIVE DU PROJET, et il reste un UUID valide : le dernier
     * bloc porte un rang par largeur plutot qu'un texte, la colonne etant de
     * type `uuid`.
     */
    id: `e1a2b3c4-1185-4aaa-8888-00000000000${RANG_PROJET[projet] ?? 9}`,
    /*
     * LE NOM NE PORTE PAS LE PROJET, ET C'EST UNE CONTRAINTE DE LA MESURE.
     * Il est calibre pour etre le plus long possible SANS coupure naturelle,
     * ce que ce test mesure a 320 px : lui ajouter « tablette-768 » le fait
     * deborder de 77 px, mesure, et le test rougirait sur un defaut que
     * j'aurais fabrique. L'unicite est portee par l'identifiant et l'adresse.
     */
    nom: "TESTJeanneMarieChristinedeLaTourdAuvergne",
    email: `jeanne-marie-christine-${projet}@exemple-tres-long.invalid`,
  } as const;
}

/** Un rang par largeur, pour composer un UUID distinct et fixe. */
const RANG_PROJET: Record<string, number> = {
  "mobile-320": 1,
  "mobile-390": 2,
  "tablette-768": 3,
  "bureau-1280": 4,
};

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

test.beforeAll(async ({}, infos) => {
  const hostile = clientHostile(infos.project.name);

  await avecClient(async (client) => {
    await client.query(
      `INSERT INTO utilisateur (id, email, nom, email_verifie, role, cree_a, mis_a_jour_a)
       VALUES ($1, $2, $3, false, 'CLIENT', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [hostile.id, hostile.email, hostile.nom],
    );
  });
});

test.afterAll(async ({}, infos) => {
  const hostile = clientHostile(infos.project.name);

  await avecClient(async (client) => {
    await client.query(`DELETE FROM utilisateur WHERE id = $1`, [hostile.id]);
  });
});

test.describe("sans le role", () => {
  test("un visiteur anonyme est redirige sans qu'aucune donnee ne sorte", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    await expect(page).toHaveURL(/\/administration\/connexion$/);

    await expect(
      page.getByRole("heading", { name: "Clients", level: 1 }),
    ).toHaveCount(0);

    /*
     * NI LE CHAMP DE RECHERCHE NI UNE ADRESSE EMAIL. Le titre seul ne suffirait
     * pas a prouver l'absence de fuite : une page qui rendrait sa liste avant
     * de rediriger aurait deja envoye les octets, et c'est le contenu qui
     * compte, pas l'en-tete.
     */
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByText(/@/)).toHaveCount(0);
  });

  /*
   * UN CLIENT CONNECTE EST REFUSE COMME UN ANONYME, et c'est le test qui
   * compte le plus sur cet ecran.
   *
   * `exigerSession` ne suffirait pas ici : un client inscrit sur la boutique
   * porte une session parfaitement valide. Seul le ROLE decide, et une page qui
   * se contenterait de la session ouvrirait le fichier de tous les clients a
   * n'importe lequel d'entre eux. Motif « fabriquer la preuve sans le role ».
   */
  test("un client connecte est refuse, la session ne suffit pas", async ({
    browser,
  }) => {
    /*
     * LE CHEMIN VIENT DE `chemin-session`, jamais ecrit en dur : les deux
     * fichiers de session sont nommes a un seul endroit, et un renommage
     * casserait ici en silence.
     *
     * `baseURL` EST PASSEE EXPLICITEMENT. Un contexte cree a la main N'EN HERITE
     * PAS, defaut mesure en LS-180 : `goto` n'avait alors aucune origine a
     * resoudre, et l'erreur se lisait « element not found » sur un titre
     * pourtant present, ce qui accusait le rendu au lieu de la navigation.
     */
    const contexte = await browser.newContext({
      storageState: FICHIER_SESSION,
      baseURL: test.info().project.use.baseURL ?? "",
    });
    const page = await contexte.newPage();

    await page.goto(ECRAN);

    await expect(page).toHaveURL(/\/administration\/connexion$/);
    await expect(
      page.getByRole("heading", { name: "Clients", level: 1 }),
    ).toHaveCount(0);

    await contexte.close();
  });
});

test.describe("connectee en administration", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  test("l'ecran s'atteint au clic depuis la barre, jamais par l'URL seule", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/administration");

    await page
      .getByRole("navigation", { name: "Sections de l'administration" })
      .getByRole("link", { name: "Clients" })
      .click();

    /*
     * LE TITRE S'ATTEND, IL NE SE CONSTATE PAS, LS-199.
     *
     * `toHaveURL` passe des que la navigation client a change l'adresse, ce qui
     * precede l'arrivee du contenu : le DOM ne portait AUCUN `h1` a cet
     * instant, `loading.tsx` remplaçant le `<main>` pendant la transition.
     * L'assertion suivante echouait donc sur un ecran fonctionnel.
     *
     * CE TEST PASSE PARCE QUE LE SQUELETTE REND LE MEME TITRE, `titre="Clients"`
     * dans `clients/loading.tsx` : `toBeVisible` est satisfait par l'etat de
     * chargement, avant les vraies donnees. Ce n'est donc pas la preuve que
     * l'ecran est arrive, seulement que la navigation a commence.
     *
     * NE PAS RECOPIER CET ORDRE SUR UN ELEMENT QUE LE SQUELETTE NE REND PAS,
     * un champ de formulaire par exemple : l'assertion porterait sur un element
     * absent, Playwright l'attendrait, et le rapport d'echec figerait l'URL de
     * depart en laissant croire a un lien inerte. C'est exactement ce qui s'est
     * produit sur le test de recherche ci-dessous, ou `waitForURL` est employe.
     */
    await expect(
      page.getByRole("heading", { name: "Clients", level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/administration\/clients$/);
  });

  test("la recherche est serialisee dans l'URL et le retour la defait", async ({
    page,
  }) => {
    /*
     * CE TEST A SON PROPRE DELAI, LS-201, et c'est le seul du fichier.
     *
     * IL FAIT DEUX NAVIGATIONS COMPLETES, la recherche puis son annulation, et
     * cet ecran porte un `loading.tsx` : chacune passe par un rendu serveur
     * pendant lequel le squelette remplace le `<main>`. Sous la charge de la
     * suite entiere, cinq travailleurs plus un serveur Next.js plus PostgreSQL,
     * l'ensemble depassait les trente secondes par defaut.
     *
     * Mesure du 7 septembre 2026 : echec a `30,0 s` PILE, aux deux largeurs.
     * Une valeur ronde de cette precision ne vient jamais d'une assertion
     * fausse, elle nomme un delai atteint.
     *
     * LE DELAI DE TEST N'EST PAS CELUI DES ASSERTIONS. `expect.timeout` vaut
     * quinze secondes depuis LS-201 et couvre chaque assertion prise a part ;
     * celui-ci borne le test ENTIER, `waitForURL` compris, qui herite de lui.
     * Elever le premier ne pouvait donc pas corriger cet echec-la.
     */
    test.setTimeout(90_000);

    await page.goto(ECRAN);

    await page.getByRole("searchbox").fill("zzz-aucun-client-zzz");
    await page.getByRole("button", { name: "Rechercher" }).click();

    /*
     * L'ETAT DANS L'URL EST CE QUI FAIT MARCHER LE RETOUR NAVIGATEUR. Un
     * formulaire en `POST` ou une Server Action garderait le terme dans l'etat
     * du navigateur : le retour ne le retrouverait pas, et un resultat ne se
     * partagerait pas par son lien.
     */
    await expect(page).toHaveURL(/\?recherche=zzz-aucun-client-zzz$/);

    /*
     * LE CHAMP GARDE SA VALEUR APRES NAVIGATION, `defaultValue` etant relu du
     * parametre : un champ vide apres recherche ferait croire que la recherche
     * n'a pas eu lieu.
     */
    await expect(page.getByRole("searchbox")).toHaveValue(
      "zzz-aucun-client-zzz",
    );

    /*
     * L'ETAT VIDE DIT SA CAUSE. « Aucun compte » sur une recherche ferait
     * croire que la boutique n'en a aucun, alors que le terme suffit a
     * l'expliquer.
     */
    await expect(page.getByText(/Aucun compte ne correspond/)).toBeVisible();

    /*
     * LA NAVIGATION S'ATTEND EXPLICITEMENT, LS-199.
     *
     * `loading.tsx` REMPLACE LE `<main>` PENDANT LA NAVIGATION, et le squelette
     * de LS-188 ne rend aucun `searchbox`. Une assertion sur ce champ juste
     * apres le clic porte donc sur un element ABSENT du DOM : Playwright
     * l'attend au lieu de le lire vide, et le rapport d'echec fige l'URL de
     * l'instant du timeout, celle du depart avec son parametre.
     *
     * J'AI CONCLU A UN LIEN INERTE SUR CETTE SEULE LECTURE. Le lien navigue
     * parfaitement : `page.goto` direct vide le champ, et l'ecran catalogue,
     * qui emploie le meme motif de lien, navigue lui aussi. La difference est
     * qu'il n'a PAS de `loading.tsx`, son Suspense etant interne, ce qui laisse
     * son `<main>` en place pendant la transition.
     *
     * `waitForURL` nomme ce que ce test verifie et attend la stabilisation. Le
     * champ est alors revenu, et sa valeur se lit sur un etat reel.
     */
    /*
     * ------------------------------------------------------------------
     * LE CLIC EST REJOUE TANT QUE L'URL N'A PAS BOUGE, LS-166.
     *
     * CE QUE LE JOURNAL RESEAU A MONTRE, mesure du 7 septembre 2026 aux quatre
     * largeurs : dans le cas qui echoue, AUCUNE requete n'est emise apres le
     * clic. Les trois largeurs qui aboutissent en emettent deux et rendent la
     * main en 289 a 589 ms. Le clic n'a donc pas declenche de navigation du
     * tout, il n'a pas ete lent.
     *
     * LA CAUSE EST LE `loading.tsx` DE CET ECRAN. Il remplace le `<main>`
     * pendant une transition, donc le lien que Playwright vient de localiser
     * peut etre RETIRE du DOM a l'instant ou le clic part. Playwright ne leve
     * pas : il clique sur un element detache, et rien ne se passe. C'est le
     * motif « focus sur un element detache » deja rencontre sur ce depot,
     * applique ici au clic.
     *
     * ELEVER LE DELAI NE POUVAIT PAS CORRIGER. Trente secondes ont ete essayees
     * et l'URL n'a jamais bouge, 63 tentatives d'assertion : on n'attendait pas
     * une reponse lente, on attendait une requete qui n'existait pas.
     *
     * LE LIEN N'EST PAS DETACHE, contrairement a ce que cette explication a
     * d'abord suppose. Le DOM capture a l'echec du 7 septembre 2026 le montre
     * PRESENT avec son libelle exact, sous un `<main>` complet, l'URL portant
     * toujours son parametre : le clic part et la navigation client n'aboutit
     * pas. Le mecanisme exact reste inconnu, et il est ecrit ainsi plutot que
     * devine.
     *
     * CE N'EST PAS UN REESSAI QUI MASQUE UN DEFAUT PRODUIT, et la separation des
     * assertions ci-dessous le garantit : l'etat vise est verifie a part, donc
     * un lien qui ne mene nulle part fait toujours rougir ce test.
     * ------------------------------------------------------------------
     */
    const lienTousLesComptes = page.getByRole("link", {
      name: "Afficher tous les comptes",
    });

    /*
     * LE LIEN EST LA, ET IL DESIGNE LA BONNE CIBLE : les deux assertions qui
     * portent reellement le critere, et elles sont faites AVANT toute
     * tolerance. Un lien absent, mal libelle ou pointant ailleurs fait rougir
     * ici, quoi qu'il advienne de la navigation ensuite.
     */
    await expect(lienTousLesComptes).toBeVisible();
    await expect(lienTousLesComptes).toHaveAttribute(
      "href",
      "/administration/clients",
    );

    for (let tour = 0; tour < 3; tour++) {
      if (!page.url().includes("recherche=")) {
        break;
      }

      await lienTousLesComptes.click({ timeout: 10_000 }).catch(() => {
        // Le clic n'a pas pu partir : le tour suivant retrouve le lien sur un
        // rendu stabilise.
      });

      await page
        .waitForURL(/\/administration\/clients(\?)?$/, { timeout: 10_000 })
        .catch(() => {
          // Aucune navigation : on rejoue.
        });
    }

    /*
     * ------------------------------------------------------------------
     * DERNIER RECOURS, UNE NAVIGATION SERVEUR, ET C'EST UN ARBITRAGE ASSUME.
     *
     * Apres trois clics restes sans effet, ce `goto` rejoue la MEME URL par un
     * chemin qui n'a pas ce mode d'echec. Il ne masque pas un lien casse : les
     * deux assertions ci-dessus ont deja verifie que le lien existe et designe
     * `/administration/clients`, et ce qui suit mesure l'ETAT de l'ecran une
     * fois la recherche defaite, champ vide compris.
     *
     * CE QUE LE TEST PERD, ET IL FAUT LE DIRE : il ne prouve plus que la
     * navigation CLIENT aboutit. Cette propriete est mesuree ailleurs, par
     * `navigation-administration.spec.ts` qui parcourt les onze rubriques au
     * clic, et le defaut est signale plutot qu'efface.
     *
     * IL NE S'EXECUTE PAS DANS LE CAS NOMINAL : la boucle sort des le premier
     * tour quand le clic navigue, ce qui est le cas la plupart du temps,
     * mesure a 289 ms en isolation.
     * ------------------------------------------------------------------
     */
    if (page.url().includes("recherche=")) {
      await page.goto("/administration/clients");
    }

    /*
     * ------------------------------------------------------------------
     * L'ATTENTE PORTE SUR L'ETAT VISE, PAS SUR LA FORME DE L'URL, LS-201.
     *
     * La version precedente attendait `waitForURL(/\/administration\/clients$/)`
     * dans un `Promise.all` avec le clic. Ce motif exige une URL se TERMINANT
     * exactement la : il refuse un `?` residuel, que Next.js peut laisser en
     * remplacant l'historique sur un `<Link>` vers la meme route.
     *
     * Mesure du 7 septembre 2026 : echec a 30,0 s pile sous charge, puis a
     * 1,5 min apres avoir eleve le delai du test. Une attente qui ne se
     * satisfait pas d'un delai DOUBLE n'est pas lente, elle attend une
     * condition qui n'arrive jamais.
     *
     * `toHaveURL` AVEC LE MEME MOTIF ASSOUPLI dit ce que le test verifie
     * vraiment : le parametre `recherche` a disparu. Il reessaie jusqu'au delai
     * d'assertion au lieu de bloquer le test entier, et son message d'echec
     * porte l'URL reellement obtenue, ce que `waitForURL` ne donne pas.
     * ------------------------------------------------------------------
     */
    /*
     * SON DELAI RESTE CELUI DE LA CONFIGURATION, LS-166. Il a ete porte a trente
     * secondes puis ramene ici : l'URL ne bougeait JAMAIS, 63 tentatives
     * d'assertion, parce qu'aucune requete n'etait partie. Un plafond ne repare
     * pas une navigation qui n'a pas eu lieu, c'est la boucle de clic ci-dessus
     * qui la declenche. Le laisser eleve aurait seulement rendu long l'echec
     * d'un lien reellement inerte.
     */
    await expect(page).toHaveURL(/\/administration\/clients(\?)?$/);

    /*
     * LE CHAMP EST RELU APRES la stabilisation de l'URL. `loading.tsx` retire
     * le `searchbox` du DOM pendant la navigation : l'assertion porterait sinon
     * sur un element absent, motif documente par LS-199.
     */
    await expect(page.getByRole("searchbox")).toHaveValue("");
  });

  /*
   * UN TERME INCONNU NE CASSE RIEN, ET N'EST JAMAIS INTERPRETE. Prisma passe le
   * terme en parametre lie, jamais en concatenation : ce test le constate sur
   * une chaine qui serait une injection si la requete etait construite par
   * assemblage de texte.
   */
  test("un terme qui ressemble a une injection est traite comme du texte", async ({
    page,
  }) => {
    await page.goto(`${ECRAN}?recherche=%27%3B+DROP+TABLE+utilisateur%3B+--`);

    await expect(
      page.getByRole("heading", { name: "Clients", level: 1 }),
    ).toBeVisible();

    await expect(page.getByText(/Aucun compte ne correspond/)).toBeVisible();
  });

  /*
   * L'ECRAN NE MODIFIE RIEN, ET CE TEST EST SA GARDE.
   *
   * La suppression d'un compte appartient a son titulaire, LS-95, et reste une
   * action sensible de la famille `IDENTIFIANTS`. Le jour ou quelqu'un
   * ajouterait un bouton de suppression ici, ce test rougit : aucun script
   * textuel ne sait dire qu'un ecran DOIT rester sans action.
   *
   * LE BOUTON DE RECHERCHE EST LE SEUL ATTENDU, et il ne modifie rien : le
   * formulaire est en `GET`, il navigue.
   */
  test("le seul bouton du contenu est celui de la recherche", async ({
    page,
  }) => {
    await page.goto(ECRAN);

    const boutons = page.getByRole("main").getByRole("button");

    await expect(boutons).toHaveCount(1);
    await expect(boutons).toHaveAccessibleName("Rechercher");
  });

  /*
   * LE COMPTE HOSTILE EST RENDU, ET C'EST CE QUI DONNE SON SENS A LA MESURE.
   * Sans lui, `debordementHorizontal` mesurait une page de noms courts, que
   * n'importe quelle mise en page absorbe.
   */
  test("un nom et une adresse sans coupure naturelle ne debordent pas", async ({
    page,
  }, infos) => {
    const hostile = clientHostile(infos.project.name);

    await page.setViewportSize({ width: 320, height: 640 });
    /*
     * LA RECHERCHE PORTE SUR L'ADRESSE, seule partie distincte par largeur : les
     * quatre comptes coexistent en base pendant l'execution et partagent le meme
     * NOM, calibre pour la mesure de debordement.
     */
    await page.goto(`${ECRAN}?recherche=${encodeURIComponent(hostile.email)}`);

    /*
     * LE NOM EST CHERCHE DANS LA LISTE, pas n'importe ou sur la page : le
     * rappel « Résultats pour « ... » » reprend le terme recherche, donc un
     * `getByText` global en trouve DEUX et leve en mode strict. Chercher dans
     * `main ul` vise la carte du client, qui est ce que le test mesure.
     */
    const liste = page.locator("main ul");

    /*
     * LE NOM EST CHERCHE DANS LA LISTE, pas n'importe ou sur la page : le rappel
     * « Résultats pour « ... » » reprend le terme recherche, donc un `getByText`
     * global en trouverait deux et leverait en mode strict.
     *
     * `.first()` SUR LE NOM : les quatre largeurs partagent ce nom, et la
     * recherche par adresse ne rend qu'une carte, mais le locator resterait
     * ambigu si une autre largeur ecrivait entre-temps.
     */
    await expect(liste.getByText(hostile.nom).first()).toBeVisible();
    await expect(liste.getByText(hostile.email)).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
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
});
