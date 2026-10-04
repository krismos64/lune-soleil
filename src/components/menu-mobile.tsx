"use client";

/**
 * Menu mobile plein écran de la boutique, LS-261, ADR-045.
 *
 * BÂTI SUR `<details>` POUR MARCHER SANS SCRIPT, critère 4 de LS-261. Sans
 * JavaScript, toucher « Menu » ouvre le panneau et le retoucher le ferme : le
 * navigateur gère seul l'état et l'annonce « développé » ou « réduit ». Le
 * script ajoute ce que le HTML seul ne sait pas faire :
 *
 *   - l'ouverture en cercle depuis le bouton, en mouvement autorisé seulement
 *   - le focus posé sur le premier lien, puis enfermé dans le menu
 *   - Échap qui ferme et rend le focus au bouton
 *   - la page derrière rendue `inert` et non défilable
 *   - la fermeture à chaque changement de page, l'en-tête survivant aux
 *     navigations client
 *
 * SOUS 768 PX SEULEMENT. Au-delà, la navigation en ligne de l'en-tête suffit et
 * le menu est masqué par le CSS ; un passage en largeur le referme.
 *
 * LES LIENS ARRIVENT DU SERVEUR en props, avec leur libellé exact : ce
 * composant n'invente ni destination ni texte.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./menu-mobile.module.css";
import { useMouvementAutorise } from "./use-mouvement-autorise";

export type EntreeMenu = {
  href: string;
  libelle: string;
  description: string;
};

/** Durée de la fermeture en cercle, alignée sur la transition du CSS. */
const DUREE_FERMETURE_MS = 700;

export function MenuMobile({
  entrees,
  compte,
  articles,
  nomBoutique,
}: {
  entrees: readonly EntreeMenu[];
  compte: { href: string; libelle: string };
  articles: number;
  nomBoutique: string;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const bouton = useRef<HTMLElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const mouvement = useMouvementAutorise();
  const chemin = usePathname();

  const appliquer = useCallback(
    (ouvrir: boolean, rendreFocus = false) => {
      const element = details.current;
      if (!element) return;
      setOuvert(ouvrir);

      const horsMenu = [
        ...document.querySelectorAll<HTMLElement>("main, footer"),
      ];
      horsMenu.forEach((noeud) => {
        noeud.inert = ouvrir;
      });
      document.documentElement.toggleAttribute("data-menu-ouvert", ouvrir);

      if (ouvrir) {
        element.open = true;
        window.requestAnimationFrame(() => {
          element.dataset.etat = "ouvert";
          window.setTimeout(
            () =>
              panneau.current
                ?.querySelector<HTMLElement>("a")
                ?.focus({ preventScroll: true }),
            mouvement ? 300 : 0,
          );
        });
        return;
      }

      delete element.dataset.etat;
      window.setTimeout(
        () => {
          if (!element.dataset.etat) element.open = false;
        },
        mouvement ? DUREE_FERMETURE_MS : 0,
      );
      if (rendreFocus) bouton.current?.focus();
    },
    [mouvement],
  );

  /* Le bouton bascule l'état ; le script prend la main sur le navigateur. */
  const surClic = (evenement: React.MouseEvent) => {
    evenement.preventDefault();
    appliquer(!ouvert);
  };

  /* Échap ferme, et la tabulation boucle dans le menu ouvert. */
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") {
        evenement.preventDefault();
        appliquer(false, true);
        return;
      }
      if (evenement.key !== "Tab" || !bouton.current || !panneau.current)
        return;
      evenement.preventDefault();
      const cibles = [
        bouton.current,
        ...panneau.current.querySelectorAll<HTMLElement>("a"),
      ];
      const rang = cibles.indexOf(document.activeElement as HTMLElement);
      const pas = evenement.shiftKey ? -1 : 1;
      cibles[(rang + pas + cibles.length) % cibles.length]?.focus();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert, appliquer]);

  /* Un changement de page referme le menu, l'en-tête n'étant pas re-rendu. */
  useEffect(() => {
    appliquer(false);
  }, [chemin, appliquer]);

  /* Passer en largeur referme le menu, masqué au-delà de 768 px. */
  useEffect(() => {
    const large = window.matchMedia("(min-width: 768px)");
    const surChangement = () => {
      if (large.matches) appliquer(false);
    };
    large.addEventListener("change", surChangement);
    return () => large.removeEventListener("change", surChangement);
  }, [appliquer]);

  /* Démonter le composant ne laisse jamais la page inerte. */
  useEffect(
    () => () => {
      document
        .querySelectorAll<HTMLElement>("main, footer")
        .forEach((noeud) => {
          noeud.inert = false;
        });
      document.documentElement.removeAttribute("data-menu-ouvert");
    },
    [],
  );

  return (
    <details
      ref={details}
      className={styles.menu}
      data-anime={mouvement ? "" : undefined}
    >
      <summary ref={bouton} className={styles.bouton} onClick={surClic}>
        <span className={styles.burger} aria-hidden="true" />
        <span className={styles.texteBouton}>{ouvert ? "Fermer" : "Menu"}</span>
      </summary>

      <div ref={panneau} className={styles.panneau}>
        <div className={styles.etoiles} aria-hidden="true" />
        <p className={styles.surtitre}>Bijoux faits main</p>

        <nav aria-label="Navigation principale">
          <ol className={styles.liens}>
            {entrees.map((entree, rang) => (
              <li
                key={entree.href}
                style={{ "--rang": rang } as React.CSSProperties}
              >
                <Link href={entree.href} className={styles.lien}>
                  <span className={styles.numero} aria-hidden="true">
                    {String(rang + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.libelle}>{entree.libelle}</span>
                  <span className={styles.description}>
                    {entree.description}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <div className={styles.raccourcis}>
          <Link href={compte.href} className={styles.raccourci}>
            {compte.libelle}
          </Link>
          <Link href="/panier" className={styles.raccourci}>
            {articles > 0 ? `Panier, ${articles}` : "Panier"}
          </Link>
        </div>

        <svg
          className={styles.astres}
          viewBox="0 0 150 90"
          aria-hidden="true"
          focusable="false"
        >
          <path
            className={styles.lune}
            d="M58 12 C34 8 18 28 22 50 C26 72 48 82 68 72 C48 74 34 60 35 44 C36 28 46 16 58 12Z"
          />
          <g className={styles.rayons}>
            <path d="M96 20v-10M96 72v10M70 46h-10M122 46h10M78 28l-7-7M114 28l7-7M78 64l-7 7M114 64l7 7" />
          </g>
          <circle className={styles.soleil} cx="96" cy="46" r="17" />
        </svg>
        <p className={styles.nom}>{nomBoutique}</p>
      </div>
    </details>
  );
}
