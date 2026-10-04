"use client";

/**
 * Bornage des animations automatiques, ADR-045 point 4, WCAG 2.2.2. LS-260.
 *
 * Aucun bouton de pause, arbitrage de Christophe du 4 octobre 2026 : une
 * animation qui dure s'arrête donc d'elle-même. Tout élément marqué
 * `data-borne` passe par trois états, et `globals.css` suspend ses animations
 * hors de `joue` :
 *
 *   attente  hors de l'écran, rien ne tourne
 *   joue     entré dans l'écran, au plus `DUREE_MAX_MS`
 *   fin      la durée est écoulée, l'animation reste figée où elle est
 *
 * Ressortir puis revenir dans l'écran rouvre une fenêtre : le visiteur qui
 * revient voit à nouveau le mouvement, jamais plus de dix secondes d'affilée.
 *
 * SANS SCRIPT, L'ATTRIBUT RESTE VIDE et aucune règle de suspension ne
 * s'applique : les animations finies de l'emblème jouent une fois, et le
 * bandeau défilant, dont l'animation n'existe que sous `joue`, reste immobile.
 *
 * EN MOUVEMENT RÉDUIT, RIEN NE S'INSTALLE : le CSS a déjà retiré les
 * animations, et un observateur ne servirait à rien.
 */
import { useEffect } from "react";

/** Au plus dix secondes de mouvement par entrée dans l'écran. */
export const DUREE_MAX_MS = 10_000;

export function AnimationsBornees() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
  }, []);

  return null;
}
