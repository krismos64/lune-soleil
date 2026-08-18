/**
 * Etat de chargement de la fiche produit, LS-105. `frontend-design.md`, section
 * « Etats obligatoires ».
 *
 * POURQUOI IL EXISTE. La page est en `force-dynamic` et lit la base a chaque
 * affichage : sans frontiere de Suspense, Next.js laisse l'ecran PRECEDENT fige
 * pendant tout le rendu serveur. Arriver du catalogue laisserait la grille a
 * l'ecran, et le visiteur croirait son clic perdu.
 *
 * UNE ARMATURE ET NON UN TOURNIQUET, aux proportions de la fiche reelle : la
 * galerie carree et la colonne d'achat. Elle evite le saut de mise en page a
 * l'arrivee du contenu.
 *
 * `aria-hidden` SUR L'ARMATURE, LE STATUT A COTE. Annoncer des blocs vides
 * n'apprend rien ; une phrase le fait mieux.
 */
import styles from "./fiche.module.css";

export default function ChargementFiche() {
  return (
    <main className={styles.page}>
      <p className={styles.compteChargement} role="status">
        Chargement de la pièce.
      </p>

      <div className={styles.corps} aria-hidden="true">
        <div className={styles.galerie}>
          <div className={styles.imagePrincipale} />
        </div>
        <div className={styles.achat}>
          <p className={styles.ardoiseTitre} />
          <p className={styles.ardoiseTexte} />
          <p className={styles.ardoiseTexteCourt} />
        </div>
      </div>
    </main>
  );
}
