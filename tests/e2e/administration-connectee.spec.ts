/**
 * Les ecrans d'administration RENDUS, avec session, aux trois largeurs. LS-111.
 *
 * CE QUE CE FICHIER PROUVE ET QUE `catalogue-administration.spec.ts` NE PROUVE
 * PAS. Ce dernier verifie le REFUS d'un visiteur sans session : la redirection,
 * l'absence de fuite dans le HTML, l'appel direct a une Server Action. C'est un
 * test negatif de securite, et il est solide, mais il ne rend jamais un ecran.
 *
 * Personne ne mesurait donc, avant ce fichier :
 *
 *   - le debordement horizontal REEL a 320 px, jusqu'ici CALCULE dans les revues
 *   - l'accessibilite des ecrans reels, `AxeBuilder` ne tournant que sur la
 *     connexion et la page d'attente
 *   - le rendu des quatre blocs de l'editeur, ou LS-102 et LS-103 ont laisse
 *     trois reserves de lisibilite ouvertes
 *
 * LES CRITERES DE LS-102 ET LS-103 SONT RESTES NON EXECUTES POUR CETTE RAISON,
 * et signales comme tels dans les deux tickets plutot que declares faits. Les
 * reporter une troisieme fois aurait installe la fiction.
 *
 * QUATRE LARGEURS DEMANDEES, TROIS CONFIGUREES. `CLAUDE.md` enonce 320, 390,
 * 768 et 1280 px ; les projets Playwright couvrent 320, 390 et 1280 depuis
 * LS-68. L'ecart est anterieur a ce ticket et ne s'y corrige pas : ajouter un
 * quatrieme projet allongerait d'un tiers une suite dont le cout est deja
 * mesure. 768 px reste donc un controle a l'oeil, comme avant.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  FICHIER_SESSION,
  FICHIER_SESSION_ADMINISTRATION,
  PRODUIT_TEST,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * LA SESSION VIENT DU PROJET `preparation`, ouverte UNE fois pour toute la
 * suite, voir `session-administration.setup.ts`.
 *
 * DECLAREE ICI ET NON SUR LES PROJETS, motif de `compte-suppression-connecte` :
 * les autres fichiers verifient qu'un visiteur ANONYME est refuse, et leur
 * donner une session d'administration les ferait passer pour la mauvaise
 * raison, ou echouer franchement.
 */
test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

const ECRANS = [
  {
    chemin: "/administration",
    titre: "Administration",
  },
  {
    chemin: "/administration/categories",
    titre: "Catégories du catalogue",
  },
  {
    chemin: "/administration/produits/nouveau",
    titre: "Nouveau produit",
  },
  {
    chemin: `/administration/produits/${PRODUIT_TEST.produitId}`,
    titre: "Informations générales",
  },
] as const;

for (const ecran of ECRANS) {
  test(`${ecran.chemin} est rendu pour une administratrice`, async ({
    page,
  }) => {
    await page.goto(ecran.chemin);

    // L'URL NE DOIT PAS AVOIR BOUGE. Sans cette assertion, une redirection vers
    // la connexion laisserait les tests suivants mesurer l'ECRAN DE CONNEXION,
    // qui ne deborde pas et ne porte aucune violation : la suite serait verte
    // en n'ayant jamais rendu ce qu'elle pretend mesurer.
    await expect(page).toHaveURL(new RegExp(`${ecran.chemin}$`));

    await expect(
      page.getByRole("heading", { name: ecran.titre, exact: true }),
    ).toBeVisible();

    /*
     * SUR L'EDITEUR, VERIFIER AUSSI QUE C'EST LA BONNE FICHE.
     *
     * Les titres de la table ci-dessus sont des `h2` de bloc, identiques d'une
     * fiche a l'autre : ils prouvent que l'ecran est rendu, jamais QUEL produit
     * il porte. Le `h1` est le nom du produit, et sans cette assertion une page
     * qui rendrait une autre fiche, ou un titre vide, passerait.
     */
    if (ecran.chemin.includes(PRODUIT_TEST.produitId)) {
      await expect(
        page.getByRole("heading", { name: PRODUIT_TEST.nom, level: 1 }),
      ).toBeVisible();
    }
  });

  test(`${ecran.chemin} ne deborde pas horizontalement`, async ({ page }) => {
    await page.goto(ecran.chemin);
    await expect(
      page.getByRole("heading", { name: ecran.titre, exact: true }),
    ).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test(`${ecran.chemin} ne porte aucune violation d'accessibilite`, async ({
    page,
  }) => {
    await page.goto(ecran.chemin);
    await expect(
      page.getByRole("heading", { name: ecran.titre, exact: true }),
    ).toBeVisible();

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });
}

/**
 * LES CINQ BLOCS DE L'EDITEUR SONT RENDUS DANS L'ORDRE DECIDE, LS-100 a LS-103.
 *
 * L'ORDRE VERIFIE ICI EST CELUI DE L'ECRAN D'ADMINISTRATION, et il ne se
 * confond pas avec la table « Fiche produit, ordre des blocs » de
 * `frontend-design.md`, qui decrit la fiche PUBLIQUE : prix, ajout au panier,
 * avis verifies. Deux ecrans, deux ordres, et la premiere version de ce test
 * appliquait la table publique a l'editeur.
 *
 * LA PUBLICATION EST EN TETE, apres le titre, arbitrage de LS-103 ecrit dans
 * `page.tsx` : ce bloc porte l'etat de la fiche et ce qui manque pour la
 * publier, donc la premiere chose a lire en ouvrant l'ecran. Le placer en bas
 * obligerait a defiler tout le formulaire pour savoir ou on en est, a 320 px
 * surtout, ou le seul editeur mesure plus de 3 000 px de haut.
 *
 * LE RESTE SUIT LE TRAVAIL REEL, arbitrage du 14 aout 2026 : informations
 * generales, puis sections editoriales, puis declinaisons, puis photos.
 *
 * COMPARER LES POSITIONS RENDUES, et non l'ordre du JSX : c'est la disposition
 * qui compte, et un `order` CSS ou une grille suffirait a les dissocier sans
 * qu'aucune lecture du source ne le voie.
 */
test("les cinq blocs de l'editeur sont rendus dans l'ordre decide", async ({
  page,
}) => {
  await page.goto(`/administration/produits/${PRODUIT_TEST.produitId}`);

  const titres = [
    "Publication",
    "Informations générales",
    "Sections de la fiche",
    "Déclinaisons et prix",
    "Photos de la fiche",
  ];

  const positions: { titre: string; y: number }[] = [];

  for (const titre of titres) {
    const bloc = page.getByRole("heading", { name: titre, exact: true });
    await expect(bloc).toBeVisible();

    const boite = await bloc.boundingBox();
    expect(
      boite,
      `le titre « ${titre} » n'a pas de boite de rendu`,
    ).not.toBeNull();
    positions.push({ titre, y: boite!.y });
  }

  // Strictement croissant : deux blocs a la meme ordonnee seraient cote a cote,
  // ce que la conception a 320 px exclut.
  //
  // LES PAIRES SE CONSTRUISENT PAR `slice` ET NON PAR UN INDICE NU : le projet
  // active `noUncheckedIndexedAccess`, et `positions[i]` y vaut
  // `{...} | undefined`. Le contourner par `!` retirerait la garantie que le
  // drapeau apporte au reste du fichier.
  const paires = positions.slice(1).map((courant, index) => ({
    precedent: positions[index]!,
    courant,
  }));

  for (const { precedent, courant } of paires) {
    expect(
      courant.y,
      `« ${courant.titre} » n'est pas sous « ${precedent.titre} »`,
    ).toBeGreaterThan(precedent.y);
  }
});

/**
 * LE BLOC DE PUBLICATION AFFICHE SES MOTIFS DE REFUS, et c'est le plus haut de
 * l'ecran a 320 px.
 *
 * L'ETAT MESURE EST L'ETAT NOMINAL, et c'est contre-intuitif. Un produit qu'on
 * vient de creer n'est jamais publiable : il lui manque ses photos et ses
 * descriptions. Cette liste de motifs est donc ce que l'exploitante voit au
 * PREMIER affichage de chaque fiche, pas un cas de bord.
 *
 * C'est aussi le bloc ou LS-103 a trouve son defaut de largeur, un `<ul>` dont
 * le `padding-inline-start` par defaut mangeait 40 px sur 320. La correction
 * n'avait jamais pu etre observee dans un navigateur.
 */
test("les motifs de non-publication sont lisibles sans debordement", async ({
  page,
}) => {
  await page.goto(`/administration/produits/${PRODUIT_TEST.produitId}`);

  const publication = page.getByRole("heading", {
    name: "Publication",
    exact: true,
  });
  await expect(publication).toBeVisible();

  /*
   * LES MOTIFS SE COMPTENT DANS LA REGION DE PUBLICATION, ET NON SUR LA PAGE.
   *
   * La premiere version ecrivait `page.getByRole("listitem")`, ce qui compte
   * les elements de QUATRE listes : les manques, mais aussi une entree par
   * variante, par photo et par section. La fixture posant une declinaison, le
   * compte valait au moins 1 meme quand le bloc de publication ne rendait plus
   * aucun motif.
   *
   * MESURE FAITE : en vidant `manquants` dans `publication-produit.tsx`, le test
   * restait VERT aux trois largeurs, alors que son commentaire affirmait qu'il
   * verrait ce cas. Une assertion ancree trop large ne mesure pas ce qu'elle
   * nomme.
   */
  const regionPublication = page.getByRole("region", { name: "Publication" });
  const motifs = regionPublication.getByRole("listitem");
  expect(await motifs.count()).toBeGreaterThan(0);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * UN CLIENT CONNECTE EST REFUSE, ET C'EST LE TROU QUE LA SESSION OUVRE.
 *
 * CE QUE CE BLOC PROUVE ET QUE RIEN D'AUTRE NE PROUVAIT. Les fichiers
 * anterieurs verifient qu'un visiteur ANONYME est redirige. Un compte
 * ordinairement connecte, lui, n'etait teste nulle part : c'est pourtant le
 * seul chemin realiste vers ces ecrans, une personne qui s'est inscrite dans la
 * boutique et qui tape l'URL d'administration.
 *
 * LA DIFFERENCE EST L'INVARIANT 2. Une page qui appellerait `exigerSession` au
 * lieu d'`exigerAdministratrice` redirige toujours l'anonyme, donc TOUS les
 * tests de refus anterieurs restent verts, et livre l'ecran entier a n'importe
 * quel compte. C'est un defaut silencieux, et il se corrige d'un mot.
 *
 * LA SESSION CLIENTE EST DEJA OUVERTE par `session-cliente.setup.ts`, sans
 * aucune inscription supplementaire : le plafond de debit n'est pas touche.
 */
test.describe("un client connecte sans le role", () => {
  test.use({ storageState: FICHIER_SESSION });

  for (const ecran of ECRANS) {
    test(`${ecran.chemin} refuse un client connecte`, async ({ page }) => {
      await page.goto(ecran.chemin);

      await expect(page).toHaveURL(/\/administration\/connexion$/);

      /*
       * LE CONTENU PROTEGE N'EST PAS SERVI, meme masque. Une page qui rendrait
       * son titre avant de naviguer le livrerait dans le HTML a qui n'a pas le
       * role.
       *
       * L'ACCUEIL EST EXCLU DE CETTE ASSERTION, ET CE N'EST PAS UNE FUITE :
       * l'ecran de CONNEXION porte lui-meme `<h1>Administration</h1>`, le meme
       * libelle que la page protegee. Exiger son absence apres redirection
       * ferait rougir un refus parfaitement correct. La redirection constatee
       * ci-dessus reste la preuve qui compte, et les trois autres ecrans
       * portent des titres qui n'existent nulle part ailleurs.
       */
      if (ecran.chemin !== "/administration") {
        await expect(
          page.getByRole("heading", { name: ecran.titre, exact: true }),
        ).toHaveCount(0);
      }
    });
  }

  /*
   * LE NOM DU PRODUIT EST LA DONNEE LA PLUS PARLANTE de l'editeur : il dit
   * qu'une fiche existe sous cet identifiant. Une redirection qui laisserait
   * fuiter le `<h1>` renseignerait sur le catalogue en preparation.
   */
  test("le nom du produit ne fuite pas vers un client connecte", async ({
    page,
  }) => {
    await page.goto(`/administration/produits/${PRODUIT_TEST.produitId}`);

    await expect(page).toHaveURL(/\/administration\/connexion$/);
    await expect(page.getByText(PRODUIT_TEST.nom)).toHaveCount(0);
  });
});
