/**
 * L'annonce de la promotion en vigueur, ADR-051, LS-319, sur l'accueil et le
 * catalogue.
 *
 * LE TEXTE EST ÉCRIT DANS LE CODE ET NE DIT QUE CE QUI EST VRAI : « sur toute
 * la boutique » seulement si chaque pièce en vente est réduite, « sur les
 * pièces signalées » sinon, calculé par le serveur. La période est celle de
 * `src/lib/promotion.ts`, arbitrage de Christophe du 12 novembre 2026.
 *
 * IMMOBILE, ADR-045 : la bande défilante de la maquette faisait bouger un
 * texte, elle n'est pas portée.
 */
import type { AnnoncePromotion as Annonce } from "@/services/catalogue";

import styles from "./annonce-promotion.module.css";

export function AnnoncePromotion({ annonce }: { annonce: Annonce | null }) {
  if (annonce === null) return null;
  return (
    <section className={styles.annonce} aria-label="Promotion en cours">
      <p className={styles.texte}>
        <strong className={styles.titre}>
          {annonce.libelle} : -{annonce.taux}&nbsp;%
        </strong>{" "}
        {annonce.toutLeCatalogue
          ? "sur toute la boutique"
          : "sur les pièces signalées"}
        , {annonce.periodeAnnoncee}.
      </p>
    </section>
  );
}
