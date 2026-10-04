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

/** Inclinaison maximale d'une carte, en degrés. */
const INCLINAISON_MAX = 8;

export function ReactionPointeur() {
  useEffect(() => {
    const souris = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calme = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!souris.matches || calme.matches) return;

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

    const cartes = [
      ...document.querySelectorAll<HTMLElement>("[data-inclinaison] > li"),
    ];
    const surCarte = (evenement: PointerEvent) => {
      const carte = evenement.currentTarget as HTMLElement;
      const boite = carte.getBoundingClientRect();
      const x = (evenement.clientX - boite.left) / boite.width - 0.5;
      const y = (evenement.clientY - boite.top) / boite.height - 0.5;
      carte.style.transform = `perspective(900px) rotateY(${x * INCLINAISON_MAX}deg) rotateX(${-y * INCLINAISON_MAX}deg)`;
    };
    const quitterCarte = (evenement: PointerEvent) => {
      (evenement.currentTarget as HTMLElement).style.transform = "";
    };

    window.addEventListener("pointermove", surDeplacement, { passive: true });
    for (const carte of cartes) {
      carte.addEventListener("pointermove", surCarte);
      carte.addEventListener("pointerleave", quitterCarte);
    }

    return () => {
      window.removeEventListener("pointermove", surDeplacement);
      window.cancelAnimationFrame(image);
      for (const calque of calques) calque.style.transform = "";
      for (const carte of cartes) {
        carte.removeEventListener("pointermove", surCarte);
        carte.removeEventListener("pointerleave", quitterCarte);
        carte.style.transform = "";
      }
    };
  }, []);

  return null;
}
