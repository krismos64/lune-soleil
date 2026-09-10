"use client";

/**
 * Cloture d'un signalement d'avis, LS-77, article L111-7-2.
 *
 * COMPOSANT CLIENT PAR NECESSITE : deux boutons partagent un champ de reponse
 * et un etat en cours. Rien de ce qui decide n'est ici, la Server Action exige
 * le role et delegue.
 *
 * DEUX DECISIONS ET NON TROIS, alors que l'enum en porte trois. `EXAMINE` reste
 * un etat de passage que rien ne pose a l'ecran : une exploitante qui a lu un
 * signalement l'a retenu ou ecarte. Le laisser cliquable produirait une
 * troisieme file que personne ne viderait.
 *
 * `RETENU` NE RETIRE PAS L'AVIS, et le libelle le dit. Le retrait passe par le
 * bouton de moderation de l'avis lui-meme, avec son propre motif, regle R5 :
 * fondre les deux ferait disparaitre la justification du retrait derriere celle
 * du signalement.
 */
import { useActionState, useEffect, useRef, useState } from "react";

import { cloturerSignalement } from "./actions";
import type { ResultatCloture } from "./actions";
import styles from "./avis.module.css";

/** Ce que chaque refus dit a l'exploitante, en clair. */
function messageDeRefus(resultat: ResultatCloture): string | null {
  switch (resultat.statut) {
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous, la décision n'a pas été enregistrée.";
    case "INVALIDE":
      return "La décision n'a pas pu être lue. Rechargez la page et réessayez.";
    case "INTROUVABLE":
      return "Ce signalement n'existe plus. Rechargez la page.";
    case "INDISPONIBLE":
      return "La décision n'a pas pu être enregistrée. Réessayez dans un instant.";
    default:
      return null;
  }
}

export function ClotureSignalement({
  signalementId,
}: {
  signalementId: string;
}) {
  const [resultat, action, enCours] = useActionState<
    ResultatCloture | null,
    FormData
  >(cloturerSignalement, null);

  const [suite, setSuite] = useState("");

  const formulaire = useRef<HTMLFormElement>(null);
  const declencheur = useRef<HTMLButtonElement | null>(null);

  /*
   * LE BOUTON DECLENCHEUR PEUT AVOIR DISPARU, ET C'EST LE CAS NOMINAL, meme
   * motif que la moderation d'un avis : une cloture reussie fait sortir le
   * signalement de la liste « A examiner », donc le `<li>` qui portait le
   * bouton clique est demonte. `focus()` sur un noeud detache ne fait rien, et
   * le focus retombe silencieusement sur `<body>`.
   */
  useEffect(() => {
    if (resultat === null) {
      return;
    }

    if (declencheur.current?.isConnected) {
      declencheur.current.focus();
    } else {
      formulaire.current?.focus();
    }

    declencheur.current = null;
  }, [resultat]);

  const refus = resultat === null ? null : messageDeRefus(resultat);
  const identifiantSuite = `suite-${signalementId}`;
  const identifiantAide = `aide-suite-${signalementId}`;

  function memoriser(evenement: React.MouseEvent<HTMLButtonElement>) {
    declencheur.current = evenement.currentTarget;
  }

  return (
    <form
      ref={formulaire}
      tabIndex={-1}
      action={action}
      className={styles.decisions}
    >
      <input type="hidden" name="signalementId" value={signalementId} />

      <div className={styles.champ}>
        <label htmlFor={identifiantSuite} className={styles.libelle}>
          Suite donnée
        </label>
        <p id={identifiantAide} className={styles.aide}>
          Facultatif, et jamais publié. Elle vous rappelle ce que vous avez
          répondu si la personne revient.
        </p>
        <textarea
          id={identifiantSuite}
          name="suite"
          className={styles.zoneTexte}
          maxLength={2000}
          aria-describedby={identifiantAide}
          value={suite}
          onChange={(evenement) => setSuite(evenement.target.value)}
        />
      </div>

      {/*
       * LA REGION LIVE ANNONCE L'ETAT PENDANT L'APPEL, C35. Sans elle, un
       * lecteur d'ecran n'entend rien entre le clic et le rafraichissement.
       */}
      <p aria-live="polite" className={styles.annonce}>
        {enCours ? "Enregistrement de la décision…" : ""}
      </p>

      <div className={styles.boutons}>
        <button
          type="submit"
          name="decision"
          value="ECARTE"
          className={styles.bouton}
          disabled={enCours}
          onClick={memoriser}
        >
          {enCours ? "Enregistrement…" : "Écarter le doute"}
        </button>

        <button
          type="submit"
          name="decision"
          value="RETENU"
          className={`${styles.bouton} ${styles.boutonSecondaire}`}
          disabled={enCours}
          onClick={memoriser}
        >
          Retenir le doute
        </button>
      </div>

      {resultat?.statut === "SUCCES" && (
        <p role="status" aria-live="polite" className={styles.succes}>
          Décision enregistrée. Le signalement a changé de liste.
        </p>
      )}

      {refus !== null && (
        <p role="alert" className={styles.erreur}>
          {refus}
        </p>
      )}
    </form>
  );
}
