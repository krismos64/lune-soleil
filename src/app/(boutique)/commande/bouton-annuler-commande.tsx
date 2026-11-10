"use client";

/**
 * Bouton « Annuler et revenir au panier », LS-315, ADR-050.
 *
 * COMPOSANT CLIENT PARCE QUE L'ISSUE EST UNE INTERACTION : un refus s'affiche
 * a cote du bouton, un succes redirige vers le panier depuis l'action. L'action ne recoit AUCUN
 * argument, la commande venant du cookie signe, invariant 2.
 */
import { useState, useTransition } from "react";

import styles from "./commande-en-attente.module.css";
import { annulerCommandeAction } from "./confirmation/actions-annulation";

export function BoutonAnnulerCommande() {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");

  function annuler(): void {
    demarrer(async () => {
      const resultat = await annulerCommandeAction();

      /*
       * LE RESULTAT EST LU : un refus s'affiche, jamais de faux succes. Un
       * succes ne revient pas ici, l'action redirige vers le panier.
       */
      if (resultat.statut === "IMPOSSIBLE") {
        setErreur(resultat.message);
      }
    });
  }

  return (
    <div className={styles.zoneAnnuler}>
      <p
        role="alert"
        aria-label="Erreur d'annulation"
        className={erreur === "" ? styles.erreurVide : styles.erreur}
      >
        {erreur}
      </p>

      {/*
       * DESACTIVE PENDANT L'ENVOI : l'appel au prestataire dure jusqu'a vingt
       * secondes, et un second clic serait refuse par la garde sur le statut,
       * avec un message deroutant pour une annulation qui a reussi.
       */}
      <button
        type="button"
        disabled={enCours}
        onClick={annuler}
        className={styles.annuler}
      >
        {enCours ? "Annulation en cours…" : "Annuler et revenir au panier"}
      </button>
    </div>
  );
}
