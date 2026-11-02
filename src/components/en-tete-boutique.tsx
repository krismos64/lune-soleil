/**
 * En-tete de la boutique publique, LS-122.
 *
 * COMPOSANT SERVEUR. Sous 768 px, la navigation passe dans `MenuMobile`, le
 * menu plein écran de LS-261 validé avec la maquette d'accueil du 4 octobre
 * 2026 ; au-delà, elle reste une liste de liens en ligne, rendue côté serveur
 * avec sa page active, et qui marche donc sans script. Le
 * premier choix, quatre entrées sur deux lignes à 320 px sans menu, est
 * remplacé par cet arbitrage. Le menu repose sur `<details>` et marche donc
 * sans JavaScript.
 *
 * LE COMPTE ET LE PANIER RESTENT DANS LA BARRE À TOUTES LES LARGEURS : ce sont
 * des actions, pas de la navigation. Sous 480 px ils deviennent des
 * pictogrammes, leur texte restant le nom accessible.
 *
 * REFONTE DE LS-309, arbitrages du 2 novembre 2026 : sceau et nom en serif de
 * titre, navigation centrée entre la marque et les actions à partir de 768 px,
 * page active, entrée « Accueil », fond crème, barre collante au défilement à
 * partir de 768 px seulement. Le panneau du menu mobile ne change pas.
 *
 * IL VIT DANS LE LAYOUT DU GROUPE `(boutique)` ET NON DANS LE LAYOUT RACINE.
 * Le layout racine couvre aussi `/administration`, qui ne doit afficher ni cet
 * en-tete ni le pied de page : une administratrice connectee n'est pas en train
 * de faire ses courses.
 */
import Image from "next/image";
import Link from "next/link";
import { cookies, headers } from "next/headers";

import { NOM_COOKIE_PANIER, decoderPanier } from "@/lib/panier-cookie";
import { compterArticles } from "@/services/panier";
import { lireIdentite } from "@/services/autorisation";
import styles from "./en-tete-boutique.module.css";
import { NOM_BOUTIQUE } from "@/lib/seo";
import { ENTREES_MENU_MOBILE } from "@/lib/navigation-boutique";
import { MenuMobile } from "./menu-mobile";
import { NavigationEnLigne } from "./navigation-en-ligne";

export async function EnTeteBoutique() {
  /*
   * LE COMPTEUR SOMME LE COOKIE, SANS REQUETE EN BASE. L'en-tete est rendu sur
   * CHAQUE page du site : y ajouter une lecture ferait payer une requete a
   * toute la navigation pour un chiffre indicatif.
   *
   * IL PEUT DONC DIFFERER du panier revalide, qui ramene les quantites au
   * disponible. L'ecart est assume : le compteur dit ce que le visiteur a mis,
   * la page du panier dit ce qu'il peut reellement acheter.
   */
  const magasin = await cookies();
  const articles = compterArticles(
    decoderPanier(magasin.get(NOM_COOKIE_PANIER)?.value),
  );

  /*
   * L'ETAT DE SESSION SERT A AFFICHER, JAMAIS A AUTORISER, invariant 2. Cet
   * en-tete choisit un libelle et une destination ; chaque page protegee
   * revérifie la session de son cote, et `/compte` redirige toute seule.
   *
   * LE LIEN EXISTE PARCE QUE LES ECRANS SANS CHEMIN SONT LE DEFAUT DE LS-162 :
   * huit ecrans d'administration ont vecu sans qu'aucun ne renvoie vers un
   * autre, invisible parce que les tests atteignaient leur cible par une URL en
   * dur. Livrer inscription et connexion sans entree ici aurait rejoue
   * exactement cela cote boutique.
   */
  const identite = await lireIdentite(await headers());

  /* Le même nom dans la barre et dans le menu, WCAG 3.2.4, revue de LS-261. */
  const nomPanier =
    articles > 0
      ? `Votre panier, ${articles} ${articles > 1 ? "pièces" : "pièce"}`
      : "Votre panier, vide";

  return (
    <header className={styles.entete}>
      {/*
       * LE LIEN D'EVITEMENT EST LE PREMIER ELEMENT FOCALISABLE, WCAG 2.2 AA.
       * Sans lui, chaque page oblige a traverser toute la navigation au clavier
       * avant d'atteindre le contenu. Il est masque tant qu'il n'a pas le focus,
       * jamais par `display: none` qui le retirerait aussi du parcours clavier.
       */}
      <a href="#contenu" className={styles.evitement}>
        Aller au contenu
      </a>

      <div className={styles.barre}>
        {/*
         * LE SCEAU EST UN DÉCOR, `alt` VIDE : le nom écrit à côté donne déjà son
         * nom au lien, et un texte alternatif le ferait annoncer deux fois.
         *
         * SERVI À SA TAILLE AFFICHÉE, l'original faisant 720 px : `next/image`
         * en tire 48 et 96 px. `loading="eager"` parce qu'il est au-dessus de la
         * ligne de flottaison sur toutes les pages, sans `preload` pour ne pas
         * disputer la bande passante à l'image principale de la page, LS-309.
         */}
        <Link href="/" className={styles.marque}>
          <Image
            src="/habillage/logo-sceau.jpg"
            alt=""
            width={44}
            height={44}
            loading="eager"
            className={styles.sceau}
          />
          <span className={styles.texteMarque}>
            <span className={styles.nom}>{NOM_BOUTIQUE}</span>
            <span className={styles.baseline}>Bijoux faits main</span>
          </span>
        </Link>

        {/*
         * LA NAVIGATION EN LIGNE EST UN COMPOSANT CLIENT, et lui seul : elle
         * pose `aria-current` d'après le chemin courant, LS-309. Elle porte
         * `aria-label` : une page a plusieurs régions de navigation, en-tête et
         * pied de page, qu'un lecteur d'écran doit distinguer.
         */}
        <NavigationEnLigne />

        <div className={styles.actions}>
          {/*
           * LE COMPTEUR N'APPARAIT QUE S'IL Y A QUELQUE CHOSE. Un « 0 » permanent
           * occupe la place sans rien apprendre, et le prototype ne l'affiche pas
           * non plus sur un panier vide.
           *
           * LE NOMBRE EST DANS LE NOM ACCESSIBLE et non seulement a l'ecran :
           * « Panier » seul ne dirait pas a qui ecoute combien de pieces il
           * contient.
           */}
          {/*
           * DEUX LIBELLES, DEUX DESTINATIONS, ET LE TEXTE DIT LEQUEL. Un lien
           * « Mon compte » qui mene au formulaire de connexion se lit comme une
           * panne ; annoncer « Se connecter » a qui l'est deja se lit comme une
           * deconnexion. Le nom accessible suit le meme texte, sans `aria-label`
           * qui le contredirait.
           */}
          <Link
            href={identite ? "/compte" : "/compte/connexion"}
            className={styles.compte}
          >
            <svg
              className={styles.picto}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
            <span className={styles.texteEtroit}>
              {identite ? "Mon compte" : "Se connecter"}
            </span>
          </Link>

          <Link href="/panier" className={styles.panier} aria-label={nomPanier}>
            <span className={styles.icone}>
              <svg
                className={styles.picto}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M6 8h12l-1 12H7L6 8Z" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" />
              </svg>
              {articles > 0 && (
                <span className={styles.compteur} aria-hidden="true">
                  {articles}
                </span>
              )}
            </span>
            <span className={styles.texteEtroit} aria-hidden="true">
              Panier
            </span>
          </Link>
        </div>

        <MenuMobile
          entrees={ENTREES_MENU_MOBILE}
          compte={{
            href: identite ? "/compte" : "/compte/connexion",
            libelle: identite ? "Mon compte" : "Se connecter",
          }}
          articles={articles}
          nomPanier={nomPanier}
          nomBoutique={NOM_BOUTIQUE}
        />
      </div>
    </header>
  );
}
