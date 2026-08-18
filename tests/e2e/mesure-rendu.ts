/**
 * Mesures de rendu partagees par la suite de bout en bout. LS-112.
 *
 * UN MODULE A PART, comme `chemin-session.ts` : Playwright refuse qu'un fichier
 * de test en importe un autre, « should not import test file ». Ce module n'en
 * est pas un.
 *
 * POURQUOI IL EXISTE. Chaque fichier de test portait sa propre copie de la
 * mesure, et cette copie etait FAUSSE. La duplication a fait vivre le defaut
 * dans six fichiers pendant trois stories, LS-68, LS-81 et LS-89, dont les
 * criteres d'acceptation s'appuyaient dessus.
 */

/**
 * Debordement horizontal de la page, en pixels au-dela de la zone visible.
 *
 * CE QU'ELLE CORRIGE, ET QUI A ETE MESURE. La version employee jusqu'a LS-112
 * comparait `scrollWidth` a `clientWidth` sur `documentElement`. Elle est
 * AVEUGLE : un `<div>` de 800 px insere dans l'editeur de fiche produit
 * s'etendait jusqu'a 816 px sur un viewport de 320, et `scrollWidth` rendait
 * quand meme 320. Les 131 tests d'alors restaient verts.
 *
 * LA RAISON tient au modele de defilement : un element en flux normal plus large
 * que son parent deborde visuellement, mais tant qu'aucun ancetre n'etablit de
 * contexte de defilement horizontal, la racine ne comptabilise pas ce
 * depassement. Le document ne « sait » pas qu'il deborde, la personne qui
 * regarde l'ecran, si.
 *
 * `getBoundingClientRect` echappe a cela : il rend la position REELLE apres mise
 * en page, transformations comprises.
 *
 * LES DEUX BORDS SONT MESURES, et non le seul bord droit comme en LS-111. Un
 * element dont le bord gauche est negatif, marge negative ou
 * `position: absolute; left: -Npx`, deborde et produit la meme barre de
 * defilement. Le nom des tests dit « ne deborde pas horizontalement » : la
 * mesure doit tenir cette promesse, pas la moitie.
 *
 * LES ELEMENTS MASQUES SONT EXCLUS. Un panneau replie ou un menu ferme est
 * souvent pousse hors de l'ecran a dessein, et le compter ferait rougir un rendu
 * correct.
 *
 * CE QU'ELLE NE VOIT PAS, faute d'y descendre : un shadow DOM et une `<iframe>`.
 * Sans consequence tant que les ecrans restent en CSS natif, a reprendre si un
 * composant a racine fantome arrive.
 */
export async function debordementHorizontal(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(() => {
    const largeurVisible = document.documentElement.clientWidth;
    let depassement = 0;

    for (const element of document.querySelectorAll("*")) {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        element.getClientRects().length === 0
      ) {
        continue;
      }

      const boite = element.getBoundingClientRect();

      // A DROITE, ce qui depasse la zone visible. A GAUCHE, ce qui sort par
      // l'abscisse negative. Les deux produisent la meme barre de defilement, et
      // le maximum des deux dit de combien la page est trop large.
      depassement = Math.max(
        depassement,
        boite.right - largeurVisible,
        -boite.left,
      );
    }

    return depassement;
  });
}

/**
 * Tolerance en pixels sous laquelle un depassement n'est pas un defaut.
 *
 * UNE TOLERANCE ASSUMEE ET NON UN ARRONDI CACHE. La version de LS-111 arrondissait
 * la mesure avant de la comparer a zero, ce qui laissait passer 0,4 px sans que
 * rien ne le dise. Le seuil est ici nomme et cite par les tests.
 *
 * UN PIXEL, parce que la mise en page produit des fractions inevitables : une
 * bordure de 0,5 px, une largeur en pourcentage qui ne tombe pas juste, un
 * arrondi de sous-pixel du moteur de rendu. Aucun de ces cas ne fait defiler
 * lateralement. Un debordement REEL, lui, se compte en dizaines de pixels : le
 * defaut trouve en LS-111 en faisait 496, celui de LS-103 en faisait 40.
 */
export const TOLERANCE_DEBORDEMENT_PX = 1;
