/**
 * Pied de page de la boutique publique, LS-122.
 *
 * COMPOSANT SERVEUR, uniquement des liens.
 *
 * LA PLUPART DES CIBLES N'EXISTENT PAS ENCORE, LS-123 les livrera. Elles sont
 * ecrites ici parce que le pied de page s'ecrit une fois, et parce que LS-25
 * exige que le lien « notre histoire » aboutisse a une page reelle : ce critere
 * se verifiera a la livraison de LS-123, pas avant.
 *
 * AUCUNE ICONE SOCIALE. LS-30 l'impose : aucune icone n'est publiee sans canal
 * officiel valide, et aucun canal n'est ouvert a ce jour. Le prototype n'en
 * affiche pas non plus.
 */
import Link from "next/link";

import styles from "./pied-boutique.module.css";

/**
 * Les trois colonnes du pied de page, dans l'ordre du prototype.
 *
 * LES ANCRES POINTENT VERS DES SECTIONS QUE LS-123 DEVRA REELLEMENT CREER. Un
 * lien vers `#cgv` qui ne trouve pas sa cible ne leve aucune erreur : il
 * retombe en haut de page, silencieusement. Le critere 2 de LS-123 porte
 * precisement cette verification.
 */
const COLONNES = [
  {
    titre: "Découvrir",
    liens: [
      { href: "/catalogue", libelle: "Toutes les créations" },
      { href: "/notre-univers", libelle: "Notre histoire" },
      { href: "/notre-univers#matieres", libelle: "Matériaux" },
      { href: "/notre-univers#entretien", libelle: "Entretien" },
    ],
  },
  {
    titre: "Besoin d'aide",
    liens: [
      { href: "/aide", libelle: "Livraison et retours" },
      { href: "/aide#faq", libelle: "Questions fréquentes" },
      { href: "/aide#contact", libelle: "Contact" },
    ],
  },
  {
    titre: "Informations",
    liens: [
      { href: "/informations-legales", libelle: "Mentions légales" },
      { href: "/informations-legales#cgv", libelle: "Conditions de vente" },
      {
        href: "/informations-legales#confidentialite",
        libelle: "Confidentialité",
      },
      {
        href: "/informations-legales#retractation",
        libelle: "Rétractation",
      },
    ],
  },
] as const;

export function PiedBoutique() {
  return (
    <footer className={styles.pied}>
      <div className={styles.contenu}>
        <div className={styles.marque}>
          <p className={styles.nom}>Lune &amp; Soleil</p>
          {/*
           * AUCUNE MENTION D'ORIGINE GEOGRAPHIQUE ICI. `frontend-design.md`
           * l'interdit tant que l'exploitante n'a pas confirme le lieu reel de
           * fabrication : « faits main en Bearn » non confirme serait une
           * allegation commerciale trompeuse, pas un argument decoratif.
           */}
          <p className={styles.description}>
            Des bijoux faits main, en petite série, avec une attention portée
            aux matières et aux détails.
          </p>
        </div>

        {COLONNES.map((colonne) => (
          <nav
            key={colonne.titre}
            aria-label={colonne.titre}
            className={styles.colonne}
          >
            {/*
             * UN TITRE DE COLONNE EN `h2` ET NON EN `p` STYLE : la structure de
             * titres doit rester parcourable au lecteur d'ecran. Le pied de page
             * vient apres le contenu, dont les titres de section sont aussi des
             * `h2` : la hierarchie reste coherente.
             */}
            <h2 className={styles.titreColonne}>{colonne.titre}</h2>
            <ul className={styles.liste}>
              {colonne.liens.map((lien) => (
                <li key={lien.href}>
                  <Link href={lien.href} className={styles.lien}>
                    {lien.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className={styles.bas}>
        <p className={styles.mention}>
          &copy; {new Date().getFullYear()} Lune &amp; Soleil
        </p>
        <p className={styles.mention}>France métropolitaine, Corse comprise</p>
      </div>
    </footer>
  );
}
