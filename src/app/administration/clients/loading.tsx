/**
 * Etat de chargement de l'ecran Clients, LS-185 puis LS-188.
 *
 * IL EST AUTORISE ICI, ET C'EST UNE VERIFICATION ET NON UNE SUPPOSITION. C32
 * interdit un `loading.tsx` sur une route qui appelle `notFound()`, le streaming
 * de Suspense commençant avant que le 404 soit atteint : la page rendrait alors
 * 200 sur une ressource absente. Cette page n'appelle pas `notFound()`, elle
 * redirige ou rend une liste, donc le motif ne s'applique pas.
 *
 * POURQUOI IL EST UTILE ICI PLUS QU'AILLEURS. La page est en `force-dynamic` et
 * sa requete agrege, pour cent comptes, deux comptages, la somme des commandes
 * et la derniere connexion reussie. Chaque soumission de recherche est une
 * navigation serveur complete : sans cet ecran, le clic sur « Rechercher » ne
 * produit aucun retour visuel jusqu'a l'arrivee des resultats.
 *
 * LS-188 L'A RAMENE SUR LE COMPOSANT PARTAGE. Il etait le premier et le seul
 * etat de chargement de l'administration, ecrit avant que les onze autres
 * existent, et portait sa propre phrase sans armature. Le garder tel quel aurait
 * fait diverger le seul ecran deja fait de ceux qui le rejoignaient, et
 * `verifier-chargement-administration.sh` le signale desormais.
 */
import { ChargementAdministration } from "@/components/chargement-administration";

import styles from "./clients.module.css";

export default function ChargementClients() {
  return (
    <ChargementAdministration
      titre="Clients"
      surtitre="Relation client"
      annonce="Chargement des comptes…"
      lignes={5}
      classePage={styles.page}
      classeTitre={styles.titre}
      classeSurtitre={styles.surtitre}
    />
  );
}
