/**
 * Code de statut des deux ecrans de detail de l'administration, LS-188,
 * critere 5.
 *
 * ------------------------------------------------------------------
 * CE FICHIER COMBLE UN TROU, IL NE PROLONGE PAS UNE PROTECTION EXISTANTE.
 *
 * Le critere 5 de LS-188 demande que `pages-erreur.spec.ts` « continue de
 * verifier le code de statut des deux ecrans de detail ». Verification faite, il
 * ne l'a jamais fait : ce fichier couvre la 404 PUBLIQUE, et renvoie a
 * `fiche-produit.spec.ts` pour les 404 de fiche. Aucune spec d'administration
 * n'appelait `status()`, sur aucune route.
 *
 * Les deux ecrans de detail de l'administration n'avaient donc AUCUN test de
 * statut, et l'ecart est signale plutot que resolu en silence.
 * ------------------------------------------------------------------
 *
 * CE QUE CE FICHIER PROUVE ET QUE RIEN D'AUTRE NE PROUVE. LS-188 a place une
 * frontiere `<Suspense>` DANS ces deux pages. Une frontiere engage la reponse en
 * 200 des qu'un repli s'affiche : deplacer la garde d'existence sous elle ferait
 * passer les 404 en 200 SANS QUE RIEN NE CHANGE A L'ECRAN, la page rendue etant
 * identique dans les deux cas. Aucun test de rendu ne peut voir ce defaut.
 *
 * `verifier-chargement-administration.sh` ET `verifier-loading-et-404.sh` gardent
 * la meme frontiere PAR LE TEXTE, et aucun des trois ne remplace les autres :
 * les scripts attrapent les deux formes connues du defaut a l'ecriture, ce test
 * attrape le statut reel quelle qu'en soit la cause, y compris une cause que
 * personne n'a prevue.
 *
 * L'IDENTIFIANT EST UN UUID VALIDE QUI N'EXISTE PAS, et la nuance compte : la
 * page de commande distingue l'identifiant DIFFORME, qui passe par
 * `EntreeInvalideError`, de l'identifiant BIEN FORME mais absent, qui passe par
 * le `commande === null`. Les deux chemins menent a `notFound()` et les deux
 * sont couverts ici, sans quoi la moitie de la garde ne serait pas exercee.
 *
 * UNE SEULE LARGEUR. Ces tests lisent un code de statut HTTP, jamais un rendu :
 * les rejouer a trois largeurs triplerait la duree pour trois fois la meme
 * verification. Motif « plafond de debit et suite e2e », en fiche.
 */
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";

/**
 * UUID bien forme dont aucune ligne ne porte l'identifiant.
 *
 * IL DOIT ETRE VALIDE POUR QUE LE TEST MESURE CE QU'IL PRETEND. Un identifiant
 * difforme sortirait par le chemin `EntreeInvalideError` sur l'ecran de
 * commande, donc sans jamais atteindre la lecture en base : le test passerait au
 * vert en n'ayant exerce qu'une validation de format.
 */
const IDENTIFIANT_ABSENT = "3f2504e0-4f89-41d3-9a0c-0305e82c3399";

/** Identifiant volontairement difforme, l'autre chemin vers le meme 404. */
const IDENTIFIANT_DIFFORME = "pas-un-uuid";

test.describe("statut des ecrans de detail de l'administration", () => {
  /*
   * LA SESSION D'ADMINISTRATION EST INDISPENSABLE, et son absence rendrait ces
   * tests faux plutot qu'inutiles. Sans role, la garde redirige vers la
   * connexion AVANT toute lecture : la reponse serait alors une redirection,
   * jamais un 404, et le test passerait au vert sans avoir approche la frontiere
   * qu'il pretend garder.
   */
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  const CAS = [
    {
      intitule: "fiche produit, identifiant absent",
      chemin: `/administration/produits/${IDENTIFIANT_ABSENT}`,
    },
    {
      intitule: "detail de commande, identifiant absent",
      chemin: `/administration/commandes/${IDENTIFIANT_ABSENT}`,
    },
    {
      intitule: "detail de commande, identifiant difforme",
      chemin: `/administration/commandes/${IDENTIFIANT_DIFFORME}`,
    },
  ];

  for (const cas of CAS) {
    test(`${cas.intitule} rend un 404 reel et non un 200 habille`, async ({
      page,
    }, infos) => {
      test.skip(
        infos.project.name !== "mobile-320",
        "lit un code de statut, pas un rendu : une seule largeur suffit",
      );

      const reponse = await page.goto(cas.chemin);

      /*
       * LE STATUT EST LU SUR LA REPONSE, jamais deduit de ce que la page
       * affiche. C'est tout l'objet de ce fichier : le defaut de C32 rend
       * exactement la meme page, seul le code HTTP differe.
       */
      expect(reponse?.status()).toBe(404);
    });
  }
});
