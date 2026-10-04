"use client";

/**
 * Bornage des animations automatiques, ADR-045 point 4, WCAG 2.2.2. LS-260.
 *
 * Aucun bouton de pause, arbitrage de Christophe du 4 octobre 2026. WCAG 2.2.2
 * n'en dispense que si le mouvement s'arrête EN CINQ SECONDES AU PLUS : tout
 * élément marqué `data-borne` passe donc par trois états, et `globals.css`
 * suspend ses animations hors de `joue` :
 *
 *   attente  hors de l'écran, rien ne tourne
 *   joue     entré dans l'écran, au plus `DUREE_MAX_MS`
 *   fin      la durée est écoulée, l'animation reste figée où elle est
 *
 * LA PREMIÈRE VERSION BORNAIT À DIX SECONDES, et la revue de LS-260 l'a
 * relevé : c'était lire la norme à moitié. ADR-045 porte la correction.
 *
 * Ressortir puis revenir dans l'écran rouvre une fenêtre de cinq secondes.
 *
 * MONTÉ DANS LE LAYOUT DE LA BOUTIQUE DEPUIS LS-262, et rejoué à chaque
 * changement de chemin : sur une page qui ne le montait pas, `data-borne`
 * restait vide et la lune de Notre univers jouait au chargement, hors de
 * l'écran, revue de LS-262.
 *
 * SANS SCRIPT, L'ATTRIBUT RESTE VIDE : les animations finies, toutes sous cinq
 * secondes, jouent une fois, et le bandeau défilant, dont l'animation
 * n'existe que sous un état posé ici, reste immobile.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useMouvementAutorise } from "./use-mouvement-autorise";

/** Au plus cinq secondes de mouvement par entrée dans l'écran, WCAG 2.2.2. */
export const DUREE_MAX_MS = 5_000;

export function AnimationsBornees() {
  const mouvement = useMouvementAutorise();
  const chemin = usePathname();

  useEffect(() => {
    if (!mouvement) return;

    const minuteries = new Map<Element, number>();

    const arreter = (cible: Element) => {
      const minuterie = minuteries.get(cible);
      if (minuterie !== undefined) window.clearTimeout(minuterie);
      minuteries.delete(cible);
    };

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          const cible = entree.target;
          arreter(cible);
          if (!entree.isIntersecting) {
            cible.setAttribute("data-borne", "attente");
            continue;
          }
          cible.setAttribute("data-borne", "joue");
          minuteries.set(
            cible,
            window.setTimeout(() => {
              cible.setAttribute("data-borne", "fin");
              minuteries.delete(cible);
            }, DUREE_MAX_MS),
          );
        }
      },
      { threshold: 0.15 },
    );

    const cibles = document.querySelectorAll("[data-borne]");
    cibles.forEach((cible) => observateur.observe(cible));

    return () => {
      observateur.disconnect();
      minuteries.forEach((minuterie) => window.clearTimeout(minuterie));
      minuteries.clear();
      cibles.forEach((cible) => cible.setAttribute("data-borne", ""));
    };
  }, [mouvement, chemin]);

  return null;
}
