/**
 * Etat de chargement du journal des connexions, LS-188.
 *
 * LA REQUETE EST LA PLUS LOURDE DES ECRANS DE LISTE : elle lit les tentatives
 * recentes sur les comptes d'administration ET les comptes clients, reussies
 * comme echouees, soit la table qui grossit le plus vite du modele.
 *
 * SA CLASSE DE PAGE EST EN KEBAB-CASE, `styles["journal-connexions"]`, et non
 * `styles.page` comme les autres ecrans. La reprendre telle quelle est
 * volontaire : le squelette doit se poser dans la mise en page de l'ecran, et
 * renommer la classe ici la desynchroniserait de la page qu'elle remplace.
 *
 * LE TITRE N'A PAS DE CLASSE, l'ecran s'appuyant sur le style de base des `h1`.
 * `classeTitre` est donc omis, et le composant rend un `<h1>` nu, identique.
 *
 * IL EST AUTORISE ICI : la page n'appelle pas `notFound()`, donc C32 ne
 * s'applique pas.
 */
import { ChargementAdministration } from "@/components/chargement-administration";

import styles from "./journal-connexions.module.css";

export default function Chargement() {
  return (
    <ChargementAdministration
      titre="Journal des connexions"
      annonce="Chargement du journal…"
      lignes={6}
      classePage={styles["journal-connexions"]}
    />
  );
}
