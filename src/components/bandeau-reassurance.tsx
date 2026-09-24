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
 * UN SOUS-ENSEMBLE PAR ÉCRAN, JAMAIS UNE SECONDE FORMULATION, LS-251. La fiche,
 * le panier et le tunnel ne portent pas les six éléments : dans la zone d'achat
 * à 320 px, le bandeau entier empilerait près de 500 px entre le bouton d'ajout
 * et les dimensions. Chaque écran choisit ses éléments par `elements`, et le
 * texte reste ici, seul endroit où il s'écrit. Arbitrage de Christophe du
 * 24 septembre 2026. L'ordre rendu est toujours celui de `ORDRE`, quel que soit
 * celui de la liste reçue : deux écrans n'affichent pas les mêmes allégations
 * dans deux ordres différents.
 *
 * LE NOM DE LA RÉGION DIT CE QU'ELLE PORTE, C39 : « Engagements de la
 * boutique » pour le bandeau entier, « Informations de livraison » pour le
 * bloc 7 de la fiche. Un nom unique sur des contenus différents les rendrait
 * indiscernables dans la navigation par régions.
 *
 * COMPOSANT SERVEUR, SANS ACCÈS AUX DONNÉES, règle de `src/components/`.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { DUREE_RETRACTATION_JOURS } from "@/lib/mentions-retractation";
import { formaterMontant } from "@/lib/montant";

import styles from "./bandeau-reassurance.module.css";

export type ElementReassurance =
  | "fabrication"
  | "paiement"
  | "livraison"
  | "gratuite"
  | "retractation"
  | "contact";

const ORDRE: readonly ElementReassurance[] = [
  "fabrication",
  "paiement",
  "livraison",
  "gratuite",
  "retractation",
  "contact",
];

function contenu(
  element: ElementReassurance,
  seuilFranchiseCentimes: number | null,
): ReactNode {
  switch (element) {
    case "fabrication":
      return (
        <>
          <span className={styles.titre}>Faits main en Béarn</span>
          <span className={styles.detail}>
            Assemblés et finis à la main à Artix
          </span>
        </>
      );
    case "paiement":
      return (
        <>
          <span className={styles.titre}>Paiement sécurisé</span>
          <span className={styles.detail}>Par carte, via Stripe</span>
        </>
      );
    case "livraison":
      return (
        <>
          <span className={styles.titre}>Livraison Mondial Relay</span>
          <span className={styles.detail}>
            En Point Relais, en Locker ou à domicile
          </span>
        </>
      );
    case "gratuite":
      return seuilFranchiseCentimes === null ? null : (
        <>
          <span className={styles.titre}>
            Livraison offerte dès {formaterMontant(seuilFranchiseCentimes)}
          </span>
          <span className={styles.detail}>
            En Point Relais et Locker, le domicile reste payant
          </span>
        </>
      );
    case "retractation":
      return (
        <>
          {/*
           * LE DELAI VIENT DE LA CONSTANTE, LS-251. Le tunnel affiche ce texte
           * sous la mention legale, qui la lit : un « 14 » ecrit ici ferait
           * porter deux sources au meme ecran le jour ou elle changerait.
           * Releve par `ls-frontend-revue`.
           */}
          <span className={styles.titre}>
            {DUREE_RETRACTATION_JOURS} jours pour changer d&apos;avis
          </span>
          <span className={styles.detail}>Frais de retour à votre charge</span>
        </>
      );
    case "contact":
      return (
        <>
          <span className={styles.titre}>Réponse par email</span>
          <span className={styles.detail}>
            <Link href="/contact" className={styles.lien}>
              Poser une question
            </Link>
          </span>
        </>
      );
  }
}

export function BandeauReassurance({
  seuilFranchiseCentimes,
  elements = ORDRE,
  nom = "Engagements de la boutique",
}: {
  seuilFranchiseCentimes: number | null;
  elements?: readonly ElementReassurance[];
  nom?: string;
}) {
  const rendus = ORDRE.filter((element) => elements.includes(element))
    .map((element) => ({
      element,
      rendu: contenu(element, seuilFranchiseCentimes),
    }))
    .filter(({ rendu }) => rendu !== null);

  // Un bandeau sans élément ne rend rien, pas une région vide qu'un lecteur
  // d'écran annoncerait sans contenu : un écran qui ne demanderait que la
  // gratuité la verrait se taire quand la franchise est désactivée.
  if (rendus.length === 0) {
    return null;
  }

  return (
    <section className={styles.bandeau} aria-label={nom}>
      <ul className={styles.liste}>
        {rendus.map(({ element, rendu }) => (
          <li key={element} className={styles.element}>
            {rendu}
          </li>
        ))}
      </ul>
    </section>
  );
}
