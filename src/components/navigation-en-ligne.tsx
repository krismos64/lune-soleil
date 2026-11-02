"use client";

/**
 * Navigation en ligne de l'en-tête, à partir de 768 px, LS-309.
 *
 * COMPOSANT CLIENT POUR UNE SEULE RAISON : `aria-current` dépend du chemin
 * courant, que seul `usePathname` donne, et l'en-tête survit aux navigations
 * client sans être re-rendu par le serveur. Le reste de l'en-tête, marque,
 * compte et compteur du panier lu dans le cookie, reste serveur.
 *
 * SANS SCRIPT, LE RENDU SERVEUR PORTE DÉJÀ LA BONNE PAGE ACTIVE : `usePathname`
 * vaut le chemin demandé au premier rendu.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ENTREES_NAVIGATION, estEntreeActive } from "@/lib/navigation-boutique";
import styles from "./en-tete-boutique.module.css";

export function NavigationEnLigne() {
  const chemin = usePathname();

  return (
    <nav aria-label="Navigation principale" className={styles.navigation}>
      <ul className={styles.liste}>
        {ENTREES_NAVIGATION.map((entree) => (
          <li key={entree.href}>
            <Link
              href={entree.href}
              className={styles.lien}
              aria-current={
                estEntreeActive(chemin, entree.href) ? "page" : undefined
              }
            >
              {entree.libelle}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
