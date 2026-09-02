/**
 * En-tete de la boutique publique, LS-122.
 *
 * COMPOSANT SERVEUR. La navigation est une liste de liens : rien n'y est
 * interactif, donc aucun JavaScript n'est envoye pour l'afficher. Le menu
 * deroulant mobile est ecarte volontairement, quatre entrees tenant a 320 px
 * sur deux lignes.
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
  { href: "/catalogue", libelle: "Les créations" },
  { href: "/notre-univers", libelle: "Notre univers" },
  { href: "/aide", libelle: "Livraison et aide" },
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
          <span className={styles.nom}>Lune &amp; Soleil</span>
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
          {identite ? "Mon compte" : "Se connecter"}
        </Link>

        <Link
          href="/panier"
          className={styles.panier}
          aria-label={
            articles > 0
              ? `Votre panier, ${articles} ${articles > 1 ? "pièces" : "pièce"}`
              : "Votre panier, vide"
          }
        >
          <span aria-hidden="true">Panier</span>
          {articles > 0 && (
            <span className={styles.compteur} aria-hidden="true">
              {articles}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
