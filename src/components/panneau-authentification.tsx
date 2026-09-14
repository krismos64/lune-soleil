import Image from "next/image";

import styles from "./panneau-authentification.module.css";

/*
 * GABARIT A DEUX PANNEAUX DES ECRANS D'AUTHENTIFICATION, LS-229.
 *
 * Il habille la connexion et l'inscription, des deux espaces, et RIEN D'AUTRE.
 * La reauthentification, la verification d'email et le mot de passe oublie
 * partagent pourtant le meme module CSS `authentification.module.css` : ce sont
 * des etapes au milieu d'un parcours, pas des portes d'entree, et les parer
 * d'un grand visuel ferait ressembler une confirmation d'identite a une page
 * d'accueil.
 *
 * LE PANNEAU EST RETIRE DU FLUX SOUS 768 px PAR `display: none`, ET L'IMAGE
 * RESTE DANS LE BALISAGE. Le composant etant rendu sur le serveur, il ne connait
 * pas la largeur du client : il n'existe aucun moyen de ne pas emettre le noeud
 * sans basculer en composant client et mesurer la fenetre, ce qui coute plus
 * cher que le gain.
 *
 * `sizes` DECLARE 50vw SANS CLAUSE MOBILE, ET CE DETAIL A ETE MESURE DEUX FOIS.
 *
 * Deux versions ont voulu economiser le telechargement sur telephone, ou le
 * panneau est masque : `(min-width: 768px) 50vw, 0px`, puis `, 1px`. Les deux
 * ont donne le meme defaut sur grand ecran, mesure le 14 septembre 2026 : le
 * navigateur retenait la source la plus petite du jeu, 607 px de large, et
 * l'etirait sur 734 px d'affichage. Le panneau rendait un aplat delave qui
 * ressemblait a une image manquante.
 *
 * LA CLAUSE MOBILE NE VAUT PAS CE RISQUE. `sizes` est une indication donnee
 * AVANT la mise en page, et le navigateur reste libre de garder une source deja
 * choisie : l'economie n'est jamais garantie, alors que le delavage, lui, se
 * voit sur l'ecran le plus visible du parcours.
 *
 * `priority` ET NON LE CHARGEMENT DIFFERE PAR DEFAUT. Le panneau occupe la
 * moitie de l'ecran des l'ouverture : `loading="lazy"`, que `next/image` pose
 * sinon, le faisait arriver apres coup et laissait un aplat sable visible le
 * temps du chargement. C'est ce que fait deja le hero de l'accueil, pour la
 * meme raison.
 *
 * L'IMAGE EST DECORATIVE. `alt` vide et `aria-hidden` : elle n'apporte aucune
 * information que le formulaire ne porte pas, et l'annoncer retarderait l'acces
 * au premier champ.
 *
 * ATTENTION, `accueil-hero.jpg` EST UN VISUEL ENGENDRE, NON CONTRACTUEL. Il
 * montre des bijoux absents du catalogue. `public/habillage/README.md` porte
 * l'arbitrage du 19 aout 2026 : conserve pendant le developpement, REMPLACE
 * AVANT L'OUVERTURE par une photographie reelle de LS-23, faute de quoi il ferait
 * passer des pieces inexistantes pour des creations de la boutique. Le
 * remplacement ne demande aucune modification ici si le nom de fichier est
 * conserve.
 */
export function PanneauAuthentification({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.gabarit}>
      <div className={styles.panneau} aria-hidden="true">
        <Image
          src="/habillage/accueil-hero.jpg"
          alt=""
          className={styles.image}
          width={1586}
          height={992}
          sizes="50vw"
          priority
        />
      </div>
      <div className={styles.colonneFormulaire}>
        <div className={styles.contenu}>{children}</div>
      </div>
    </div>
  );
}
