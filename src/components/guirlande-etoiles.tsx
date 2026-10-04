/**
 * Guirlande d'étoiles du thème de Noël, page des créations, ADR-046.
 *
 * AU-DESSUS DU TITRE, JAMAIS SUR UN BIJOU : décor pur, `aria-hidden`. Le fil
 * se trace, puis les neuf étoiles suspendues s'allument une fois ; tout est
 * fini avant cinq secondes, et immobile en mouvement réduit, ADR-045.
 *
 * COMPOSANT SERVEUR. Les positions sont calculées ici, une fois, sur la
 * courbe du fil : deux arcs de Bézier quadratiques, le second reflétant le
 * point de contrôle du premier, comme la commande `T` du tracé.
 */
import type { CSSProperties } from "react";

import styles from "./guirlande-etoiles.module.css";

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

export function GuirlandeEtoiles() {
  return (
    <div className={styles.cadre} aria-hidden="true" data-borne="">
      <svg className={styles.guirlande} viewBox="0 0 640 56" focusable="false">
        <path className={styles.fil} d={FIL} pathLength={1} />
        {POINTS.map(({ x, y }, i) => (
          <g key={x} className={styles.etoile} style={rang(i)}>
            <line x1={x} y1={y} x2={x} y2={y + 8} />
            <path
              transform={`translate(${x} ${y + 14})`}
              d="M0 -7 l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
