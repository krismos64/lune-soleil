"use client";

/**
 * Erreur serveur de la page de contact, LS-97. `frontend-design.md`, section
 * « Etats obligatoires » : « une erreur serveur produit un message visible ».
 *
 * `"use client"` EST IMPOSE PAR NEXT.JS pour une frontiere d'erreur, qui doit
 * s'attacher a un gestionnaire cote navigateur.
 *
 * SANS CE FICHIER, une panne rend la page d'erreur generique de Next.js : en
 * anglais, sans identite visuelle, sur le seul ecran qui permet de joindre la
 * boutique.
 *
 * L'ADRESSE EMAIL EST DONNEE ICI, ET C'EST LE POINT DE CET ECRAN. Une erreur
 * sur la page de contact ferme le canal qu'elle sert : sans repli, la personne
 * n'a plus aucun moyen d'ecrire. Le formulaire est un confort, l'adresse est la
 * garantie.
 *
 * LE MESSAGE NE DIT PAS CE QUI A ECHOUE, invariant 9 : « la base est
 * injoignable » renseignerait sur l'infrastructure sans aider qui que ce soit.
 */
import Link from "next/link";

import styles from "./contact.module.css";

export default function ErreurContact({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Nous écrire</h1>

      <div className={styles.delai} role="alert">
        <p>
          Le formulaire n&apos;a pas pu être affiché. Le problème vient de notre
          côté.
        </p>
        <p>
          En attendant, écrivez directement à{" "}
          <a href="mailto:contact@lune-soleil.fr">contact@lune-soleil.fr</a>.
        </p>
      </div>

      <div className={styles.formulaire}>
        <button type="button" className={styles.bouton} onClick={reset}>
          Réessayer
        </button>
        <Link href="/catalogue">Retour au catalogue</Link>
      </div>
    </main>
  );
}
