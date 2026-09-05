/**
 * Echappement des donnees structurees, LS-137.
 *
 * POURQUOI CE FICHIER EXISTE. `DonneesStructurees` emploie
 * `dangerouslySetInnerHTML`, seul moyen d'ecrire un `<script type="ld+json">`
 * en React. Le contenu vient d'une saisie d'administration : un nom de produit.
 * Sans echappement, une saisie contenant `</script>` fermerait la balise au
 * milieu du JSON et laisserait le reste s'interpreter comme du balisage de
 * page. C'est une injection, par un chemin que le navigateur ouvre et que
 * `JSON.stringify` ne ferme pas.
 *
 * LE TEST PORTE SUR LA FONCTION DE SERIALISATION, pas sur le rendu React. La
 * garde est la, et un test de rendu n'ajouterait qu'une couche de bruit autour
 * de la meme assertion.
 *
 * LA FONCTION EST REEXPORTEE POUR CE TEST. Elle n'a pas d'autre appelant : la
 * rendre publique est le prix de sa verification, et le commentaire du module
 * le dit.
 */
import { describe, expect, it } from "vitest";

import { serialiserSansEchappement } from "@/components/donnees-structurees";

describe("serialiserSansEchappement", () => {
  it("rend un JSON relisable pour un contenu ordinaire", () => {
    const balisage = { "@type": "Product", name: "Collier Aurore" };
    expect(JSON.parse(serialiserSansEchappement(balisage))).toEqual(balisage);
  });

  /*
   * LE TEST CENTRAL. La sequence de fermeture ne doit jamais apparaitre
   * litteralement dans la sortie, sous aucune casse : le parseur HTML des
   * navigateurs cherche `</script` sans distinction de majuscules.
   */
  it("neutralise une sequence de fermeture de balise dans une valeur", () => {
    const sortie = serialiserSansEchappement({
      name: "Collier </script><img src=x onerror=alert(1)>",
    });

    expect(sortie.toLowerCase()).not.toContain("</script");
  });

  /*
   * ET LE VERSANT QUI COMPTE AUTANT : le balisage recu par les moteurs doit
   * etre INCHANGE. Un echappement qui protegerait en abimant la valeur
   * publierait un nom de produit deforme dans l'index.
   */
  it("preserve la valeur exacte apres relecture", () => {
    const nom = "Collier </script> Aurore";
    const relu = JSON.parse(serialiserSansEchappement({ name: nom })) as {
      name: string;
    };

    expect(relu.name).toBe(nom);
  });

  /*
   * TOUT CHEVRON OUVRANT EST ECHAPPE, et non la seule sequence `</script`.
   * Viser la sequence exacte laisserait passer `<\/script`, `<script` et les
   * variantes que les parseurs tolerent : echapper le caractere ferme la
   * famille entiere plutot qu'un de ses membres.
   */
  it("echappe tout chevron ouvrant, et pas seulement la balise script", () => {
    expect(serialiserSansEchappement({ name: "a < b" })).not.toContain("<");
  });

  it("echappe aussi un chevron dans une cle", () => {
    expect(serialiserSansEchappement({ "<cle>": "valeur" })).not.toContain("<");
  });
});
