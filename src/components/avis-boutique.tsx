/**
 * Avis de la boutique, en cartes : page « Avis clients », accueil et fiche
 * produit. LS-313, habillage et mouvement de LS-314.
 *
 * POURQUOI CE COMPOSANT EXISTE. Les pièces sont uniques : vendue puis archivée,
 * une pièce n'a plus de fiche, et son avis disparaissait avec elle. Ici l'avis
 * survit à sa fiche, porté par le nom FIGÉ à la vente, invariant 3. Depuis
 * LS-314, la fiche emploie la même carte, sans la pièce, qu'elle porte déjà.
 *
 * COMPOSANT SERVEUR, aucune interaction : la liste reste dans le HTML servi,
 * lisible sans JavaScript et indexable. Le mouvement est tout en CSS.
 *
 * LES MENTIONS DE L'ARTICLE D111-10 1° SONT PRÈS DE CHAQUE AVIS : procédure de
 * contrôle et classement par `MentionAvisVerifies`, les deux dates sur chaque
 * carte. La rubrique du 2° vit sur `/informations-legales#avis`.
 *
 * LA NOTE RESTE ÉCRITE, « 5 sur 5 ». Les étoiles sont un décor `aria-hidden` :
 * l'or `--ls-accent-gold` est interdit pour du texte, ADR-022, et un lecteur
 * d'écran ne lit pas un dessin.
 *
 * LE MOUVEMENT, ADR-045 amendé par LS-314. Avec `anime`, les étoiles se
 * tracent puis se remplissent, sous `data-borne`, donc cinq secondes au plus,
 * et les cartes arrivent par un glissement seul, jamais d'une opacité nulle
 * (point 5). Sans `anime`, rien ne bouge : c'est le cas de la fiche produit,
 * où ADR-045 n'admet aucun décor animé. En mouvement réduit, tout est immobile.
 *
 * AUCUN BALISAGE `Review` NI `AggregateRating` sur `/avis` ni l'accueil :
 * Google refuse les avis qu'une entreprise publie sur elle-même. Les étoiles
 * des moteurs restent sur les fiches actives, LS-310.
 */
import Link from "next/link";
import type { CSSProperties } from "react";

import { urlMedia } from "@/integrations/medias/urls";
import { formaterDate } from "@/lib/affichage-commande";
import {
  DELAI_PUBLICATION_JOURS,
  type AvisPublie,
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

/** Rang d'un élément dans sa séquence, lu par le CSS du module. */
const rang = (i: number): CSSProperties => ({ "--i": i }) as CSSProperties;

/** Une étoile à cinq branches dans un carré de 24, centrée. */
const TRACE_ETOILE =
  "M12 2.6l2.8 5.9 6.4.8-4.7 4.5 1.2 6.4L12 17.1l-5.7 3.1 1.2-6.4-4.7-4.5 6.4-.8z";

/**
 * Cinq étoiles, `note` pleines. DÉCOR, `aria-hidden` : la note est écrite à
 * côté. Une note arrondie à l'entier, la moyenne affichée en texte gardant sa
 * décimale.
 *
 * `pathLength="1"` rend le tracé indépendant de la taille de l'étoile : le
 * même `stroke-dasharray` dessine chaque contour, quelle que soit l'échelle.
 */
export function Etoiles({
  note,
  anime = false,
  taille = "petite",
}: {
  note: number;
  anime?: boolean;
  taille?: "petite" | "grande";
}) {
  const pleines = Math.round(note);

  return (
    <span
      className={`${styles.etoiles} ${taille === "grande" ? styles.etoilesGrandes : ""}`}
      aria-hidden="true"
      data-anime={anime ? "" : undefined}
      data-borne={anime ? "" : undefined}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={styles.etoile}
          data-pleine={i < pleines ? "" : undefined}
          style={rang(i)}
          focusable="false"
        >
          <path className={styles.etoileFond} d={TRACE_ETOILE} />
          <path
            className={styles.etoileTrait}
            d={TRACE_ETOILE}
            pathLength={1}
          />
        </svg>
      ))}
    </span>
  );
}

type AvisAffiche = AvisPublie & { piece?: AvisPublieAvecPiece["piece"] };

/**
 * La liste des avis en cartes.
 *
 * `niveauTitre` choisit le niveau du nom de la pièce selon la page qui
 * l'accueille, pour ne jamais sauter un niveau de titre. Une liste sans pièce,
 * la fiche, ne porte aucun titre dans ses cartes.
 *
 * `colonnes` règle la grille aux largeurs moyennes et grandes ; à 320 px, une
 * colonne toujours.
 */
export function ListeAvisBoutique({
  avis,
  niveauTitre = "h3",
  anime = false,
  colonnes = 1,
}: {
  avis: AvisAffiche[];
  niveauTitre?: "h2" | "h3";
  anime?: boolean;
  colonnes?: 1 | 2 | 3;
}) {
  const TitrePiece = niveauTitre;

  return (
    <ul className={styles.liste} data-colonnes={colonnes}>
      {avis.map((ligne, position) => (
        <li
          key={ligne.id}
          className={styles.carte}
          /*
           * LE GLISSEMENT SEUL, `data-apparition-mode="glisse"` : une carte ne
           * part jamais d'une opacité nulle, ADR-045 point 5. Les cartes se
           * suivent de 120 ms, plafonnées à trois pour que la dixième n'attende
           * pas une seconde.
           */
          data-apparition={anime ? "" : undefined}
          data-apparition-mode={anime ? "glisse" : undefined}
          style={
            anime
              ? ({
                  "--delai-apparition": `${Math.min(position, 3) * 120}ms`,
                } as CSSProperties)
              : undefined
          }
        >
          {/* Le guillemet ouvrant, décor doré, ADR-022. */}
          <span className={styles.guillemet} aria-hidden="true">
            “
          </span>

          <p className={styles.note}>
            <Etoiles note={ligne.note} anime={anime} />
            <span className={styles.noteTexte}>{ligne.note} sur 5</span>
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

          <div className={styles.pied}>
            {ligne.piece !== undefined && (
              <div className={styles.piece}>
                {/*
                 * LA PHOTO DE LA PIÈCE, déclinaison 320 existante, ADR-007.
                 * Sans photo, une case vide garde l'alignement. Le texte
                 * alternatif est celui du média : le nom de la pièce suit juste
                 * à côté.
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
                <TitrePiece className={styles.nomPiece}>
                  {/*
                   * UN LIEN SEULEMENT VERS UNE FICHE QUI RÉPOND : une pièce
                   * archivée rendrait 404. Le nom reste affiché dans les deux
                   * cas.
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
              </div>
            )}

            {/* Les deux dates, distinguées, article D111-10 1°. */}
            <p className={styles.dates}>
              Expérience du {formaterDate(ligne.experienceA)}, publié le{" "}
              {formaterDate(ligne.publieA)}.
            </p>

            {/*
             * LE SIGNALEMENT, article L111-7-2, LS-77 : tout affichage d'un avis
             * le porte, près de l'avis.
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
