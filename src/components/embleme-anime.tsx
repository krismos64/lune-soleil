/**
 * Emblème animé du héros d'accueil, LS-260, ADR-045.
 *
 * COMPOSANT SERVEUR, AUCUN SCRIPT. Tout le mouvement est en CSS : l'anneau et
 * les rayons se tracent, la lune glisse, le soleil grandit, les étoiles
 * scintillent. Le seul script qui le touche est `ReactionPointeur`, qui décale
 * les calques au pointeur sur ordinateur, par leur `data-profondeur`.
 *
 * LE DÉCOR EST MUET, `aria-hidden` : le titre de la page porte le sens, et un
 * logo annoncé avant le titre retarderait l'information utile.
 *
 * `pathLength="1"` NORMALISE CHAQUE TRACÉ. Le dessin progressif se règle alors
 * avec `stroke-dasharray: 1` et `stroke-dashoffset` de 1 à 0, sans mesurer la
 * longueur réelle dans le navigateur : la maquette le faisait en script, ce
 * qui laissait l'emblème vide sans JavaScript.
 *
 * LES COULEURS VIENNENT DES JETONS `--ls-or-*` par `style`, jamais en dur. Les
 * tracés reprennent le logo vectoriel fourni par Christophe.
 *
 * LES BOUCLES SONT FINIES, ADR-045 point 4 : tout s'arrête avant dix secondes,
 * avec ou sans script. `data-borne` permet en plus à `AnimationsBornees` de
 * suspendre ce qui sortirait de l'écran.
 */
import type { CSSProperties } from "react";

import styles from "./embleme-anime.module.css";

/** Les quatorze rayons du soleil, repris du logo vectoriel. */
const RAYONS = [
  "M690 346 C678 321 703 302 691 273",
  "M736 356 C742 329 772 326 780 298",
  "M773 386 C792 366 817 379 837 357",
  "M794 430 C820 420 837 444 866 433",
  "M795 478 C822 487 823 516 852 525",
  "M774 520 C794 540 779 565 800 585",
  "M736 548 C743 575 717 589 724 617",
  "M690 561 C679 587 699 608 686 636",
  "M644 549 C635 576 605 578 597 606",
  "M606 520 C585 539 560 524 539 546",
  "M585 478 C558 486 543 461 514 472",
  "M586 431 C558 423 558 393 529 385",
  "M606 389 C585 369 600 344 579 323",
  "M644 359 C636 333 661 316 653 288",
] as const;

/** Étoiles à quatre branches, centrées sur leur point d'ancrage. */
const ETOILES = [
  "M600 153 l6 25 25 6-25 6-6 25-6-25-25-6 25-6z",
  "M600 697 l5 21 21 5-21 5-5 21-5-21-21-5 21-5z",
  "M847 655 l4 17 17 4-17 4-4 17-4-17-17-4 17-4z",
  "M250 450 l4 16 16 4-16 4-4 16-4-16-16-4 16-4z",
] as const;

/** Feuilles des deux branches, symétriques. */
const FEUILLES = [
  { cx: 215, cy: 830, angle: -35 },
  { cx: 240, cy: 880, angle: -48 },
  { cx: 280, cy: 935, angle: -55 },
  { cx: 985, cy: 830, angle: 35 },
  { cx: 960, cy: 880, angle: 48 },
  { cx: 920, cy: 935, angle: 55 },
] as const;

const arret = (jeton: string): CSSProperties => ({
  stopColor: `var(${jeton})`,
});
const rang = (i: number): CSSProperties => ({ "--rang": i }) as CSSProperties;

export function EmblemeAnime() {
  return (
    <div className={styles.cadre} aria-hidden="true" data-borne="">
      <div className={styles.halo} />
      <svg
        className={styles.embleme}
        viewBox="30 30 1140 1140"
        focusable="false"
      >
        <defs>
          <linearGradient id="embleme-or" x1="0" y1="0" x2="1" y2="1">
            <stop style={arret("--ls-or-sombre")} />
            <stop offset=".35" style={arret("--ls-or-clair")} />
            <stop offset=".7" style={arret("--ls-or-moyen")} />
            <stop offset="1" style={arret("--ls-or-pale")} />
          </linearGradient>
          <radialGradient id="embleme-soleil" cx="40%" cy="35%" r="70%">
            <stop style={arret("--ls-or-pale")} />
            <stop offset=".5" style={arret("--ls-or-clair")} />
            <stop offset="1" style={arret("--ls-or-sombre")} />
          </radialGradient>
        </defs>

        <g className={styles.calque} data-profondeur="6">
          <circle
            className={`${styles.trait} ${styles.anneau}`}
            cx="600"
            cy="600"
            r="560"
            pathLength={1}
          />
        </g>

        <g className={styles.calque} data-profondeur="14">
          <path
            className={styles.lune}
            d="M535 257 C365 230 265 365 292 505 C318 640 452 702 570 635 C438 650 351 560 356 449 C360 348 431 279 535 257Z"
          />
        </g>

        <g className={styles.calque} data-profondeur="22">
          <g className={styles.rayons}>
            {RAYONS.map((d, i) => (
              <path
                key={d}
                className={`${styles.trait} ${styles.rayon}`}
                style={rang(i)}
                d={d}
                pathLength={1}
              />
            ))}
          </g>
          <circle className={styles.soleil} cx="690" cy="455" r="86" />
        </g>

        <g className={styles.calque} data-profondeur="30">
          {ETOILES.map((d, i) => (
            <path key={d} className={styles.etoile} style={rang(i)} d={d} />
          ))}
          <circle
            className={styles.etoile}
            style={rang(4)}
            cx="952"
            cy="392"
            r="5"
          />
          <circle
            className={styles.etoile}
            style={rang(5)}
            cx="742"
            cy="242"
            r="4"
          />
        </g>

        <g className={styles.calque} data-profondeur="10">
          <path
            className={`${styles.trait} ${styles.branche}`}
            d="M330 1000 C250 950 205 875 195 780"
            pathLength={1}
          />
          <path
            className={`${styles.trait} ${styles.branche}`}
            d="M870 1000 C950 950 995 875 1005 780"
            pathLength={1}
          />
          {FEUILLES.map(({ cx, cy, angle }, i) => (
            <ellipse
              key={`${cx}-${cy}`}
              className={styles.feuille}
              style={rang(i % 3)}
              cx={cx}
              cy={cy}
              rx="8"
              ry="23"
              transform={`rotate(${angle} ${cx} ${cy})`}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
