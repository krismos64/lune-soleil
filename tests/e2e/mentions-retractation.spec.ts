/**
 * Les mentions de retractation sur le HTML reellement servi, LS-136.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE ALORS QUE LE CONTROLE TEXTUEL EST VERT.
 *
 * `verifier-mentions-retractation.sh` constate qu'un fichier source appelle
 * `MENTION_TUNNEL`. Il ne dit RIEN de ce que le client voit : entre l'appel et
 * l'ecran il y a une condition de rendu, une etape du tunnel, un composant
 * client qui ne s'hydrate pas. Une mention presente dans le code et jamais
 * rendue satisfait le controle et laisse l'obligation legale non remplie.
 *
 * Le cas n'est pas theorique sur ce depot : LS-134 avait livre un chemin de
 * retractation ecrit, teste et documente, dont aucun code n'emettait le jeton.
 * Motif « chemin annonce jamais branche », en fiche.
 * ------------------------------------------------------------------
 *
 * L'ENJEU. L'article L221-20 porte le delai de retractation a DOUZE MOIS quand
 * l'information est absente ou incorrecte, sur toutes les commandes
 * concernees. C'est le risque le plus couteux du parcours 5.
 *
 * UNE SEULE LARGEUR pour les assertions de texte, qui ne dependent pas du
 * rendu. La mesure a 320 px a sa propre assertion, la mention devant rester
 * lisible sur le plus petit ecran cible.
 */
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * Amene le tunnel jusqu'a son etape de recapitulatif, la seule qui porte la
 * mention.
 *
 * LE TUNNEL SERIALISE SON ETAPE DANS L'URL, `?etape=`, mais une garde interdit
 * d'y sauter sur une saisie vide : `etapeAtteignable` de LS-115 ramene a la
 * premiere etape incomplete. Il faut donc reellement remplir le tunnel, ce qui
 * est aussi ce que fait un client.
 *
 * LES LIBELLES VIENNENT DE `tunnel-commande.spec.ts` et non d'une lecture du
 * code : ce fichier connait deja le parcours exact, y compris l'attente
 * d'activation du bouton apres avoir coche un mode, fenetre invisible en local
 * qui a produit neuf echecs en integration continue le 25 aout 2026.
 */
async function allerAuRecapitulatif(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto(`/produit/${CATALOGUE_TEST.enStock.slug}`);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(
    page.getByRole("status", { name: "Ajout au panier" }),
  ).toHaveText("Ajouté au panier.");

  await page.goto("/commande");

  await page.getByLabel("Nom et prénom").fill("Camille Dupont");
  await page.getByLabel("Adresse email").fill("e2e-ls136@exemple.test");
  await page.getByRole("button", { name: "Continuer" }).click();

  /*
   * L'ORDRE EST COORDONNEES, ADRESSE, PUIS LIVRAISON. Je l'avais inverse a la
   * premiere ecriture, et les quatre tests echouaient en attendant un bouton
   * radio que l'etape courante ne rendait pas. L'ordre se lit dans `ETAPES` de
   * `commande/page.tsx`, jamais de memoire.
   */
  await page.getByLabel("Adresse", { exact: true }).fill("12 rue des Ateliers");
  await page.getByLabel("Code postal").fill("35000");
  await page.getByLabel("Ville").fill("Rennes");
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByRole("radio", { name: "À domicile" }).check();
  await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(
    page.getByRole("heading", { name: "Votre droit de rétractation" }),
  ).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test.describe("emplacement 1, avant la validation de la commande", () => {
  /*
   * ------------------------------------------------------------------
   * LE TEST CENTRAL DE LA STORY.
   *
   * Au 5 septembre 2026, avant LS-136, le tunnel ne portait AUCUNE occurrence
   * du mot « retractation ». Les conditions generales en portaient six, ce qui
   * ne suffit pas : l'article L221-23 exige l'information AVANT la validation,
   * « pas seulement dans les conditions generales que personne ne lit ».
   * ------------------------------------------------------------------
   */
  test("le récapitulatif annonce le droit de rétractation", async ({
    page,
  }) => {
    await allerAuRecapitulatif(page);

    const contenu = await page.locator("main").innerText();

    expect(contenu).toMatch(/rétractation/i);
    expect(contenu).toMatch(/quatorze jours/i);
    expect(contenu).toMatch(/réception/i);
  });

  /*
   * SANS CETTE MENTION, LES FRAIS DE RETOUR REVIENNENT AU VENDEUR, article
   * L221-23, la charge de la preuve pesant sur lui. Elle porte la decision
   * commerciale du 28 juillet 2026, LS-27.
   */
  test("le récapitulatif annonce les frais de retour à la charge du client", async ({
    page,
  }) => {
    await allerAuRecapitulatif(page);

    const contenu = await page.locator("main").innerText();
    expect(contenu).toMatch(/frais de retour/i);
    expect(contenu).toMatch(/à votre charge/i);
  });

  /*
   * ELLE PRECEDE LE BOUTON, et ce n'est pas une preference de mise en page :
   * « avant la validation » est le texte de l'obligation. Une mention placee
   * apres le bouton serait lue apres l'engagement, donc trop tard.
   *
   * LA POSITION SE MESURE SUR LE DOM RENDU, par comparaison d'ordonnees : une
   * assertion sur l'ordre du code source ne dirait rien d'une mise en page qui
   * remonterait le bouton.
   */
  test("la mention précède le bouton de commande, pas l'inverse", async ({
    page,
  }) => {
    await allerAuRecapitulatif(page);

    const mention = page.getByText(/frais de retour/i).first();
    const bouton = page.getByRole("button", {
      name: /obligation de paiement/i,
    });

    const boiteMention = await mention.boundingBox();
    const boiteBouton = await bouton.boundingBox();

    expect(boiteMention, "la mention n'est pas rendue").not.toBeNull();
    expect(boiteBouton, "le bouton n'est pas rendu").not.toBeNull();
    expect(boiteMention!.y).toBeLessThan(boiteBouton!.y);
  });
});

test.describe("emplacement 2, conditions générales", () => {
  test("les conditions générales portent le droit et les frais de retour", async ({
    page,
  }) => {
    await page.goto("/informations-legales");

    const contenu = await page.locator("main").innerText();
    expect(contenu).toMatch(/rétractation/i);
    expect(contenu).toMatch(/frais de retour/i);
    expect(contenu).toMatch(/à votre charge/i);
  });
});

test.describe("rendu à 320 px", () => {
  /*
   * LA MENTION DOIT RESTER LISIBLE SUR LE PLUS PETIT ECRAN CIBLE. Une mention
   * legale qui deborde hors du viewport est illisible, donc non delivree :
   * l'obligation porte sur l'information recue, pas sur sa presence dans le
   * DOM.
   */
  test("le récapitulatif ne déborde pas à 320 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await allerAuRecapitulatif(page);

    await expect(page.getByText(/frais de retour/i).first()).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });
});
