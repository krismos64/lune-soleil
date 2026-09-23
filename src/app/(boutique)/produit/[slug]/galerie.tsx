"use client";

/**
 * Galerie de photographies de la fiche produit, LS-105.
 *
 * COMPOSANT CLIENT parce que changer d'image ne doit pas recharger la page.
 * Sans photographie, la fiche reste servie : c'est la page qui decide de ne pas
 * rendre ce composant, et non lui de rendre un vide.
 *
 * LES TROIS VIGNETTES SANS NOM ACCESSIBLE DU PROTOTYPE SONT CORRIGEES ICI,
 * ecart de LS-85 mesure le 13 aout. La consigne du ticket est explicite : le
 * corriger en ECRIVANT ce composant plutot qu'apres. Chaque bouton porte donc
 * un `aria-label` qui dit ce qu'il fait et sur quoi il porte.
 *
 * LES URL SONT CONSTRUITES A PARTIR DU CHEMIN, jamais lues en base : le
 * traitement ecrit onze declinaisons par media, ADR-007, et leurs noms sont
 * fixes. Le repli `<img>` est en `.jpeg` et NON `.jpg`, extension reellement
 * produite : c'est le defaut de LS-102, une chaine construite a l'execution
 * confrontee a rien.
 */
import { useRef, useState } from "react";

import { srcSetMedia, urlMedia, urlVignette } from "@/integrations/medias/urls";
import type { PhotoFiche } from "@/services/catalogue";
import styles from "./fiche.module.css";

export function Galerie({
  photos,
  nomProduit,
}: {
  photos: PhotoFiche[];
  nomProduit: string;
}) {
  const [indexAffiche, setIndexAffiche] = useState(0);
  /*
   * LS-244, LA LOUPE. `survol` porte la position du pointeur en pourcentage de
   * l'image, `null` hors survol. L'image 1920 ne se charge qu'au premier
   * survol : elle pese plusieurs centaines de kilo-octets, et la plupart des
   * visites ne zoomeront jamais.
   */
  const [survol, setSurvol] = useState<{ x: number; y: number } | null>(null);
  const agrandie = useRef<HTMLDialogElement>(null);
  const boutonAgrandir = useRef<HTMLButtonElement>(null);
  const [zoomee, setZoomee] = useState(false);

  const affichee = photos[indexAffiche] ?? photos[0];

  if (affichee === undefined) {
    return null;
  }

  /*
   * `sizes` DECRIT LA PLACE REELLE DE L'IMAGE, sans quoi le navigateur
   * telechargerait systematiquement la plus grande declinaison. A partir de
   * 768 px la galerie occupe une demi-largeur, en dessous la largeur entiere.
   */
  const tailles = "(min-width: 768px) 45vw, 90vw";

  return (
    <div className={styles.galerie}>
      {/*
       * LS-244, DEMANDE DE L'EXPLOITANTE EN RECETTE : voir le detail d'un bijou.
       *
       * L'IMAGE EST UN BOUTON QUI OUVRE LA PHOTO EN GRAND, et non un simple
       * survol : le survol n'existe pas au doigt, et la majorite des visites
       * vient du telephone, invariant 10. Au clavier, Entree ouvre, Echap
       * ferme ; le `<dialog>` natif rend le reste de la page inerte et rend le
       * focus au bouton a la fermeture.
       *
       * LA LOUPE AU SURVOL S'AJOUTE SUR ORDINATEUR SEULEMENT, `pointer: fine`
       * dans le CSS : un calque qui agrandit la zone sous le pointeur.
       */}
      <button
        ref={boutonAgrandir}
        type="button"
        className={styles.boutonAgrandir}
        aria-label={
          affichee.texteAlternatif
            ? `Agrandir la photo : ${affichee.texteAlternatif}`
            : `Agrandir la photo de ${nomProduit}`
        }
        onClick={() => agrandie.current?.showModal()}
        onPointerMove={(evenement) => {
          if (evenement.pointerType !== "mouse") return;
          const cadre = evenement.currentTarget.getBoundingClientRect();
          setSurvol({
            x: ((evenement.clientX - cadre.left) / cadre.width) * 100,
            y: ((evenement.clientY - cadre.top) / cadre.height) * 100,
          });
        }}
        onPointerLeave={() => setSurvol(null)}
      >
        <picture>
          <source
            type="image/avif"
            srcSet={srcSetMedia(affichee.chemin, "avif")}
            sizes={tailles}
          />
          <source
            type="image/webp"
            srcSet={srcSetMedia(affichee.chemin, "webp")}
            sizes={tailles}
          />
          {/*
           * `alt` VIDE PLUTOT QUE LE NOM DU PRODUIT quand le texte alternatif
           * manque. Le nom est deja le titre de la page, juste a cote : le
           * repeter ferait entendre deux fois la meme chose sans rien decrire de
           * l'image.
           */}
          <img
            src={urlVignette(affichee.chemin)}
            alt={affichee.texteAlternatif ?? ""}
            className={styles.imagePrincipale}
            width={640}
            height={640}
            decoding="async"
          />
        </picture>
        {survol ? (
          <span
            className={styles.loupe}
            aria-hidden="true"
            style={{
              backgroundImage: `url(${urlMedia(affichee.chemin, "1920.webp")})`,
              backgroundPosition: `${survol.x}% ${survol.y}%`,
            }}
          />
        ) : null}
      </button>

      <dialog
        ref={agrandie}
        className={styles.agrandie}
        aria-label={`Photo agrandie de ${nomProduit}`}
        /*
         * LE FOCUS EST RENDU EXPLICITEMENT AU BOUTON : Safari ne donne pas le
         * focus a un bouton clique, et le `<dialog>` le rendrait alors a
         * `body`. Releve par `ls-frontend-revue`.
         */
        onClose={() => {
          setZoomee(false);
          boutonAgrandir.current?.focus();
        }}
        /*
         * UN CLIC SUR LE FOND FERME, comme Echap : sur un `<dialog>` modal, un
         * clic hors du contenu vise l'element lui-meme.
         */
        onClick={(evenement) => {
          if (evenement.target === evenement.currentTarget) {
            evenement.currentTarget.close();
          }
        }}
      >
        <div className={styles.actionsAgrandie}>
          <button
            type="button"
            className={styles.fermerAgrandie}
            aria-pressed={zoomee}
            onClick={() => setZoomee((etat) => !etat)}
          >
            Zoomer
          </button>
          <button
            type="button"
            className={styles.fermerAgrandie}
            onClick={() => agrandie.current?.close()}
          >
            Fermer
          </button>
        </div>
        <picture>
          <source
            type="image/avif"
            srcSet={urlMedia(affichee.chemin, "1920.avif")}
          />
          <source
            type="image/webp"
            srcSet={urlMedia(affichee.chemin, "1920.webp")}
          />
          <img
            src={urlMedia(affichee.chemin, "1280.jpeg")}
            alt={affichee.texteAlternatif ?? ""}
            className={`${styles.imageAgrandie} ${zoomee ? styles.zoomee : ""}`}
            loading="lazy"
            decoding="async"
          />
        </picture>
      </dialog>

      {/*
       * LES VIGNETTES N'APPARAISSENT QU'A PARTIR DE DEUX PHOTOGRAPHIES. Une
       * vignette unique sous sa propre image grande ne sert a rien.
       */}
      {photos.length > 1 && (
        <ul className={styles.vignettes}>
          {photos.map((photo, index) => {
            const active = index === indexAffiche;

            return (
              <li key={photo.id}>
                {/*
                 * LE NOM ACCESSIBLE EST L'OBJET DE CETTE CORRECTION, LS-85. Le
                 * prototype portait trois boutons de vignettes sans nom : un
                 * lecteur d'ecran annoncait « bouton » trois fois de suite,
                 * sans dire ce que chacun montrait.
                 *
                 * LE LIBELLE DIT LE RANG ET LE PRODUIT, parce que le texte
                 * alternatif peut manquer : « Voir la photo 2 de Bague fine »
                 * reste utile quand `texteAlternatif` est nul, ce qu'un
                 * `aria-label` bati sur lui seul ne serait pas.
                 *
                 * `aria-current` DIT LAQUELLE EST AFFICHEE. La bordure le dit a
                 * l'oeil ; sans cet attribut, rien ne le dit a qui ecoute.
                 */}
                <button
                  type="button"
                  className={`${styles.vignette} ${active ? styles.vignetteActive : ""}`}
                  onClick={() => setIndexAffiche(index)}
                  aria-label={
                    photo.texteAlternatif
                      ? `Voir la photo ${index + 1} de ${nomProduit} : ${photo.texteAlternatif}`
                      : `Voir la photo ${index + 1} de ${nomProduit}`
                  }
                  aria-current={active ? "true" : undefined}
                >
                  {/*
                   * `alt` VIDE, ET C'EST LA FORME CORRECTE ICI. L'image est
                   * DECORATIVE au sens strict : le bouton qui la porte annonce
                   * deja ce qu'elle montre par son `aria-label`. Un texte
                   * alternatif la ferait annoncer deux fois.
                   */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- fichiers servis par Nginx depuis un volume, hors de la portee de l'optimiseur de Next.js : les declinaisons sont pre-generees par ADR-007 */}
                  <img
                    src={urlMedia(photo.chemin, "320.jpeg")}
                    alt=""
                    className={styles.imageVignette}
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
