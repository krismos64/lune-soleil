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
import styles from "./poussiere-or.module.css";

/**
 * NOMBRE DE GRAINS. Leurs positions, tailles et retards vivent dans le module
 * CSS, par `nth-child` : écrits en style en ligne, ils l'étaient deux fois
 * dans la page, en HTML et dans la charge utile de React, et retardaient la
 * première peinture sur un réseau lent, mesuré en LS-260.
 */
const NOMBRE_GRAINS = 16;

export function PoussiereOr() {
  return (
    <div className={styles.poussiere} aria-hidden="true">
      {Array.from({ length: NOMBRE_GRAINS }, (_, i) => (
        <span key={i} className={styles.grain} />
      ))}
    </div>
  );
}
