/**
 * Page d'accueil publique, LS-122.
 *
 * COMPOSANT SERVEUR PUR. Aucun `"use client"` : la page n'a aucune interaction,
 * tout y est lien ou texte.
 *
 * ELLE LIT LA BASE A CHAQUE AFFICHAGE, pour la meme raison que le catalogue de
 * LS-104 : la disponibilite change a chaque reservation, et une mise en cache
 * afficherait « En stock » sur une piece unique deja vendue.
 */
import Image from "next/image";
import Link from "next/link";

import { lireCataloguePublic } from "@/services/catalogue";
import { CarteProduit } from "./catalogue/carte-produit";
import styles from "./page.module.css";

export const metadata = {
  title: "Lune & Soleil, bijoux artisanaux faits main",
  description:
    "Des bijoux faits main, crÃ©Ã©s Ã  l'unitÃ© et en petite sÃ©rie. Livraison en France mÃ©tropolitaine, Corse comprise.",
};

export const dynamic = "force-dynamic";

/** Nombre de crÃ©ations mises en avant sur l'accueil. */
const NOMBRE_MIS_EN_AVANT = 4;

export default async function PageAccueil() {
  /*
   * LE MEME SERVICE QUE LE CATALOGUE, sans filtre. `listerProduitsPublies` trie
   * deja par `publie_a DESC NULLS LAST`, ce que le critere 3 demande : refaire
   * un tri ici donnerait deux sources de verite pour la meme notion de
   * nouveaute.
   *
   * LA COUPE SE FAIT ICI ET NON EN SQL. Le dimensionnement du catalogue, 10 a 40
   * references, ne justifie pas un `LIMIT`, et `frontend-design.md` interdit
   * d'introduire un plafond que le schema ne porte pas.
   */
  const { produits, categories } = await lireCataloguePublic();
  const misEnAvant = produits.slice(0, NOMBRE_MIS_EN_AVANT);

  return (
    <main>
      <section className={styles.hero}>
        <div className={styles.heroTexte}>
          <p className={styles.surtitre}>Bijoux faits main</p>
          <h1 className={styles.titre}>
            La lumiÃ¨re d&apos;un bijou, le geste d&apos;une main.
          </h1>
          <p className={styles.accroche}>
            Des piÃ¨ces dÃ©licates en petite sÃ©rie, pensÃ©es pour accompagner
            le quotidien sans jamais se ressembler tout Ã  fait.
          </p>
          <div className={styles.actions}>
            <Link href="/catalogue" className={styles.actionPrincipale}>
              DÃ©couvrir les crÃ©ations
            </Link>
            <Link href="/notre-univers" className={styles.actionSecondaire}>
              Entrer dans l&apos;atelier
            </Link>
          </div>
        </div>

        {/*
         * LE VISUEL EST DECORATIF, `alt` VIDE ET `aria-hidden`. Le titre et
         * l'accroche portent deja tout le sens : le decrire ferait repeter la
         * meme information a qui ecoute.
         *
         * `next/image` ICI, CONTRAIREMENT AUX PHOTOS DE PRODUITS. Ce fichier vit dans
         * `public/` et passe donc par l'optimiseur de Next.js. Les medias d'ADR-007
         * sont servis par Nginx depuis un volume, hors de sa portee, et emploient
         * `<img>` avec leurs declinaisons pre-generees.
         *
         * IMAGE PROVISOIRE. Les photographies reelles sont LS-23, bloquee par la
         * chaine de traitement des medias. Le fichier vit dans `public/` et non
         * dans le volume des medias d'ADR-007 : c'est un element d'habillage du
         * site, pas une photo de produit administrable.
         */}
        <div className={styles.heroVisuel}>
          <Image
            src="/habillage/accueil-hero.jpg"
            alt=""
            aria-hidden="true"
            className={styles.image}
            width={1280}
            height={960}
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
          />
        </div>
      </section>

      {/*
       * BANDEAU DE REASSURANCE, `frontend-design.md`.
       *
       * TROIS ELEMENTS ET NON QUATRE. Le prototype affiche « Livraison offerte
       * des 39 EUR », la regle l'INTERDIT en dur : le seuil doit venir de la
       * configuration centralisee qui sert aussi au calcul serveur des frais de
       * port. Cette configuration n'existe pas encore, elle appartient a LS-27
       * et LS-115. Ecrire 39 ici creerait exactement la divergence que la regle
       * previent, « offerte des 39 » sur l'accueil et un autre seuil au panier,
       * ce qui est une information precontractuelle fausse.
       *
       * LA RETRACTATION NE S'ANNONCE JAMAIS SEULE : la mention des frais de
       * retour a la charge du client l'accompagne partout, sous peine du delai
       * de douze mois de l'article L221-20.
       *
       * AUCUNE MENTION D'ORIGINE GEOGRAPHIQUE, non confirmee par l'exploitante.
       */}
      <section className={styles.reassurance} aria-label="Nos engagements">
        <ul className={styles.listeReassurance}>
          <li className={styles.elementReassurance}>
            <span className={styles.titreReassurance}>Fait main</span>
            <span className={styles.detailReassurance}>
              Petites sÃ©ries prÃ©parÃ©es avec soin
            </span>
          </li>
          <li className={styles.elementReassurance}>
            <span className={styles.titreReassurance}>Paiement sÃ©curisÃ©</span>
            <span className={styles.detailReassurance}>
              Par carte, via Stripe
            </span>
          </li>
          <li className={styles.elementReassurance}>
            <span className={styles.titreReassurance}>14 jours</span>
            <span className={styles.detailReassurance}>
              Pour changer d&apos;avis, frais de retour Ã  votre charge
            </span>
          </li>
        </ul>
      </section>

      {/*
       * DERNIERES CREATIONS.
       *
       * `CarteProduit` EST REUTILISEE TELLE QUELLE, avec la grille du catalogue.
       * La dupliquer ici ferait diverger deux rendus du meme objet des la
       * premiere correction, et c'est ce composant qui porte deja les trois
       * sources d'image, le badge de disponibilite et le prix en centimes.
       *
       * RESERVE ASSUMEE : la carte rend un `h2`, place ici sous le `h2` de la
       * section. La hierarchie reste lisible mais n'est pas ideale. La corriger
       * demanderait de parametrer le niveau de titre dans un composant ecrit par
       * LS-104, donc d'elargir cette story : signale plutot que fait.
       */}
      {misEnAvant.length > 0 && (
        <section className={styles.section}>
          <div className={styles.enteteSection}>
            <div>
              <p className={styles.surtitreSection}>NouveautÃ©s</p>
              <h2 className={styles.titreSection}>Les derniÃ¨res crÃ©ations</h2>
            </div>
            <Link href="/catalogue" className={styles.lienSection}>
              Voir toute la collection
            </Link>
          </div>

          <ul className={styles.grille}>
            {misEnAvant.map((produit) => (
              <CarteProduit key={produit.id} produit={produit} />
            ))}
          </ul>
        </section>
      )}

      {/*
       * ENTREE PAR CATEGORIE.
       *
       * `categories` NE PORTE QUE CE QUI A DU PUBLIE, `listerCategoriesPubliees`
       * le garantit. Proposer une entree vers une categorie vide fabriquerait
       * l'etat vide au lieu de l'eviter, ce que LS-104 avait deja tranche.
       *
       * LA NUMEROTATION EST DECORATIVE, `aria-hidden` : « 01 » n'apporte rien a
       * qui ecoute, et serait lu « zero un » avant chaque nom de categorie.
       */}
      {categories.length > 0 && (
        <section className={styles.sectionCategories}>
          <div className={styles.introCategories}>
            <p className={styles.surtitreSection}>Choisir simplement</p>
            <h2 className={styles.titreSection}>
              Quel bijou vous appelle aujourd&apos;hui ?
            </h2>
          </div>

          <ul className={styles.listeCategories}>
            {categories.map((categorie, index) => (
              <li key={categorie.id}>
                <Link
                  href={`/catalogue?categorie=${categorie.slug}`}
                  className={styles.lienCategorie}
                >
                  <span className={styles.rangCategorie} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.nomCategorie}>{categorie.nom}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
       * BLOC EDITORIAL.
       *
       * LE TEXTE NE DIT NI LE LIEU NI LE NOMBRE DE CREATRICES. Le recit appartient
       * a LS-25, valide par l'exploitante, et une allegation d'origine non
       * confirmee serait une pratique commerciale trompeuse. Ce bloc annonce la
       * page sans raconter a sa place.
       */}
      <section className={styles.editorial}>
        <div className={styles.editorialTexte}>
          <p className={styles.surtitreEditorial}>L&apos;atelier</p>
          <h2 className={styles.titreEditorial}>
            CrÃ©er peu, crÃ©er avec intention.
          </h2>
          <p className={styles.texteEditorial}>
            Chaque bijou commence par une association de formes et de matiÃ¨res,
            travaillÃ©e Ã  la main et produite en petite quantitÃ©.
          </p>
          <Link href="/notre-univers" className={styles.actionEditorial}>
            DÃ©couvrir notre univers
          </Link>
        </div>
      </section>
    </main>
  );
}
