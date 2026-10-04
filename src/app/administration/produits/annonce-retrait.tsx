"use client";

/**
 * Confirmation du retrait d'un produit de l'espace, LS-266.
 *
 * LE PARAMÈTRE `retrait` EST EFFACÉ DE L'ADRESSE dès l'affichage, relevé par
 * `ls-frontend-revue` : sans cela, un rechargement, un retour par
 * l'historique ou une action groupée faite ensuite sur cette page réaffichait
 * « Produit retiré » au-dessus d'un autre geste. `history.replaceState` ne
 * relance aucun rendu serveur : le message reste jusqu'au prochain.
 *
 * LE FOCUS VA AU MESSAGE : après la redirection, il retomberait sur le début
 * du document, et une région `status` présente dès le rendu n'est pas
 * toujours annoncée.
 */

import { useEffect, useRef } from "react";

import styles from "./catalogue.module.css";

export function AnnonceRetrait() {
  const message = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    message.current?.focus();
    const adresse = new URL(window.location.href);
    adresse.searchParams.delete("retrait");
    window.history.replaceState(window.history.state, "", adresse);
  }, []);

  return (
    <p
      className={styles.annonceRetrait}
      role="status"
      ref={message}
      tabIndex={-1}
    >
      Produit retiré de votre espace. Il n&apos;est pas effacé, seul le
      développeur pourra le récupérer.
    </p>
  );
}
