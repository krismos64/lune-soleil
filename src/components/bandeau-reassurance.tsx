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
import type { CSSProperties, ReactNode } from "react";

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

/*
 * LES ICÔNES, LS-260, refonte du 8 octobre 2026 : un trait de même épaisseur,
 * décor seul (`aria-hidden`), le texte portant l'information. `pathLength`
 * normalise chaque tracé à 1 pour qu'une seule animation les dessine tous.
 * La fabrication porte l'emblème lune et soleil plutôt qu'un pictogramme
 * générique : c'est la signature de l'atelier.
 */
const ICONES: Record<ElementReassurance, ReactNode> = {
  fabrication: (
    <>
      <circle cx="15" cy="10" r="4" pathLength={1} />
      <path
        pathLength={1}
        d="M15 3v1.5M15 15.5V17M8 10h1.5M20.5 10H22M10 5l1 1M19 14l1 1M20 5l-1 1"
      />
      <path pathLength={1} d="M11 13.5a6.5 6.5 0 1 1-6.5-8 5 5 0 0 0 6.5 8z" />
    </>
  ),
  paiement: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" pathLength={1} />
      <path pathLength={1} d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" />
    </>
  ),
  livraison: (
    <>
      <path pathLength={1} d="M3 8l9-4 9 4v9l-9 4-9-4z" />
      <path pathLength={1} d="M3 8l9 4 9-4M12 12v9M7.5 6l9 4" />
    </>
  ),
  gratuite: (
    <>
      <rect x="4" y="9" width="16" height="12" rx="1.5" pathLength={1} />
      <path
        pathLength={1}
        d="M3 9h18M12 9v12M12 9c-1.5-3-5-3.5-5-1.5S10 9 12 9c2 0 5 .5 5-1.5S13.5 6 12 9"
      />
    </>
  ),
  retractation: (
    <>
      <path pathLength={1} d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path pathLength={1} d="M4 4v4.5h4.5" />
      <path pathLength={1} d="M12 8v4l2.5 2" />
    </>
  ),
  contact: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" pathLength={1} />
      <path pathLength={1} d="M3.5 6.5L12 13l8.5-6.5" />
    </>
  ),
};

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
  anime = false,
}: {
  seuilFranchiseCentimes: number | null;
  elements?: readonly ElementReassurance[];
  nom?: string;
  /**
   * Trace les icônes à l'entrée dans l'écran, LS-260. RÉSERVÉ AUX PAGES
   * VITRINES : rien ne bouge dans le tunnel ni autour d'un paiement,
   * `frontend-design.md`. Sans cette option, les icônes sont dessinées et
   * immobiles.
   */
  anime?: boolean;
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
    <section
      className={`${styles.bandeau} ${anime ? styles.anime : ""}`}
      aria-label={nom}
      data-borne={anime ? "" : undefined}
    >
      <ul className={styles.liste}>
        {rendus.map(({ element, rendu }, rang) => (
          <li
            key={element}
            className={styles.element}
            style={{ "--i": rang } as CSSProperties}
          >
            <span className={styles.medaillon} aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                focusable="false"
                className={styles.icone}
              >
                {ICONES[element]}
              </svg>
            </span>
            <span className={styles.texte}>{rendu}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
