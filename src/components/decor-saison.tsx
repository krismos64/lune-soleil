/**
 * Décors des douze thèmes d'ambiance, LS-323, amendement d'ADR-046 du
 * 14 novembre 2026. UN SEUL JEU DE COMPOSANTS pour les douze : chaque thème
 * ne fournit que ses deux jetons (`--ls-saison-un`, `--ls-saison-deux`) et sa
 * ligne dans `AMBIANCES`, motifs et mouvement.
 *
 * COMPOSANTS SERVEUR, SANS SCRIPT, comme les décors de Noël et de Black Week :
 * positions fixes écrites ici, jamais tirées au hasard au rendu, ADR-046
 * section 5.
 *
 * DEUX SORTES DE MOUVEMENT, ADR-045 amendé par LS-323 :
 * - l'ENTRÉE, finie et sous cinq secondes : l'anneau se trace, le grand motif
 *   et la couronne éclosent, la frise se déroule ;
 * - le MOUVEMENT CONTINU, marqué `data-continu` et joué seulement sous un état
 *   posé par le script (`joue` ou `fin`) : la nuée de motifs, le halo qui
 *   respire, l'anneau pointillé qui tourne, le grand motif qui bat, tourne ou
 *   se balance. Le bouton de pause le fige ; sans script, rien ne tourne sans
 *   fin, WCAG 2.2.2.
 *
 * TOUT EST `aria-hidden` et `pointer-events: none`, jamais posé sur un texte,
 * une photographie de bijou ou un contrôle. Seul `BandeauOperation` porte du
 * texte, immobile.
 */
import { useId, type CSSProperties, type ReactNode } from "react";

import type {
  Ambiance,
  MotifSaison as Motif,
  MouvementSaison,
} from "@/lib/theme-saisonnier";

import styles from "./decor-saison.module.css";

const variables = (valeurs: Record<string, string | number>): CSSProperties =>
  valeurs as CSSProperties;

const classes = (...noms: (string | false | undefined)[]): string =>
  noms.filter(Boolean).join(" ");

/**
 * Le dessin de chaque motif, dans une boîte de 24 par 24. `currentColor` porte
 * la teinte de saison ; les détails clairs sont en `--ls-surface`, l'or des
 * soleils et du mimosa vient des jetons d'or du logo, décor seulement.
 */
const DESSINS: Record<Motif, ReactNode> = {
  coeur: (
    <path d="M12 20.5C5.5 15.6 3 12.3 3 8.8 3 6 5.1 4 7.7 4c1.7 0 3.3.9 4.3 2.4C13 4.9 14.6 4 16.3 4 18.9 4 21 6 21 8.8c0 3.5-2.5 6.8-9 11.7Z" />
  ),
  etoile: (
    <path d="M12 2c.9 6.2 3.8 9.1 10 10-6.2.9-9.1 3.8-10 10-.9-6.2-3.8-9.1-10-10 6.2-.9 9.1-3.8 10-10Z" />
  ),
  feu: (
    <>
      <path
        className={styles.trait}
        d="M12 1.5v5.2M12 17.3v5.2M1.5 12h5.2M17.3 12h5.2M4.6 4.6l3.7 3.7M15.7 15.7l3.7 3.7M19.4 4.6l-3.7 3.7M8.3 15.7l-3.7 3.7"
      />
      <circle className={styles.or} cx="12" cy="12" r="1.9" />
      <circle className={styles.or} cx="18.6" cy="8.6" r=".9" />
      <circle className={styles.or} cx="5.4" cy="15.4" r=".9" />
    </>
  ),
  fleur: (
    <>
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse
          key={angle}
          cx="12"
          cy="6.4"
          rx="3.1"
          ry="4.7"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      <circle className={styles.or} cx="12" cy="12" r="2.5" />
    </>
  ),
  mimosa: (
    <>
      <path className={styles.trait} d="M4.5 21.5C9 17.5 13.5 12 19.5 3.5" />
      {(
        [
          [6.6, 15.4, 2.7],
          [11.6, 17, 2.2],
          [10.4, 9.8, 2.7],
          [15.8, 12, 2.3],
          [14.6, 4.9, 2.4],
          [19.6, 8, 1.9],
        ] as const
      ).map(([cx, cy, r]) => (
        <circle
          key={`${cx}-${cy}`}
          className={styles.or}
          cx={cx}
          cy={cy}
          r={r}
        />
      ))}
    </>
  ),
  oeuf: (
    <>
      <path d="M12 2.5c3.6 0 7 5.6 7 10.6 0 4.6-3.1 8.4-7 8.4s-7-3.8-7-8.4c0-5 3.4-10.6 7-10.6Z" />
      <path
        className={styles.detail}
        d="M5.7 12.4l2.1-2 2.1 2 2.1-2 2.1 2 2.1-2 2.1 2"
      />
      <circle className={styles.or} cx="9" cy="16.6" r="1.1" />
      <circle className={styles.or} cx="15" cy="16.6" r="1.1" />
      <circle className={styles.or} cx="12" cy="6.6" r="1.1" />
    </>
  ),
  soleil: (
    <>
      <circle className={styles.or} cx="12" cy="12" r="4.8" />
      <path
        className={styles.trait}
        d="M12 1.6v3.2M12 19.2v3.2M1.6 12h3.2M19.2 12h3.2M4.6 4.6l2.3 2.3M17.1 17.1l2.3 2.3M19.4 4.6l-2.3 2.3M6.9 17.1l-2.3 2.3"
      />
    </>
  ),
  feuille: (
    <>
      <path d="M3.5 20.5C3.5 10 9.5 3.5 20.5 3.5c0 11-6.5 17-17 17Z" />
      <path
        className={styles.detail}
        d="M3.5 20.5 15.5 8.5M9 15V10.4M9 15h4.6"
      />
    </>
  ),
  ruban: (
    <path
      fillRule="evenodd"
      d="M12 2.5c-2.7 0-4.4 1.7-4.4 3.8 0 1.5.8 3.2 2.1 5.2L5 20.6l3.6-.5 1.3 3.4L12 15.4l2.1 8.1 1.3-3.4 3.6.5-4.7-9.1c1.3-2 2.1-3.7 2.1-5.2 0-2.1-1.7-3.8-4.4-3.8Zm0 2.4c1.2 0 1.9.6 1.9 1.5 0 .8-.6 2-1.9 3.8-1.3-1.8-1.9-3-1.9-3.8 0-.9.7-1.5 1.9-1.5Z"
    />
  ),
  moustache: (
    <path d="M12 10.9c-1.2-2.1-3.5-2.7-5.2-1.4-1.5 1.2-3 1.4-4.8.3.5 3.4 2.8 5.5 5.8 5.5 1.9 0 3.3-.9 4.2-2.4.9 1.5 2.3 2.4 4.2 2.4 3 0 5.3-2.1 5.8-5.5-1.8 1.1-3.3.9-4.8-.3-1.7-1.3-4-.7-5.2 1.4Z" />
  ),
  flocon: (
    <path
      className={styles.trait}
      d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9.6 3.9 12 6.3l2.4-2.4M9.6 20.1 12 17.7l2.4 2.4M3.4 10.5l3.3-.9-.9-3.3M20.6 13.5l-3.3.9.9 3.3M3.4 13.5l3.3.9-.9 3.3M20.6 10.5l-3.3-.9.9-3.3"
    />
  ),
  etiquette: (
    <>
      <path d="M3 12.7V4.6C3 3.7 3.7 3 4.6 3h8.1c.4 0 .8.2 1.1.5l7 7c.6.6.6 1.6 0 2.2l-8.1 8.1c-.6.6-1.6.6-2.2 0l-7-7c-.3-.3-.5-.7-.5-1.1Z" />
      <circle className={styles.percee} cx="7.6" cy="7.6" r="1.7" />
      <path className={styles.detail} d="M11 15.2l4.2-4.2" />
    </>
  ),
};

/**
 * Le mouvement continu du grand motif, choisi par sa forme : un cœur bat, un
 * flocon ou un soleil tourne, une étoile scintille, le reste se balance.
 */
const ALLURE: Record<Motif, "bat" | "tourne" | "balance" | "scintille"> = {
  coeur: "bat",
  etoile: "scintille",
  feu: "tourne",
  fleur: "tourne",
  mimosa: "balance",
  oeuf: "balance",
  soleil: "tourne",
  feuille: "balance",
  ruban: "balance",
  moustache: "balance",
  flocon: "tourne",
  etiquette: "balance",
};

/** Un motif de saison, décor pur. */
export function MotifSaison({
  motif,
  className,
}: {
  motif: Motif;
  className?: string | undefined;
}) {
  return (
    <svg
      className={classes(styles.motif, className)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {DESSINS[motif]}
    </svg>
  );
}

const TEINTES = [styles.teinteUn, styles.teinteDeux, styles.teintePale];

/**
 * LA NUÉE : des motifs qui tombent, montent ou scintillent en continu dans
 * leur zone, positions fixes. Absente en mouvement réduit, immobile et
 * invisible sans script.
 */
export function NueeSaison({
  ambiance,
  nombre = 14,
  ronde = false,
}: {
  ambiance: Ambiance;
  nombre?: number;
  /** Zone coupée en disque, pour l'emblème rond de l'accueil. */
  ronde?: boolean;
}) {
  const scintille = ambiance.mouvement === "scintille";
  return (
    <div
      className={classes(styles.nuee, ronde && styles.nueeRonde)}
      aria-hidden="true"
      data-continu=""
      data-mouvement={ambiance.mouvement}
    >
      {Array.from({ length: nombre }, (_, i) => (
        <span
          key={i}
          className={classes(styles.grain, TEINTES[i % TEINTES.length])}
          style={variables({
            "--gauche": `${(i * 37 + 6) % 94}%`,
            // En scintillement, le motif reste en place : il lui faut une
            // hauteur. En chute ou en montée, il traverse la zone.
            "--haut": scintille ? `${(i * 53 + 9) % 86}%` : "0%",
            "--taille": `${10 + ((i * 5) % 4) * 3}px`,
            "--retard": `${((i * 0.67) % 7).toFixed(2)}s`,
            "--duree": `${(scintille ? 2.6 : 6.5) + (i % 5) * (scintille ? 0.5 : 1.1)}s`,
            "--derive": `${((i * 13) % 44) - 22}px`,
            "--tour": `${((i * 47) % 140) - 70}deg`,
          })}
        >
          <MotifSaison
            motif={ambiance.motifs[i % ambiance.motifs.length] ?? "etoile"}
          />
        </span>
      ))}
    </div>
  );
}

/** Six motifs posés en couronne, à 46 % du centre : ils éclosent un à un. */
const COURONNE = [
  { angle: -62, taille: 13 },
  { angle: -8, taille: 9 },
  { angle: 48, taille: 11 },
  { angle: 118, taille: 9 },
  { angle: 176, taille: 12 },
  { angle: 232, taille: 8 },
] as const;

/**
 * La couronne de motifs autour de l'emblème de l'accueil, dans son cadre :
 * elle n'en sort pas et ne touche ni le titre ni les boutons.
 */
export function CouronneSaison({ ambiance }: { ambiance: Ambiance }) {
  return (
    <div className={styles.couronne} aria-hidden="true">
      <div className={styles.haloSaison} data-continu="" />
      {COURONNE.map(({ angle, taille }, i) => {
        const radian = (angle * Math.PI) / 180;
        return (
          <span
            key={angle}
            className={classes(
              styles.perle,
              TEINTES[i % TEINTES.length === 2 ? 0 : i % TEINTES.length],
            )}
            data-continu=""
            style={variables({
              "--x": `${(50 + Math.cos(radian) * 46).toFixed(1)}%`,
              "--y": `${(50 + Math.sin(radian) * 46).toFixed(1)}%`,
              "--taille": `${taille}%`,
              "--rang": i,
            })}
          >
            <MotifSaison
              motif={ambiance.motifs[i % ambiance.motifs.length] ?? "etoile"}
            />
          </span>
        );
      })}
    </div>
  );
}

/**
 * LE MÉDAILLON DE SAISON du bandeau du catalogue : un anneau qui se trace, un
 * anneau pointillé qui tourne, le grand motif du thème au centre, sa couronne
 * et sa nuée. Dans une zone de décor à part, jamais sur le texte.
 */
export function SceneSaison({
  ambiance,
  className,
}: {
  ambiance: Ambiance;
  className?: string | undefined;
}) {
  const grand = ambiance.motifs[0];
  return (
    <div
      className={classes(styles.scene, className)}
      aria-hidden="true"
      data-borne=""
    >
      <NueeSaison ambiance={ambiance} nombre={12} />
      <div className={styles.medaillon}>
        <div className={styles.haloSaison} data-continu="" />
        <svg
          className={styles.anneaux}
          viewBox="-100 -100 200 200"
          focusable="false"
        >
          <circle className={styles.anneauTrace} r="94" pathLength={1} />
          <circle className={styles.anneauPointille} r="80" data-continu="" />
        </svg>
        <div className={styles.grand}>
          <div
            className={styles.allure}
            data-allure={ALLURE[grand]}
            data-continu=""
          >
            <MotifSaison motif={grand} />
          </div>
        </div>
        <CouronneSaison ambiance={ambiance} />
      </div>
    </div>
  );
}

/**
 * La frise au pied d'un bandeau : le motif du thème répété, qui se déroule une
 * fois de gauche à droite. Un motif SVG et non une image, donc net à toute
 * largeur et teinté par les jetons.
 */
export function FriseSaison({
  ambiance,
  className,
}: {
  ambiance: Ambiance;
  className?: string | undefined;
}) {
  const id = `frise-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [premier, second = premier] = ambiance.motifs;
  return (
    <div
      className={classes(styles.frise, className)}
      aria-hidden="true"
      data-borne=""
    >
      <svg className={styles.friseDessin} focusable="false">
        <defs>
          <pattern id={id} width="72" height="20" patternUnits="userSpaceOnUse">
            <g
              className={styles.teinteUn}
              transform="translate(6 3) scale(.58)"
            >
              {DESSINS[premier]}
            </g>
            <circle className={styles.pointFrise} cx="30" cy="10" r="1.6" />
            <g
              className={styles.teinteDeux}
              transform="translate(42 4.5) scale(.46)"
            >
              {DESSINS[second]}
            </g>
            <circle className={styles.pointFrise} cx="66" cy="10" r="1.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

/** Motifs des deux marges de la grille du catalogue, grand écran seulement. */
export function MargesSaison({ ambiance }: { ambiance: Ambiance }) {
  const sens: MouvementSaison =
    ambiance.mouvement === "monte" ? "monte" : "tombe";
  return (
    <div className={styles.marges} aria-hidden="true" data-borne="">
      {(["gauche", "droite"] as const).map((cote, c) => (
        <div
          key={cote}
          className={classes(
            styles.marge,
            cote === "gauche" ? styles.margeGauche : styles.margeDroite,
          )}
          data-continu=""
          data-mouvement={sens}
        >
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className={classes(
                styles.grain,
                styles.grainMarge,
                TEINTES[(i + c) % TEINTES.length],
              )}
              style={variables({
                "--gauche": `${(i * 41 + c * 17) % 84}%`,
                "--haut": "0%",
                "--taille": `${11 + ((i * 3) % 3) * 3}px`,
                "--retard": `${((i * 1.37) % 12).toFixed(2)}s`,
                "--duree": `${14 + (i % 4) * 2.5}s`,
                "--derive": `${((i * 7) % 28) - 14}px`,
                "--tour": `${((i * 61) % 160) - 80}deg`,
              })}
            >
              <MotifSaison
                motif={ambiance.motifs[i % ambiance.motifs.length] ?? "etoile"}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Liseré d'une carte aux couleurs du thème, tracé au survol et au focus, HORS
 * de la carte et jamais sur la photographie : même construction que le liseré
 * doré de Black Week, LS-318. Une transition d'interaction, pas une animation
 * automatique.
 */
export function TraceCarteSaison() {
  return (
    <svg className={styles.traceCarte} aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="100%" height="100%" rx="11" pathLength={1} />
    </svg>
  );
}

/** Le ruban d'un thème : son motif et le nom de l'événement, texte immobile. */
export function RubanSaison({
  ambiance,
  className,
}: {
  ambiance: Ambiance;
  className?: string | undefined;
}) {
  return (
    <p className={classes(styles.ruban, className)}>
      <MotifSaison motif={ambiance.motifs[0]} className={styles.motifRuban} />
      {ambiance.evenement}
    </p>
  );
}

/**
 * LE BANDEAU D'OPÉRATION EN TÊTE DE L'ACCUEIL, pour les six thèmes que
 * l'exploitante associe à une réduction, LS-323. Même contrat que le bandeau
 * Black Week de LS-322.
 *
 * LE TEXTE EST IMMOBILE, ADR-045 : seuls bougent le trait qui fait le tour du
 * cadre et les motifs des deux côtés, jamais par-dessus une lettre. Mouvement
 * continu, donc `data-continu` sous le `data-borne` du héros.
 *
 * LE TAUX ET LA PÉRIODE NE VIENNENT QUE DE LA PROMOTION ACTIVE, ADR-051 et
 * ADR-046 : sans promotion, le bandeau ne nomme que l'événement. La portée,
 * « toute la boutique » ou « les pièces signalées », est celle que le serveur
 * calcule pour `AnnoncePromotion`, jamais une formule écrite ici.
 */
export function BandeauOperation({
  ambiance,
  promotion,
}: {
  ambiance: Ambiance;
  promotion: {
    taux: number;
    periodeAnnoncee: string | null;
    toutLeCatalogue: boolean;
  } | null;
}) {
  const [premier, second = premier] = ambiance.motifs;
  return (
    /*
     * SOUS PROMOTION, LE BANDEAU REPREND LA RÉGION « Promotion en cours » de
     * `AnnoncePromotion`, qu'il remplace sur l'accueil. Sans promotion, aucune
     * région.
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
      <span className={styles.cote} aria-hidden="true" data-continu="">
        <MotifSaison motif={premier} className={styles.motifCote} />
        <MotifSaison motif={second} className={styles.motifCotePetit} />
      </span>
      <div className={styles.texteBandeau}>
        <p className={styles.titreBandeau}>{ambiance.evenement}</p>
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
      <span
        className={classes(styles.cote, styles.coteDroit)}
        aria-hidden="true"
        data-continu=""
      >
        <MotifSaison motif={second} className={styles.motifCotePetit} />
        <MotifSaison motif={premier} className={styles.motifCote} />
      </span>
    </div>
  );
}
