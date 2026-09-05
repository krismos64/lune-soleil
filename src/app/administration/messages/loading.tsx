/**
 * Etat de chargement de l'ecran Messages, LS-188.
 *
 * UN MESSAGE NON LU EST CE QUE L'EXPLOITANTE VIENT CHERCHER ICI. L'ecran est en
 * `force-dynamic` pour qu'un message arrive pendant la consultation se voie au
 * rafraichissement, ce qui rend l'attente frequente.
 *
 * IL EST AUTORISE ICI, ET C'EST UNE VERIFICATION ET NON UNE SUPPOSITION. La
 * regle C32 interdit un fichier de chargement de segment sur une route qui
 * appelle `notFound()`, le streaming commençant avant que le 404 soit atteint.
 * Cette page ne l'appelle pas. Les deux ecrans de detail qui l'appellent portent
 * un `<Suspense>` interne a la place.
 */
import Link from "next/link";

import { ChargementAdministration } from "@/components/chargement-administration";

import styles from "./messages.module.css";

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
      titre="Messages"
      annonce="Chargement des messages…"
      lignes={4}
      classePage={styles.page}
      classeTitre={styles.titre}
    />
  );
}
