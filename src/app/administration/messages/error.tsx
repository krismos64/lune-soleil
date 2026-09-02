"use client";

/**
 * Erreur serveur de la rubrique Messages, LS-97. `frontend-design.md`, section
 * « Etats obligatoires ».
 *
 * `"use client"` EST IMPOSE PAR NEXT.JS pour une frontiere d'erreur.
 *
 * CET ECRAN INTERROGE LA BASE A CHAQUE AFFICHAGE, `force-dynamic` : une panne y
 * est le cas de panne le plus probable de la rubrique, et sans ce fichier elle
 * remonte a la frontiere globale au lieu d'un message situe.
 *
 * LE MESSAGE RASSURE SUR CE QUI COMPTE ICI : les messages ne sont pas perdus.
 * L'exploitante qui voit une erreur sur cette page doit savoir que les demandes
 * de ses clients sont en base, pas que « quelque chose a echoue ».
 */
import Link from "next/link";

import styles from "./messages.module.css";

export default function ErreurMessages({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Messages</h1>

      <div className={styles.vide} role="alert">
        <p>
          La liste n&apos;a pas pu être affichée. Aucun message n&apos;est
          perdu, ils restent enregistrés.
        </p>
      </div>

      <div className={styles.gestes}>
        <button type="button" className={styles.bouton} onClick={reset}>
          Réessayer
        </button>
        <Link href="/administration/commandes" className={styles.retour}>
          Retour aux commandes
        </Link>
      </div>
    </main>
  );
}
