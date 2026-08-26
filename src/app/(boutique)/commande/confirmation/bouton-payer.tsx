"use client";

/**
 * Bouton de paiement de la page de confirmation, LS-118.
 *
 * COMPOSANT CLIENT PARCE QUE LA REDIRECTION EST UNE INTERACTION : l'action rend
 * l'URL de la session, le navigateur y part. Aucune donnee n'est calculee ici,
 * et l'action ne recoit AUCUN argument, la commande venant du cookie signe.
 */
import { useState, useTransition } from "react";

import styles from "../commande.module.css";
import { reessayerPaiementAction } from "./actions-paiement";

export function BoutonPayer({ libelle }: { libelle: string }) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");

  function payer(): void {
    demarrer(async () => {
      const resultat = await reessayerPaiementAction();

      /*
       * LE RESULTAT EST LU, JAMAIS IGNORE, regle des faux succes de
       * `frontend-design.md` : un refus s'affiche, associe a l'action.
       */
      if (resultat.statut === "IMPOSSIBLE") {
        setErreur(resultat.message);
        return;
      }

      setErreur("");
      window.location.assign(resultat.url);
    });
  }

  return (
    <>
      <p
        role="alert"
        aria-label="Erreur de paiement"
        className={erreur === "" ? styles.erreurVide : styles.erreur}
      >
        {erreur}
      </p>

      {/*
       * DESACTIVE PENDANT L'ENVOI, meme motif que le bouton de commande : un
       * double clic creerait deux sessions, la seconde expirant la premiere,
       * appels au prestataire pour rien.
       */}
      <button
        type="button"
        disabled={enCours}
        onClick={payer}
        className={styles.payer}
      >
        {enCours ? "Redirection vers le paiement…" : libelle}
      </button>
    </>
  );
}
