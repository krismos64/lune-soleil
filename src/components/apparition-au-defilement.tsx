"use client";

/**
 * Apparition douce des blocs secondaires au défilement, ADR-045. LS-260.
 *
 * UN BLOC N'EST MASQUÉ QUE S'IL EST HORS DE L'ÉCRAN AU MONTAGE. Le script le
 * passe alors à `data-apparition="attente"`, puis à `vu` quand il entre dans
 * l'écran. Un bloc déjà visible n'est jamais touché : il ne disparaît pas une
 * image après avoir été peint, ce que la maquette faisait au chargement.
 *
 * SANS SCRIPT, L'ATTRIBUT RESTE VIDE et `globals.css` ne masque rien. En
 * mouvement réduit, y compris activé en cours de visite, rien ne s'installe et
 * tout bloc encore en attente redevient visible.
 *
 * RÉSERVÉ AUX BLOCS SECONDAIRES, ADR-045 point 5 : un titre, une accroche, un
 * bouton d'action ou une carte de produit ne partent jamais d'une opacité
 * nulle, et ne portent donc jamais `data-apparition`.
 */
import { useEffect } from "react";

import { useMouvementAutorise } from "./use-mouvement-autorise";

export function ApparitionAuDefilement() {
  const mouvement = useMouvementAutorise();

  useEffect(() => {
    if (!mouvement) return;

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (!entree.isIntersecting) continue;
          entree.target.setAttribute("data-apparition", "vu");
          observateur.unobserve(entree.target);
        }
      },
      { threshold: 0.15 },
    );

    const hauteur = window.innerHeight;
    const cibles = [...document.querySelectorAll("[data-apparition]")];
    for (const cible of cibles) {
      const { top, bottom } = cible.getBoundingClientRect();
      if (top < hauteur && bottom > 0) continue;
      cible.setAttribute("data-apparition", "attente");
      observateur.observe(cible);
    }

    return () => {
      observateur.disconnect();
      cibles.forEach((cible) => cible.setAttribute("data-apparition", ""));
    };
  }, [mouvement]);

  return null;
}
