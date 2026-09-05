/**
 * Etat de chargement de l'ecran Expéditions, LS-188.
 *
 * La page est en `force-dynamic` : un colis remis au transporteur pendant que
 * l'ecran est ouvert doit se voir au rafraichissement.
 *
 * IL EST AUTORISE ICI, ET C'EST UNE VERIFICATION ET NON UNE SUPPOSITION. La
 * regle C32 interdit un fichier de chargement de segment sur une route qui
 * appelle `notFound()`, le streaming commençant avant que le 404 soit atteint.
 * Cette page ne l'appelle pas. Les deux ecrans de detail qui l'appellent portent
 * un `<Suspense>` interne a la place.
 */
import Link from "next/link";

import { ChargementAdministration } from "@/components/chargement-administration";

import styles from "./expeditions.module.css";

export default function Chargement() {
  return (
    <ChargementAdministration
      /*
       * LE LIEN DE RETOUR EST RENDU, et ce n'est pas cosmetique : la page le
       * porte au-dessus de son sur-titre, sur 44 px de cible tactile plus
       * 12 px de marge. L'omettre remonterait le titre de 56 px pendant le
       * chargement, puis le redescendrait, soit le saut de mise en page que
       * le critere 3 interdit.
       */
      tete={
        <Link href="/administration/commandes" className={styles.retour}>
          Retour aux commandes
        </Link>
      }
      titre="Expéditions"
      annonce="Chargement des expéditions…"
      lignes={4}
      surtitre="Mondial Relay"
      classeSurtitre={styles.surtitre}
      classePage={styles.page}
      classeTitre={styles.titre}
    />
  );
}
