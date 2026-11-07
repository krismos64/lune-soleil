/**
 * Avis de la boutique, pour la page « Avis clients » et l'accueil. LS-313.
 *
 * POURQUOI CE COMPOSANT EXISTE. Les pièces sont uniques : vendue puis archivée,
 * une pièce n'a plus de fiche, et son avis disparaissait avec elle. Ici l'avis
 * survit à sa fiche, porté par le nom FIGÉ à la vente, invariant 3.
 *
 * COMPOSANT SERVEUR, aucune interaction : la liste reste dans le HTML servi,
 * lisible sans JavaScript et indexable.
 *
 * LES MENTIONS DE L'ARTICLE D111-10 1° SONT PRÈS DE CHAQUE AVIS, comme sur la
 * fiche, `.claude/rules/legal.md` : procédure de contrôle et classement par
 * `MentionAvisVerifies`, les deux dates sur chaque avis. Un affichage d'avis
 * qui les omettrait, page ou bloc d'accueil, serait le manquement que l'article
 * vise. La rubrique du 2° vit sur `/informations-legales#avis`.
 *
 * AUCUN BALISAGE `Review` NI `AggregateRating` : Google refuse les avis qu'une
 * entreprise publie sur elle-même. Les étoiles restent sur les fiches actives,
 * LS-310.
 */
import Link from "next/link";

import { urlMedia } from "@/integrations/medias/urls";
import { formaterDate } from "@/lib/affichage-commande";
import {
  DELAI_PUBLICATION_JOURS,
  type AvisPublieAvecPiece,
} from "@/services/avis";

import styles from "./avis-boutique.module.css";

/**
 * La mention obligatoire près des avis, article D111-10 1°. UNE SEULE SOURCE
 * pour la fiche, la page et l'accueil : trois textes recopiés divergeraient au
 * premier changement de procédure, et c'est la mention publique qui deviendrait
 * fausse. Le classement annoncé est celui du `orderBy` des lectures publiques.
 */
export function MentionAvisVerifies({
  className,
}: {
  className?: string | undefined;
}) {
  return (
    <p className={className}>
      Ces avis sont vérifiés : ils ne sont déposables qu&apos;après une commande
      réellement livrée, et chacun est relu avant publication, sous{" "}
      {DELAI_PUBLICATION_JOURS} jours au plus. Aucune contrepartie n&apos;est
      accordée en échange d&apos;un avis. Ils sont classés du plus récent au
      plus ancien.
    </p>
  );
}

/**
 * La liste des avis, chacun avec sa pièce. `niveauTitre` choisit le niveau du
 * nom de la pièce selon la page qui l'accueille, pour ne jamais sauter un
 * niveau de titre.
 */
export function ListeAvisBoutique({
  avis,
  niveauTitre,
}: {
  avis: AvisPublieAvecPiece[];
  niveauTitre: "h2" | "h3";
}) {
  const TitrePiece = niveauTitre;

  return (
    <ul className={styles.liste}>
      {avis.map((ligne) => (
        <li key={ligne.id} className={styles.avis}>
          {/*
           * LA PHOTO DE LA PIÈCE, déclinaison 320 existante, ADR-007, comme la
           * vignette du récapitulatif, LS-300. Sans photo, une case vide garde
           * l'alignement. Le texte alternatif est celui du média : le nom de la
           * pièce suit juste à côté, ce qui évite de le faire lire deux fois.
           */}
          {ligne.piece.mediaChemin ? (
            // eslint-disable-next-line @next/next/no-img-element -- fichiers servis par Nginx depuis un volume, hors de la portee de l'optimiseur de Next.js, declinaisons pre-generees par ADR-007
            <img
              src={urlMedia(ligne.piece.mediaChemin, "320.jpeg")}
              alt={ligne.piece.mediaTexteAlternatif ?? ""}
              className={styles.vignette}
              width={320}
              height={320}
              loading="lazy"
            />
          ) : (
            <span className={styles.vignetteAbsente} aria-hidden="true" />
          )}

          <div className={styles.corps}>
            <TitrePiece className={styles.piece}>
              {/*
               * UN LIEN SEULEMENT VERS UNE FICHE QUI RÉPOND : une pièce
               * archivée rendrait 404. Le nom reste affiché dans les deux cas.
               */}
              {ligne.piece.slugFiche ? (
                <Link
                  href={`/produit/${ligne.piece.slugFiche}`}
                  className={styles.lienPiece}
                >
                  {ligne.piece.nom}
                </Link>
              ) : (
                ligne.piece.nom
              )}
            </TitrePiece>

            <p className={styles.note}>{ligne.note} sur 5</p>

            {/* Les deux dates, distinguées, article D111-10 1°. */}
            <p className={styles.dates}>
              Expérience du {formaterDate(ligne.experienceA)}, publié le{" "}
              {formaterDate(ligne.publieA)}.
            </p>

            {ligne.commentaire !== null && (
              <p className={styles.commentaire}>{ligne.commentaire}</p>
            )}

            {ligne.reponse !== null && (
              <div className={styles.reponse}>
                <p className={styles.auteurReponse}>Réponse de la boutique</p>
                <p className={styles.texteReponse}>{ligne.reponse.contenu}</p>
              </div>
            )}

            {/*
             * LE SIGNALEMENT, article L111-7-2, LS-77 : tout affichage d'un avis
             * le porte, près de l'avis, et pas seulement la fiche.
             */}
            <p className={styles.signaler}>
              <Link
                href={{ pathname: "/avis/signaler", query: { avis: ligne.id } }}
                className={styles.lienSignaler}
              >
                Signaler un doute sur cet avis
              </Link>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
