"use client";

/**
 * Réaction au pointeur, ADR-045. LS-260.
 *
 * Deux effets, un seul comportement : suivre la souris. Les calques marqués
 * `data-profondeur` se décalent d'autant de pixels au plus, et les cartes d'une
 * liste marquée `data-inclinaison` s'inclinent sous le pointeur.
 *
 * ORDINATEUR SEULEMENT, `(hover: hover) and (pointer: fine)` : sur écran
 * tactile il n'y a pas de survol, et un décalage au toucher gênerait le
 * défilement. Rien en mouvement réduit.
 *
 * UNE SEULE MISE À JOUR PAR IMAGE, `requestAnimationFrame` : un événement de
 * pointeur arrive bien plus souvent que l'écran ne se redessine.
 */
import { useEffect } from "react";

import { useMouvementAutorise } from "./use-mouvement-autorise";

/** Inclinaison maximale d'une carte, en degrés. */
const INCLINAISON_MAX = 8;

export function ReactionPointeur() {
  const mouvement = useMouvementAutorise();

  useEffect(() => {
    if (!mouvement) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;

    const calques = [
      ...document.querySelectorAll<HTMLElement | SVGElement>(
        "[data-profondeur]",
      ),
    ];
    let image = 0;

    const surDeplacement = (evenement: PointerEvent) => {
      if (image) return;
      image = window.requestAnimationFrame(() => {
        image = 0;
        const x = evenement.clientX / window.innerWidth - 0.5;
        const y = evenement.clientY / window.innerHeight - 0.5;
        for (const calque of calques) {
          const profondeur = Number(calque.dataset.profondeur ?? 0);
          calque.style.transform = `translate(${x * profondeur}px, ${y * profondeur}px)`;
        }
      });
    };

    /*
     * LES CARTES PAR DÉLÉGATION, LS-262 : un filtre ou un changement de page du
     * catalogue remplace les cartes sans démonter ce composant. Écouter le
     * document suit donc toujours les cartes affichées, là où une liste
     * relevée au montage aurait gardé des éléments disparus.
     */
    let carteActive: HTMLElement | null = null;
    const relacher = () => {
      if (carteActive) carteActive.style.transform = "";
      carteActive = null;
    };
    const surCarte = (evenement: PointerEvent) => {
      const carte = (evenement.target as Element | null)?.closest<HTMLElement>(
        "[data-inclinaison] > li",
      );
      if (carte !== carteActive) relacher();
      if (!carte) return;
      carteActive = carte;
      const boite = carte.getBoundingClientRect();
      const x = (evenement.clientX - boite.left) / boite.width - 0.5;
      const y = (evenement.clientY - boite.top) / boite.height - 0.5;
      carte.style.transform = `perspective(900px) rotateY(${x * INCLINAISON_MAX}deg) rotateX(${-y * INCLINAISON_MAX}deg)`;
    };

    window.addEventListener("pointermove", surDeplacement, { passive: true });
    document.addEventListener("pointermove", surCarte, { passive: true });
    document.addEventListener("pointerleave", relacher);

    return () => {
      window.removeEventListener("pointermove", surDeplacement);
      window.cancelAnimationFrame(image);
      for (const calque of calques) calque.style.transform = "";
      document.removeEventListener("pointermove", surCarte);
      document.removeEventListener("pointerleave", relacher);
      relacher();
    };
  }, [mouvement]);

  return null;
}
