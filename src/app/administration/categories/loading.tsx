/**
 * Etat de chargement de l'ecran Catégories du catalogue, LS-188.
 *
 * La page est en `force-dynamic` et relit la liste a chaque affichage, une
 * categorie creee devant apparaitre immediatement. L'attente est donc reelle a
 * chaque navigation, et non seulement au premier chargement.
 *
 * IL EST AUTORISE ICI, ET C'EST UNE VERIFICATION ET NON UNE SUPPOSITION. La
 * regle C32 interdit un fichier de chargement de segment sur une route qui
 * appelle `notFound()`, le streaming commençant avant que le 404 soit atteint.
 * Cette page ne l'appelle pas. Les deux ecrans de detail qui l'appellent portent
 * un `<Suspense>` interne a la place.
 */
import { ChargementAdministration } from "@/components/chargement-administration";

import styles from "./categories.module.css";

export default function Chargement() {
  return (
    <ChargementAdministration
      titre="Catégories du catalogue"
      annonce="Chargement des catégories…"
      lignes={4}
      classePage={styles.page}
      classeTitre={styles.titre}
    />
  );
}
