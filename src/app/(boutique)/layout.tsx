/**
 * Layout du groupe de routes `(boutique)`, LS-122.
 *
 * POURQUOI UN GROUPE DE ROUTES et non le layout racine : verifie via Context7,
 * un dossier entre parentheses n'entre pas dans l'URL et porte son propre
 * layout. `/administration` reste donc hors de cet en-tete, sans qu'aucune
 * adresse publique change.
 *
 * IL EST IMBRIQUE DANS LE LAYOUT RACINE, qui garde `html` et `body`. Deux
 * layouts racines concurrents provoqueraient un rechargement complet a chaque
 * passage entre la boutique et l'administration, ce que la documentation de
 * Next.js signale explicitement.
 *
 * LA CIBLE DU LIEN D'EVITEMENT VIT DANS LE `main` DE CHAQUE PAGE, et non dans
 * un conteneur pose ici.
 *
 * La premiere version enveloppait `children` dans un `<div id="contenu">`. Deux
 * defauts, tous deux mesures sur le rendu :
 *
 *   - `focus()` sur ce div ne prenait pas, le focus retombait sur `body`. Le
 *     lien faisait defiler la page sans deplacer le focus clavier : la
 *     tabulation suivante repartait du haut, exactement ce que le lien evite
 *   - le div enveloppait le `<main>` que chaque page porte deja, ajoutant un
 *     niveau qui ne servait rien
 *
 * Une cible non focalisable est le piege classique du lien d'evitement : il
 * parait fonctionner, la page bouge, et il ne remplit pas son role.
 */
import { EnTeteBoutique } from "@/components/en-tete-boutique";
import { PiedBoutique } from "@/components/pied-boutique";

export default function LayoutBoutique({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <EnTeteBoutique />
      {children}
      <PiedBoutique />
    </>
  );
}
