/**
 * Guirlande de boules des thèmes de Noël, page des créations, ADR-046 amendé
 * par LS-277. Elle remplace la guirlande d'étoiles de LS-267.
 *
 * AU-DESSUS DU TITRE, JAMAIS SUR UN BIJOU : décor pur, `aria-hidden`. Le fil
 * se trace, puis les neuf boules rouges et blanches s'accrochent une fois ;
 * tout est fini avant cinq secondes, et immobile en mouvement réduit, ADR-045.
 *
 * COMPOSANT SERVEUR. Les positions sont calculées ici, une fois, sur la
 * courbe du fil : deux arcs de Bézier quadratiques, le second reflétant le
 * point de contrôle du premier, comme la commande `T` du tracé.
 */
import type { CSSProperties } from "react";

import styles from "./guirlande-boules.module.css";

const FIL = "M10 10 Q160 52 320 22 T630 10";

/** Point d'une courbe de Bézier quadratique au paramètre `t`. */
function bezier(
  depart: readonly [number, number],
  controle: readonly [number, number],
  arrivee: readonly [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * depart[0] + 2 * u * t * controle[0] + t * t * arrivee[0],
    u * u * depart[1] + 2 * u * t * controle[1] + t * t * arrivee[1],
  ];
}

/** Neuf points répartis sur les deux arcs, arrondis au dixième. */
const POINTS = Array.from({ length: 9 }, (_, i) => {
  const t = 0.08 + i * 0.105;
  const [x, y] =
    t < 0.5
      ? bezier([10, 10], [160, 52], [320, 22], t * 2)
      : bezier([320, 22], [480, -8], [630, 10], t * 2 - 1);
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
});

const rang = (i: number): CSSProperties => ({ "--rang": i }) as CSSProperties;

/**
 * Guirlande de boules rouges et blanches au-dessus du titre du catalogue,
 * thèmes `NOEL_1` et `NOEL_2`, LS-277. Elle remplace la guirlande d'étoiles
 * dorées de LS-267. Le fil se trace puis les boules s'accrochent une à une,
 * moins de cinq secondes en tout, ADR-045 ; dans le flux, au-dessus du titre,
 * sans chevauchement ni décalage après l'affichage, ADR-046 section 5.
 */
export function GuirlandeBoules() {
  return (
    <div className={styles.cadre} aria-hidden="true" data-borne="">
      <svg className={styles.guirlande} viewBox="0 0 640 56" focusable="false">
        <path className={styles.fil} d={FIL} pathLength={1} />
        {POINTS.map(({ x, y }, i) => (
          <g
            key={x}
            className={i % 2 === 0 ? styles.bouleRouge : styles.bouleBlanche}
            style={rang(i)}
          >
            <line x1={x} y1={y} x2={x} y2={y + 8} />
            <circle cx={x} cy={y + 15} r="6.5" />
          </g>
        ))}
      </svg>
    </div>
  );
}
