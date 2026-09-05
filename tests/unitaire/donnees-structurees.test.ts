/**
 * Echappement des donnees structurees, LS-137.
 *
 * POURQUOI CE FICHIER EXISTE. Le contenu du bloc JSON-LD vient d'une saisie
 * d'administration : un nom de produit, une description. Une saisie contenant
 * `</script>` fermerait la balise au milieu du JSON et laisserait le reste
 * s'interpreter comme du balisage de page. C'est une injection, par un chemin
 * que le navigateur ouvre et que `JSON.stringify` ne ferme pas : il echappe les
 * guillemets et les antislashs, jamais les chevrons.
 *
 * ------------------------------------------------------------------
 * CE TEST MESURE LE RENDU, il ne raisonne pas sur le mecanisme.
 *
 * Ces assertions portent sur le HTML REELLEMENT RENDU, et non sur la fonction
 * d'echappement prise a part. Ce choix a paye immediatement.
 *
 * En passant le composant de `dangerouslySetInnerHTML` a un enfant texte, regle
 * C23, j'ai suppose que React echapperait le contenu comme il le fait partout
 * ailleurs. LA MESURE A DIT L'INVERSE : le rendu portait `{"<cle>":"<valeur>"}`
 * tel quel. Un `<script>` est du texte BRUT au sens de la specification HTML,
 * ou `&lt;` ne serait pas decode, et React suit la specification.
 *
 * L'echappement explicite est donc conserve, et c'est ce test qui l'a impose.
 * Tester la fonction seule aurait valide un mecanisme sans jamais verifier
 * qu'il s'applique la ou il compte.
 * ------------------------------------------------------------------
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DonneesStructurees } from "@/components/donnees-structurees";

/** Rend le composant et rend le HTML servi, tel qu'un navigateur le recevrait. */
function rendu(balisage: Record<string, unknown>): string {
  return renderToStaticMarkup(DonneesStructurees({ balisage }));
}

describe("DonneesStructurees", () => {
  it("rend un bloc JSON-LD relisable pour un contenu ordinaire", () => {
    const balisage = { "@type": "Product", name: "Collier Aurore" };
    const html = rendu(balisage);

    expect(html).toContain('type="application/ld+json"');

    const contenu = html
      .replace(/^<script[^>]*>/, "")
      .replace(/<\/script>$/, "");
    expect(JSON.parse(contenu)).toEqual(balisage);
  });

  /*
   * LE TEST CENTRAL. La sequence de fermeture ne doit jamais apparaitre
   * litteralement dans le HTML servi, sous aucune casse : le parseur des
   * navigateurs cherche `</script` sans distinction de majuscules.
   */
  it("neutralise une sequence de fermeture de balise dans une valeur", () => {
    const html = rendu({
      name: "Collier </script><img src=x onerror=alert(1)>",
    });

    /*
     * LA BALISE FERMANTE FINALE EST LA SEULE ATTENDUE. La compter plutot que
     * chercher son absence evite un test qui passerait sur un rendu vide.
     */
    const fermetures = html.toLowerCase().split("</script").length - 1;
    expect(fermetures).toBe(1);
    expect(html.toLowerCase().endsWith("</script>")).toBe(true);
  });

  /*
   * ET LE VERSANT QUI COMPTE AUTANT : le balisage recu par les moteurs doit
   * etre INCHANGE. Un echappement qui protegerait en abimant la valeur
   * publierait un nom de produit deforme dans l'index. Les moteurs lisent le
   * HTML decode, donc la valeur doit se retrouver apres decodage.
   */
  it("preserve la valeur exacte apres decodage HTML", () => {
    const nom = "Collier </script> Aurore";
    const html = rendu({ name: nom });

    /*
     * LE JSON EST RELU TEL QUEL, sans decodage d'entites HTML : le contenu
     * d'un `<script>` est du texte BRUT, React n'y pose aucune entite. C'est
     * `\\u003c` qui porte l'echappement, et tout parseur JSON le relit comme
     * le caractere d'origine.
     */
    const contenu = html
      .replace(/^<script[^>]*>/, "")
      .replace(/<\/script>$/, "");

    expect((JSON.parse(contenu) as { name: string }).name).toBe(nom);
  });

  /*
   * TOUT CHEVRON OUVRANT EST NEUTRALISE, et non la seule sequence `</script`.
   * Viser la sequence exacte laisserait passer les variantes que les parseurs
   * tolerent, `<!--` en particulier, qui ouvre le mode « script data double
   * escaped » du HTML et est le vecteur classique d'un filtre trop etroit.
   */
  it("neutralise aussi l'ouverture de commentaire HTML", () => {
    const html = rendu({ name: "a <!-- b" });
    expect(html).not.toContain("<!--");
  });

  /*
   * CETTE ASSERTION A ECHOUE SUR LA PREMIERE VERSION DU COMPOSANT, qui comptait
   * sur React pour echapper. Le rendu portait `{"<cle>":"<valeur>"}` tel quel :
   * un `<script>` est du texte brut au sens HTML, React n'y echappe rien. La
   * mesure a impose l'echappement explicite.
   */
  it("neutralise un chevron dans une cle comme dans une valeur", () => {
    const html = rendu({ "<cle>": "<valeur>" });

    const corps = html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    expect(corps).not.toContain("<");
  });
});
