/**
 * Décors du thème Black Week, LS-318, d'après la maquette validée de
 * `docs/prototypes/theme-black-week/`.
 *
 * COMPOSANTS SERVEUR, SANS SCRIPT, comme les décors de Noël : positions fixes
 * écrites ici, jamais tirées au hasard au rendu, ADR-046 section 5.
 *
 * DEUX SORTES DE MOUVEMENT, ADR-045 amendé par LS-277 puis LS-318 :
 * - l'ENTRÉE, finie et sous cinq secondes : le soleil se lève, ses rayons se
 *   tracent, le liseré d'or se déroule ;
 * - le MOUVEMENT CONTINU, marqué `data-continu` et joué seulement sous un état
 *   posé par le script (`joue` ou `fin`) : rotation lente des rayons, halo
 *   qui respire, poussière d'or du bandeau et des marges. Le bouton de pause
 *   le fige ; sans script, rien ne tourne sans fin, WCAG 2.2.2.
 *
 * LE REFLET QUI BALAIE « WEEK » DANS LA MAQUETTE N'EST PAS PORTÉ : ADR-045
 * interdit tout mouvement sur un texte et l'animation de `background-position`.
 *
 * TOUT EST `aria-hidden` et `pointer-events: none`, jamais posé sur un texte,
 * une photographie de bijou ou un contrôle.
 */
import type { CSSProperties } from "react";

import styles from "./decor-black-week.module.css";

const variables = (valeurs: Record<string, string | number>): CSSProperties =>
  valeurs as CSSProperties;

const NOMBRE_RAYONS = 24;

/** Les rayons du soleil, alternés longs et courts, en coordonnées centrées. */
const RAYONS = Array.from({ length: NOMBRE_RAYONS }, (_, i) => {
  const angle = (i / NOMBRE_RAYONS) * Math.PI * 2;
  const long = i % 2 === 0;
  const debut = long ? 54 : 58;
  const fin = long ? 96 : 78;
  return {
    x1: +(Math.cos(angle) * debut).toFixed(1),
    y1: +(Math.sin(angle) * debut).toFixed(1),
    x2: +(Math.cos(angle) * fin).toFixed(1),
    y2: +(Math.sin(angle) * fin).toFixed(1),
    long,
  };
});

/**
 * Le soleil levant et sa poussière d'or, dans une zone de décor qui ne
 * chevauche jamais le texte du bandeau.
 */
export function SoleilBlackWeek({
  className,
}: {
  className?: string | undefined;
}) {
  return (
    <div
      className={`${styles.zone} ${className ?? ""}`}
      aria-hidden="true"
      data-borne=""
    >
      <PoussiereDoree nombre={24} />
      <div className={styles.soleil}>
        <div className={styles.halo} data-continu="" />
        <svg
          className={styles.rayons}
          viewBox="-100 -100 200 200"
          focusable="false"
          data-continu=""
        >
          {RAYONS.map((rayon, i) => (
            <line
              key={i}
              className={rayon.long ? styles.rayonLong : styles.rayonCourt}
              x1={rayon.x1}
              y1={rayon.y1}
              x2={rayon.x2}
              y2={rayon.y2}
              pathLength={1}
              style={variables({ "--rang": i })}
            />
          ))}
        </svg>
        <div className={styles.disque} />
      </div>
    </div>
  );
}

/** Grains d'or qui montent et s'éteignent, en continu, positions fixes. */
function PoussiereDoree({ nombre }: { nombre: number }) {
  return (
    <div className={styles.poussiere} data-continu="">
      {Array.from({ length: nombre }, (_, i) => (
        <span
          key={i}
          className={styles.grain}
          style={variables({
            "--gauche": `${(i * 37) % 100}%`,
            "--haut": `${30 + ((i * 53) % 65)}%`,
            "--retard": `${((i * 0.47) % 6).toFixed(2)}s`,
            "--duree": `${(5 + (i % 5) * 0.9).toFixed(1)}s`,
            "--derive": `${((i * 11) % 60) - 30}px`,
          })}
        />
      ))}
    </div>
  );
}

/** Liseré d'or sous le bandeau, qui se déroule une fois. */
export function LisereOr({ className }: { className?: string | undefined }) {
  return (
    <div
      className={`${styles.lisere} ${className ?? ""}`}
      aria-hidden="true"
      data-borne=""
    />
  );
}

/** Poussière d'or des deux marges de la grille, grand écran seulement. */
export function MargesDorees() {
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
              className={styles.grainMarge}
              style={variables({
                "--gauche": `${(i * 41 + c * 17) % 90}%`,
                "--retard": `${((i * 0.83) % 9).toFixed(2)}s`,
                "--duree": `${12 + (i % 4) * 2.5}s`,
                "--derive": `${((i * 5) % 30) - 15}px`,
              })}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Liseré doré d'une carte, tracé au survol et au focus, HORS de la carte et
 * jamais sur la photographie. Une transition d'interaction, pas une animation
 * automatique.
 *
 * LE RECTANGLE COUVRE TOUT LE SVG, posé 3 px au-delà du bord de la carte : le
 * trait de 2 px, centré sur son contour, tombe entièrement dehors. La première
 * version le posait à 1 px dans une carte qui coupait ses débordements : seule
 * la part du trait sur la photographie restait visible, et `99 %` le rentrait
 * encore à droite. Relevé par `ls-frontend-revue`.
 */
export function TraceCarte() {
  return (
    <svg className={styles.traceCarte} aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="100%" height="100%" rx="11" pathLength={1} />
    </svg>
  );
}

/** Sac d'achat en trait, doré, dans le bouton « Ajouter au panier ». */
export function SacIcone({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

/** Étincelles à quatre branches, de part et d'autre du texte du bandeau. */
const ETINCELLES = [
  { haut: "18%", gauche: "22%", taille: 14, retard: "0s" },
  { haut: "62%", gauche: "58%", taille: 10, retard: "0.9s" },
  { haut: "34%", gauche: "78%", taille: 8, retard: "1.7s" },
  { haut: "74%", gauche: "16%", taille: 9, retard: "2.4s" },
] as const;

function Etincelles({ cote }: { cote: "gauche" | "droite" }) {
  return (
    <span className={styles.etincelles} aria-hidden="true" data-continu="">
      {ETINCELLES.map((e, i) => (
        <svg
          key={i}
          className={styles.etincelle}
          viewBox="-10 -10 20 20"
          focusable="false"
          style={variables({
            "--haut": e.haut,
            "--gauche":
              cote === "gauche" ? e.gauche : `calc(100% - ${e.gauche})`,
            "--taille": `${e.taille}px`,
            "--retard": e.retard,
          })}
        >
          <path d="M0-10C1 -2 2 -1 10 0C2 1 1 2 0 10C-1 2 -2 1 -10 0C-2 -1 -1 -2 0-10Z" />
        </svg>
      ))}
    </span>
  );
}

/**
 * LE BANDEAU BLACK WEEK EN TÊTE DE L'ACCUEIL, LS-322, demande de Christophe
 * du 13 novembre 2026, codé sans maquette sur son arbitrage.
 *
 * LE TEXTE EST IMMOBILE, ADR-045 : seuls bougent la comète d'or qui fait le
 * tour du cadre et les étincelles des deux côtés, jamais par-dessus une
 * lettre. Le mouvement est continu, donc marqué `data-continu` sous le
 * `data-borne` du héros : il n'existe qu'avec le script, sous le bouton de
 * pause, et disparaît en mouvement réduit.
 *
 * LE TAUX ET LA PÉRIODE NE VIENNENT QUE DE LA PROMOTION ACTIVE, ADR-051 et
 * ADR-046 : sans promotion, le bandeau ne nomme que l'événement. La portée,
 * « toute la boutique » ou « les pièces signalées », est celle que le
 * serveur calcule pour `AnnoncePromotion`, jamais une formule écrite ici.
 */
export function BandeauBlackWeek({
  promotion,
}: {
  promotion: {
    taux: number;
    periodeAnnoncee: string | null;
    toutLeCatalogue: boolean;
  } | null;
}) {
  return (
    /*
     * SOUS PROMOTION, LE BANDEAU REPREND LA RÉGION « Promotion en cours » de
     * `AnnoncePromotion`, qu'il remplace sur l'accueil : le repère survit à
     * la navigation par régions. Sans promotion, aucune région.
     */
    <div
      className={styles.bandeau}
      {...(promotion === null
        ? {}
        : { role: "region", "aria-label": "Promotion en cours" })}
    >
      <svg
        className={styles.cadreBandeau}
        aria-hidden="true"
        focusable="false"
        data-continu=""
      >
        <rect className={styles.cadreFixe} width="100%" height="100%" rx="14" />
        <rect
          className={styles.comete}
          width="100%"
          height="100%"
          rx="14"
          pathLength={1}
        />
      </svg>
      <Etincelles cote="gauche" />
      <div className={styles.texteBandeau}>
        <p className={styles.titreBandeau}>
          Black <span className={styles.orBandeau}>Week</span>
        </p>
        {promotion === null ? null : (
          <>
            <p className={styles.offreBandeau}>
              <span className={styles.tauxBandeau}>
                −{promotion.taux}&nbsp;%
              </span>{" "}
              {promotion.toutLeCatalogue
                ? "sur toute la boutique"
                : "sur les pièces signalées"}
            </p>
            {promotion.periodeAnnoncee === null ? null : (
              <p className={styles.sousTitreBandeau}>
                {promotion.periodeAnnoncee}
              </p>
            )}
          </>
        )}
      </div>
      <Etincelles cote="droite" />
    </div>
  );
}
