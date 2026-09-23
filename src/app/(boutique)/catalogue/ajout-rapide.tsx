"use client";

/**
 * Ajout au panier depuis une carte du catalogue, LS-240.
 *
 * RELEVE PAR L'EXPLOITANTE EN RECETTE : pour acheter trois bijoux, il fallait
 * ouvrir trois fiches et revenir trois fois a la liste. Ce bouton ajoute sans
 * quitter la page.
 *
 * IL N'EXISTE QUE POUR UN PRODUIT A UNE SEULE VARIANTE, la carte le decide. Un
 * collier en 40 et 45 cm ne s'ajoute pas sans choisir : sa carte ne porte pas
 * de bouton, et son lien mene a la fiche ou le choix se fait.
 *
 * AUCUN SECOND CHEMIN D'AJOUT : c'est la meme Server Action que la fiche. Le
 * refus d'un exemplaire de trop, LS-238, s'applique donc ici sans rien
 * recopier.
 *
 * COMPOSANT CLIENT MINIMAL, le reste de la carte restant serveur : seul le
 * bouton a besoin d'un etat.
 */
import { useState, useTransition } from "react";

import { ajouterAuPanier } from "../panier/actions-panier";
import styles from "./catalogue.module.css";

export function AjoutRapide({
  varianteId,
  nomProduit,
  epuise,
}: {
  varianteId: string;
  nomProduit: string;
  epuise: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <div className={styles.ajoutRapide}>
      <button
        type="button"
        className={styles.boutonAjoutRapide}
        disabled={epuise || enCours}
        /*
         * LE NOM ACCESSIBLE PORTE LE PRODUIT : dix boutons « Ajouter au
         * panier » sur une grille seraient indiscernables pour un lecteur
         * d'ecran qui liste les boutons de la page.
         *
         * IL COMMENCE PAR LE TEXTE VISIBLE, WCAG 2.5.3 releve par
         * `ls-frontend-revue` : qui pilote a la voix dit « Ajouter au panier »,
         * et un nom « Ajouter Bague Lune au panier » ne le contient pas d'un
         * seul tenant.
         */
        aria-label={
          epuise ? `Épuisé, ${nomProduit}` : `Ajouter au panier, ${nomProduit}`
        }
        onClick={() => {
          /*
           * LA REGION EST VIDEE AVANT L'APPEL : un second ajout reussi
           * reecrirait la meme phrase, le DOM ne changerait pas, et le lecteur
           * d'ecran se tairait. Releve par `ls-frontend-revue`.
           */
          setMessage("");
          demarrer(async () => {
            const issue = await ajouterAuPanier(varianteId, 1);
            setMessage(
              issue.statut === "OK" ? "Ajouté au panier." : issue.message,
            );
          });
        }}
      >
        {epuise ? "Épuisé" : "Ajouter au panier"}
      </button>

      {/*
       * UNE REGION LIVE PAR CARTE, nommee par le produit, LS-85 : sans elle,
       * l'ajout ne produit aucun retour audible, et une region unique pour la
       * grille ne dirait pas quelle piece a ete ajoutee.
       */}
      <p
        role="status"
        aria-label={`Ajout de ${nomProduit}`}
        className={styles.annonceAjoutRapide}
      >
        {message}
      </p>
    </div>
  );
}
