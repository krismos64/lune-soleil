/**
 * La recherche d'une liste de l'administration, refonte du 22 novembre 2026 :
 * commandes, retours, factures, produits, stock, messages et avis. Elle reprend
 * le motif de l'écran des comptes clients, LS-199.
 *
 * UN FORMULAIRE `GET`, SANS JAVASCRIPT : le terme s'écrit dans l'adresse,
 * `?recherche=…`, ce qui garde le bouton retour et le lien partagé, comme les
 * filtres. Les autres paramètres de la liste, le filtre de statut par exemple,
 * repartent en champs cachés : chercher ne remet pas le filtre à zéro.
 *
 * LA `key` PORTE LE TERME, LS-199 : sans elle, React réutilise le champ et
 * garde le texte saisi après « Effacer la recherche », pendant que la liste,
 * elle, montre tout.
 *
 * `autoComplete` ET `spellCheck` SONT COUPÉS : le champ reçoit des noms de
 * clients, que le navigateur mémoriserait et que le correcteur du système
 * transmettrait à un service tiers.
 */
import Link from "next/link";

import styles from "./recherche-liste.module.css";

export function RechercheListe({
  chemin,
  libelle,
  exemple,
  terme,
  conserver = {},
}: {
  /** L'écran de la liste, cible du formulaire et du lien d'effacement. */
  chemin: string;
  /** Ce que l'on peut chercher, dit en clair. */
  libelle: string;
  exemple: string;
  terme: string;
  /** Les paramètres de la liste à garder, le filtre de statut en tête. */
  conserver?: Record<string, string | undefined>;
}) {
  const gardes = Object.entries(conserver).filter(
    (entree): entree is [string, string] => entree[1] !== undefined,
  );
  const sansRecherche =
    gardes.length === 0
      ? chemin
      : `${chemin}?${new URLSearchParams(gardes).toString()}`;

  return (
    <form
      className={styles.recherche}
      role="search"
      method="get"
      action={chemin}
    >
      <label className={styles.libelle} htmlFor="recherche-liste">
        {libelle}
      </label>
      <div className={styles.ligne}>
        <input
          key={terme}
          id="recherche-liste"
          name="recherche"
          type="search"
          className={styles.champ}
          defaultValue={terme}
          placeholder={exemple}
          autoComplete="off"
          spellCheck={false}
        />
        {gardes.map(([nom, valeur]) => (
          <input key={nom} type="hidden" name={nom} value={valeur} />
        ))}
        <button type="submit" className={styles.bouton}>
          Rechercher
        </button>
      </div>
      {terme === "" ? null : (
        <p className={styles.rappel}>
          Résultats pour « {terme} ».{" "}
          <Link href={sansRecherche} prefetch={false} className={styles.lien}>
            Effacer la recherche
          </Link>
        </p>
      )}
    </form>
  );
}
