"use client";

/**
 * Le repère d'écran du bandeau de l'administration, LS-326 : la famille et la
 * rubrique de l'écran courant, avec son icône dans un médaillon à la couleur
 * de la famille. Il remplace le mot « Administration », qui ne disait rien de
 * l'endroit où l'on est.
 *
 * COMPOSANT CLIENT, pour la seule raison de `usePathname` : le layout ne
 * connaît pas le chemin. Il lit `RUBRIQUES`, la table de la barre latérale :
 * un écran de détail garde la rubrique de sa liste, `estRubriqueCourante`.
 *
 * IL DONNE AUSSI SA COULEUR À L'ÉCRAN : `data-famille` est lu par le layout,
 * `.colonne:has([data-famille=…])`, qui pose `--ls-famille` pour tout l'écran
 * sans qu'aucune page n'ait à la connaître.
 *
 * L'ICÔNE SE TRACE À CHAQUE CHANGEMENT D'ÉCRAN, ADR-045 amendé par LS-326 :
 * la clé change avec la rubrique, l'animation rejoue une fois, six dixièmes
 * de seconde. Le texte ne bouge pas. Rien en mouvement réduit.
 *
 * CE N'EST PAS UN FIL D'ARIANE CLIQUABLE : la barre latérale porte déjà les
 * liens, les doubler ici rendrait leurs noms ambigus.
 */
import { usePathname } from "next/navigation";

import { IconeAdministration } from "./icones-administration";
import {
  GROUPES,
  RUBRIQUES,
  estRubriqueCourante,
} from "./navigation-administration";
import styles from "./repere-ecran.module.css";

export function RepereEcran() {
  const chemin = usePathname();
  const rubrique = RUBRIQUES.find((candidate) =>
    estRubriqueCourante(chemin, candidate.chemin),
  );
  const groupe = GROUPES.find((candidat) => candidat.cle === rubrique?.groupe);

  return (
    <p className={styles.repere} data-famille={rubrique?.groupe ?? "ensemble"}>
      <span className={styles.medaillon} aria-hidden="true">
        <IconeAdministration
          key={rubrique?.chemin ?? "aucune"}
          nom={rubrique?.icone ?? "bord"}
          className={styles.icone}
        />
      </span>
      <span className={styles.textes}>
        <span className={styles.famille}>
          {groupe?.titre ?? "Administration"}
        </span>
        {rubrique === undefined ? null : (
          <span className={styles.rubrique}>{rubrique.libelle}</span>
        )}
      </span>
    </p>
  );
}
