"use client";

/**
 * Formulaire de declaration de retractation. LS-134, etapes 3 et 4 du parcours 5.
 *
 * COMPOSANT CLIENT PAR NECESSITE : la soumission a un etat en cours, un message
 * d'erreur et un ecran de succes. Rien de ce qui decide n'est ici, la Server
 * Action verifie la session et le delai cote serveur, invariant 2.
 *
 * LE MOTIF EST FACULTATIF ET L'INTERFACE LE DIT, article L221-18. Le champ ne
 * porte ni `required` ni etoile d'obligation : le droit de retractation est
 * INCONDITIONNEL, et une interface qui suggere qu'il faut se justifier dissuade
 * de l'exercer.
 *
 * LE BOUTON N'EST JAMAIS DESACTIVE PAR UNE SAISIE VIDE, pour la meme raison :
 * une demande sans motif est une demande valide.
 */
import { useActionState } from "react";

import { deposerMaRetractation } from "./actions";
import type { ResultatRetractation } from "./actions";
import styles from "./retractation.module.css";

/** Ce que chaque refus dit au client, en clair et sans jargon. */
function messageDeRefus(resultat: ResultatRetractation): string | null {
  switch (resultat.statut) {
    case "REFUSE_HORS_DELAI":
      return `Le délai de rétractation de cette commande s'est terminé le ${resultat.jourLimite}. Vous pouvez nous écrire depuis la page Contact, nous regarderons votre situation.`;
    case "REFUSE_DEJA_DEPOSEE":
      return "Une demande de rétractation existe déjà pour cette commande. Retrouvez son avancement sur le détail de la commande.";
    case "REFUSE_ETAT_COMMANDE":
      return "Cette commande ne peut pas faire l'objet d'une rétractation. Écrivez-nous depuis la page Contact si cela vous semble être une erreur.";
    case "REFUSE_ACCES":
      return "Cette commande est introuvable.";
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous, votre saisie n'a pas été envoyée.";
    case "INDISPONIBLE":
      return "La demande n'a pas pu être enregistrée. Réessayez dans un instant, rien n'a été perdu.";
    default:
      return null;
  }
}

export function FormulaireRetractation({
  commandeId,
  numero,
  jourLimite,
}: {
  commandeId: string;
  numero: string;
  /** `null` tant que la reception n'est pas connue, LS-131. */
  jourLimite: string | null;
}) {
  const [resultat, action, enCours] = useActionState<
    ResultatRetractation | null,
    FormData
  >(deposerMaRetractation, null);

  if (resultat?.statut === "FAIT") {
    return (
      <div className={styles.succes} role="status">
        <h2 className={styles.titreSucces}>
          Votre rétractation est enregistrée
        </h2>
        <p>
          Nous vous avons envoyé un accusé de réception par email. Il fait foi
          de la date à laquelle vous avez exercé votre droit.
        </p>
        <p>
          Renvoyez votre bijou dans les 14 jours qui suivent cette demande. Les
          frais de retour sont à votre charge.
        </p>
        <p>
          Dès que le colis nous parvient, ou dès que vous nous transmettez une
          preuve de son expédition, nous procédons au remboursement.
        </p>
      </div>
    );
  }

  const refus = resultat === null ? null : messageDeRefus(resultat);

  return (
    <form action={action} className={styles.formulaire}>
      <input type="hidden" name="commandeId" value={commandeId} />

      <p className={styles.rappel}>
        Vous vous apprêtez à vous rétracter de la commande {numero}.
        {jourLimite === null
          ? " Votre droit est ouvert."
          : ` Votre droit est ouvert jusqu'au ${jourLimite} inclus.`}
      </p>

      <div className={styles.champ}>
        <label htmlFor="motif" className={styles.libelle}>
          Motif <span className={styles.facultatif}>(facultatif)</span>
        </label>
        <p id="motif-aide" className={styles.aide}>
          Vous n&apos;avez pas à vous justifier. Ce champ nous aide simplement à
          progresser.
        </p>
        <textarea
          id="motif"
          name="motif"
          rows={4}
          maxLength={2000}
          aria-describedby="motif-aide"
          className={styles.zoneTexte}
        />
      </div>

      {refus === null ? null : (
        <p className={styles.erreur} role="alert">
          {refus}
        </p>
      )}

      <button type="submit" className={styles.bouton} disabled={enCours}>
        {enCours ? "Envoi en cours..." : "Confirmer ma rétractation"}
      </button>

      <p className={styles.mentionFrais}>
        Les frais de retour du bijou restent à votre charge.
      </p>
    </form>
  );
}
