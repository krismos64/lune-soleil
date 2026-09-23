/**
 * Bandeau de réassurance des pages publiques, LS-236.
 *
 * LES SIX ÉLÉMENTS DE `frontend-design.md`, AUCUN DE PLUS. Ils répondent aux
 * questions d'un acheteur qui ne connaît pas encore la boutique : d'où vient le
 * bijou, le paiement est-il sûr, combien coûte la livraison, puis-je changer
 * d'avis. Chacun est une allégation déjà vérifiée, rien n'est inventé ici.
 *
 * LE SEUIL DE GRATUITÉ ARRIVE EN PARAMÈTRE, lu par la page dans la
 * configuration, ADR-043 : l'exploitante le change sans redéploiement, et un
 * montant écrit ici mentirait le jour où elle le modifie. `null` quand la
 * franchise est désactivée ou la configuration illisible : l'élément se tait
 * plutôt que d'annoncer une gratuité qui n'existe pas.
 *
 * LA GRATUITÉ EST ANNONCÉE EN POINT RELAIS ET LOCKER, JAMAIS « TOUS MODES » :
 * le domicile n'est pas offert, `calculerFraisPort` et ADR-035. LS-249 a
 * corrigé la même erreur dans `/aide` et les conditions générales.
 *
 * LA RÉTRACTATION NE S'ANNONCE JAMAIS SANS SES FRAIS DE RETOUR, article
 * L221-20, `legal.md`.
 *
 * AUCUN « NOUS » DE MARQUE : l'exploitante exerce seule, `frontend-design.md`.
 * L'ancien bandeau s'appelait « Nos engagements », il devient « Engagements de
 * la boutique ».
 *
 * COMPOSANT SERVEUR, SANS ACCÈS AUX DONNÉES, règle de `src/components/`.
 */
import Link from "next/link";

import { formaterMontant } from "@/lib/montant";

import styles from "./bandeau-reassurance.module.css";

export function BandeauReassurance({
  seuilFranchiseCentimes,
}: {
  seuilFranchiseCentimes: number | null;
}) {
  return (
    <section className={styles.bandeau} aria-label="Engagements de la boutique">
      <ul className={styles.liste}>
        <li className={styles.element}>
          <span className={styles.titre}>Faits main en Béarn</span>
          <span className={styles.detail}>
            Assemblés et finis à la main à Artix
          </span>
        </li>
        <li className={styles.element}>
          <span className={styles.titre}>Paiement sécurisé</span>
          <span className={styles.detail}>Par carte, via Stripe</span>
        </li>
        <li className={styles.element}>
          <span className={styles.titre}>Livraison Mondial Relay</span>
          <span className={styles.detail}>
            En Point Relais, en Locker ou à domicile
          </span>
        </li>
        {seuilFranchiseCentimes === null ? null : (
          <li className={styles.element}>
            <span className={styles.titre}>
              Livraison offerte dès {formaterMontant(seuilFranchiseCentimes)}
            </span>
            <span className={styles.detail}>
              En Point Relais et Locker, le domicile reste payant
            </span>
          </li>
        )}
        <li className={styles.element}>
          <span className={styles.titre}>
            14 jours pour changer d&apos;avis
          </span>
          <span className={styles.detail}>Frais de retour à votre charge</span>
        </li>
        <li className={styles.element}>
          <span className={styles.titre}>Réponse par email</span>
          <span className={styles.detail}>
            <Link href="/contact" className={styles.lien}>
              Poser une question
            </Link>
          </span>
        </li>
      </ul>
    </section>
  );
}
