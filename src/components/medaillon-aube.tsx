/**
 * Médaillon d'aube : une aquarelle cerclée, un anneau doré qui se trace, des
 * rayons, des astres et de la poussière d'or. Décor des en-têtes de l'aide
 * (LS-280), des informations légales (LS-282) et du catalogue (LS-283),
 * ADR-045 amendé.
 *
 * COMPOSANT SERVEUR, SANS TEXTE. Il est `aria-hidden` en entier, son image a
 * un `alt` vide, et tout son mouvement est en CSS, borné à cinq secondes par
 * `data-borne` que pose `AnimationsBornees` depuis le layout de la boutique.
 *
 * L'AQUARELLE NE BOUGE PAS ET NE PART D'AUCUNE OPACITÉ NULLE : elle peut être
 * l'élément du LCP, et une apparition le retarderait. Seuls l'anneau, les
 * rayons, les astres et la poussière s'animent.
 *
 * UN SEUL MÉDAILLON PAR PAGE : l'identifiant du dégradé est fixe. Un second
 * exemplaire réutiliserait le premier dégradé, sans dommage visible, mais le
 * document porterait deux fois le même `id`.
 */
import Image from "next/image";
import type { CSSProperties } from "react";

import styles from "./medaillon-aube.module.css";

/** Un arrêt de dégradé SVG lu dans un jeton, jamais une valeur en dur. */
const arret = (jeton: string): CSSProperties => ({
  stopColor: `var(${jeton})`,
});

/** Rang d'un élément dans sa séquence, lu par le CSS du module. */
const rang = (i: number): CSSProperties => ({ "--i": i }) as CSSProperties;

export function MedaillonAube({
  image,
  cadrage = "50% 50%",
  taille,
}: {
  /** Chemin public de l'aquarelle, 3:2, dans `public/habillage/`. */
  image: string;
  /** `object-position` du recadrage dans le cercle. */
  cadrage?: string;
  /** `sizes` de l'image : la largeur réelle du médaillon dans la page. */
  taille: string;
}) {
  return (
    <div className={styles.medaillon} aria-hidden="true" data-borne="">
      <div className={styles.image}>
        <Image
          src={image}
          alt=""
          width={1200}
          height={800}
          sizes={taille}
          style={{ objectPosition: cadrage }}
        />
      </div>
      <svg className={styles.traces} viewBox="0 0 400 400">
        <defs>
          <linearGradient id="medaillon-or" x1="0" y1="0" x2="1" y2="1">
            <stop style={arret("--ls-or-sombre")} />
            <stop offset=".4" style={arret("--ls-or-clair")} />
            <stop offset=".7" style={arret("--ls-or-moyen")} />
            <stop offset="1" style={arret("--ls-or-pale")} />
          </linearGradient>
        </defs>
        <circle
          className={styles.anneau}
          cx="200"
          cy="200"
          r="190"
          pathLength={1}
          transform="rotate(-100 200 200)"
        />
        <circle className={styles.anneauPointille} cx="200" cy="200" r="174" />
        <g className={styles.rayons}>
          <path
            className={styles.trait}
            style={rang(0)}
            pathLength={1}
            d="M200 -6v-18"
          />
          <path
            className={styles.trait}
            style={rang(1)}
            pathLength={1}
            d="M406 200h18"
          />
          <path
            className={styles.trait}
            style={rang(2)}
            pathLength={1}
            d="M200 406v18"
          />
          <path
            className={styles.trait}
            style={rang(3)}
            pathLength={1}
            d="M-6 200h-18"
          />
        </g>
        <g className={styles.astres}>
          <path
            className={styles.eclat}
            style={rang(0)}
            d="M86 52c-22-2-36 18-30 38 5 17 24 25 40 17-15-1-25-13-24-27 1-13 6-23 14-28z"
          />
          <path
            className={styles.eclat}
            style={rang(1)}
            d="M352 70l5 18 18 5-18 5-5 18-5-18-18-5 18-5z"
          />
          <path
            className={styles.eclat}
            style={rang(2)}
            d="M40 300l4 13 13 4-13 4-4 13-4-13-13-4 13-4z"
          />
          <path
            className={styles.eclat}
            style={rang(3)}
            d="M330 340l3 10 10 3-10 3-3 10-3-10-10-3 10-3z"
          />
          <circle
            className={styles.eclat}
            style={rang(4)}
            cx="60"
            cy="86"
            r="4"
          />
        </g>
      </svg>
      <div className={styles.poussiere}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
    </div>
  );
}
