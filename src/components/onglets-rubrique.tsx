"use client";

/**
 * Les onglets de la rubrique ouverte, refonte de l'administration du
 * 22 novembre 2026 : « Commandes » et « Expéditions » sous la rubrique
 * Commandes, « Produits », « Catégories » et « Stock et marchés » sous le
 * Catalogue. Chaque onglet est un LIEN vers l'écran qui existait déjà, aucune
 * adresse ne change.
 *
 * UNE RUBRIQUE À UN SEUL ÉCRAN N'A PAS D'ONGLETS : une barre à une entrée ne
 * dirait rien que le titre ne dise.
 *
 * `aria-current="page"` porte l'onglet courant, et le style s'ancre sur
 * l'attribut, motif de la barre latérale. Les nombres arrivent du layout.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  estRubriqueCourante,
  rubriqueDe,
  type Comptages,
} from "./navigation-administration";
import styles from "./onglets-rubrique.module.css";

export function OngletsRubrique({ comptages }: { comptages: Comptages }) {
  const chemin = usePathname();
  const rubrique = rubriqueDe(chemin);

  if (rubrique === undefined || rubrique.onglets.length < 2) {
    return null;
  }

  /*
   * L'ONGLET LE PLUS PRÉCIS L'EMPORTE : « Aujourd'hui » vaut l'égalité stricte,
   * les autres un préfixe, et un seul onglet est courant à la fois.
   */
  const courant = rubrique.onglets.find((onglet) =>
    estRubriqueCourante(chemin, onglet.chemin),
  );

  return (
    <nav className={styles.onglets} aria-label={rubrique.libelle}>
      <ul className={styles.liste}>
        {rubrique.onglets.map((onglet) => {
          const valeur = onglet.compteur ? comptages[onglet.compteur] : 0;

          return (
            <li key={onglet.chemin}>
              <Link
                href={onglet.chemin}
                className={styles.onglet}
                prefetch={false}
                aria-current={onglet === courant ? "page" : undefined}
              >
                {onglet.libelle}
                {valeur > 0 ? (
                  <span className={styles.compte}>
                    <span className={styles.invisible}>, </span>
                    {valeur}
                    <span className={styles.invisible}> en attente</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
