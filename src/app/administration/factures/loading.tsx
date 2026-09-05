/**
 * Etat de chargement de l'ecran Factures et avoirs, LS-188.
 *
 * La page est en `force-dynamic` et lit les documents comptables a chaque
 * affichage, une facture emise devant apparaitre sans delai.
 *
 * IL EST AUTORISE ICI, ET C'EST UNE VERIFICATION ET NON UNE SUPPOSITION. La
 * regle C32 interdit un fichier de chargement de segment sur une route qui
 * appelle `notFound()`, le streaming commençant avant que le 404 soit atteint.
 * Cette page ne l'appelle pas. Les deux ecrans de detail qui l'appellent portent
 * un `<Suspense>` interne a la place.
 */
import { ChargementAdministration } from "@/components/chargement-administration";

import styles from "./factures.module.css";

export default function Chargement() {
  return (
    <ChargementAdministration
      titre="Factures et avoirs"
      annonce="Chargement des factures…"
      lignes={5}
      surtitre="Comptabilité"
      classeSurtitre={styles.surtitre}
      classePage={styles.page}
      classeTitre={styles.titre}
    />
  );
}
