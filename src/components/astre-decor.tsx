/**
 * Décor d'astre des pages vitrines, LS-262, ADR-045.
 *
 * DEUX VARIANTES, LE FIL DU JOUR D'UNE PAGE : `lever`, un soleil qui monte
 * au-dessus d'un horizon, ouvre une page ; `lune`, un croissant entouré de
 * quelques étoiles, la ferme. Notre univers suit ainsi le même trajet que la
 * scène de l'accueil, sans poser de texte sur un ciel qui change : les textes
 * de LS-25 restent sur leurs fonds mesurés.
 *
 * COMPOSANT SERVEUR, AUCUN SCRIPT. Décor muet, `aria-hidden`. Les animations
 * sont finies et durent moins de cinq secondes, WCAG 2.2.2 ; `data-borne` les
 * suspend hors de l'écran, ce qui fait jouer la lune de la sortie quand elle
 * arrive en vue et non au chargement.
 */
import styles from "./astre-decor.module.css";

export function AstreDecor({ variante }: { variante: "lever" | "lune" }) {
  return (
    <div
      className={`${styles.decor} ${styles[variante]}`}
      aria-hidden="true"
      data-borne=""
    >
      {variante === "lever" ? (
        <svg viewBox="0 0 160 70" focusable="false">
          <g className={styles.soleilLevant}>
            <circle cx="80" cy="56" r="20" className={styles.disque} />
            <path
              className={styles.rayons}
              pathLength={1}
              d="M80 28v-12M58 36l-8-8M102 36l8-8M50 52H38M110 52h12"
            />
          </g>
          <path className={styles.horizon} pathLength={1} d="M8 58h144" />
        </svg>
      ) : (
        <svg viewBox="0 0 160 70" focusable="false">
          <path
            className={styles.croissant}
            d="M92 10 C70 6 54 24 58 44 C62 62 82 70 98 62 C82 64 70 52 71 38 C72 24 80 14 92 10Z"
          />
          <path
            className={styles.etoile}
            style={{ animationDelay: "600ms" }}
            d="M40 22l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"
          />
          <path
            className={styles.etoile}
            style={{ animationDelay: "900ms" }}
            d="M124 30l1.5 5 5 1.5-5 1.5-1.5 5-1.5-5-5-1.5 5-1.5z"
          />
          <circle
            className={styles.etoile}
            style={{ animationDelay: "1200ms" }}
            cx="114"
            cy="12"
            r="2"
          />
        </svg>
      )}
    </div>
  );
}
