/**
 * En-tete de la boutique publique, LS-122.
 *
 * COMPOSANT SERVEUR. Sous 768 px, la navigation passe dans `MenuMobile`, le
 * menu plein écran de LS-261 validé avec la maquette d'accueil du 4 octobre
 * 2026 ; au-delà, elle reste une liste de liens en ligne, sans script. Le
 * premier choix, quatre entrées sur deux lignes à 320 px sans menu, est
 * remplacé par cet arbitrage. Le menu repose sur `<details>` et marche donc
 * sans JavaScript.
 *
 * LE COMPTE ET LE PANIER RESTENT DANS LA BARRE À TOUTES LES LARGEURS : ce sont
 * des actions, pas de la navigation. Sous 480 px ils deviennent des
 * pictogrammes, leur texte restant le nom accessible.
 *
 * IL VIT DANS LE LAYOUT DU GROUPE `(boutique)` ET NON DANS LE LAYOUT RACINE.
 * Le layout racine couvre aussi `/administration`, qui ne doit afficher ni cet
 * en-tete ni le pied de page : une administratrice connectee n'est pas en train
 * de faire ses courses.
 */
import Link from "next/link";
import { cookies, headers } from "next/headers";

import { NOM_COOKIE_PANIER, decoderPanier } from "@/lib/panier-cookie";
import { compterArticles } from "@/services/panier";
import { lireIdentite } from "@/services/autorisation";
import styles from "./en-tete-boutique.module.css";
import { NOM_BOUTIQUE } from "@/lib/seo";
import { MenuMobile } from "./menu-mobile";

/**
 * Les entrees de navigation, dans l'ordre du prototype.
 *
 * `/notre-univers` ET `/aide` N'EXISTENT PAS ENCORE, elles appartiennent a
 * LS-123 qui attend ses contenus. Les liens sont ecrits maintenant parce que
 * l'en-tete est ecrit une fois : les ajouter plus tard obligerait a le reprendre.
 * Ils rendent une 404 d'ici la, comme les liens de fiche produit l'ont fait
 * entre LS-104 et LS-105.
 */
const ENTREES = [
  {
    href: "/catalogue",
    libelle: "Les créations",
    description: "Toutes les pièces disponibles",
  },
  {
    href: "/atelier",
    libelle: "L'atelier",
    description: "L'histoire, les matériaux, l'entretien",
  },
  {
    href: "/aide",
    libelle: "Livraison et aide",
    description: "Livraison, retours et questions fréquentes",
  },
] as const;

/**
 * LE MENU MOBILE PORTE UNE ENTRÉE DE PLUS, le contact, comme la maquette
 * validée : sur un écran de téléphone, le pied de page qui le propose est loin.
 */
const ENTREES_MENU = [
  ...ENTREES,
  {
    href: "/contact",
    libelle: "Contact",
    description: "Une question sur une pièce ou une commande",
  },
] as const;

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
        <Link href="/" className={styles.marque}>
          <span className={styles.nom}>{NOM_BOUTIQUE}</span>
          <span className={styles.baseline}>Bijoux faits main</span>
        </Link>

        {/*
         * `aria-label` SUR LA BALISE `nav` : une page peut porter plusieurs
         * regions de navigation, en-tete et pied de page ici. Sans nom, un
         * lecteur d'ecran annonce deux fois « navigation » sans les distinguer.
         */}
        <nav aria-label="Navigation principale" className={styles.navigation}>
          <ul className={styles.liste}>
            {ENTREES.map((entree) => (
              <li key={entree.href}>
                <Link href={entree.href} className={styles.lien}>
                  {entree.libelle}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

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
          <svg
            className={styles.picto}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 8h12l-1 12H7L6 8Z" />
            <path d="M9 8V6a3 3 0 0 1 6 0v2" />
          </svg>
          <span className={styles.texteEtroit} aria-hidden="true">
            Panier
          </span>
          {articles > 0 && (
            <span className={styles.compteur} aria-hidden="true">
              {articles}
            </span>
          )}
        </Link>

        <MenuMobile
          entrees={ENTREES_MENU}
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
