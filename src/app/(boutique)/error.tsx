"use client";

/**
 * Erreur serveur de la boutique publique, LS-146.
 *
 * `"use client"` EST IMPOSE PAR NEXT.JS pour une frontiere d'erreur, qui doit
 * s'attacher a un gestionnaire cote navigateur. Ce fichier ne porte aucune
 * logique metier.
 *
 * IL COUVRE LE GROUPE `(boutique)` ENTIER, la ou LS-104 et LS-97 avaient pose
 * un `error.tsx` par ecran, catalogue, fiche produit et contact. Ces trois
 * fichiers restent : une frontiere plus proche gagne, et chacun porte un
 * message adapte a son ecran. Celui-ci rattrape TOUS LES AUTRES, panier,
 * tunnel, confirmation et compte, qui n'en avaient aucun et tombaient donc sur
 * la page generique de Next.js, en anglais et sans navigation.
 *
 * LE MESSAGE NE DIT PAS CE QUI A ECHOUE. « La base de donnees est injoignable »
 * renseigne sur l'infrastructure sans aider le visiteur, qui n'y peut rien, et
 * expose une information d'exploitation sur une page publique. `error.digest`
 * porte l'identifiant cote serveur pour le diagnostic : il n'est PAS affiche,
 * invariant 9 sur les secrets et les traces.
 *
 * DEUX SORTIES PLUTOT QU'UNE : reessayer, parce qu'une panne de base est
 * souvent breve, et revenir au catalogue, parce qu'un echec repete doit laisser
 * partir sans impasse.
 */
import Link from "next/link";

import styles from "../erreur.module.css";

export default function ErreurBoutique({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /*
   * `role="alert"` PLUTOT QUE `status` : le contenu attendu n'est pas arrive,
   * et `frontend-design.md` reserve `alert` au refus et a l'echec.
   *
   * LA REGION EST PORTEE PAR LE `main` LUI-MEME, sans conteneur
   * supplementaire : la page entiere EST le message d'erreur, et un `div`
   * interieur ajouterait un niveau qui ne sert rien. C'est le meme defaut que
   * le `<div id="contenu">` retire du layout de la boutique en LS-122.
   *
   * LA REGION EST NOMMEE. Une region live sans nom accessible n'est pas une
   * violation au sens d'axe-core, qui la laisse passer, mais un lecteur d'ecran
   * annonce alors le changement sans dire de quoi il parle. Les sept regions du
   * parcours ont ete nommees en LS-85 pour ce motif.
   */
  return (
    <main
      className={styles.page}
      id="contenu"
      tabIndex={-1}
      role="alert"
      aria-label="Erreur de la page"
    >
      <p className={styles.surtitre}>Une erreur est survenue</p>

      <h1 className={styles.titre}>La page n&apos;a pas pu s&apos;afficher</h1>

      {/*
       * AUCUN ACCORD AU FEMININ, `frontend-design.md`.
       *
       * « Le probleme vient de notre cote » reprend la formulation deja
       * employee par l'erreur du catalogue : elle evite que le visiteur
       * cherche ce qu'il a mal fait.
       */}
      <p className={styles.texte}>
        Le problème vient de notre côté, pas de votre navigation. Votre panier
        est conservé.
      </p>

      <div className={styles.sorties}>
        <button
          type="button"
          onClick={reset}
          className={styles.actionPrincipale}
        >
          Réessayer
        </button>
        <Link href="/catalogue" className={styles.actionSecondaire}>
          Voir les créations
        </Link>
      </div>
    </main>
  );
}
