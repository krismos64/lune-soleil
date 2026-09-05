"use client";

/**
 * Formulaire de retractation SANS COMPTE, LS-134. Article L221-21.
 *
 * COMPOSANT CLIENT PAR NECESSITE : la soumission a un etat en cours, un message
 * d'erreur et un ecran de succes. Rien de ce qui decide n'est ici, la Server
 * Action delegue au service qui verifie la signature du jeton, invariant 2.
 *
 * LE JETON EST DANS UN CHAMP CACHE ET NON DANS UNE VARIABLE DE MODULE : il doit
 * repartir avec la soumission, et c'est le formulaire qui le porte.
 *
 * LE MOTIF EST FACULTATIF ET L'INTERFACE LE DIT, article L221-18. Le champ ne
 * porte ni `required` ni etoile d'obligation : le droit est INCONDITIONNEL, et
 * une interface qui suggere qu'il faut se justifier dissuade de l'exercer.
 */
import { useActionState, useEffect, useRef } from "react";
import { MENTION_FORMULAIRE } from "@/lib/mentions-retractation";

import { deposerRetractationParJeton } from "./actions";
import type { ResultatRetractationJeton } from "./actions";
import styles from "../../compte/commandes/[id]/retractation/retractation.module.css";

/** Ce que chaque refus dit au client, en clair et sans jargon. */
function messageDeRefus(resultat: ResultatRetractationJeton): string | null {
  switch (resultat.statut) {
    case "REFUSE_HORS_DELAI":
      return `Le délai de rétractation de cette commande s'est terminé le ${resultat.jourLimite}. Vous pouvez nous écrire depuis la page Contact, nous regarderons votre situation.`;
    case "REFUSE_DEJA_DEPOSEE":
      return "Une demande de rétractation existe déjà pour cette commande. Vous avez reçu un accusé de réception par email.";
    case "REFUSE_ETAT_COMMANDE":
      return "Cette commande ne peut pas faire l'objet d'une rétractation. Écrivez-nous depuis la page Contact si cela vous semble être une erreur.";
    case "REFUSE_ACCES":
      return "Ce lien n'est plus valable. Écrivez-nous depuis la page Contact, nous vous aiderons.";
    case "INDISPONIBLE":
      return "La demande n'a pas pu être enregistrée. Réessayez dans un instant, rien n'a été perdu.";
    default:
      return null;
  }
}

export function FormulaireRetractationJeton({
  jeton,
  jourLimite,
}: {
  jeton: string;
  /** `null` tant que la reception n'est pas connue, LS-131. */
  jourLimite: string | null;
}) {
  const [resultat, action, enCours] = useActionState<
    ResultatRetractationJeton | null,
    FormData
  >(deposerRetractationParJeton, null);

  const confirmation = useRef<HTMLDivElement>(null);

  /*
   * LE FOCUS SUIT LE REMPLACEMENT, meme motif que l'ecran de mot de passe
   * oublie. Le bouton qui portait le focus vient d'etre retire du DOM : sans
   * cela le focus retombe sur `body`, et la tabulation suivante repart du haut
   * de la page. Au clavier, la confirmation serait inatteignable.
   */
  useEffect(() => {
    if (resultat?.statut === "FAIT") {
      confirmation.current?.focus();
    }
  }, [resultat]);

  if (resultat?.statut === "FAIT") {
    return (
      <div
        ref={confirmation}
        tabIndex={-1}
        className={styles.succes}
        role="status"
        aria-live="polite"
        aria-label="Confirmation de rétractation"
      >
        <h2 className={styles.titreSucces}>
          Votre rétractation est enregistrée
        </h2>
        <p>
          Votre demande est datée du jour et cette date fait foi. Un accusé de
          réception vous parvient par email.
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
      <input type="hidden" name="jeton" value={jeton} />

      <p className={styles.rappel}>
        Vous vous apprêtez à vous rétracter de votre commande.
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

      {/*
       * LS-136, EMPLACEMENT 3 DES TROIS, SUR LE CHEMIN SANS COMPTE.
       *
       * CE FICHIER PORTAIT SA PROPRE COPIE du texte, identique par coincidence
       * a celle de l'espace client. Rien ne les gardait d'accord : une decision
       * commerciale modifiant la charge des frais aurait suivi sur un chemin et
       * pas sur l'autre, et deux emplacements qui se contredisent valent une
       * absence d'information, article L221-20, douze mois.
       *
       * LE CHEMIN SANS COMPTE PORTE LE PLUS DE VOLUME, `legal.md` : l'email de
       * confirmation est le seul par lequel un acheteur sans compte recoit son
       * droit. C'etait donc le chemin le moins protege qui restait hors source
       * unique.
       *
       * Releve en revue critique : mon commentaire affirmait qu'un seul
       * composant servait les deux chemins. Il y en a deux.
       */}
      <p className={styles.mentionFrais}>{MENTION_FORMULAIRE.fraisRetour}</p>
    </form>
  );
}
