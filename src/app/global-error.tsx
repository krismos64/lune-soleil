"use client";

/**
 * Erreur de dernier recours, LS-146.
 *
 * IL NE SE DECLENCHE QUE SI LE LAYOUT RACINE LUI-MEME ECHOUE. Une erreur dans
 * une page est rattrapee par l'`error.tsx` le plus proche ; celui-ci ne prend la
 * main que lorsque cette chaine entiere a echoue, layout racine compris. C'est
 * le cas le plus rare et le plus grave : l'ecran est alors la SEULE chose qui
 * reste entre le visiteur et une page blanche.
 *
 * IL REMPLACE LE LAYOUT RACINE, il ne s'y imbrique pas. Il porte donc ses
 * propres `html` et `body`, avec `lang="fr"` : sans cet attribut un lecteur
 * d'ecran prononcerait le texte avec les regles de l'anglais, et le layout qui
 * le posait est precisement celui qui vient d'echouer.
 *
 * AUCUN JETON CSS, ET C'EST LA RAISON D'ETRE DES VALEURS EN DUR. `tokens.css` et
 * `globals.css` sont importes par le layout racine : compter sur eux ici
 * reviendrait a dependre du fichier dont la defaillance amene cette page. Les
 * couleurs de `.pageRacine` sont donc ecrites litteralement dans
 * `erreur.module.css`, seule exception du projet a la regle « aucune valeur
 * hexadecimale », et `verifier-palette-secours.sh` verifie qu'elles restent
 * egales aux jetons d'ADR-022.
 *
 * AUCUN COMPOSANT PARTAGE N'EST IMPORTE ICI, ni en-tete ni pied de page. Ils
 * lisent le cookie du panier et des services : dans un etat ou le layout racine
 * a echoue, rien ne garantit qu'ils se rendent. Un ecran de secours n'a de
 * valeur que s'il ne peut pas echouer a son tour, et sa seule dependance est
 * une feuille de style.
 *
 * PAS DE `<Link>` NON PLUS, un `<a>` nu. La navigation client de Next.js repose
 * sur le routeur, dont l'etat est douteux a ce point : un lien HTML ordinaire
 * provoque un rechargement complet, ce qui est exactement le comportement
 * souhaite pour repartir d'un etat sain.
 */
import styles from "./erreur.module.css";

export default function ErreurGlobale({ reset }: { reset: () => void }) {
  return (
    <html lang="fr">
      <body className={styles.pageRacine}>
        <h1 className={styles.titreRacine}>
          Le site est momentanément indisponible
        </h1>

        {/*
         * AUCUN DETAIL TECHNIQUE, invariant 9. `error.digest` existe et sert au
         * diagnostic cote serveur : l'afficher exposerait un identifiant
         * d'exploitation sur une page publique sans aider le visiteur.
         *
         * AUCUN ACCORD AU FEMININ, `frontend-design.md`.
         */}
        <p className={styles.texteRacine}>
          Une erreur inattendue empêche l&apos;affichage du site. Nos excuses
          pour la gêne occasionnée.
        </p>

        <button type="button" onClick={reset} className={styles.actionRacine}>
          Réessayer
        </button>

        <p className={styles.texteRacine}>
          {/*
           * `<a>` NU ET NON `<Link>`, ET LA RÈGLE EST DÉSACTIVÉE SCIEMMENT.
           *
           * `no-html-link-for-pages` a raison partout ailleurs : une navigation
           * client est plus rapide et conserve l'état. Ici, l'état est
           * précisément ce dont il faut se débarrasser. Cette page ne s'affiche
           * que si le layout racine a échoué, et la navigation de `<Link>`
           * repose sur le routeur, dont rien ne garantit l'intégrité à ce
           * moment : un `<Link>` pourrait ne pas répondre, sur le seul écran
           * qui reste au visiteur.
           *
           * Un lien HTML ordinaire provoque un rechargement complet du
           * document, ce qui est le comportement recherché pour repartir d'un
           * état sain.
           */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Revenir à l&apos;accueil</a>
        </p>
      </body>
    </html>
  );
}
