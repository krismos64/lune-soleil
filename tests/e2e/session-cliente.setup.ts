/**
 * Ouvre UNE session cliente pour toute la suite de bout en bout. LS-81, LS-89.
 *
 * POURQUOI CE PROJET DE PREPARATION EXISTE, ET LE DEFAUT QU'IL CORRIGE. Les
 * tests de l'ecran de suppression ont besoin d'une session, et aucun ecran de
 * connexion client n'existe encore, LS-54. La premiere version s'inscrivait
 * depuis les tests eux-memes, ce qui a produit un defaut plus grave que celui
 * qu'elle mesurait :
 *
 *   - `/sign-up/email` est plafonne a trois appels par minute et par adresse IP,
 *     et Better Auth tient EN PLUS un compteur global par IP, LS-92
 *   - les trois projets de largeur s'inscrivaient chacun dans la meme minute
 *   - le compteur ainsi consomme faisait rendre 429 a un test VOISIN,
 *     `connexion-administration`, qui attend un 401 sur un identifiant faux
 *
 * Mesure faite : ce test passe sans ce fichier, echoue avec sa premiere
 * version. Un fichier de test qui fait rougir un AUTRE fichier est pire qu'un
 * test absent, la rougeur apparaissant loin de sa cause.
 *
 * L'INSCRIPTION A DONC LIEU UNE FOIS, dans un projet dont les trois largeurs
 * dependent. Un seul appel au total, avant que la moindre mesure commence.
 *
 * LE PLAFOND N'EST PAS DESACTIVE POUR AUTANT : le neutraliser en test retirerait
 * de la mesure une protection reelle, et la suite ne dirait plus rien du
 * comportement servi en production.
 */
import { expect, test as preparation } from "@playwright/test";

import { FICHIER_SESSION } from "./chemin-session";

const MOT_DE_PASSE = "phrase-de-passe-de-test1";

preparation("ouvrir une session cliente partagee", async ({ page }) => {
  const email = `e2e-suppression-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@exemple.test`;

  const reponse = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password: MOT_DE_PASSE, name: "Client de test" },
  });

  // ECHOUER ICI PLUTOT QUE DANS CHAQUE TEST. Les douze tests dependants sont
  // alors marques comme non executes, avec la vraie cause en tete de rapport,
  // au lieu d'echouer plus loin sur « le formulaire est introuvable ».
  expect(reponse.ok(), await reponse.text()).toBe(true);

  await page.context().storageState({ path: FICHIER_SESSION });
});
