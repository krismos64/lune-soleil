"use client";

/**
 * Scène du matin à la nuit, pilotée par le défilement. LS-260, ADR-045.
 *
 * LES PHRASES SONT RENDUES PAR LE SERVEUR et arrivent en `children` : ce
 * composant ne produit aucun texte. Chacune est un élément marqué
 * `data-phrase`.
 *
 * DEUX MODES. Sans script ou en mouvement réduit, la scène est un bloc
 * statique où les phrases se lisent l'une sous l'autre, sur le ciel du matin.
 * Animée, elle devient une scène collante haute de plusieurs écrans : le ciel
 * passe de l'aube à la nuit, le soleil se couche, la lune se lève, et une seule
 * phrase est visible à la fois. `data-mode` porte la bascule, posée ici après
 * le montage.
 *
 * LE CIEL LIT LES JETONS `--ls-ciel-*` au lieu d'en recopier les valeurs, et
 * LA COULEUR DU TEXTE EST CHOISIE PAR CONTRASTE CALCULÉ à chaque étape, entre
 * `--ls-primary-hover` et `--ls-texte-nuit`, sur la teinte réelle au milieu de
 * la scène. Un seuil fixe sur la progression laissait le texte sombre sur un
 * crépuscule déjà foncé, défaut relevé sur la maquette.
 *
 * LA PHRASE MASQUÉE PORTE `aria-hidden` : un lecteur d'écran lit l'état
 * affiché, et non trois phrases dont deux sont transparentes.
 *
 * RIEN N'EST AUTOMATIQUE : le mouvement suit le défilement, WCAG 2.2.2 ne
 * s'applique pas, et le calcul ne tourne qu'au défilement, une fois par image.
 */
import { useEffect, useRef, type ReactNode } from "react";

import styles from "./scene-cycle.module.css";

type Rgb = readonly [number, number, number];

/** Les quatre étapes du ciel, du haut vers le bas de la scène. */
const ETAPES = ["aube", "jour", "crepuscule", "nuit"] as const;

/** Positions fixes des étoiles, en pourcentage : aucun tirage au hasard. */
const ETOILES = [
  [8, 12],
  [17, 34],
  [23, 8],
  [31, 52],
  [38, 21],
  [44, 63],
  [52, 14],
  [57, 41],
  [63, 27],
  [69, 58],
  [74, 9],
  [81, 36],
  [86, 19],
  [92, 48],
  [12, 61],
  [27, 44],
  [48, 30],
  [66, 5],
  [78, 66],
  [95, 26],
] as const;

function lireCouleur(styleRacine: CSSStyleDeclaration, jeton: string): Rgb {
  const hex = styleRacine.getPropertyValue(jeton).trim().replace("#", "");
  return [0, 2, 4].map((i) =>
    parseInt(hex.slice(i, i + 2), 16),
  ) as unknown as Rgb;
}

function melanger(a: Rgb, b: Rgb, t: number): Rgb {
  return a.map((v, i) =>
    Math.round(v + ((b[i] ?? v) - v) * t),
  ) as unknown as Rgb;
}

/** Luminance relative WCAG 2.2. */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function rapportContraste(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const rgb = (c: Rgb) => `rgb(${c.join(", ")})`;

export function SceneCycle({
  titre,
  children,
}: {
  titre: string;
  children: ReactNode;
}) {
  const section = useRef<HTMLElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const soleil = useRef<HTMLDivElement>(null);
  const lune = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const racine = section.current;
    const decor = scene.current;
    if (!racine || !decor) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const style = getComputedStyle(document.documentElement);
    const ciel = ETAPES.map((etape) => ({
      haut: lireCouleur(style, `--ls-ciel-${etape}-haut`),
      bas: lireCouleur(style, `--ls-ciel-${etape}-bas`),
    }));
    const sombre = lireCouleur(style, "--ls-primary-hover");
    const clair = lireCouleur(style, "--ls-texte-nuit");
    const phrases = [...racine.querySelectorAll<HTMLElement>("[data-phrase]")];

    racine.dataset.mode = "anime";

    let image = 0;
    const rendre = () => {
      image = 0;
      const boite = racine.getBoundingClientRect();
      const course = Math.max(1, boite.height - window.innerHeight);
      const t = Math.min(1, Math.max(0, -boite.top / course));

      const position = t * (ciel.length - 1);
      const i = Math.min(ciel.length - 2, Math.floor(position));
      const f = position - i;
      const depart = ciel[i];
      const arrivee = ciel[i + 1];
      if (!depart || !arrivee) return;
      const haut = melanger(depart.haut, arrivee.haut, f);
      const bas = melanger(depart.bas, arrivee.bas, f);
      const milieu = melanger(haut, bas, 0.5);
      const texteClair =
        rapportContraste(clair, milieu) > rapportContraste(sombre, milieu);

      decor.style.setProperty("--ciel-haut", rgb(haut));
      decor.style.setProperty("--ciel-bas", rgb(bas));
      decor.style.setProperty(
        "--cycle-texte",
        rgb(texteClair ? clair : sombre),
      );
      decor.style.setProperty(
        "--etoiles",
        Math.max(0, (t - 0.6) / 0.4).toFixed(3),
      );

      const largeur = Math.min(window.innerWidth, 1200) * 0.42;
      const hauteur = window.innerHeight * 0.36;
      const angleSoleil = Math.PI * (0.15 + t * 0.95);
      const angleLune = Math.PI * (-0.1 + Math.max(0, t - 0.45) * 1.6);
      if (soleil.current) {
        soleil.current.style.transform = `translate(${-Math.cos(angleSoleil) * largeur}px, ${-Math.sin(angleSoleil) * hauteur + hauteur * 0.4}px)`;
        soleil.current.style.opacity = String(
          Math.max(0, 1 - Math.max(0, t - 0.7) * 4),
        );
      }
      if (lune.current) {
        lune.current.style.transform = `translate(${-Math.cos(angleLune) * largeur}px, ${-Math.sin(angleLune) * hauteur + hauteur * 0.5}px) rotate(${t * 30}deg)`;
        lune.current.style.opacity = String(
          Math.min(1, Math.max(0, (t - 0.45) * 4)),
        );
      }

      const active = t < 0.33 ? 0 : t < 0.66 ? 1 : 2;
      phrases.forEach((phrase, k) => {
        const visible = k === Math.min(active, phrases.length - 1);
        phrase.dataset.active = String(visible);
        phrase.setAttribute("aria-hidden", String(!visible));
      });
    };

    const demander = () => {
      if (!image) image = window.requestAnimationFrame(rendre);
    };

    rendre();
    window.addEventListener("scroll", demander, { passive: true });
    window.addEventListener("resize", demander);

    return () => {
      window.removeEventListener("scroll", demander);
      window.removeEventListener("resize", demander);
      window.cancelAnimationFrame(image);
      delete racine.dataset.mode;
      for (const phrase of phrases) {
        delete phrase.dataset.active;
        phrase.removeAttribute("aria-hidden");
      }
    };
  }, []);

  return (
    <section ref={section} className={styles.cycle} aria-label={titre}>
      <div ref={scene} className={styles.scene}>
        <div className={styles.etoiles} aria-hidden="true">
          {ETOILES.map(([x, y]) => (
            <i key={`${x}-${y}`} style={{ left: `${x}%`, top: `${y}%` }} />
          ))}
        </div>
        <div
          ref={soleil}
          className={`${styles.astre} ${styles.soleil}`}
          aria-hidden="true"
        />
        <div
          ref={lune}
          className={`${styles.astre} ${styles.lune}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 100 100" focusable="false">
            <path d="M62 8 C30 4 10 30 14 56 C18 82 46 96 70 84 C46 86 30 68 31 47 C32 28 44 13 62 8Z" />
          </svg>
        </div>
        <div className={styles.horizon} aria-hidden="true" />
        <div className={styles.phrases}>{children}</div>
      </div>
    </section>
  );
}
