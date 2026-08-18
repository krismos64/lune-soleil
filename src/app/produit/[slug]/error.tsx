"use client";

/**
 * Erreur serveur de la fiche produit, LS-105. `frontend-design.md`, section
 * « Etats obligatoires » : « une erreur serveur produit un message visible ».
 *
 * `"use client"` EST IMPOSE PAR NEXT.JS pour une frontiere d'erreur, qui doit
 * s'attacher a un gestionnaire cote navigateur.
 *
 * SANS CE FICHIER, une base injoignable rend la page d'erreur generique de
 * Next.js, en anglais et sans identite visuelle, sur la page ou le client
 * decide d'acheter.
 *
 * LE MESSAGE NE DIT PAS CE QUI A ECHOUE. « La base de donnees est injoignable »
 * renseignerait sur l'infrastructure sans aider le visiteur. `error.digest`
 * porte l'identifiant cote serveur pour le diagnostic, il n'est pas affiche.
 *
 * LA SORTIE MENE AU CATALOGUE, ET NON A L'ACCUEIL. Qui consulte une fiche
 * cherche un bijou : le catalogue est l'endroit ou la recherche continue.
 */
import Link from "next/link";

import styles from "./fiche.module.css";

export default function ErreurFiche({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.legal} role="alert">
        <h1 className={styles.titreSection}>
          Pièce momentanément indisponible
        </h1>
        <p className={styles.texteSection}>
          Cette pièce n&apos;a pas pu être affichée. Le problème vient de notre
          côté.
        </p>
        <button type="button" onClick={reset} className={styles.ajouter}>
          Réessayer
        </button>
        <p className={styles.texteSection}>
          <Link href="/catalogue" className={styles.lienLegal}>
            Revenir au catalogue
          </Link>
        </p>
      </div>
    </main>
  );
}
