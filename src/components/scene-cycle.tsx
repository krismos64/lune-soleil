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
 * `--ls-primary-hover` et `--ls-texte-nuit`, sur toute la bande où se pose le
 * texte, de 30 à 70 % de la hauteur, et non sur un seul point.
 *
 * AUCUNE PHRASE PENDANT LE PASSAGE AU CRÉPUSCULE, et c'est une contrainte
 * mathématique. Un ciel qui passe continûment du clair au foncé croise une
 * teinte où ni le texte sombre ni le texte clair n'atteint 4,5:1 : au mieux
 * 3,37:1 avec ces deux couleurs. Calculé sur les jetons au pas de 0,001, le
 * texte tient 4,5:1 sur toute la bande pour t < 0,570 et t > 0,774. Les
 * fenêtres de `FENETRES` se posent dans ces intervalles avec une marge, et
 * une garde refuse en plus d'afficher une phrase sous le seuil si un jeton
 * changeait. Revue de LS-260.
 *
 * LES PHRASES MASQUÉES RESTENT DANS L'ARBRE D'ACCESSIBILITÉ. Un lecteur
 * d'écran en curseur virtuel ne fait pas défiler la fenêtre : `aria-hidden`
 * sur les phrases hors fenêtre les lui retirait purement, ce que la première
 * version faisait. Seule l'opacité porte la bascule.
 *
 * RIEN N'EST AUTOMATIQUE : le mouvement suit le défilement, WCAG 2.2.2 ne
 * s'applique pas, et le calcul ne tourne qu'au défilement, une fois par image.
 */
import { useEffect, useRef, type ReactNode } from "react";

import styles from "./scene-cycle.module.css";
import { useMouvementAutorise } from "./use-mouvement-autorise";

type Rgb = readonly [number, number, number];

/** Les quatre étapes du ciel, du haut vers le bas de la scène. */
const ETAPES = ["aube", "jour", "crepuscule", "nuit"] as const;

/** Fenêtres de progression de chaque phrase, hors du passage au crépuscule. */
const FENETRES = [
  [0, 0.25],
  [0.3, 0.55],
  [0.8, 1],
] as const;

/** Seuil WCAG 2.2 AA du texte courant, les phrases `p` faisant 17 px. */
const SEUIL_CONTRASTE = 4.5;

/** Points de la bande où se pose le texte, en part de la hauteur de scène. */
const BANDE_TEXTE = [0.3, 0.4, 0.5, 0.6, 0.7] as const;

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

  const mouvement = useMouvementAutorise();

  useEffect(() => {
    const racine = section.current;
    const decor = scene.current;
    if (!racine || !decor || !mouvement) return;

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
      const bande = BANDE_TEXTE.map((part) => melanger(haut, bas, part));
      const pire = (texte: Rgb) =>
        Math.min(...bande.map((fond) => rapportContraste(texte, fond)));
      const contrasteClair = pire(clair);
      const contrasteSombre = pire(sombre);
      const texteClair = contrasteClair > contrasteSombre;
      const lisible =
        Math.max(contrasteClair, contrasteSombre) >= SEUIL_CONTRASTE;

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

      phrases.forEach((phrase, k) => {
        const fenetre = FENETRES[k];
        const visible =
          lisible &&
          fenetre !== undefined &&
          t >= fenetre[0] &&
          t <= fenetre[1];
        phrase.dataset.active = String(visible);
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
      for (const phrase of phrases) delete phrase.dataset.active;
      for (const propriete of [
        "--ciel-haut",
        "--ciel-bas",
        "--cycle-texte",
        "--etoiles",
      ])
        decor.style.removeProperty(propriete);
    };
  }, [mouvement]);

  return (
    <section ref={section} className={styles.cycle} aria-label={titre}>
      <div ref={scene} className={styles.scene}>
        <div className={styles.etoiles} aria-hidden="true" />
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
