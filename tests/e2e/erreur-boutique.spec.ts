/**
 * LA FRONTIERE D'ERREUR DE LA BOUTIQUE PUBLIQUE, LS-125.
 *
 * CE QU'ELLE COUVRE, ET QUE RIEN N'EPROUVAIT. `(boutique)/error.tsx` rattrape
 * depuis LS-146 le panier, le tunnel, la confirmation de commande et l'espace
 * client, c'est-a-dire tous les ecrans publics qui n'ont pas leur propre
 * frontiere. Elle n'avait AUCUN test, quand son jumeau d'administration en a un
 * depuis LS-191.
 *
 * POURQUOI UNE RELECTURE NE SUFFIT PAS. Un `error.tsx` peut exister, etre juste,
 * et ne jamais s'afficher : il ne rattrape que ce qui leve SOUS lui dans
 * l'arbre, et une frontiere plus proche gagne. Trois ecrans portent deja la
 * leur, catalogue, fiche produit et contact. Rien ne disait que les autres
 * tombaient bien sur celle du groupe plutot que sur la page generique de
 * Next.js, en anglais et sans navigation.
 *
 * LE TICKET LS-125 EST LARGEMENT PERIME, et c'est pourquoi ce fichier ne suit
 * pas ses quatre criteres a la lettre. Ecrit le 25 aout sur une page STATIQUE,
 * il demandait un `error.tsx` que LS-146 a livre trois semaines plus tard, un
 * `loading.tsx` conditionnel a une dynamicite que LS-118 a apportee, et un 404
 * sur un jeton que cette page n'emploie pas. Motif « livrable depasse par le
 * code », en fiche.
 *
 * CE QUI RESTAIT REELLEMENT OUVERT est la MESURE : le contrôle existait, sa
 * portee n'avait jamais ete verifiee.
 *
 * `/echec-rendu` EST UNE PAGE QUI LEVE A DESSEIN, ouverte par la seule variable
 * `AUTORISER_ECHEC_RENDU` que `playwright.config.ts` pose. Elle rend 404 partout
 * ailleurs, ce que ce fichier NE PEUT PAS verifier : la variable y est justement
 * posee. Un test unitaire s'en charge, comme pour son jumeau.
 *
 * UNE SEULE LARGEUR POUR LA PLUPART DES ASSERTIONS. Elles lisent du texte et des
 * roles, jamais un rendu : les rejouer a quatre largeurs quadruplerait la duree
 * pour quatre fois la meme verification. Motif « plafond de debit et suite
 * e2e », en fiche.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

const ECRAN_QUI_ECHOUE = "/echec-rendu";

test.describe("frontiere d'erreur de la boutique", () => {
  /*
   * LE TEST CENTRAL. Sans cette frontiere, une erreur de rendu du panier ou du
   * tunnel remonte a `app/global-error.tsx`, qui REMPLACE le layout racine : le
   * visiteur perd l'en-tete et le pied, donc tout moyen d'aller ailleurs sans
   * saisir une URL, au moment precis ou il essayait d'acheter.
   */
  test("l'erreur publique rend un message situe et deux sorties", async ({
    page,
  }) => {
    await page.goto(ECRAN_QUI_ECHOUE);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    /*
     * DEUX SORTIES PLUTOT QU'UNE, forme voulue par LS-146 : reessayer, parce
     * qu'une panne de base est souvent breve, et revenir au catalogue, parce
     * qu'un echec repete doit laisser partir sans impasse.
     */
    await expect(
      page.getByRole("button", { name: /Réessayer/i }),
    ).toBeVisible();

    /*
     * LE LIBELLE EST « Voir les creations » ET NON « catalogue », mesure sur le
     * composant plutot que suppose : mon premier jet cherchait le mot de la
     * ROUTE, `/catalogue`, la ou l'ecran parle la langue de la boutique. Le
     * test rougissait sur un code parfaitement sain.
     */
    await expect(
      page.getByRole("link", { name: /Voir les créations/i }),
    ).toBeVisible();
  });

  /*
   * L'EN-TETE SURVIT A L'ERREUR, ET C'EST CE QUI DISTINGUE CETTE FRONTIERE DE
   * `global-error.tsx`. Elle vit SOUS le layout du groupe : si elle remontait
   * au-dessus, aucun element du layout ne serait rendu.
   *
   * LE LIEN D'EVITEMENT EST LA PREUVE LA PLUS SURE. Il est pose par
   * `EnTeteBoutique`, donc sa presence dit que le layout a bien ete rendu,
   * alors qu'un titre pourrait venir de la page d'erreur elle-meme.
   */
  test("l'en-tete de la boutique survit a une erreur de rendu", async ({
    page,
  }) => {
    await page.goto(ECRAN_QUI_ECHOUE);

    await expect(
      page.getByRole("link", { name: /Aller au contenu/i }),
    ).toBeAttached();
  });

  /*
   * AUCUN DETAIL TECHNIQUE N'ATTEINT LA PAGE, invariant 9. Le message de
   * l'erreur provoquee contient « LS-125 » et « Echec de rendu provoque » : les
   * chercher dans le HTML servi prouve qu'ils n'y sont pas, la ou une relecture
   * du composant ne dirait rien de ce que Next.js ajoute autour.
   */
  test("l'erreur publique n'expose aucun detail technique", async ({
    page,
  }) => {
    await page.goto(ECRAN_QUI_ECHOUE);

    const contenu = await page.content();

    expect(contenu).not.toContain("Echec de rendu provoque");
    expect(contenu).not.toContain("LS-125");
    expect(contenu).not.toContain("stack");
  });

  test("l'erreur publique ne deborde pas horizontalement", async ({ page }) => {
    await page.goto(ECRAN_QUI_ECHOUE);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test("l'erreur publique ne porte aucune violation d'accessibilite", async ({
    page,
  }) => {
    await page.goto(ECRAN_QUI_ECHOUE);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });
});
