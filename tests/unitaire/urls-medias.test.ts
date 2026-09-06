/**
 * URL publiques des medias, LS-187 et LS-192.
 *
 * ------------------------------------------------------------------
 * CE QUE CES TESTS GARDENT, ET POURQUOI AUCUN TEST NE LE GARDAIT AVANT.
 *
 * Sept ecrans construisaient ces URL a la main, sous deux formes dont une seule
 * pouvait etre juste. Aucun test ne les comparait, et la suite de bout en bout
 * ne pouvait pas les departager : la seule photographie du depot etait posee
 * PAR UNE FIXTURE, dans la forme qui arrangeait la boutique.
 *
 * Motif « chaine construite a l'execution » : `640.jpg` pour `640.jpeg` ne
 * faisait rougir aucune assertion, l'URL restant bien formee.
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from "vitest";

import {
  DECLINAISON_PAR_DEFAUT,
  srcSetMedia,
  urlMedia,
  urlVignette,
} from "@/integrations/medias/urls";
import { declinaisonsAttendues } from "@/integrations/medias/traitement";

/**
 * Un chemin tel que `publier()` peut REELLEMENT en rendre un.
 *
 * IL NE PORTE NI BARRE NI DOSSIER PARENT, et c'est le point de tous ces tests.
 * `exigerSegmentSimple` de `stockage.ts` impose `^[A-Za-z0-9][A-Za-z0-9._-]*$` :
 * `produits/abc/`, la forme que la fixture posait, est REFUSE a la publication.
 */
const CHEMIN = "a1b2c3d4e5f6";

describe("urlMedia", () => {
  it("pose exactement une barre entre le chemin et le nom de fichier", () => {
    expect(urlMedia(CHEMIN, "640.jpeg")).toBe(`/medias/${CHEMIN}/640.jpeg`);
  });

  /*
   * LES DEUX DEFAUTS MESURES EN HTTP LE 6 SEPTEMBRE 2026, chacun avec son code.
   * Les asserter separement nomme ce qui casse : une assertion unique sur
   * l'egalite dirait « ce n'est pas la bonne chaine » sans dire laquelle des
   * deux erreurs a ete commise.
   */
  it("ne colle pas le nom de fichier au chemin, qui rend 404", () => {
    expect(urlMedia(CHEMIN, "640.jpeg")).not.toContain(`${CHEMIN}640`);
  });

  it("ne produit aucune double barre, qui rend 308", () => {
    const url = urlMedia(CHEMIN, "640.jpeg");
    // Le `//` de `https://` n'existe pas ici, l'URL etant relative.
    expect(url).not.toContain("//");
  });

  /*
   * LE GARDE-FOU, que la boutique n'avait pas. Il leve a la CONSTRUCTION plutot
   * que de laisser servir une URL bien formee vers un fichier absent : le
   * defaut se voit alors a la premiere execution et non a la premiere visite.
   */
  it("leve sur une declinaison que le traitement ne produit pas", () => {
    expect(() => urlMedia(CHEMIN, "640.jpg")).toThrow(/640\.jpg/);
    expect(() => urlMedia(CHEMIN, "800.avif")).toThrow(/ADR-007/);
  });

  it("accepte toutes les declinaisons reellement produites", () => {
    for (const declinaison of declinaisonsAttendues()) {
      expect(() => urlMedia(CHEMIN, declinaison)).not.toThrow();
    }
  });
});

describe("urlVignette", () => {
  it("emploie la declinaison par defaut", () => {
    expect(urlVignette(CHEMIN)).toBe(urlMedia(CHEMIN, DECLINAISON_PAR_DEFAUT));
  });

  /*
   * LA DECLINAISON PAR DEFAUT DOIT EXISTER, et rien d'autre ne le verifie :
   * c'est une constante de ce module, pas une entree d'appelant. Retirer le
   * JPEG 640 d'ADR-007 casserait sept ecrans, et ce test le dirait.
   */
  it("repose sur une declinaison que le traitement produit", () => {
    expect(declinaisonsAttendues()).toContain(DECLINAISON_PAR_DEFAUT);
  });
});

describe("srcSetMedia", () => {
  it("enumere les largeurs dans l'ordre croissant avec leur descripteur", () => {
    expect(srcSetMedia(CHEMIN, "avif")).toBe(
      `/medias/${CHEMIN}/320.avif 320w, /medias/${CHEMIN}/640.avif 640w, /medias/${CHEMIN}/1280.avif 1280w`,
    );
  });

  /*
   * 1920 px EST PRODUIT MAIS ABSENT DES `srcSet`, et la distinction se perd
   * facilement : une carte de catalogue de 320 px n'a que faire d'une image de
   * 1920. Sans cette assertion, elargir le filtre passerait inapercu.
   */
  it("s'arrete a 1280 px, sans proposer le 1920 de la fiche produit", () => {
    expect(srcSetMedia(CHEMIN, "avif")).not.toContain("1920");
  });

  /*
   * LE JPEG S'ARRETE A 1280 px DANS ADR-007, donc son `srcSet` compte une
   * largeur de moins que les autres formats. Un `srcSet` derive des largeurs
   * SANS regarder les formats produits proposerait un `1920.jpeg` inexistant.
   */
  it("ne propose que des declinaisons reellement produites, JPEG compris", () => {
    for (const format of ["avif", "webp", "jpeg"] as const) {
      const noms = srcSetMedia(CHEMIN, format)
        .split(", ")
        .map((entree) => entree.split(" ")[0]?.split("/").pop());

      for (const nom of noms) {
        expect(declinaisonsAttendues()).toContain(nom);
      }
    }
  });
});
