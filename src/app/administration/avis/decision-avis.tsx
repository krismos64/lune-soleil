"use client";

/**
 * Decision de moderation d'un avis, LS-61, regles R4, R5 et R9.
 *
 * COMPOSANT CLIENT PAR NECESSITE : trois boutons partagent un champ de motif et
 * un etat en cours. Rien de ce qui decide n'est ici, la Server Action exige le
 * role et delegue au service qui porte l'exigence de motif.
 *
 * LE MOTIF EST OBLIGATOIRE SUR UN REFUS ET UN RETRAIT, ET L'ECRAN LE DIT AVANT
 * LA SOUMISSION. Le service refuse de toute facon, regle R5 : la garde d'ecran
 * evite un aller-retour, elle ne remplace pas celle du serveur.
 *
 * TROIS BOUTONS DISTINCTS ET NON UNE LISTE DEROULANTE : la decision est le
 * geste, pas un choix a confirmer ensuite. Chacun porte son intention dans son
 * libelle, ce qu'un `select` suivi d'un bouton « Valider » perd.
 */
import { useActionState, useEffect, useRef, useState } from "react";

import { appliquerModeration } from "./actions";
import type { ResultatModeration } from "./actions";
import styles from "./avis.module.css";

/** Ce que chaque refus dit a l'exploitante, en clair. */
function messageDeRefus(resultat: ResultatModeration): string | null {
  switch (resultat.statut) {
    case "MOTIF_MANQUANT":
      return "Un refus ou un retrait demande un motif. Il n'est pas publié, il documente la décision.";
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous, la décision n'a pas été enregistrée.";
    case "INVALIDE":
      return "La décision n'a pas pu être lue. Rechargez la page et réessayez.";
    case "INTROUVABLE":
      return "Cet avis n'existe plus. Rechargez la page.";
    case "INDISPONIBLE":
      return "La décision n'a pas pu être enregistrée. Réessayez dans un instant.";
    default:
      return null;
  }
}

export function DecisionAvis({
  avisId,
  dejaPublie,
}: {
  avisId: string;
  /** Un avis deja publie ne se republie pas, il se retire. */
  dejaPublie: boolean;
}) {
  const [resultat, action, enCours] = useActionState<
    ResultatModeration | null,
    FormData
  >(appliquerModeration, null);

  const [motif, setMotif] = useState("");

  const formulaire = useRef<HTMLFormElement>(null);
  const declencheur = useRef<HTMLButtonElement | null>(null);

  /*
   * LE BOUTON DECLENCHEUR PEUT AVOIR DISPARU, ET C'EST LE CAS NOMINAL, revue
   * frontend du 10 septembre 2026, meme motif que la revue de LS-103. Une
   * decision reussie revalide l'arbre serveur : l'avis quitte la liste « A
   * relire » pour « Decisions prises », donc le `<li>` qui portait le bouton
   * clique est demonte. `focus()` sur un noeud detache ne fait rien, et le
   * focus retombe silencieusement sur `<body>`, au tout debut du document.
   *
   * `isConnected` DISTINGUE LES DEUX CAS. Le bouton survit a un refus de motif
   * ou a une panne, ou le focus doit y revenir ; il disparait apres une
   * decision reussie, ou le repli est le formulaire lui-meme, qui porte
   * `tabIndex={-1}` pour cette raison et pour elle seule.
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

  const motifManquant = motif.trim().length === 0;
  const refus = resultat === null ? null : messageDeRefus(resultat);
  const identifiantMotif = `motif-${avisId}`;
  const identifiantAide = `aide-motif-${avisId}`;

  return (
    <form
      ref={formulaire}
      tabIndex={-1}
      action={action}
      className={styles.decisions}
    >
      <input type="hidden" name="avisId" value={avisId} />

      <div className={styles.champ}>
        <label htmlFor={identifiantMotif} className={styles.libelle}>
          Motif de la décision
        </label>
        <p id={identifiantAide} className={styles.aide}>
          Obligatoire pour refuser ou retirer, règle R5. Il documente la
          décision et n&apos;est jamais publié.
        </p>
        <textarea
          id={identifiantMotif}
          name="motif"
          className={styles.zoneTexte}
          maxLength={2000}
          aria-describedby={identifiantAide}
          value={motif}
          onChange={(evenement) => setMotif(evenement.target.value)}
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
        {!dejaPublie && (
          <button
            type="submit"
            name="decision"
            value="PUBLIE"
            className={styles.bouton}
            disabled={enCours}
            onClick={(evenement) => {
              declencheur.current = evenement.currentTarget;
            }}
          >
            {enCours ? "Enregistrement…" : "Publier"}
          </button>
        )}

        <button
          type="submit"
          name="decision"
          value={dejaPublie ? "RETIRE" : "REFUSE"}
          className={`${styles.bouton} ${styles.boutonSecondaire}`}
          /*
           * LE BOUTON EST DESACTIVE SANS MOTIF, regle R5. Ce n'est pas la
           * garde qui compte, le service refuse de toute facon : c'est
           * l'explication portee par le texte d'aide au-dessus, qui evite de
           * decouvrir l'exigence apres avoir cliqué.
           */
          disabled={enCours || motifManquant}
          onClick={(evenement) => {
            declencheur.current = evenement.currentTarget;
          }}
        >
          {dejaPublie ? "Retirer" : "Refuser"}
        </button>
      </div>

      {/*
       * L'ACCUSE DE SUCCES EXISTE, ET IL EST INDISPENSABLE AU CLAVIER. La liste
       * se reorganise apres une decision, mais un lecteur d'ecran n'en voit
       * rien : sans cette region, l'exploitante clique et n'entend AUCUN retour,
       * le bouton ayant disparu. Le focus se pose sur ce formulaire, qui porte
       * alors ce message.
       */}
      {resultat?.statut === "SUCCES" && (
        <p role="status" aria-live="polite" className={styles.succes}>
          Décision enregistrée. L&apos;avis a changé de liste.
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
