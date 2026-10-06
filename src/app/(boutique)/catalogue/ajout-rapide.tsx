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
import { useState, useTransition, type CSSProperties } from "react";

import { FloconIcone, PaquetIcone } from "@/components/decor-noel";

import { ajouterAuPanier } from "../panier/actions-panier";
import styles from "./catalogue.module.css";

/*
 * `noel`, LS-277 : un petit paquet précède le libellé, et un clic réussi fait
 * éclater une gerbe de flocons autour du bouton, décor `aria-hidden` qui
 * s'efface en 0,8 s. L'annonce reste le seul retour pour un lecteur d'écran.
 */
const GERBE = Array.from({ length: 10 }, (_, k) => {
  const angle = (k / 10) * Math.PI * 2;
  const rayon = 46 + (k % 3) * 14;
  return {
    x: Math.round(Math.cos(angle) * rayon),
    y: Math.round(Math.sin(angle) * rayon * 0.6),
  };
});

export function AjoutRapide({
  varianteId,
  nomProduit,
  epuise,
  noel = false,
}: {
  varianteId: string;
  nomProduit: string;
  epuise: boolean;
  noel?: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState("");
  const [gerbe, setGerbe] = useState(0);

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
            if (noel && issue.statut === "OK") {
              setGerbe((n) => n + 1);
            }
          });
        }}
      >
        {noel ? <PaquetIcone className={styles.paquetBouton} /> : null}
        {epuise ? "Épuisé" : "Ajouter au panier"}
        {gerbe > 0 ? (
          <span key={gerbe} className={styles.gerbe} aria-hidden="true">
            {GERBE.map(({ x, y }) => (
              <span
                key={`${x}-${y}`}
                className={styles.eclat}
                style={{ "--gx": `${x}px`, "--gy": `${y}px` } as CSSProperties}
              >
                <FloconIcone />
              </span>
            ))}
          </span>
        ) : null}
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
