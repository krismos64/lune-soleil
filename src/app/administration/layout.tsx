/**
 * Layout de l'administration, LS-162 puis LS-181.
 *
 * IL EXISTE POUR PORTER LA BARRE DE NAVIGATION, arbitrage de Christophe du
 * 2 septembre 2026 : barre permanente plutot qu'index sur l'accueil. Sept URL a
 * connaitre par coeur ne se reglent pas en imposant un retour a l'accueil entre
 * chaque ecran. LS-181 y ajoute le GABARIT, deux colonnes sur grand ecran, et
 * le BANDEAU superieur, tous deux absents jusque-la.
 *
 * IL N'AUTORISE RIEN, ET C'EST DELIBERE. Chaque page appelle deja
 * `exigerAdministratrice` avant de rendre quoi que ce soit, et c'est LA
 * protection : un layout ne doit surtout pas devenir le seul endroit ou elle
 * vit. Deux raisons, et la seconde est la vraie.
 *
 * D'abord, un layout ne se re-rend pas a chaque navigation : y placer une garde
 * la ferait s'executer moins souvent que les pages qu'elle pretend proteger.
 *
 * Ensuite et surtout, une Server Action n'est PAS rendue par un layout. Une
 * garde qui vivrait ici laisserait toutes les actions ouvertes a un appel HTTP
 * direct, alors que l'ecran paraitrait protege. C'est exactement le motif que
 * `verifier-gardes-administration.sh` verifie fonction par fonction.
 *
 * CE QU'IL FAIT DE LA SESSION, il ne s'en sert QUE POUR AFFICHER. `lireIdentite`
 * ne leve pas et rend `null` sans session : la barre disparait alors, ce qui
 * evite de proposer neuf liens vers des ecrans proteges a qui n'est pas
 * connecte, sur la page de connexion en particulier. Cacher la barre n'est pas
 * une protection et n'en tient pas lieu : les pages restent gardees.
 *
 * LES COMPTAGES SONT LUS ICI, une fois par rendu de page, et passes en props.
 * Un composant client ne doit pas ouvrir sa propre porte vers les donnees pour
 * afficher une pastille. Ils ne sont lus QUE SI la session porte le role : sans
 * cela, un client inscrit ferait jouer une requete d'agregation a chaque
 * navigation sur une barre qu'il ne verra jamais.
 */
import Link from "next/link";
import { headers } from "next/headers";

import { NavigationAdministration } from "@/components/navigation-administration";
import { lireIdentite } from "@/services/autorisation";
import { lireComptages } from "@/services/tableau-bord";

import { BoutonDeconnexion } from "./bouton-deconnexion";
import styles from "./layout.module.css";

/**
 * Gabarit de titre de l'administration, LS-137.
 *
 * IL REMPLACE CELUI DU LAYOUT RACINE plutot que de s'y ajouter. Un `template`
 * defini dans un segment ne s'applique qu'a ses enfants, et le titre resolu
 * d'un enfant n'est PAS repasse dans le gabarit du parent : « Stocks et
 * marches, administration » est donc le titre final, jamais « Stocks et
 * marches, administration, Lune & Soleil ».
 *
 * POURQUOI CE SUFFIXE PLUTOT QUE LE NOM DE LA BOUTIQUE. Ces ecrans ne sont vus
 * que par l'exploitante, souvent plusieurs onglets ouverts : ce qui l'aide a
 * s'y retrouver est de distinguer l'administration de la boutique publique, pas
 * de lire deux fois le nom de son propre site.
 *
 * `default` COUVRE LE SEGMENT LUI-MEME, `/administration`, dont le titre ne
 * passe pas par le gabarit : un `template` ne s'applique jamais au segment qui
 * le declare.
 */
export const metadata = {
  title: {
    default: "Administration, Lune & Soleil",
    template: "%s, administration",
  },
};

export default async function LayoutAdministration({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const identite = await lireIdentite(await headers());

  /*
   * LE ROLE EST VERIFIE, PAS SEULEMENT LA PRESENCE D'UNE SESSION. Un client
   * inscrit sur la boutique porte une session valide avec le role `CLIENT` :
   * sans ce test, la barre de l'administration s'afficherait pour lui s'il
   * ouvrait une de ces URL, en annoncant la structure d'ecrans auxquels il n'a pas acces.
   * Les pages le refuseraient bien, mais l'affichage aurait deja divulgue la
   * structure de l'administration. Motif « fabriquer la preuve sans le role ».
   */
  const estAdministratrice = identite?.role === "ADMINISTRATRICE";

  if (!estAdministratrice) {
    return <>{children}</>;
  }

  const comptages = await lireComptages();

  /*
   * LE NOM AFFICHE EST L'EMAIL, faute de mieux aujourd'hui : `lireIdentite` ne
   * rend pas le nom, et l'ajouter toucherait la frontiere de session pour un
   * gain d'affichage. La partie locale suffit a identifier la personne dans une
   * administration a compte unique.
   */
  const nom = identite.email.split("@")[0] ?? identite.email;

  return (
    <div className={styles.gabarit}>
      <NavigationAdministration
        comptages={comptages}
        nom={nom}
        deconnexion={<BoutonDeconnexion />}
      />

      <div className={styles.colonne}>
        {/*
         * LE BANDEAU SUPERIEUR. Il ne porte PAS le nom de l'ecran, contrairement
         * au prototype : le layout ne connait pas la page rendue sous lui, et le
         * deduire du chemin dupliquerait la table des rubriques a un second
         * endroit qui divergerait. Chaque page porte deja son titre en tete de
         * contenu, ou il est un `h1` et non un ornement de bandeau.
         *
         * `role="banner"` N'EST PAS POSE ICI. Il appartient a l'en-tete de la
         * page, et un second serait ambigu pour un lecteur d'ecran.
         */}
        <div className={styles.bandeau}>
          <span className={styles.bandeauSurtitre}>Administration</span>

          {/*
           * LIEN VERS LA BOUTIQUE, et non un bouton. C'est une navigation vers
           * une autre partie du site, ouverte dans le meme onglet : ouvrir un
           * nouvel onglet sans le dire est une surprise, et le signaler
           * alourdirait un lien secondaire.
           */}
          <Link className={styles.bandeauLien} href="/">
            Voir la boutique
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}
