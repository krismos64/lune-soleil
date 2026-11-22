"use client";

/**
 * Le repère d'écran du bandeau de l'administration, LS-326 : la rubrique et
 * son icône, dans sa couleur. Refonte du 22 novembre 2026 : il nomme la
 * RUBRIQUE (« Catalogue »), l'écran se nommant par son titre (« Produits ») et
 * par l'onglet courant, `OngletsRubrique`.
 *
 * IL DONNE AUSSI SA COULEUR À L'ÉCRAN : `data-famille` est lu par le layout,
 * `.colonne:has([data-famille=…])`, qui pose `--ls-famille` pour tout l'écran
 * sans qu'aucune page ne la connaisse.
 *
 * COMPOSANT CLIENT, `usePathname`, pour la raison de la barre : un layout ne se
 * re-rend pas à la navigation.
 */
import { usePathname } from "next/navigation";

import { IconeAdministration } from "./icones-administration";
import { rubriqueDe } from "./navigation-administration";
import styles from "./repere-ecran.module.css";

export function RepereEcran() {
  const rubrique = rubriqueDe(usePathname());

  return (
    <p className={styles.repere} data-famille={rubrique?.cle ?? "accueil"}>
      <span className={styles.medaillon} aria-hidden="true">
        <IconeAdministration
          nom={rubrique?.icone ?? "bord"}
          className={styles.icone}
        />
      </span>
      <span className={styles.rubrique}>
        {rubrique?.libelle ?? "Administration"}
      </span>
    </p>
  );
}
