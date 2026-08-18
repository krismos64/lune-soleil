/**
 * Une carte du catalogue public, LS-104.
 *
 * COMPOSANT SERVEUR. Rien n'y est interactif : la carte est un lien, et le
 * badge de disponibilite vient deja calcule du serveur. Aucun `"use client"`,
 * donc aucun JavaScript envoye pour l'afficher.
 *
 * LA DISPONIBILITE N'EST PAS CALCULEE ICI, elle est recue. `frontend-design.md`
 * l'impose, et la raison tient a ce qu'un calcul cote client obligerait a
 * transmettre la quantite exacte pour la masquer ensuite : elle serait lisible
 * dans le HTML de la page.
 */
import Link from "next/link";

import type { EtatDisponibilite, ProduitCatalogue } from "@/services/catalogue";
import styles from "./catalogue.module.css";

/**
 * Libelles des trois etats, `frontend-design.md`.
 *
 * « Derniere piece » EST LA SEULE QUANTITE PUBLIEE, et c'est assume : c'est une
 * information d'urgence vraie, et le cas ordinaire ici, chaque bijou etant fait
 * main. « 7 en stock » exposerait le niveau d'activite de la boutique sans rien
 * apporter au client.
 */
const LIBELLE_DISPONIBILITE: Record<EtatDisponibilite, string> = {
  EN_STOCK: "En stock",
  DERNIERE_PIECE: "Dernière pièce",
  EPUISE: "Épuisé",
};

/**
 * Classe du badge selon l'etat.
 *
 * LE TERRACOTTA PASSE EN FOND ET NON EN TEXTE, LS-84. Il donne 4,07:1 sur creme,
 * conforme AA en texte large ou gras seulement, et ce badge est du petit texte.
 * En fond avec du blanc dessus, le rapport repasse au-dessus du seuil, ce que
 * `tokens.css` prescrit explicitement.
 */
const CLASSE_DISPONIBILITE: Record<EtatDisponibilite, string> = {
  EN_STOCK: styles.badgeEnStock!,
  DERNIERE_PIECE: styles.badgeDernierePiece!,
  EPUISE: styles.badgeEpuise!,
};

/**
 * Prefixe sous lequel les medias sont servis, ADR-007.
 *
 * Il vient de la configuration et non des donnees : `Media.chemin` porte un
 * chemin relatif au dossier `public/` du volume, jamais une URL. En
 * developpement aucun Nginx ne sert ce chemin, les vignettes ne s'affichent donc
 * pas hors production, ce qui est attendu.
 */
const PREFIXE_MEDIAS = process.env.MEDIA_PREFIXE_PUBLIC ?? "/medias";

/** Le prix en euros, a partir des centimes entiers de l'invariant 1. */
function prixAffiche(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(centimes / 100);
}

export function CarteProduit({ produit }: { produit: ProduitCatalogue }) {
  const disponibilite = LIBELLE_DISPONIBILITE[produit.disponibilite];

  return (
    <li className={styles.carte}>
      <Link href={`/produit/${produit.slug}`} className={styles.lienCarte}>
        <div className={styles.cadreImage}>
          {produit.mediaChemin ? (
            /*
             * TROIS SOURCES ET UN REPLI, ADR-007. Le navigateur prend la
             * premiere qu'il sait lire : AVIF, puis WebP, puis le JPEG du
             * `<img>`. Servir l'AVIF seul afficherait une image cassee a qui ne
             * le supporte pas.
             *
             * `sizes` DECRIT LA PLACE REELLE et non la largeur de l'ecran : a
             * 320 px la carte occupe toute la largeur moins les marges, au-dela
             * elle partage la grille. Sans cette indication le navigateur
             * telechargerait systematiquement la plus grande declinaison.
             */
            <picture>
              <source
                type="image/avif"
                srcSet={`${PREFIXE_MEDIAS}/${produit.mediaChemin}320.avif 320w, ${PREFIXE_MEDIAS}/${produit.mediaChemin}640.avif 640w, ${PREFIXE_MEDIAS}/${produit.mediaChemin}1280.avif 1280w`}
                sizes="(min-width: 1280px) 300px, (min-width: 768px) 45vw, 90vw"
              />
              <source
                type="image/webp"
                srcSet={`${PREFIXE_MEDIAS}/${produit.mediaChemin}320.webp 320w, ${PREFIXE_MEDIAS}/${produit.mediaChemin}640.webp 640w, ${PREFIXE_MEDIAS}/${produit.mediaChemin}1280.webp 1280w`}
                sizes="(min-width: 1280px) 300px, (min-width: 768px) 45vw, 90vw"
              />
              <img
                src={`${PREFIXE_MEDIAS}/${produit.mediaChemin}640.jpeg`}
                alt={produit.mediaTexteAlternatif ?? ""}
                className={styles.image}
                loading="lazy"
                decoding="async"
                width={640}
                height={640}
              />
            </picture>
          ) : (
            /*
             * SANS PHOTO, UN EMPLACEMENT ET NON UNE CARTE ABSENTE. Un produit
             * publie sans image reste vendable : le retirer du catalogue le
             * rendrait introuvable sans que personne ne comprenne pourquoi.
             *
             * `aria-hidden` PARCE QUE LE LIEN PORTE DEJA LE NOM DU PRODUIT :
             * annoncer « image absente » n'apporterait rien a qui ecoute.
             */
            <div className={styles.imageAbsente} aria-hidden="true" />
          )}
        </div>

        <div className={styles.corpsCarte}>
          <h2 className={styles.nomProduit}>{produit.nom}</h2>
          <p className={styles.categorie}>{produit.categorieNom}</p>
          <p className={styles.prix}>{prixAffiche(produit.prixCentimes)}</p>
          <p className={CLASSE_DISPONIBILITE[produit.disponibilite]}>
            {disponibilite}
          </p>
        </div>
      </Link>
    </li>
  );
}
