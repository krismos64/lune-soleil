/**
 * Construction des URL publiques des medias, LS-187 et LS-192.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE MODULE EXISTE : SEPT ECRANS CONSTRUISAIENT CES URL A LA MAIN, et
 * les deux formes en circulation ne pouvaient pas etre justes toutes les deux.
 *
 *   boutique, cinq ecrans   `${PREFIXE}/${chemin}640.jpeg`
 *   editeur de produit      `${PREFIXE}/${chemin}/640.jpeg`
 *
 * MESURE DU 6 SEPTEMBRE 2026, en HTTP sur le serveur de developpement, avec un
 * chemin que `publier()` peut REELLEMENT rendre :
 *
 *   /medias/e2e-mesure-ls187/640.jpeg   200
 *   /medias/e2e-mesure-ls187640.jpeg    404
 *
 * C'est donc la forme de l'EDITEUR qui est juste, et les cinq ecrans de la
 * boutique qui rendraient 404 sur une vraie photographie. L'inverse de ce que
 * LS-187 annoncait, et sa description a ete reecrite.
 * ------------------------------------------------------------------
 *
 * LA CAUSE DE L'INVERSION EST UNE FIXTURE DE TEST. `tests/e2e/chemin-session.ts`
 * posait `produits/e2e-ls104/`, avec une barre finale et un dossier parent, en
 * affirmant que c'etait « comme celui que le traitement ecrit ». C'est faux :
 * `exigerSegmentSimple` de `stockage.ts` impose `^[A-Za-z0-9][A-Za-z0-9._-]*$`,
 * donc ni slash ni barre finale, et `publier()` rend ce segment nu.
 *
 * Aucune photographie du depot ne venait du service : les deux medias etaient
 * poses a la main, dans la forme qui arrangeait la boutique. Une donnee de test
 * faconnee pour satisfaire le code masque le defaut au lieu de le reveler.
 *
 * LE GARDE-FOU DE DECLINAISON EST CONSERVE ET GENERALISE. L'editeur portait
 * deja un controle sur `640.jpeg`, ecrit en LS-183 apres qu'une premiere
 * version eut porte `640.jpg` ; la boutique n'en avait aucun et ecrivait ses
 * onze noms de fichiers en dur. Motif « chaine construite a l'execution » :
 * `640.jpg` pour `640.jpeg` ne faisait rougir aucun test.
 */
import {
  LARGEURS_SERVIES,
  declinaisonsAttendues,
  type Format,
} from "./declinaisons";

/**
 * Prefixe sous lequel les medias sont servis.
 *
 * UN SEUL NOM DE VARIABLE, LS-192. Il en existait DEUX pour la meme valeur,
 * `MEDIA_PREFIXE_PUBLIC` sur cinq ecrans et `NEXT_PUBLIC_MEDIA_PREFIXE` dans le
 * panier, chacun avec le meme repli `/medias`. Les deux ne pouvaient pas etre
 * justes : renseigner l'une en production aurait change l'adresse des medias
 * sur six ecrans et pas sur le panier. Le repli identique faisait que rien ne
 * cassait tant que la variable n'etait jamais renseignee, donc aucun test ne
 * pouvait le voir.
 *
 * `NEXT_PUBLIC_` EST LE PREFIXE RETENU, et c'est ce que la contrainte impose :
 * `lignes-panier.tsx` est un composant CLIENT, et Next.js n'expose au navigateur
 * que les variables portant ce prefixe. Retenir l'autre nom aurait rendu la
 * valeur `undefined` dans le panier, qui serait retombe sur son repli en
 * silence : exactement le defaut d'origine sous une autre forme.
 *
 * LUE AU CHARGEMENT DU MODULE, et c'est ce que Next.js impose pour une variable
 * `NEXT_PUBLIC_` : elle est substituee a la compilation dans le bundle client,
 * et une lecture differee ne verrait rien. La contrepartie est qu'un changement
 * de valeur demande une reconstruction, ce qui est le cas de toute variable
 * publique de Next.js.
 */
const PREFIXE = process.env.NEXT_PUBLIC_MEDIA_PREFIXE ?? "/medias";

/**
 * La declinaison employee partout ou une seule image est servie.
 *
 * 640 px EN JPEG : la vignette d'une liste, l'image de repli d'un `<picture>`
 * et le balisage de partage. Le JPEG est le seul format qu'aucun client ne
 * refuse, ce qui compte pour une balise `og:image` lue par des robots.
 */
export const DECLINAISON_PAR_DEFAUT = "640.jpeg";

/**
 * Les largeurs proposees dans un `srcSet`, ADR-007.
 *
 * 1920 px EST EXCLU DES `srcSet` DE VIGNETTE mais reste produit : il sert la
 * fiche produit sur un ecran a haute densite, pas une carte de catalogue de
 * 320 px. `LARGEURS_SERVIES` reste la source, ce tableau n'etant qu'un filtre.
 */
const LARGEURS_SRCSET = LARGEURS_SERVIES.filter((largeur) => largeur <= 1280);

/**
 * Leve si la declinaison demandee n'est plus produite par le traitement.
 *
 * C'EST LE GARDE-FOU QUE LA BOUTIQUE N'AVAIT PAS. Retirer une largeur ou un
 * format d'ADR-007 casserait sept ecrans en silence, les URL restant bien
 * formees et les fichiers ayant disparu. Ici la construction leve, donc le
 * defaut se voit a la premiere execution plutot qu'a la premiere visite.
 */
function exigerDeclinaison(nom: string): string {
  if (!declinaisonsAttendues().includes(nom)) {
    throw new Error(
      `La declinaison ${nom} n'est plus produite par le traitement, ADR-007.`,
    );
  }
  return nom;
}

/**
 * URL publique d'une declinaison d'un media.
 *
 * `chemin` EST LE SEGMENT RENDU PAR `publier()`, sans barre ni dossier parent.
 * La barre qui le separe du nom de fichier est posee ICI, une seule fois, ce
 * qui est precisement ce que sept ecrans faisaient chacun a leur facon.
 */
export function urlMedia(chemin: string, declinaison: string): string {
  return `${PREFIXE}/${chemin}/${exigerDeclinaison(declinaison)}`;
}

/** URL de la vignette par defaut, 640 px en JPEG. */
export function urlVignette(chemin: string): string {
  return urlMedia(chemin, DECLINAISON_PAR_DEFAUT);
}

/**
 * `srcSet` complet d'un format, pour une balise `<source>`.
 *
 * IL EST DERIVE DES LARGEURS ET NON ECRIT A LA MAIN. Les trois `srcSet` du
 * depot enumeraient leurs largeurs dans une chaine de gabarit : ajouter une
 * largeur a ADR-007 demandait de modifier trois chaines, et en oublier une ne
 * faisait rougir aucun test.
 */
export function srcSetMedia(chemin: string, format: Format): string {
  return LARGEURS_SRCSET.map(
    (largeur) => `${urlMedia(chemin, `${largeur}.${format}`)} ${largeur}w`,
  ).join(", ");
}
