/**
 * Etat de chargement de l'ecran Rétractations, LS-188.
 *
 * LES DELAIS SE COMPTENT EN JOURS ET L'ECRAN LES CALCULE AU RENDU. Un cache y
 * afficherait un delai faux, d'ou le `force-dynamic`, d'ou l'attente reelle.
 *
 * IL EST AUTORISE ICI, ET C'EST UNE VERIFICATION ET NON UNE SUPPOSITION. La
 * regle C32 interdit un fichier de chargement de segment sur une route qui
 * appelle `notFound()`, le streaming commençant avant que le 404 soit atteint.
 * Cette page ne l'appelle pas. Les deux ecrans de detail qui l'appellent portent
 * un `<Suspense>` interne a la place.
 */
import { ChargementAdministration } from "@/components/chargement-administration";

import styles from "./retractations.module.css";

export default function Chargement() {
  return (
    <ChargementAdministration
      titre="Rétractations"
      annonce="Chargement des rétractations…"
      lignes={4}
      classePage={styles.page}
      classeTitre={styles.titre}
    />
  );
}
