/**
 * Poussière d'or du héros d'accueil, LS-260.
 *
 * UNE FORME DE PAILLETTES, `frontend-design.md` et ADR-045 : CSS déterministe,
 * positions FIXES et non tirées au hasard, aucun canvas, `aria-hidden`,
 * `pointer-events: none`, supprimée en mouvement réduit. Les grains montent et
 * s'éteignent en deux passages, moins de dix secondes en tout.
 *
 * COMPOSANT SERVEUR, aucun script.
 */
import type { CSSProperties } from "react";

import styles from "./poussiere-or.module.css";

/** Position en pourcentage, taille en pixels, retard en millisecondes. */
const GRAINS = [
  [6, 72, 3, 0],
  [12, 38, 2, 400],
  [19, 85, 2, 900],
  [24, 22, 3, 300],
  [31, 64, 2, 1200],
  [38, 12, 2, 600],
  [44, 48, 3, 1000],
  [51, 80, 2, 200],
  [57, 30, 2, 1400],
  [63, 66, 3, 500],
  [69, 18, 2, 800],
  [74, 55, 2, 1300],
  [80, 88, 3, 100],
  [86, 34, 2, 700],
  [91, 70, 2, 1100],
  [96, 16, 3, 1500],
] as const;

export function PoussiereOr() {
  return (
    <div className={styles.poussiere} aria-hidden="true">
      {GRAINS.map(([x, y, taille, retard]) => (
        <span
          key={`${x}-${y}`}
          className={styles.grain}
          style={
            {
              left: `${x}%`,
              top: `${y}%`,
              width: `${taille}px`,
              height: `${taille}px`,
              animationDelay: `${retard}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
