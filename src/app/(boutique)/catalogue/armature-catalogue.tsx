/**
 * Armature de chargement du catalogue, LS-104 puis LS-139.
 *
 * C'ETAIT `loading.tsx`, ET IL A ETE DEPLACE ICI LE 9 SEPTEMBRE 2026. Le
 * fichier de segment enveloppe la page ENTIERE dans une frontiere Suspense :
 * le streaming demarre alors des le premier `await` de la page, et un statut
 * ne se change plus une fois les octets partis.
 *
 * CE QUE CELA COUTAIT, mesure en arretant reellement la base de production :
 * `/catalogue` rendait **200** avec « Chargement des pieces… » comme etat
 * FINAL, quand l'accueil, qui n'a aucune frontiere au-dessus de lui, rendait un
 * vrai 500. Un visiteur sans JavaScript restait devant un chargement
 * perpetuel, et un moteur indexait cette page.
 *
 * UNE SONDE EN TETE DE PAGE NE SUFFISAIT PAS, et c'est l'erreur de la premiere
 * correction, deployee puis mesuree : elle etait elle-meme un `await` SOUS la
 * frontiere, donc elle suspendait et demarrait le flux avant de lever. La
 * documentation de Next.js 16 le dit, verifiee par Context7 : le controle doit
 * preceder « any await that may suspend », frontiere de segment comprise.
 *
 * LE REMEDE GARDE LES DEUX EXIGENCES. La page fait sa lecture au-dessus de
 * toute frontiere, ce qui lui rend son vrai statut, et pose ce composant en
 * `fallback` d'un `<Suspense>` INTERNE pour que l'etat de chargement de
 * `frontend-design.md` reste rendu. C'est la voie que la fiche produit avait
 * ecrite dans son propre en-tete sans avoir eu a l'emprunter.
 *
 * UNE ARMATURE ET NON UN TOURNIQUET. Elle occupe la place que la grille prendra,
 * ce qui evite le saut de mise en page a l'arrivee des cartes. Les proportions
 * reprennent celles de `.carte`, meme cadre carre.
 *
 * `aria-hidden` SUR L'ARMATURE, ET LE STATUT A COTE. Annoncer six cartes vides
 * n'apprend rien a qui ecoute ; une phrase le fait mieux. C'est la raison pour
 * laquelle l'armature est purement decorative ici.
 *
 * L'ANNONCE SE TERMINE PAR DES POINTS DE SUSPENSION, LS-195. C35 de
 * `frontend-design.md`, et `verifier-ponctuation-chargement.sh` le garde.
 */
import styles from "./catalogue.module.css";

/** Autant d'ardoises que la grille montre de cartes sur un ecran courant. */
const ARDOISES = [0, 1, 2, 3, 4, 5];

export function ArmatureCatalogue() {
  return (
    <>
      <p className={styles.compte} role="status">
        Chargement des pièces…
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
    </>
  );
}
