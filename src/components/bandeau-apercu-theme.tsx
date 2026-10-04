/**
 * Bandeau d'aperçu d'un thème saisonnier, ADR-046, revue de LS-267.
 *
 * RENDU POUR LA SEULE SESSION ADMINISTRATRICE QUI DEMANDE UN APERÇU : il dit
 * que le thème affiché n'est pas appliqué, et ramène aux paramètres. Une
 * région d'état nommée, LS-85, au-dessus du contenu.
 */
import Link from "next/link";

import {
  LIBELLES_THEMES,
  type ThemeSaisonnier,
} from "@/services/theme-saisonnier";

import styles from "./bandeau-apercu-theme.module.css";

export function BandeauApercuTheme({ theme }: { theme: ThemeSaisonnier }) {
  return (
    <p className={styles.bandeau} role="status" aria-label="Aperçu du thème">
      Aperçu de {LIBELLES_THEMES[theme]}, visible pour votre session seulement :
      il n&apos;est pas appliqué.{" "}
      <Link
        href="/administration/parametres"
        className={styles.lien}
        prefetch={false}
      >
        Revenir aux paramètres
      </Link>
    </p>
  );
}
