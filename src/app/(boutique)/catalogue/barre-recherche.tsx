/**
 * La barre de recherche du catalogue public, arbitrage de Christophe du
 * 22 novembre 2026.
 *
 * UN FORMULAIRE `GET`, SANS JAVASCRIPT, comme les filtres : le terme s'écrit
 * dans l'adresse, `?recherche=…`, ce qui garde le bouton retour et le lien
 * partagé. La catégorie retenue repart en champ caché : chercher ne remet pas
 * le filtre à zéro.
 *
 * LA `key` PORTE LE TERME, LS-199 : sans elle, React réutilise le champ et
 * garde le texte saisi après « Effacer », pendant que la grille montre tout.
 *
 * LE LIBELLÉ EST VISIBLE : un `placeholder` seul disparaît à la saisie et
 * n'est pas un nom accessible fiable.
 *
 * LA RECHERCHE N'EST PAS INDEXÉE : la page la porte en `noindex`, une adresse
 * par terme saisi diluerait le catalogue dans l'index.
 */
import Link from "next/link";

import { cheminCatalogue } from "@/lib/url-catalogue";
import { LONGUEUR_MAX_RECHERCHE } from "@/lib/recherche";
import styles from "./barre-recherche.module.css";

export function BarreRecherche({
  terme,
  slugCategorie,
}: {
  terme: string;
  slugCategorie: string | undefined;
}) {
  return (
    <form
      className={styles.recherche}
      role="search"
      method="get"
      action="/catalogue"
    >
      <label className={styles.libelle} htmlFor="recherche-catalogue">
        Rechercher une création
      </label>
      <div className={styles.cadre}>
        <svg
          className={styles.loupe}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
        <input
          key={terme}
          id="recherche-catalogue"
          name="recherche"
          type="search"
          className={styles.champ}
          defaultValue={terme}
          placeholder="Bague, lune, argent…"
          maxLength={LONGUEUR_MAX_RECHERCHE}
          autoComplete="off"
          enterKeyHint="search"
        />
        {slugCategorie ? (
          <input type="hidden" name="categorie" value={slugCategorie} />
        ) : null}
        <button type="submit" className={styles.bouton}>
          Rechercher
        </button>
      </div>
      {terme === "" ? null : (
        /*
         * Le terme est déjà redit par la ligne de compte de la grille,
         * « 3 pièces pour « lune » » : ici, seulement la sortie.
         */
        <p className={styles.rappel}>
          <Link
            href={cheminCatalogue({ categorie: slugCategorie })}
            className={styles.effacer}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
            Effacer la recherche
          </Link>
        </p>
      )}
    </form>
  );
}
