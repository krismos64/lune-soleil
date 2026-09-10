"use client";

/**
 * Erreur serveur de la rubrique Avis, LS-61. `frontend-design.md`, section
 * « Etats obligatoires ».
 *
 * `"use client"` EST IMPOSE PAR NEXT.JS pour une frontiere d'erreur.
 *
 * CET ECRAN INTERROGE LA BASE A CHAQUE AFFICHAGE, `force-dynamic` : une panne y
 * est le cas de panne le plus probable de la rubrique, et sans ce fichier elle
 * remonte a la frontiere globale au lieu d'un message situe.
 *
 * LE MESSAGE RASSURE SUR CE QUI COMPTE ICI : aucun avis n'est perdu, et aucune
 * decision n'est prise a moitie. Une exploitante qui voit une erreur sur cette
 * page doit savoir que l'avis qu'elle relisait est toujours en attente, pas que
 * « quelque chose a echoue ».
 *
 * AUCUN DETAIL TECHNIQUE N'ATTEINT L'ECRAN, invariant 9 : ni trace, ni nom de
 * classe, ni `error.digest`.
 */
import Link from "next/link";

import styles from "./avis.module.css";

export default function ErreurAvis({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Avis</h1>

      <p className={styles.vide}>
        Les avis n&apos;ont pas pu être affichés. Aucun avis n&apos;est perdu et
        aucune décision n&apos;a été enregistrée à moitié.
      </p>

      <div className={styles.boutons}>
        <button type="button" onClick={reset} className={styles.bouton}>
          Réessayer
        </button>

        <Link
          href="/administration"
          className={`${styles.bouton} ${styles.boutonSecondaire}`}
          prefetch={false}
        >
          Retour au tableau de bord
        </Link>
      </div>
    </main>
  );
}
