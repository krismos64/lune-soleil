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

export function EnTeteBoutique() {
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
      </div>
    </header>
  );
}
