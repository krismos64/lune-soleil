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
 * `id="contenu"` PORTE LA CIBLE DU LIEN D'EVITEMENT. Il vit ici et non dans
 * chaque page : le poser page par page garantirait qu'une page l'oublie, et le
 * lien retomberait alors en haut sans rien signaler.
 */
import { EnTeteBoutique } from "@/components/en-tete-boutique";
import { PiedBoutique } from "@/components/pied-boutique";

export default function LayoutBoutique({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <EnTeteBoutique />
      <div id="contenu">{children}</div>
      <PiedBoutique />
    </>
  );
}
