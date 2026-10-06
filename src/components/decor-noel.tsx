/**
 * Décors des thèmes de Noël, `NOEL_1` et `NOEL_2`, LS-277, d'après la maquette
 * validée de `docs/prototypes/themes-noel/`.
 *
 * COMPOSANTS SERVEUR, SANS SCRIPT. Les positions sont fixes et écrites ici,
 * jamais tirées au hasard au rendu : le serveur et le navigateur rendent le
 * même balisage, et rien ne se décale après l'affichage, ADR-046 section 5.
 *
 * DEUX SORTES DE MOUVEMENT, ADR-045 amendé par LS-277 :
 * - l'ENTRÉE, finie et sous cinq secondes (descente des boules, glissé des
 *   bandes) ;
 * - le MOUVEMENT CONTINU, réservé aux décors listés par l'amendement (neige,
 *   bercement des boules), marqué `data-continu`. `globals.css` le laisse
 *   tourner après la borne de cinq secondes, et le bouton de pause le fige.
 *
 * TOUT EST `aria-hidden` et `pointer-events: none`, jamais posé sur un texte,
 * une photographie de bijou ou un contrôle.
 */
import type { CSSProperties } from "react";

import styles from "./decor-noel.module.css";

const variables = (valeurs: Record<string, string | number>): CSSProperties =>
  valeurs as CSSProperties;

/** Flocon à six branches, en trait. */
export function FloconIcone({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 1v10M1.7 3.5l8.6 5M1.7 8.5l8.6-5M4.6 1.8 6 3.2 7.4 1.8M4.6 10.2 6 8.8l1.4 1.4" />
    </svg>
  );
}

/** Nœud de ruban, plein. */
export function NoeudIcone({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 34 22"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M17 11C11 1 3 2 3 8s8 5 14 3c6 2 14 3 14-3S23 1 17 11Z"
        fill="currentColor"
      />
      <path
        d="M15 12l-5 9 4-1 2 2 1-9M19 12l5 9-4-1-2 2-1-9"
        fill="currentColor"
        opacity=".85"
      />
    </svg>
  );
}

/** Petit paquet cadeau, en trait. */
export function PaquetIcone({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="7" width="13" height="9" rx="1" />
      <path d="M1.5 4.5h15V7h-15zM9 4.5V16M9 4.5C7 1 4 2 5.2 4.5M9 4.5C11 1 14 2 12.8 4.5" />
    </svg>
  );
}

/*
 * Cinq boules, en pourcentage de la largeur de leur zone. `a` est l'amplitude
 * du premier balancement en degrés, alterné pour un mouvement naturel.
 */
const BOULES = [
  { x: 12, fil: 70, taille: 30, a: 14, blanche: false },
  { x: 30, fil: 118, taille: 40, a: -11, blanche: true },
  { x: 50, fil: 84, taille: 34, a: 9, blanche: false },
  { x: 69, fil: 132, taille: 44, a: -13, blanche: false },
  { x: 87, fil: 92, taille: 30, a: 12, blanche: true },
] as const;

/**
 * Boules suspendues. Elles descendent, se balancent, puis se bercent en
 * continu de 2,5 degrés. Le conteneur porte `data-continu` : seul le bercement
 * dépasse la borne de cinq secondes.
 */
export function BoulesSuspendues({ zone }: { zone: "embleme" | "bandeau" }) {
  return (
    <div
      className={`${styles.boules} ${zone === "embleme" ? styles.boulesEmbleme : styles.boulesBandeau}`}
      aria-hidden="true"
      data-continu=""
    >
      {BOULES.map((boule, i) => (
        <div
          key={boule.x}
          className={`${styles.boule} ${boule.blanche ? styles.bouleBlanche : ""}`}
          style={variables({ "--rang": i, "--x": `${boule.x}%` })}
        >
          <div
            className={styles.balance}
            style={variables({ "--amplitude": `${boule.a}deg` })}
          >
            <div
              className={styles.fil}
              style={variables({ "--longueur": `${boule.fil}px` })}
            />
            <div
              className={styles.corps}
              style={variables({ "--taille": `${boule.taille}px` })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Flocons qui tombent en continu dans leur zone, positions fixes. Un flocon
 * sur trois est plus petit, un sur quatre plus grand.
 */
export function NeigeContinue({ nombre = 22 }: { nombre?: number }) {
  return (
    <div className={styles.neige} aria-hidden="true" data-continu="">
      {Array.from({ length: nombre }, (_, i) => (
        <span
          key={i}
          className={styles.flocon}
          style={variables({
            "--gauche": `${(i * 37) % 100}%`,
            "--retard": `${((i * 0.31) % 3.4).toFixed(2)}s`,
            "--duree": `${(3.2 + (i % 5) * 0.4).toFixed(1)}s`,
            "--derive": `${((i * 7) % 24) - 12}px`,
          })}
        />
      ))}
    </div>
  );
}

/** Neige des deux marges de la grille du catalogue, grand écran seulement. */
export function MargesNeigeuses() {
  return (
    <div className={styles.marges} aria-hidden="true" data-borne="">
      {(["gauche", "droite"] as const).map((cote, c) => (
        <div
          key={cote}
          className={`${styles.marge} ${cote === "gauche" ? styles.margeGauche : styles.margeDroite}`}
          data-continu=""
        >
          {Array.from({ length: 14 }, (_, i) => (
            <span
              key={i}
              className={styles.floconMarge}
              style={variables({
                "--gauche": `${(i * 41 + c * 17) % 90}%`,
                "--retard": `${((i * 0.83) % 9).toFixed(2)}s`,
                "--duree": `${9 + (i % 4) * 2}s`,
                "--derive": `${((i * 5) % 20) - 10}px`,
              })}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Bande sucre d'orge, qui glisse deux fois puis s'arrête. */
export function BandeSucreOrge({
  className,
}: {
  className?: string | undefined;
}) {
  return (
    <div
      className={`${styles.sucreOrge} ${className ?? ""}`}
      aria-hidden="true"
      data-borne=""
    />
  );
}

/** Bande de papier cadeau, `public/habillage/papier-cadeau.jpg`. */
export function BandePapierCadeau() {
  return (
    <div className={styles.papierCadeau} aria-hidden="true" data-borne="" />
  );
}
