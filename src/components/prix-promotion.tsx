/**
 * Le bloc de prix, avec ou sans promotion, ADR-051, LS-319.
 *
 * UN SEUL COMPOSANT pour la carte, la fiche, le panier et le tunnel : quatre
 * écritures divergeraient au premier changement, et un prix barré affiché
 * différemment d'un écran à l'autre se lit comme une erreur.
 *
 * LE PRIX VIENT DU SERVEUR, `frontend-design.md` : ce composant affiche, il
 * ne calcule rien. `prixReferenceCentimes` nul, il rend le prix seul, tel
 * qu'avant la promotion.
 *
 * LE PRIX BARRÉ SE DIT AUSSI AU LECTEUR D'ÉCRAN : une balise `<s>` n'est pas
 * annoncée par tous, et deux prix collés se liraient comme un seul nombre.
 * Les mentions « Prix initial » et « prix réduit » ne sont que pour lui.
 *
 * IMMOBILE, ADR-045 : le trait qui se trace et le tampon de la maquette ne
 * sont pas portés, aucun mouvement sur un texte.
 */
import { formaterMontant } from "@/lib/montant";

import styles from "./prix-promotion.module.css";

export function PrixPromotion({
  prixCentimes,
  prixReferenceCentimes,
  taux = null,
  suffixe = "",
  as: Balise = "p",
  className,
}: {
  prixCentimes: number;
  prixReferenceCentimes: number | null;
  /** Le taux du badge, `null` pour un prix barré sans badge (panier, tunnel). */
  taux?: number | null;
  /** Ce qui suit le prix, « l'unité » au panier, revue d'interface de LS-319. */
  suffixe?: string;
  /** `span` dans une ligne déjà en paragraphe, le récapitulatif du tunnel. */
  as?: "p" | "span";
  className?: string | undefined;
}) {
  if (prixReferenceCentimes === null) {
    return (
      <Balise className={className}>
        {formaterMontant(prixCentimes)}
        {suffixe}
      </Balise>
    );
  }
  /*
   * LE SIGNE − TYPOGRAPHIQUE, U+2212, et non le trait d'union : une
   * synthèse vocale lit le second « tiret », revue d'interface de LS-319. Le
   * PDF de facture garde le trait d'union, `@react-pdf` remplaçant en silence
   * un caractère qu'il ne sait pas rendre.
   */
  return (
    <Balise className={`${className ?? ""} ${styles.bloc}`}>
      <span className={styles.horsEcran}>Prix initial : </span>
      <s className={styles.ancien}>{formaterMontant(prixReferenceCentimes)}</s>
      <span className={styles.horsEcran}>, prix réduit : </span>
      <span className={styles.actuel}>
        {formaterMontant(prixCentimes)}
        {suffixe}
      </span>
      {taux !== null ? (
        <span className={styles.badge}>−{taux}&nbsp;%</span>
      ) : null}
    </Balise>
  );
}
