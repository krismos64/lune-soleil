"use client";

/**
 * La préférence de mouvement, suivie pendant toute la visite. ADR-045 point 3.
 *
 * LIRE `matchMedia(...).matches` UNE SEULE FOIS NE SUFFIT PAS : une personne
 * qui active la réduction des mouvements en cours de visite garderait une
 * scène animée et des phrases masquées, défaut relevé par la revue de LS-260.
 * Le hook s'abonne à `change`, et un composant qui en dépend démonte ses effets
 * dès que la préférence bascule.
 *
 * CÔTÉ SERVEUR, LA RÉPONSE EST `false` : la page sort immobile et complète, et
 * le mouvement ne s'installe qu'après hydratation.
 */
import { useSyncExternalStore } from "react";

const REQUETE = "(prefers-reduced-motion: reduce)";

function abonner(prevenir: () => void): () => void {
  const requete = window.matchMedia(REQUETE);
  requete.addEventListener("change", prevenir);
  return () => requete.removeEventListener("change", prevenir);
}

export function useMouvementAutorise(): boolean {
  return useSyncExternalStore(
    abonner,
    () => !window.matchMedia(REQUETE).matches,
    () => false,
  );
}
