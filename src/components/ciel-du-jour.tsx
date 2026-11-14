/**
 * L'en-tête du tableau de bord, LS-325 : un arc où le soleil, ou la lune, se
 * tient à la place de l'heure. La marque s'appelle Lune-soleil, et c'est le
 * seul décor animé de l'administration, ADR-045 amendé le 14 novembre 2026.
 *
 * COMPOSANT SERVEUR, SANS SCRIPT : la position est calculée ici, à l'heure de
 * Paris, et rendue telle quelle. Rien ne se recalcule dans le navigateur.
 *
 * UNE ENTRÉE, UNE SEULE, puis plus rien ne bouge : l'arc se trace, l'astre
 * gagne sa place depuis l'horizon. Aucune boucle. En mouvement réduit,
 * l'astre est posé à sa place dès le premier rendu.
 *
 * AUCUN TEXTE N'EST POSÉ SUR CE FOND, qui change avec l'heure : la date et la
 * salutation vivent dessous, sur la surface ordinaire. Décor pur,
 * `aria-hidden`.
 */
import type { CSSProperties } from "react";

import styles from "./ciel-du-jour.module.css";

/** Le soleil se lève à 6 h et se couche à 21 h, heures rondes d'un atelier. */
const LEVER = 6;
const COUCHER = 21;

export type Moment = "aube" | "jour" | "crepuscule" | "nuit";

/** Ce que l'arc montre à une heure donnée, de 0 à 24, décimales comprises. */
export function momentDuJour(heure: number): {
  moment: Moment;
  astre: "soleil" | "lune";
  /** Avancement de l'astre sur son arc, de 0 (levant) à 1 (couchant). */
  avancement: number;
} {
  const h = ((heure % 24) + 24) % 24;
  if (h >= LEVER && h < COUCHER) {
    return {
      moment: h < 9 ? "aube" : h < 18 ? "jour" : "crepuscule",
      astre: "soleil",
      avancement: (h - LEVER) / (COUCHER - LEVER),
    };
  }
  const depuisCoucher = (h - COUCHER + 24) % 24;
  return {
    moment: "nuit",
    astre: "lune",
    avancement: depuisCoucher / (24 - COUCHER + LEVER),
  };
}

/** L'heure de Paris, décimale : 14 h 30 vaut 14,5. */
export function heureDeParis(instant: Date): number {
  const parties = new Intl.DateTimeFormat("fr-FR", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: "Europe/Paris",
  }).formatToParts(instant);
  const lire = (type: string): number =>
    Number(parties.find((partie) => partie.type === type)?.value ?? 0);
  return (lire("hour") % 24) + lire("minute") / 60;
}

const LARGEUR = 400;
const HAUTEUR = 96;
const MARGE = 28;
const SOL = 84;
const SOMMET = 62;

/** Un point de l'arc : une demi-sinusoïde posée sur l'horizon. */
const point = (t: number): [number, number] => [
  +(MARGE + (LARGEUR - 2 * MARGE) * t).toFixed(1),
  +(SOL - SOMMET * Math.sin(Math.PI * t)).toFixed(1),
];

const ARC = Array.from({ length: 33 }, (_, i) => point(i / 32))
  .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`)
  .join(" ");

/** Quelques étoiles fixes, la nuit seulement. */
const ETOILES = [
  [52, 22, 1.4],
  [118, 40, 1],
  [176, 14, 1.6],
  [238, 34, 1.1],
  [296, 18, 1.5],
  [348, 44, 1],
] as const;

export function CielDuJour({ heure }: { heure: number }) {
  const { moment, astre, avancement } = momentDuJour(heure);
  const [x, y] = point(avancement);
  const [x0, y0] = point(0);
  return (
    <div className={styles.ciel} data-moment={moment} aria-hidden="true">
      <svg
        className={styles.dessin}
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        preserveAspectRatio="xMidYMax meet"
        focusable="false"
      >
        {moment === "nuit"
          ? ETOILES.map(([cx, cy, r]) => (
              <circle
                key={`${cx}-${cy}`}
                className={styles.etoile}
                cx={cx}
                cy={cy}
                r={r}
              />
            ))
          : null}
        <path className={styles.arc} d={ARC} pathLength={1} />
        <path className={styles.horizon} d={`M0 ${SOL}H${LARGEUR}`} />
        <g
          className={styles.astre}
          style={
            {
              "--depart-x": `${(x0 - x).toFixed(1)}px`,
              "--depart-y": `${(y0 - y).toFixed(1)}px`,
            } as CSSProperties
          }
        >
          {astre === "soleil" ? (
            <>
              <circle className={styles.halo} cx={x} cy={y} r="17" />
              <circle className={styles.soleil} cx={x} cy={y} r="9" />
            </>
          ) : (
            <path
              className={styles.lune}
              transform={`translate(${x - 10} ${y - 10})`}
              d="M12 1.5C6 1.5 1.5 6 1.5 11.5S6 20 11.5 19.5C7.5 18 5.5 14.5 6 10.5 6.5 6.5 9 3.5 12 1.5Z"
            />
          )}
        </g>
      </svg>
    </div>
  );
}
