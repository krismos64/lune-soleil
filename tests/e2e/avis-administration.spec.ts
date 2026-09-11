/**
 * La rubrique Avis de l'administration, LS-140 critere 2, LS-61 et LS-77.
 *
 * CE QUE CE FICHIER PROUVE ET QUE `administration-connectee.spec.ts` NE PROUVE
 * PAS. Ce dernier mesure le debordement et l'accessibilite de l'ecran, ce qui
 * est necessaire et ne dit rien du COMPORTEMENT : il restait vert sur les
 * QUATRE listes vides, c'est-a-dire sur un ecran ou ni carte d'avis, ni bouton
 * de decision, ni formulaire de cloture n'etait rendu.
 *
 * C'EST LE MOTIF DE LS-121, LS-130 ET LS-160, RENCONTRE UNE QUATRIEME FOIS.
 * `axe-core` ne voit que ce qui est rendu, et un contraste a 4,04:1 avait
 * echappe a la mesure faute d'une commande remboursee dans le jeu de donnees.
 * Les avis amorces par `commande.setup.ts` rendent enfin les branches pleines.
 *
 * LE TEST NEGATIF D'AUTORISATION EST ICI, et il compte autant que le reste : la
 * rubrique porte des donnees de clients et des decisions de moderation, un
 * visiteur ordinaire ne doit jamais l'atteindre.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  COMMANDE_AVIS_TEST,
  FICHIER_SESSION_ADMINISTRATION,
  FICHIER_SESSION,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * LE REFUS SE MESURE AVANT L'ACCES, et avec la session CLIENTE et non sans
 * session : une redirection vers la connexion prouverait seulement qu'il faut
 * etre connecte, jamais qu'il faut le ROLE. La session cliente est
 * authentifiee et depourvue du role, c'est le seul etat qui exerce la garde.
 */
test.describe("refus d'acces", () => {
  test.use({ storageState: FICHIER_SESSION });

  test("un client connecte sans role n'atteint pas la rubrique Avis", async ({
    page,
  }) => {
    await page.goto("/administration/avis");

    /*
     * LA REDIRECTION EST L'ASSERTION, PAS LE STATUT. `exigerAdministratrice`
     * leve, la page rattrape et redirige vers la connexion, qui repond 200 :
     * une assertion sur le code aurait donc echoue tout en decrivant un
     * comportement correct.
     */
    await expect(page).toHaveURL(/\/administration\/connexion/);

    /*
     * LE CONTENU EST VERIFIE EN PLUS DE L'URL, et c'est le sens qui compte. Une
     * redirection qui laisserait le corps de la page protegee dans la reponse
     * ferait fuir les commentaires de clients malgre l'URL affichee.
     */
    const texte = (await page.locator("body").textContent()) ?? "";

    expect(texte).not.toContain("TEST Commentaire en attente de relecture.");
    expect(texte).not.toContain("TEST Commentaire publié sur la fiche.");
  });
});

test.describe("rubrique connectee", () => {
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  /*
   * LA NAVIGATION AU CLIC N'EST PAS MESUREE ICI, ET C'EST DELIBERE.
   *
   * `navigation-administration.spec.ts` exerce les QUATORZE rubriques de la
   * barre depuis le 11 septembre 2026, Avis comprise : la refaire ici
   * dupliquerait l'assertion et son geste d'ouverture du panneau replie.
   *
   * ELLE N'Y ETAIT PAS AVANT CETTE DATE, et c'est ce qui a fait ecrire ce test
   * en double avant de le retirer : cinq rubriques sur quatorze n'etaient
   * cliquees par aucun test. Le sens 5 de
   * `verifier-navigation-administration.sh` garde desormais cette couverture.
   */

  /**
   * LA FILE DE RELECTURE PORTE L'AVIS EN ATTENTE, et ses deux gestes.
   *
   * LE COMPTE EST DANS LE TITRE, ce qui le rend verifiable : « À relire (0) »
   * et « À relire (1) » se distinguent, la seule presence du titre non.
   */
  test("l'avis en attente est a relire, avec ses deux decisions", async ({
    page,
  }) => {
    await page.goto("/administration/avis");

    await expect(
      page.getByRole("heading", { name: /À relire \([1-9]/ }),
    ).toBeVisible();

    await expect(
      page.getByText("TEST Commentaire en attente de relecture."),
    ).toBeVisible();

    /*
     * LES DEUX GESTES SONT OFFERTS ENSEMBLE. Un ecran qui n'offrirait que
     * « Publier » ferait de la relecture une formalite, et l'article D111-10
     * impose de pouvoir refuser un avis en le motivant.
     */
    await expect(
      page.getByRole("button", { name: "Publier" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refuser" }).first(),
    ).toBeVisible();
  });

  /**
   * L'AVIS PUBLIE EST DANS LES DECISIONS PRISES, jamais dans la file a relire.
   *
   * LES DEUX SENS SONT VERIFIES. Un test qui constaterait seulement sa presence
   * quelque part resterait vert si toute la liste basculait dans la mauvaise
   * section, ce qui ferait relire une seconde fois un avis deja publie.
   */
  test("l'avis publie figure dans les decisions prises", async ({ page }) => {
    await page.goto("/administration/avis");

    await expect(
      page.getByRole("heading", { name: /Décisions prises \([1-9]/ }),
    ).toBeVisible();

    const aRelire = page.locator("section", {
      has: page.getByRole("heading", { name: /À relire/ }),
    });

    await expect(
      aRelire.getByText("TEST Commentaire publié sur la fiche."),
    ).toHaveCount(0);
  });

  /**
   * LA FILE DES SIGNALEMENTS, article L111-7-2.
   *
   * ELLE ARRIVE EN `Suspense`, d'ou l'attente explicite sur son titre : une
   * assertion immediate mesurerait le squelette de chargement et non la liste.
   */
  test("le signalement a examiner est rendu avec sa cloture", async ({
    page,
  }) => {
    await page.goto("/administration/avis");

    await expect(
      page.getByRole("heading", { name: /Signalements à examiner \([1-9]/ }),
    ).toBeVisible();

    await expect(
      page.getByText(/Doute sur l'authenticité de cet avis/),
    ).toBeVisible();

    /*
     * LA QUALITE DECLAREE EST AFFICHEE. Elle ne prouve rien et n'autorise rien,
     * invariant 2, mais elle sert a l'exploitante pour juger : la masquer
     * reviendrait a lui demander de decider sans son element principal.
     */
    await expect(page.getByText("Responsable du produit")).toBeVisible();
  });

  test("la rubrique Avis ne deborde pas horizontalement", async ({ page }) => {
    await page.goto("/administration/avis");

    /*
     * L'ATTENTE PORTE SUR LA SECTION LA PLUS TARDIVE, celle qui arrive en
     * `Suspense`. Mesurer avant son arrivee mesurerait un ecran plus court que
     * celui qui est servi, et le debordement d'une carte de signalement
     * passerait inapercu.
     */
    await expect(
      page.getByRole("heading", { name: /Signalements à examiner/ }),
    ).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test("aucune violation d'accessibilite sur la rubrique Avis", async ({
    page,
  }) => {
    await page.goto("/administration/avis");

    await expect(
      page.getByRole("heading", { name: /Signalements à examiner/ }),
    ).toBeVisible();

    const resultats = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultats.violations).toEqual([]);
  });

  /**
   * LE PRODUIT NOTE EST NOMME SUR LA CARTE.
   *
   * Sans lui, l'exploitante devrait deviner de quelle piece parle l'avis
   * qu'elle relit, et un avis hors sujet, motif de refus prevu par le texte,
   * deviendrait indetectable a la lecture.
   */
  test("la carte d'avis nomme la piece concernee", async ({ page }) => {
    await page.goto("/administration/avis");

    await expect(
      page.getByText(COMMANDE_AVIS_TEST.libelleDeux).first(),
    ).toBeVisible();
  });
});
