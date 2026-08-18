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
 * TROIS DEPASSEMENTS SONT MESURES, et il a fallu les trois.
 *
 * 1. LE BORD DROIT, `right` au-dela de la largeur visible. C'est le seul que
 *    LS-111 retenait.
 *
 * 2. LE BORD GAUCHE, par l'abscisse negative. Un element tire vers la gauche,
 *    marge negative ou `left: -Npx`, produit la MEME barre de defilement. Le nom
 *    des tests dit « ne deborde pas horizontalement » : la mesure doit tenir
 *    cette promesse entiere, pas sa moitie droite.
 *
 * 3. LE CONTENU QUI DEBORDE DE SA BOITE, `scrollWidth` de l'element lui-meme.
 *    C'est une REGRESSION que la revue de LS-112 a trouvee : passer de
 *    `documentElement.scrollWidth` a `getBoundingClientRect` mesure la boite de
 *    l'ELEMENT, jamais celle de son CONTENU. Un texte en `white-space: nowrap`
 *    plus long que son bloc laisse la boite a 320 px pendant que le texte sort a
 *    365. Mesure faite sur la page d'attente : la mutation passait au VERT,
 *    quand l'ancienne mesure la voyait.
 *
 * Ce troisieme cas n'a rien de theorique ici : `frontend-design.md` cite
 * nommement `white-space: nowrap` sur texte variable et le nom de produit long
 * parmi les motifs a chercher a 320 px. La mesure censee les attraper leur etait
 * aveugle.
 *
 * LES ELEMENTS INVISIBLES SONT EXCLUS, et le filtre va plus loin que
 * `display: none`. Trois motifs courants produisent un element hors de l'ecran
 * sans qu'aucun defilement n'apparaisse, et les compter ferait rougir un rendu
 * correct :
 *
 *   - un enfant sous un ancetre en `overflow: hidden`, qui masque le depassement
 *   - un conteneur a DEFILEMENT assume, `overflow-x: auto`, ou le depassement
 *     interne est le comportement voulu et non un defaut de mise en page
 *   - la technique `sr-only` par `left: -9999px`, reservee aux lecteurs d'ecran
 *
 * Aucun n'existe dans `src/` aujourd'hui, verifie : zero `overflow` hors
 * `overflow-wrap`. La phase 3 en amenera avec ses tableaux de commandes, et le
 * filtre est ecrit maintenant plutot qu'apres le premier faux positif.
 *
 * CE QU'ELLE NE VOIT TOUJOURS PAS, faute d'y descendre : un shadow DOM et une
 * `<iframe>`. Sans consequence tant que les ecrans restent en CSS natif, a
 * reprendre si un composant a racine fantome arrive.
 */
export async function debordementHorizontal(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(() => {
    const largeurVisible = document.documentElement.clientWidth;

    /**
     * Un ancetre coupe-t-il ce qui deborde, ou le fait-il defiler ?
     *
     * Dans les deux cas le depassement de cet element ne produit aucune barre de
     * defilement sur la PAGE : il est soit invisible, soit contenu dans une zone
     * qui defile pour elle-meme. La racine est exclue de la remontee, son propre
     * `overflow` etant justement ce que la mesure interroge.
     */
    const contenuParUnAncetre = (element: Element): boolean => {
      let parent = element.parentElement;

      while (parent && parent !== document.documentElement) {
        const style = window.getComputedStyle(parent);
        if (style.overflowX !== "visible" || style.overflow !== "visible") {
          return true;
        }
        parent = parent.parentElement;
      }

      return false;
    };

    let depassement = 0;

    for (const element of document.querySelectorAll("*")) {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        element.getClientRects().length === 0 ||
        contenuParUnAncetre(element)
      ) {
        continue;
      }

      const boite = element.getBoundingClientRect();

      /*
       * LE MASQUAGE PAR REJET HORS DE L'ECRAN, technique `sr-only` classique :
       * `position: absolute; left: -9999px` reserve un contenu aux lecteurs
       * d'ecran sans le montrer. L'element est hors flux et ne produit AUCUNE
       * barre de defilement, mais son `-boite.left` vaudrait 9999, mesure faite.
       *
       * LE CRITERE EST LE HORS-FLUX, pas la valeur : seul un element
       * `absolute` ou `fixed` peut sortir ainsi sans entrainer la page. Un
       * element en flux tire a gauche par une marge negative deborde
       * REELLEMENT, et reste compte.
       */
      const horsFlux =
        style.position === "absolute" || style.position === "fixed";
      if (horsFlux && boite.right <= 0) {
        continue;
      }

      // LE DEPASSEMENT INTERNE N'EST COMPTE QUE SI L'ELEMENT NE DEFILE PAS
      // lui-meme : `overflow-x: auto` sur un tableau large est une decision de
      // mise en page, pas un defaut, et la zone defile sans entrainer la page.
      const defileLuiMeme =
        style.overflowX !== "visible" || style.overflow !== "visible";
      const interne = defileLuiMeme
        ? 0
        : element.scrollWidth - element.clientWidth;

      depassement = Math.max(
        depassement,
        boite.right - largeurVisible,
        -boite.left,
        interne,
      );
    }

    return depassement;
  });
}

/**
 * Tolerance en pixels sous laquelle un depassement n'est pas un defaut.
 *
 * UNE TOLERANCE ASSUMEE ET NON UN ARRONDI CACHE. La version de LS-111
 * arrondissait la mesure avant de la comparer a zero, ce qui laissait passer
 * 0,4 px sans que rien ne le dise. Le seuil est ici nomme et cite par chaque
 * assertion.
 *
 * UN DEMI-PIXEL, ET NON UN PIXEL ENTIER. La premiere version de LS-112 retenait
 * 1 px, et la revue a montre que la justification ne soutenait pas le chiffre :
 * ce qu'il s'agit d'absorber, ce sont les fractions inevitables de la mise en
 * page, une bordure de 0,5 px, une largeur en pourcentage qui ne tombe pas
 * juste, un arrondi de sous-pixel du moteur de rendu. Toutes tiennent SOUS le
 * demi-pixel.
 *
 * Un seuil a 1 px laissait donc passer un depassement reel d'un pixel entier
 * sans rien absorber de plus. Trop haut pour etre un vrai zero, trop bas pour
 * couvrir ce qu'il pretendait couvrir.
 *
 * LE CHIFFRE N'A DE TOUTE FACON PAS BESOIN D'ETRE GENEREUX : un debordement reel
 * se compte en dizaines de pixels. Celui de LS-111 en faisait 496, celui de
 * LS-103 en faisait 40, celui du texte non coupable 45.
 */
export const TOLERANCE_DEBORDEMENT_PX = 0.5;
