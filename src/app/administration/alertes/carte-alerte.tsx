"use client";

/**
 * Le geste d'acquittement d'une alerte, LS-98.
 *
 * COMPOSANT CLIENT PARCE QU'IL PORTE UNE INTERACTION REELLE : l'etat de la
 * soumission et l'annonce du resultat. Il ne requete rien lui-meme.
 *
 * UN COMPOSANT PAR ALERTE, et c'est ce qui rend les identifiants distincts. Un
 * unique formulaire pour toute la liste ferait porter la meme region live a
 * toutes les cartes, et l'annonce d'un acquittement designerait la mauvaise.
 *
 * LE LIBELLE DU BOUTON RESTE FIXE, lecon de la revue frontend de LS-61 : un
 * bouton `disabled` perd le focus, donc un lecteur d'ecran ne revient pas lire
 * un nom qui vient de changer. L'attente vit dans la region live.
 */
import { useActionState } from "react";

import { type ResultatAcquittement, acquitterAction } from "./actions";
import styles from "./alertes.module.css";

/** Ce que la region live annonce, selon l'issue. */
function messageDe(
  resultat: ResultatAcquittement | null,
  enCours: boolean,
): string {
  if (enCours) {
    return "Acquittement en cours…";
  }

  if (resultat === null) {
    return "";
  }

  switch (resultat.statut) {
    /*
     * LE SUCCES NE PRODUIT AUCUN MESSAGE : la carte est demontee par le
     * rafraichissement avant qu'il soit lu. Voir le bloc du composant.
     */
    case "SUCCES":
      return "";
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour acquitter.";
    /*
     * UN DOUBLE CLIC N'EST PAS UN ECHEC, et le message le dit ainsi. Annoncer
     * une erreur ferait chercher un probleme la ou l'alerte est traitee.
     */
    case "DEJA_TRAITEE":
      return "Cette alerte était déjà traitée.";
  }
}

export function CarteAlerte({ alerteId }: { alerteId: string }) {
  const [resultat, action, enCours] = useActionState<
    ResultatAcquittement | null,
    FormData
  >(async () => acquitterAction(alerteId), null);

  const annonce = messageDe(resultat, enCours);

  /*
   * ------------------------------------------------------------------
   * LE SUCCES N'EST PAS ANNONCE PAR CETTE CARTE, ET C'EST STRUCTUREL.
   *
   * `revalidatePath` redessine la page : l'alerte quitte la file « a traiter »,
   * et CE COMPOSANT EST DEMONTE avec sa region live avant que l'annonce soit
   * lue. Mesure faite le 11 septembre 2026, le test attendait « Alerte
   * acquittee » sur un element qui n'existait plus.
   *
   * Motif « focus sur un element detache », deja en fiche sur ce depot,
   * applique ici a l'ANNONCE plutot qu'au focus.
   *
   * LA CONFIRMATION VIT DONC DANS LA LISTE ELLE-MEME : l'alerte apparait sous
   * « Deja traitees », avec sa date et le nom de qui l'a acquittee. C'est une
   * confirmation plus solide qu'un message, puisqu'elle survit au
   * rafraichissement et se relit plus tard.
   *
   * CETTE REGION RESTE UTILE POUR LES REFUS, qui ne redessinent rien : session
   * expiree et alerte deja traitee laissent la carte en place.
   * ------------------------------------------------------------------
   */

  return (
    <form action={action} className={styles.geste}>
      {/*
       * LA REGION LIVE EST NOMMEE, C39 : une region anonyme s'annonce
       * « status » sans rien dire de plus a la navigation par regions, et la
       * page en porte une PAR carte.
       */}
      <p
        role="status"
        aria-live="polite"
        aria-label="État de l'acquittement de cette alerte"
        className={styles.annonce}
      >
        {annonce}
      </p>

      <button type="submit" className={styles.bouton} disabled={enCours}>
        Acquitter
      </button>
    </form>
  );
}
