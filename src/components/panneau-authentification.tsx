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
 * `sizes` RESTE A `50vw`, ET LE COUT SUR TELEPHONE EST ASSUME, PAS IGNORE.
 *
 * Mesure le 14 septembre 2026 : a 320 px en DPR 2, le navigateur telecharge
 * 9,7 ko, source 384w, pour un panneau que le CSS masque. A 1280 px il prend
 * 41,9 ko en 640w, qui eux servent.
 *
 * DEUX ESSAIS ONT VOULU SUPPRIMER CES 9,7 ko ET ONT CASSE LE RENDU :
 * `(min-width: 768px) 50vw, 0px`, puis `, 1px`. Tous deux demandaient la source
 * la plus PETITE du jeu, que le navigateur gardait ensuite sur grand ecran, ou
 * le panneau rendait alors un aplat delave.
 *
 * Aucune valeur intermediaire ne fait mieux : a 320 px, `50vw` vaut deja 160 px
 * CSS, soit 320 px en DPR 2, et le navigateur retient donc deja la plus petite
 * source utile du jeu. Descendre plus bas ne gagne rien sans rouvrir le
 * delavage. Supprimer vraiment ce cout demanderait de ne pas rendre le noeud,
 * donc un composant client qui mesure la fenetre : plus cher que 9,7 ko.
 *
 * `100vw` SERAIT FAUX ICI, a la difference du hero de l'accueil qui le declare :
 * cette image y est VISIBLE en pleine largeur sur telephone, la sienne non.
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
