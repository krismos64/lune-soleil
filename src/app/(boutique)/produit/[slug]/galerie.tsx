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
import { useState } from "react";

import type { PhotoFiche } from "@/services/catalogue";
import styles from "./fiche.module.css";

/**
 * Prefixe sous lequel les medias sont servis, ADR-007.
 *
 * Il vient de la configuration et non des donnees : `Media.chemin` porte un
 * chemin relatif au dossier `public/` du volume, jamais une URL.
 */
const PREFIXE_MEDIAS = process.env.MEDIA_PREFIXE_PUBLIC ?? "/medias";

export function Galerie({
  photos,
  nomProduit,
}: {
  photos: PhotoFiche[];
  nomProduit: string;
}) {
  const [indexAffiche, setIndexAffiche] = useState(0);

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
      <picture>
        <source
          type="image/avif"
          srcSet={`${PREFIXE_MEDIAS}/${affichee.chemin}320.avif 320w, ${PREFIXE_MEDIAS}/${affichee.chemin}640.avif 640w, ${PREFIXE_MEDIAS}/${affichee.chemin}1280.avif 1280w`}
          sizes={tailles}
        />
        <source
          type="image/webp"
          srcSet={`${PREFIXE_MEDIAS}/${affichee.chemin}320.webp 320w, ${PREFIXE_MEDIAS}/${affichee.chemin}640.webp 640w, ${PREFIXE_MEDIAS}/${affichee.chemin}1280.webp 1280w`}
          sizes={tailles}
        />
        {/*
         * `alt` VIDE PLUTOT QUE LE NOM DU PRODUIT quand le texte alternatif
         * manque. Le nom est deja le titre de la page, juste a cote : le
         * repeter ferait entendre deux fois la meme chose sans rien decrire de
         * l'image.
         */}
        <img
          src={`${PREFIXE_MEDIAS}/${affichee.chemin}640.jpeg`}
          alt={affichee.texteAlternatif ?? ""}
          className={styles.imagePrincipale}
          width={640}
          height={640}
          decoding="async"
        />
      </picture>

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
                    src={`${PREFIXE_MEDIAS}/${photo.chemin}320.jpeg`}
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
