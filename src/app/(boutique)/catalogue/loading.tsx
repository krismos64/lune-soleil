/**
 * Etat de chargement du catalogue, LS-104. `frontend-design.md`, section
 * « Etats obligatoires ».
 *
 * POURQUOI IL EXISTE. La page est en `force-dynamic` et lit la base a chaque
 * affichage : sans frontiere de Suspense, Next.js laisse l'ecran PRECEDENT fige
 * pendant tout le rendu serveur. Le visiteur clique sur un filtre et ne voit
 * rien changer, ce qui l'amene a recliquer.
 *
 * UNE ARMATURE ET NON UN TOURNIQUET. Elle occupe la place que la grille prendra,
 * ce qui evite le saut de mise en page a l'arrivee des cartes. Les proportions
 * reprennent celles de `.carte`, meme cadre carre.
 *
 * `aria-hidden` SUR L'ARMATURE, ET LE STATUT A COTE. Annoncer six cartes vides
 * n'apprend rien a qui ecoute ; une phrase le fait mieux. C'est la raison pour
 * laquelle l'armature est purement decorative ici.
 */
import styles from "./catalogue.module.css";

/** Autant d'ardoises que la grille montre de cartes sur un ecran courant. */
const ARDOISES = [0, 1, 2, 3, 4, 5];

export default function ChargementCatalogue() {
  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Le catalogue</h1>
      <p className={styles.accroche}>
        Chaque bijou est fait main et créé à l&apos;unité.
      </p>

      <p className={styles.compte} role="status">
        Chargement des pièces.
      </p>

      <ul className={styles.grille} aria-hidden="true">
        {ARDOISES.map((rang) => (
          <li key={rang} className={styles.carte}>
            <div className={styles.cadreImage}>
              <div className={styles.imageAbsente} />
            </div>
            <div className={styles.corpsCarte}>
              <p className={styles.ardoiseTexte} />
              <p className={styles.ardoiseTexteCourt} />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
