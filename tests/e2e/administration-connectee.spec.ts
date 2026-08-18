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
import { expect, test, type Page } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION, PRODUIT_TEST } from "./chemin-session";

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

/**
 * Mesure le debordement horizontal, en pixels au-dela du bord droit.
 *
 * MESURE ET NON CALCULE, c'est tout l'objet du ticket. Une revue qui additionne
 * des paddings et des largeurs de police raisonne sur le CSS ecrit ; celle-ci
 * lit ce que le moteur de rendu a REELLEMENT dispose, marges de defilement et
 * mots insecables compris. Le defaut de LS-103, un `<ul>` qui mangeait 40 px a
 * 320 px, venait exactement de la ou le calcul ne regardait pas.
 *
 * ELLE PARCOURT LES ELEMENTS, ET NON `documentElement.scrollWidth`. La premiere
 * version comparait `scrollWidth` a `clientWidth` sur la racine, comme le font
 * les quatre fichiers de test anterieurs, et une mutation a prouve qu'elle ETAIT
 * AVEUGLE : un `<div>` de 800 px insere dans l'editeur s'etendait jusqu'a 816 px
 * sur un viewport de 320, et `scrollWidth` rendait quand meme 320. Les 131 tests
 * restaient verts.
 *
 * LA RAISON tient au modele de defilement : un element en flux normal plus large
 * que son parent deborde visuellement, mais tant qu'aucun ancetre n'etablit de
 * contexte de defilement horizontal, la racine ne comptabilise pas ce
 * depassement dans son `scrollWidth`. Le document ne « sait » pas qu'il deborde,
 * la personne qui regarde l'ecran, si.
 *
 * `getBoundingClientRect` echappe a cela : il rend la position REELLE apres mise
 * en page, transformations comprises. Le maximum des bords droits, moins la
 * largeur visible, donne le depassement effectif.
 *
 * LES ELEMENTS MASQUES SONT EXCLUS. Un panneau replie ou un menu ferme est
 * souvent pousse hors de l'ecran a dessein, et le compter ferait rougir un rendu
 * correct.
 */
async function debordementHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const largeurVisible = document.documentElement.clientWidth;
    let bordMaximal = largeurVisible;

    for (const element of document.querySelectorAll("*")) {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        element.getClientRects().length === 0
      ) {
        continue;
      }

      bordMaximal = Math.max(
        bordMaximal,
        element.getBoundingClientRect().right,
      );
    }

    return Math.round(bordMaximal - largeurVisible);
  });
}

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
  });

  test(`${ecran.chemin} ne deborde pas horizontalement`, async ({ page }) => {
    await page.goto(ecran.chemin);
    await expect(
      page.getByRole("heading", { name: ecran.titre, exact: true }),
    ).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
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

  // LE PRODUIT DE CONTROLE EST VOLONTAIREMENT INCOMPLET : une declinaison, ni
  // photo ni description. Au moins un motif doit donc apparaitre, et son absence
  // signifierait que la garde de publication ne s'evalue plus.
  const motifs = page.getByRole("listitem");
  expect(await motifs.count()).toBeGreaterThan(0);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
});
