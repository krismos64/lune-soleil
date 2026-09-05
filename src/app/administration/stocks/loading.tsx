/**
 * Etat de chargement de l'ecran Stocks et marchés, LS-188.
 *
 * LE STOCK EST LA DONNEE QUI CHANGE LE PLUS VITE de l'administration : une
 * reservation posee par un achat en ligne modifie l'ecran sans geste de
 * l'exploitante. Le `force-dynamic` est ici une necessite de correction.
 *
 * IL EST AUTORISE ICI, ET C'EST UNE VERIFICATION ET NON UNE SUPPOSITION. La
 * regle C32 interdit un fichier de chargement de segment sur une route qui
 * appelle `notFound()`, le streaming commençant avant que le 404 soit atteint.
 * Cette page ne l'appelle pas. Les deux ecrans de detail qui l'appellent portent
 * un `<Suspense>` interne a la place.
 */
import { ChargementAdministration } from "@/components/chargement-administration";

import styles from "./stocks.module.css";

export default function Chargement() {
  return (
    <ChargementAdministration
      titre="Stocks et marchés"
      annonce="Chargement des stocks…"
      lignes={5}
      classePage={styles.page}
      classeTitre={styles.titre}
    />
  );
}
