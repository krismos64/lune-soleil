"use client";

/**
 * Erreur serveur de la page Statistiques, LS-64. `frontend-design.md`, section
 * « Etats obligatoires ».
 *
 * `"use client"` EST IMPOSE PAR NEXT.JS pour une frontiere d'erreur.
 *
 * CET ECRAN AGREGE CINQ REQUETES A CHAQUE AFFICHAGE, `force-dynamic` : une
 * panne y est le cas de panne le plus probable de la rubrique, et sans ce
 * fichier elle remonte a la frontiere du groupe au lieu d'un message situe.
 *
 * LE MESSAGE RASSURE SUR CE QUI COMPTE ICI : aucun chiffre n'est perdu ni
 * fausse. Une exploitante qui voit une erreur sur cette page doit savoir que ses
 * ventes sont en base et que rien n'a ete recalcule de travers.
 *
 * AUCUN DETAIL TECHNIQUE N'ATTEINT L'ECRAN, invariant 9.
 */
import Link from "next/link";

import styles from "./statistiques.module.css";

export default function ErreurStatistiques({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Statistiques</h1>

      <p className={styles.vide}>
        Les statistiques n&apos;ont pas pu être calculées. Aucun chiffre
        n&apos;est perdu : vos ventes et vos remboursements sont enregistrés, et
        cet écran ne fait que les additionner.
      </p>

      <div className={styles.listeFiltres}>
        <button type="button" onClick={reset} className={styles.filtre}>
          Réessayer
        </button>

        <Link href="/administration" className={styles.filtre} prefetch={false}>
          Retour au tableau de bord
        </Link>
      </div>
    </main>
  );
}
