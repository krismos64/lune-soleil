"use client";

/**
 * Bouton de pause des animations des thèmes de Noël, ADR-045 amendé par
 * LS-277, WCAG 2.2.2.
 *
 * SOUS LES THÈMES DE NOËL, des décors bougent EN CONTINU : la neige, les
 * rayons du soleil, le bercement des boules. Le critère 2.2.2 exige alors un
 * moyen de les arrêter. Ce bouton pose `pause-animations` sur la racine, et
 * `globals.css` fige tout ce qui bouge dans le `<main>`, décors bornés compris.
 *
 * FLOTTANT, pour rester atteignable partout où quelque chose bouge, jusqu'à la
 * neige des marges du catalogue. Discret, 32 px, mais une cible de 44 px.
 *
 * ABSENT EN MOUVEMENT RÉDUIT : rien n'y bouge, il n'y aurait rien à mettre en
 * pause. Le choix vaut pour toute la visite, `sessionStorage`, et sa lecture
 * ne lève jamais : un stockage refusé laisse simplement les animations jouer.
 */
import { useEffect, useState } from "react";

import styles from "./bouton-pause-animations.module.css";
import { useMouvementAutorise } from "./use-mouvement-autorise";

const CLE = "lune-soleil-pause-animations";
const CLASSE = "pause-animations";

function lirePause(): boolean {
  try {
    return window.sessionStorage.getItem(CLE) === "1";
  } catch {
    return false;
  }
}

export function BoutonPauseAnimations() {
  const mouvement = useMouvementAutorise();
  const [pause, setPause] = useState(false);

  // Le choix mémorisé n'est lu qu'au montage : le rendu serveur ne le connaît
  // pas, et le lire pendant le rendu ferait diverger les deux.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPause(lirePause());
  }, []);

  useEffect(() => {
    const racine = document.documentElement;
    racine.classList.toggle(CLASSE, pause);
    try {
      window.sessionStorage.setItem(CLE, pause ? "1" : "0");
    } catch {
      // Stockage refusé : le choix ne survivra pas à la page, sans conséquence.
    }
    return () => racine.classList.remove(CLASSE);
  }, [pause]);

  if (!mouvement) {
    return null;
  }

  const libelle = pause
    ? "Relancer les animations"
    : "Mettre en pause les animations";

  return (
    <button
      type="button"
      className={styles.bouton}
      aria-pressed={pause}
      aria-label={libelle}
      title={libelle}
      onClick={() => setPause((avant) => !avant)}
    >
      {pause ? (
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M3.5 2 10 6l-6.5 4z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path
            d="M3 2v8M9 2v8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
