"use client";

/**
 * Erreur serveur du catalogue, LS-104. `frontend-design.md`, section « Etats
 * obligatoires » : « une erreur serveur produit un message visible ».
 *
 * `"use client"` EST IMPOSE PAR NEXT.JS pour une frontiere d'erreur, qui doit
 * s'attacher a un gestionnaire cote navigateur. C'est le seul composant client
 * de cet ecran, et il ne porte aucune logique metier.
 *
 * SANS CE FICHIER, une base injoignable rend la page d'erreur generique de
 * Next.js : en anglais, sans identite visuelle, sur le premier ecran public du
 * projet.
 *
 * LE MESSAGE NE DIT PAS CE QUI A ECHOUE. « La base de donnees est injoignable »
 * renseignerait sur l'infrastructure sans aider le visiteur, qui n'y peut rien.
 * `error.digest` porte l'identifiant cote serveur pour le diagnostic, il n'est
 * pas affiche.
 *
 * DEUX SORTIES PLUTOT QU'UNE : reessayer, parce qu'une panne de base est souvent
 * breve, et revenir a l'accueil, parce qu'un echec repete doit laisser partir.
 */
import Link from "next/link";

import styles from "./catalogue.module.css";

export default function ErreurCatalogue({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Le catalogue</h1>

      <div className={styles.etatVide} role="alert">
        <p className={styles.texteVide}>
          Le catalogue n&apos;a pas pu être affiché. Le problème vient de notre
          côté.
        </p>
        <button type="button" onClick={reset} className={styles.actionVide}>
          Réessayer
        </button>
        <p className={styles.compte}>
          <Link href="/">Revenir à l&apos;accueil</Link>
        </p>
      </div>
    </main>
  );
}
