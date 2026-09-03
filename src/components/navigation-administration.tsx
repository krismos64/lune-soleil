"use client";

/**
 * Navigation de l'administration, LS-162.
 *
 * LE DEFAUT QU'ELLE FERME. Aucun ecran d'administration ne renvoyait vers un
 * autre : l'exploitante devait connaitre et saisir sept URL par coeur. Sur
 * smartphone, ou `frontend-design.md` fixe la cible « creer un produit complet
 * en moins de trois minutes », c'etait le premier obstacle avant meme
 * d'atteindre l'ecran.
 *
 * PERSONNE NE L'AVAIT VU parce que les tests de bout en bout appellent
 * `page.goto()` avec l'URL en dur : ils ne passent jamais par une navigation
 * reelle, donc l'absence de menu ne faisait rougir aucune assertion. Motif
 * « un defaut absent n'est pas un defaut empeche ».
 *
 * BARRE PERMANENTE ET NON INDEX SUR L'ACCUEIL, arbitrage de Christophe du
 * 2 septembre 2026. La question etait explicitement ouverte dans le ticket.
 * Sept URL a connaitre ne se reglent pas en imposant un retour a l'accueil
 * entre chaque ecran, et la cible des trois minutes suppose de passer d'un
 * ecran a l'autre sans detour.
 *
 * COMPOSANT CLIENT, ET C'EST IMPOSE PAR NEXT.JS, verifie via Context7 : UN
 * LAYOUT NE SE RE-REND PAS A LA NAVIGATION. Un chemin lu cote serveur et passe
 * en props resterait donc fige sur la premiere page ouverte, et le marqueur
 * d'ecran courant designerait la mauvaise rubrique apres chaque clic. Seul
 * `usePathname`, qui se re-rend, donne le chemin reel.
 *
 * LE COUT EST NUL EN PRATIQUE : le composant ne porte ni etat, ni gestionnaire
 * d'evenement, ni donnee. Le JavaScript envoye se limite a la lecture du
 * chemin, et aucune logique metier ne traverse cette frontiere.
 *
 * LES RUBRIQUES SONT CELLES REELLEMENT LIVREES, jamais les onze du prototype.
 * Un lien vers un ecran inexistant est pire que son absence : il promet une
 * fonction qui n'existe pas et rend un 404 a l'exploitante. Le controle
 * `verifier-navigation-administration.sh` confronte cette liste aux routes du
 * depot DANS LES DEUX SENS, ce qui est le seul moyen de tenir le critere 2 :
 * une liste ecrite a la main se perime en silence.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./navigation-administration.module.css";

/**
 * Les rubriques de la barre, dans l'ordre du travail quotidien et non dans
 * l'ordre alphabetique.
 *
 * L'ORDRE SUIT LA JOURNEE DE L'EXPLOITANTE : ce qui arrive en premier est ce
 * qu'elle regarde en premier. Les commandes payees ouvrent la liste, les
 * expeditions suivent parce qu'elles en decoulent, les messages viennent
 * ensuite. Le catalogue et les stocks sont du travail de fond, le journal des
 * connexions une verification occasionnelle.
 *
 * QUATRE ROUTES SONT DELIBEREMENT ABSENTES, et le controle le sait :
 *
 *   /administration                       la barre elle-meme y mene par le titre
 *   /administration/connexion             on n'y est pas connecte
 *   /administration/reauthentification    on y arrive par une action, jamais par choix
 *   /administration/commandes/[id]        et /produits/[id], ecrans de detail
 *
 * Un ecran de detail n'a pas de place dans une navigation : son URL contient un
 * identifiant, et il s'atteint depuis sa liste.
 */
export const RUBRIQUES = [
  { chemin: "/administration/commandes", libelle: "Commandes" },
  { chemin: "/administration/expeditions", libelle: "Expéditions" },
  { chemin: "/administration/retractations", libelle: "Rétractations" },
  { chemin: "/administration/messages", libelle: "Messages" },
  { chemin: "/administration/produits/nouveau", libelle: "Nouveau produit" },
  { chemin: "/administration/categories", libelle: "Catégories" },
  { chemin: "/administration/stocks", libelle: "Stocks" },
  { chemin: "/administration/journal-connexions", libelle: "Connexions" },
] as const;

/**
 * L'ecran courant, deduit du chemin.
 *
 * LA COMPARAISON N'EST PAS UNE EGALITE STRICTE. `/administration/commandes/abc`
 * est le detail d'une commande : la rubrique « Commandes » doit s'y marquer
 * courante, sans quoi l'exploitante perd son reperage des qu'elle ouvre un
 * detail. Le prefixe suivi d'une barre est ce qui distingue un enfant reel
 * d'un homonyme, `/administration/commandes-archivees` n'etant pas un enfant
 * de `/administration/commandes`.
 */
export function estRubriqueCourante(chemin: string, rubrique: string): boolean {
  return chemin === rubrique || chemin.startsWith(`${rubrique}/`);
}

export function NavigationAdministration() {
  const chemin = usePathname();

  return (
    /*
     * `aria-label` SUR LE `nav`, et il est indispensable ici. La page publique
     * porte deja une navigation : sans nom, un lecteur d'ecran annoncerait deux
     * regions « navigation » indiscernables. Motif deja rencontre en LS-85 sur
     * les regions live anonymes, qu'`axe-core` laisse passer sans rien dire.
     */
    <nav className={styles.barre} aria-label="Sections de l'administration">
      <ul className={styles.liste}>
        {RUBRIQUES.map((rubrique) => {
          const courante = estRubriqueCourante(chemin, rubrique.chemin);

          return (
            <li key={rubrique.chemin}>
              <Link
                href={rubrique.chemin}
                className={styles.lien}
                /*
                 * `aria-current="page"` PORTE L'INFORMATION, la couleur ne fait
                 * que l'appuyer : `frontend-design.md` interdit qu'une
                 * information passe par la seule couleur, et c'est le critere 3
                 * de la story, « l'ecran courant est annonce comme tel ».
                 */
                aria-current={courante ? "page" : undefined}
              >
                {rubrique.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
