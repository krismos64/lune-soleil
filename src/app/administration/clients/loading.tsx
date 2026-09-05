/**
 * Etat de chargement de l'ecran Clients, LS-185.
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
 * LES QUATORZE AUTRES ECRANS D'ADMINISTRATION N'EN ONT PAS, et c'est LS-188 qui
 * porte le sujet. Celui-ci en reçoit un parce que sa recherche rend l'attente
 * frequente et volontaire, la ou les autres ecrans se chargent une fois.
 */
import styles from "./clients.module.css";

export default function ChargementClients() {
  return (
    <main className={styles.page}>
      <p className={styles.surtitre}>Relation client</p>
      <h1 className={styles.titre}>Clients</h1>

      {/*
       * `role="status"` ET NON UN SIMPLE PARAGRAPHE. Un lecteur d'ecran doit
       * apprendre que la page travaille : sans annonce, l'utilisatrice ne sait
       * pas si sa recherche a ete prise en compte.
       *
       * `aria-live` N'EST PAS AJOUTE, `role="status"` le portant implicitement
       * en `polite`. Le doubler ne change rien et brouille la lecture.
       */}
      <p className={styles.vide} role="status">
        Chargement des comptes…
      </p>
    </main>
  );
}
