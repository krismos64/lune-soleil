"use client";

/**
 * Formulaire de modification d'un avis, LS-225, parcours 7.
 *
 * COMPOSANT CLIENT PAR NECESSITE : il s'ouvre et se ferme, porte un etat en
 * cours et un message de refus. Rien de ce qui decide n'est ici : la Server
 * Action lit la session, et le filtre du repository recoupe l'auteur,
 * invariant 2.
 *
 * IL EST REPLIE PAR DEFAUT, et ce n'est pas qu'une question de place. L'ecran
 * « Mes avis » sert d'abord a RELIRE ce qu'on a ecrit : ouvrir cinq formulaires
 * de modification ferait de la page un editeur, et la note d'origine
 * disparaitrait derriere des champs de saisie.
 *
 * LES NOTES SONT DES BOUTONS RADIO NATIFS, meme motif qu'au depot : un lecteur
 * d'ecran les annonce et la tabulation les atteint, ce qu'un `div` cliquable ne
 * ferait pas.
 */
import { useActionState, useId, useState } from "react";

import { modifierAvis } from "./actions";
import type { ResultatModificationAvis } from "./actions";
import styles from "./avis.module.css";

/**
 * Ce que le client lit apres l'action, succes compris.
 *
 * LE SUCCES PORTE UN MESSAGE, ET SON ABSENCE ETAIT UN DEFAUT. La premiere
 * version refermait le bloc sans rien dire : la carte se re-rendait bien avec
 * la nouvelle note, mais cela se lit comme un effet de bord et non comme une
 * confirmation, et surtout **un lecteur d'ecran n'annoncait rien**, la region
 * live restant sur chaine vide. Releve par `ls-frontend-revue` le 12 septembre
 * 2026.
 *
 * LE TEXTE REDIT CE QUI SE PASSE MAINTENANT, et pas seulement « c'est
 * enregistre » : le critere 5 a promis une relecture avant validation, et le
 * succes est le moment ou cette promesse se realise.
 */
function messageDAction(resultat: ResultatModificationAvis): string | null {
  if (resultat.statut === "FAIT") {
    return "Modification enregistrée. Votre avis est en attente de relecture.";
  }

  return messageDeRefus(resultat);
}

/** Ce que chaque refus dit au client, en clair et sans jargon. */
function messageDeRefus(resultat: ResultatModificationAvis): string | null {
  switch (resultat.statut) {
    case "REFUSE_SAISIE":
      return resultat.message;
    case "REFUSE_NON_MODIFIABLE":
      /*
       * LE MESSAGE DIT LA REGLE ET NON LE CAS RENCONTRE, le service ne les
       * distinguant pas volontairement. Il reste juste dans les trois
       * situations : avis d'autrui, avis disparu, avis passe en non retenu
       * entre l'affichage et l'envoi.
       */
      return "Cet avis ne peut plus être modifié. Rechargez la page pour voir son état à jour.";
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous, votre texte est toujours affiché ci-dessus.";
    case "INDISPONIBLE":
      return "La modification n'a pas pu être enregistrée. Réessayez dans un instant, rien n'a été perdu.";
    default:
      return null;
  }
}

export function FormulaireModification({
  avisId,
  note: noteInitiale,
  commentaire: commentaireInitial,
  produitNom,
}: {
  avisId: string;
  note: number;
  commentaire: string | null;
  /** Il nomme le bouton, plusieurs cartes portant le meme libelle sinon. */
  produitNom: string;
}): React.ReactElement {
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState(noteInitiale);

  /*
   * LE BLOC SE REFERME DANS L'ACTION, JAMAIS DANS UN EFFET, et les deux pieges
   * evites sont distincts.
   *
   * `react-hooks/set-state-in-effect` REFUSE le `setOuvert` d'un effet, et il a
   * raison : l'effet rejouerait a chaque rendu portant ce resultat, donc aussi
   * apres une reouverture manuelle du bloc, qui se refermerait toute seule.
   *
   * AUCUN FOCUS N'EST REPOSE PAR REFERENCE. `revalidatePath` re-rend la carte,
   * donc le bouton d'AVANT l'action n'est plus dans le document : `focus()` sur
   * un element detache ne prend pas, le focus retombe sur `body` et la
   * tabulation repart du haut. Le bouton reste monte et garde le focus de
   * lui-meme, `hidden` ne masquant que le bloc.
   */
  const [resultat, agir, enCours] = useActionState<
    ResultatModificationAvis | null,
    FormData
  >(async (precedent, donnees) => {
    const issue = await modifierAvis(precedent, donnees);

    if (issue.statut === "FAIT") {
      setOuvert(false);
    }

    return issue;
  }, null);

  const identifiantBloc = useId();

  const message = resultat === null ? null : messageDAction(resultat);
  const enSucces = resultat?.statut === "FAIT";

  return (
    <div className={styles.modification}>
      <button
        type="button"
        className={styles.boutonModifier}
        aria-expanded={ouvert}
        aria-controls={identifiantBloc}
        onClick={() => setOuvert((precedent) => !precedent)}
      >
        {ouvert ? "Annuler la modification" : "Modifier cet avis"}
        <span className={styles.masqueVisuellement}> de {produitNom}</span>
      </button>

      {/*
        `hidden` PLUTOT QU'UN RENDU CONDITIONNEL : le contenu reste dans le
        document, donc `aria-controls` designe un element qui existe, et le
        texte saisi survit a une fermeture accidentelle.
      */}
      <div id={identifiantBloc} hidden={!ouvert} className={styles.blocEdition}>
        {/*
          CE QUE LA MODIFICATION DECLENCHE EST DIT AVANT LA VALIDATION,
          critere 5 de LS-225. Sans cette phrase, un client verrait son avis
          disparaitre de la fiche produit sans comprendre pourquoi, et
          conclurait a une suppression.
        */}
        <p className={styles.avertissement}>
          Votre avis modifié sera relu avant d&apos;être publié à nouveau. Il
          n&apos;apparaîtra pas sur la fiche de l&apos;article pendant cette
          relecture.
        </p>

        <form action={agir}>
          <input type="hidden" name="avisId" value={avisId} />

          <fieldset className={styles.champ}>
            <legend className={styles.legende}>Votre note</legend>
            <div className={styles.notes}>
              {[1, 2, 3, 4, 5].map((valeur) => {
                const identifiant = `note-${avisId}-${valeur}`;

                return (
                  <span key={valeur} className={styles.noteChoix}>
                    <input
                      type="radio"
                      id={identifiant}
                      name="note"
                      className={styles.masqueVisuellement}
                      value={valeur}
                      checked={note === valeur}
                      onChange={() => setNote(valeur)}
                    />
                    {/*
                      LE CHIFFRE VISIBLE EST `aria-hidden`, ET LE TEXTE MASQUE
                      PORTE LE NOM ENTIER. Sans cela, le nom accessible vaut
                      « 2étoiles sur 5 » sans espace : le calcul du nom
                      concatene les noeuds et NORMALISE les espaces de bord,
                      donc l'espace initial du texte masque disparait. Mesure
                      par le test de composant de LS-225, sur un rendu qui
                      paraissait juste a l'oeil.
                    */}
                    <label htmlFor={identifiant} className={styles.libelleNote}>
                      <span aria-hidden="true">{valeur}</span>
                      <span className={styles.masqueVisuellement}>
                        {valeur > 1
                          ? `${valeur} étoiles sur 5`
                          : `${valeur} étoile sur 5`}
                      </span>
                    </label>
                  </span>
                );
              })}
            </div>
          </fieldset>

          <div className={styles.champ}>
            <label htmlFor={`commentaire-${avisId}`} className={styles.libelle}>
              Votre commentaire{" "}
              <span className={styles.facultatif}>(facultatif)</span>
            </label>
            <textarea
              id={`commentaire-${avisId}`}
              name="commentaire"
              rows={5}
              maxLength={2000}
              defaultValue={commentaireInitial ?? ""}
              className={styles.saisie}
            />
          </div>

          <button
            type="submit"
            className={styles.boutonEnvoyer}
            disabled={enCours}
          >
            {enCours ? "Envoi en cours…" : "Enregistrer la modification"}
          </button>
        </form>
      </div>

      {/*
        LA REGION LIVE VIT HORS DU BLOC REPLIABLE, ET CE N'EST PAS UN DETAIL DE
        PLACEMENT. Le succes referme le bloc : une region posee dedans passerait
        `hidden` a l'instant meme ou elle recoit le message, donc le seul etat
        qu'elle n'annoncerait JAMAIS serait la reussite.

        ELLE PORTE SON NOM, regle C39 : plusieurs cartes en rendent une chacune,
        et deux regions anonymes d'une meme page sont indiscernables dans l'arbre
        d'accessibilite. Elle n'est visee par aucun `aria-describedby`, donc la
        regle qui interdit de nommer une region decrite ne s'applique pas.
      */}
      <p
        role="status"
        aria-live="polite"
        aria-label={`État de la modification de ${produitNom}`}
        className={
          message === null
            ? styles.masqueVisuellement
            : enSucces
              ? styles.succes
              : styles.refus
        }
      >
        {message ?? ""}
      </p>
    </div>
  );
}
