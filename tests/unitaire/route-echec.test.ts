/**
 * La garde de la route qui echoue a dessein, LS-191.
 *
 * ------------------------------------------------------------------
 * CE QUE CE FICHIER EMPECHE, ET POURQUOI IL EXISTE.
 *
 * `src/app/administration/echec-rendu/page.tsx` leve volontairement, pour que
 * la suite de bout en bout traverse la vraie frontiere d'erreur. C'est le seul
 * moyen trouve de remplir le critere 6 de la story, qui refuse une frontiere
 * qu'aucun test n'a franchie.
 *
 * Une page qui leve a la demande est une porte ouverte si rien ne la ferme :
 * n'importe qui pourrait provoquer une erreur serveur a volonte, donc ecrire
 * dans le journal et mesurer le comportement du site en panne.
 *
 * SA GARDE EST UN DEFAUT FERME : sans `AUTORISER_ECHEC_RENDU`, la page appelle
 * `notFound()` AVANT de lever. Ce fichier verifie ce comportement, la suite de
 * bout en bout ne le pouvant pas : elle pose justement la variable.
 * ------------------------------------------------------------------
 *
 * TROIS CONTROLES POUR UNE SEULE GARDE, et ils ne se recouvrent pas.
 * Celui-ci exerce le COMPORTEMENT, sans serveur.
 * `scripts/verifier-route-echec.sh` garde l'ORDRE des deux instructions par le
 * texte, qu'aucune execution ne revele : une garde placee apres le `throw` ne
 * s'exprime jamais, la page ayant deja leve.
 * `tests/e2e/erreur-administration.spec.ts` traverse la frontiere pour de vrai.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * `notFound()` LEVE UNE ERREUR SPECIALE que Next.js intercepte plus haut. Elle
 * est remplacee par un marqueur reconnaissable : distinguer les deux sorties de
 * la page est tout l'objet de ce fichier, et une vraie erreur de Next.js
 * porterait un message qui pourrait changer d'une version a l'autre.
 */
const APPEL_NOT_FOUND = "NOT_FOUND_APPELE";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(APPEL_NOT_FOUND);
  },
}));

describe("route d'echec de rendu, sa garde", () => {
  let valeurInitiale: string | undefined;

  beforeEach(() => {
    valeurInitiale = process.env.AUTORISER_ECHEC_RENDU;
  });

  afterEach(() => {
    if (valeurInitiale === undefined) {
      delete process.env.AUTORISER_ECHEC_RENDU;
    } else {
      process.env.AUTORISER_ECHEC_RENDU = valeurInitiale;
    }
    vi.resetModules();
  });

  /**
   * Charge la page a neuf, la valeur d'environnement etant lue a l'appel.
   *
   * `resetModules` NE SUFFIRAIT PAS SEUL si la page lisait la variable au
   * niveau module : elle est lue DANS la fonction, ce qui est deliberé et rend
   * ce test possible.
   */
  async function rendrePage(): Promise<void> {
    vi.resetModules();
    /*
     * `page` ET NON `module` : ESLint interdit d'assigner cette variable, dont
     * Next.js se sert pour distinguer CommonJS d'un module ES.
     */
    const page = await import("@/app/administration/echec-rendu/page");
    await (page.default as () => Promise<unknown>)();
  }

  /*
   * LE CAS QUI COMPTE : la production, ou la variable n'est pas posee. La page
   * doit disparaitre, pas lever.
   */
  it("rend introuvable quand la variable est absente", async () => {
    delete process.env.AUTORISER_ECHEC_RENDU;

    await expect(rendrePage()).rejects.toThrow(APPEL_NOT_FOUND);
  });

  /*
   * TOUTE AUTRE VALEUR QUE « 1 » FERME AUSSI, ce qui distingue un defaut ferme
   * d'un defaut ouvert. Une garde ecrite `=== "0"` laisserait passer « true »,
   * « oui » et la chaine vide, c'est-a-dire presque tout.
   */
  it.each(["0", "", "true", "production"])(
    "rend introuvable pour la valeur %o",
    async (valeur) => {
      process.env.AUTORISER_ECHEC_RENDU = valeur;

      await expect(rendrePage()).rejects.toThrow(APPEL_NOT_FOUND);
    },
  );

  /*
   * ET ELLE LEVE QUAND ELLE DOIT, sans quoi la suite de bout en bout ne
   * traverserait plus rien tout en restant verte : ses assertions porteraient
   * alors sur une page 404, qui n'a ni barre ni message d'erreur.
   */
  it("leve quand la variable vaut exactement 1", async () => {
    process.env.AUTORISER_ECHEC_RENDU = "1";

    await expect(rendrePage()).rejects.toThrow(/Echec de rendu provoque/);
  });
});
