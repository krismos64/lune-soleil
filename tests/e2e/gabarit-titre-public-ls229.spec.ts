/**
 * Le gabarit de titre du perimetre PUBLIC, LS-229.
 *
 * POURQUOI UN SECOND FICHIER PLUTOT QUE D'ETENDRE CELUI DE LS-228. Les ecrans
 * d'ici s'atteignent SANS session, et c'est le coeur du sujet : ce sont les
 * `test.use({ storageState })` de l'autre fichier qui feraient echouer ces
 * cas-la, ou pire, les feraient passer pour la mauvaise raison. Un visiteur
 * connecte ne voit jamais `/compte/connexion`, il est redirige.
 *
 * CE QUE LE CONTROLE TEXTUEL NE PEUT PAS VOIR. `verifier-gabarit-titre.sh` lit
 * des regles CSS et verifie que la regle globale existe. Il ne rend pas une
 * page : il ne verra jamais qu'une specificite inattendue, une cascade ou un
 * ordre de chargement l'a neutralisee. Le defaut d'origine se mesurait
 * precisement par `getComputedStyle`, motif « controle textuel et test
 * d'execution » deja en fiche.
 *
 * LES QUATRE LARGEURS SONT DANS LA MEME ASSERTION QUE LE DEBORDEMENT. Un titre
 * plus grand est exactement ce qui pousse un ecran hors cadre a 320 px : les
 * separer laisserait passer une regression ou le serif est bien pose ET la page
 * deborde. C'est la lecon de LS-228, reprise telle quelle.
 *
 * DEUX FAMILLES D'ECRANS Y SONT MELANGEES A DESSEIN :
 *
 *   - les pages publiques, qu'aucun layout ne pouvait couvrir,
 *     `(boutique)/layout.tsx` rendant un fragment sans conteneur
 *   - les portes d'entree, connexion et inscription, qui vivent pourtant SOUS
 *     des dossiers couverts mais dont le layout sort avant le gabarit faute de
 *     session
 *
 * Les separer ferait croire a deux defauts distincts, quand c'est le meme :
 * une regle dont la portee est plus etroite que le defaut qu'elle vise.
 */
import { expect, test } from "@playwright/test";

import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * La premiere fonte de la pile `--ls-police-titre`, la valeur que le navigateur
 * retient. C'est exactement ce qui disait `system-ui` sur la production le
 * 14 septembre 2026, sur la TOTALITE des titres publics.
 */
const SERIF_ATTENDU = "Iowan Old Style";

/**
 * Les quatre largeurs de l'invariant 10 du projet, conception a partir de
 * 320 px. 320 est celle qui attrape le debordement, 1280 celle ou le gabarit a
 * deux panneaux est au plus large.
 */
const LARGEURS = [320, 390, 768, 1280] as const;

/**
 * Pages publiques. `/catalogue` y figure bien qu'il rende son etat vide en
 * l'absence de produits : son TITRE est mesurable, et c'est tout ce que ce test
 * juge. Les cartes produit, elles, attendent LS-23 et LS-24.
 */
const PAGES_PUBLIQUES = [
  "/",
  "/catalogue",
  "/aide",
  "/contact",
  "/panier",
  "/informations-legales",
];

/**
 * Les portes d'entree, atteintes sans session.
 *
 * `/administration/connexion` porte un `h1` NU, sans aucune classe, et c'est
 * precisement pourquoi il est ici : une regle ancree sur `.titre` ne l'aurait
 * jamais couvert, meme raison que les quatre ecrans nus de LS-228.
 */
const PORTES_ENTREE = [
  "/compte/connexion",
  "/compte/inscription",
  "/administration/connexion",
];

async function verifierTitre(
  page: import("@playwright/test").Page,
  chemin: string,
  largeur: number,
): Promise<void> {
  await page.setViewportSize({ width: largeur, height: 800 });
  await page.goto(chemin);

  const titre = page.locator("main h1").first();
  await expect(titre).toBeVisible();

  const police = await titre.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(police, `police du titre de ${chemin} a ${largeur}px`).toContain(
    SERIF_ATTENDU,
  );

  const debordement = await debordementHorizontal(page);
  expect(
    debordement,
    `debordement de ${chemin} a ${largeur}px`,
  ).toBeLessThanOrEqual(TOLERANCE_DEBORDEMENT_PX);
}

test.describe("Gabarit de titre, pages publiques", () => {
  for (const chemin of PAGES_PUBLIQUES) {
    for (const largeur of LARGEURS) {
      test(`le titre de ${chemin} rend en serif a ${largeur}px`, async ({
        page,
      }) => {
        await verifierTitre(page, chemin, largeur);
      });
    }
  }
});

test.describe("Gabarit de titre, portes d'entree sans session", () => {
  for (const chemin of PORTES_ENTREE) {
    for (const largeur of LARGEURS) {
      test(`le titre de ${chemin} rend en serif a ${largeur}px`, async ({
        page,
      }) => {
        await verifierTitre(page, chemin, largeur);
      });
    }
  }
});

/**
 * LE PANNEAU N'EXISTE PAS SOUS 768 px, ET CE SENS COMPTE AUTANT QUE L'AUTRE.
 *
 * Un panneau qui resterait affiche a 320 px ecraserait le formulaire a une
 * colonne inutilisable. Le test mesure donc les DEUX cotes de la bascule, 767
 * et 768, plutot qu'une seule largeur commode.
 */
test.describe("Panneau visuel des portes d'entree", () => {
  for (const chemin of PORTES_ENTREE) {
    test(`le panneau de ${chemin} n'apparait qu'au-dela de 768px`, async ({
      page,
    }) => {
      await page.goto(chemin);

      /*
       * LE SUFFIXE `__panneau` EST EXACT, ET C'EST INDISPENSABLE. Cinq classes
       * du module partagent le prefixe `panneau-authentification`, dont
       * `gabarit`, qui reste VISIBLE a 767 px. Un selecteur large suivi d'un
       * `.first()` aurait donc rendu ce test vert pour la mauvaise raison.
       */
      const panneau = page.locator('[class$="__panneau"]').first();

      await page.setViewportSize({ width: 767, height: 800 });
      await expect(
        panneau,
        `le panneau de ${chemin} doit etre absent a 767px`,
      ).toBeHidden();

      await page.setViewportSize({ width: 768, height: 800 });
      await expect(
        panneau,
        `le panneau de ${chemin} doit apparaitre a 768px`,
      ).toBeVisible();
    });
  }
});
