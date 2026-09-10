"use client";

/**
 * Formulaire de depot d'avis, LS-61, parcours 7.
 *
 * COMPOSANT CLIENT PAR NECESSITE : la soumission a un etat en cours, un message
 * d'erreur et un ecran de succes. Rien de ce qui decide n'est ici, la Server
 * Action delegue au service qui verifie la signature du jeton, invariant 2.
 *
 * LE JETON EST DANS UN CHAMP CACHE ET NON DANS UNE VARIABLE DE MODULE : il doit
 * repartir avec la soumission, et c'est le formulaire qui le porte.
 *
 * LES NOTES SONT DES BOUTONS RADIO NATIFS, jamais des etoiles cliquables. Un
 * lecteur d'ecran annonce « 4 sur 5 » et la tabulation les atteint ; un `div`
 * avec un `onClick` n'annonce rien et exclut le clavier. Le rendu visuel est
 * porte par le libelle, l'entree restant dans l'arbre d'accessibilite.
 *
 * `AUCUNE CONTREPARTIE` EST ECRIT A L'ECRAN, article D111-10 2°, et non
 * seulement dans la rubrique : c'est ici que la question se pose au client.
 */
import { useActionState, useEffect, useRef, useState } from "react";

import { deposerAvisParJeton } from "./actions";
import type { ResultatDepotAvis } from "./actions";
import styles from "./avis.module.css";

/** Une piece notable, telle que la page serveur la transmet. */
export type PieceANoter = {
  ligneCommandeId: string;
  libelleProduitFige: string;
  libelleVarianteFige: string;
  /** `true` quand un avis existe deja sur cette ligne, regle R2. */
  dejaNotee: boolean;
};

/** Ce que chaque refus dit au client, en clair et sans jargon. */
function messageDeRefus(resultat: ResultatDepotAvis): string | null {
  switch (resultat.statut) {
    case "REFUSE_SAISIE":
      return resultat.message;
    case "REFUSE_DEJA_DEPOSE":
      return "Un avis a déjà été déposé pour cette commande. Merci pour votre retour.";
    case "REFUSE_LIEN_REMPLACE":
      return "Ce lien a été remplacé par un envoi plus récent. Ouvrez le dernier message reçu, il porte le lien à utiliser.";
    case "REFUSE_PIECE_INCONNUE":
      return "Une des pièces notées ne correspond pas à cette commande. Rechargez la page et réessayez.";
    case "REFUSE_SANS_LIVRAISON":
      return "La livraison de cette commande n'est pas encore constatée. Réessayez une fois le colis reçu.";
    case "REFUSE_ACCES":
      return "Ce lien n'est plus valable. Écrivez-nous depuis la page Contact, nous vous aiderons.";
    case "INDISPONIBLE":
      return "Votre avis n'a pas pu être enregistré. Réessayez dans un instant, rien n'a été perdu.";
    default:
      return null;
  }
}

export function FormulaireAvis({
  jeton,
  pieces,
  delaiPublicationJours,
}: {
  jeton: string;
  pieces: PieceANoter[];
  delaiPublicationJours: number;
}) {
  const [resultat, action, enCours] = useActionState<
    ResultatDepotAvis | null,
    FormData
  >(deposerAvisParJeton, null);

  const confirmation = useRef<HTMLDivElement>(null);

  const aNoter = pieces.filter((piece) => !piece.dejaNotee);

  /*
   * L'ETAT DES NOTES VIT ICI PARCE QUE LA SOUMISSION LES SERIALISE EN JSON.
   * Les lire depuis le `FormData` a la soumission obligerait a reconstituer
   * `pieces[0][note]` a la main cote serveur, ce que l'adaptateur evite en
   * recevant un seul champ deja structure.
   */
  const [notes, setNotes] = useState<Record<string, number>>({});
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});

  useEffect(() => {
    if (resultat?.statut === "FAIT") {
      /*
       * LE FOCUS SUIT LE REMPLACEMENT. Le bouton qui portait le focus vient
       * d'etre retire du DOM : sans cela le focus retombe sur `body`, et la
       * tabulation suivante repart du haut de la page. Au clavier, la
       * confirmation serait inatteignable.
       */
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
        aria-label="Confirmation de dépôt d'avis"
      >
        <h2 className={styles.titreSucces}>
          {resultat.nombre > 1
            ? "Vos avis sont enregistrés"
            : "Votre avis est enregistré"}
        </h2>
        <p>
          Merci d&apos;avoir pris le temps de nous écrire. Chaque avis est relu
          avant publication, sous {delaiPublicationJours} jours au plus.
        </p>
        <p>
          Un avis peut ne pas être publié, par exemple s&apos;il ne porte pas
          sur la pièce achetée. Vous en seriez informé.
        </p>
      </div>
    );
  }

  const refus = resultat === null ? null : messageDeRefus(resultat);

  /*
   * LES SAISIES SONT CONSTRUITES A LA SOUMISSION, et seules les pieces
   * REELLEMENT notees y entrent. Envoyer une piece sans note ferait echouer la
   * validation Zod sur l'ensemble : noter une piece sur trois est une saisie
   * legitime, pas une erreur.
   */
  const saisies = aNoter
    .filter((piece) => notes[piece.ligneCommandeId] !== undefined)
    .map((piece) => ({
      ligneCommandeId: piece.ligneCommandeId,
      note: notes[piece.ligneCommandeId]!,
      commentaire: commentaires[piece.ligneCommandeId]?.trim() || null,
    }));

  return (
    <form action={action} className={styles.formulaire}>
      <input type="hidden" name="jeton" value={jeton} />
      <input type="hidden" name="saisies" value={JSON.stringify(saisies)} />

      {pieces.map((piece) => (
        <div key={piece.ligneCommandeId} className={styles.piece}>
          <p className={styles.nomPiece}>{piece.libelleProduitFige}</p>
          <p className={styles.variantePiece}>{piece.libelleVarianteFige}</p>

          {piece.dejaNotee ? (
            <p className={styles.aide}>
              Vous avez déjà déposé un avis sur cette pièce.
            </p>
          ) : (
            <>
              <fieldset className={styles.champ}>
                <legend className={styles.legende}>Votre note</legend>
                <div className={styles.notes}>
                  {[1, 2, 3, 4, 5].map((valeur) => {
                    const identifiant = `note-${piece.ligneCommandeId}-${valeur}`;

                    return (
                      <span key={valeur} className={styles.note}>
                        <input
                          type="radio"
                          id={identifiant}
                          name={`note-${piece.ligneCommandeId}`}
                          className={styles.entreeNote}
                          value={valeur}
                          checked={notes[piece.ligneCommandeId] === valeur}
                          onChange={() =>
                            setNotes((precedent) => ({
                              ...precedent,
                              [piece.ligneCommandeId]: valeur,
                            }))
                          }
                        />
                        <label
                          htmlFor={identifiant}
                          className={styles.libelleNote}
                        >
                          {valeur}
                          <span className={styles.entreeNote}>
                            {valeur > 1 ? " étoiles sur 5" : " étoile sur 5"}
                          </span>
                        </label>
                      </span>
                    );
                  })}
                </div>
              </fieldset>

              <div className={styles.champ}>
                <label
                  htmlFor={`commentaire-${piece.ligneCommandeId}`}
                  className={styles.libelle}
                >
                  Votre commentaire{" "}
                  <span className={styles.facultatif}>(facultatif)</span>
                </label>
                <p className={styles.aide} id={`aide-${piece.ligneCommandeId}`}>
                  Une note seule suffit. 2000 caractères au plus.
                </p>
                <textarea
                  id={`commentaire-${piece.ligneCommandeId}`}
                  className={styles.zoneTexte}
                  maxLength={2000}
                  aria-describedby={`aide-${piece.ligneCommandeId}`}
                  value={commentaires[piece.ligneCommandeId] ?? ""}
                  onChange={(evenement) =>
                    setCommentaires((precedent) => ({
                      ...precedent,
                      [piece.ligneCommandeId]: evenement.target.value,
                    }))
                  }
                />
              </div>
            </>
          )}
        </div>
      ))}

      {/*
       * LES DEUX MENTIONS LEGALES SONT A L'ECRAN, article D111-10. L'absence de
       * contrepartie et le controle des avis se disent la ou la question se
       * pose, pas seulement dans une rubrique que personne n'ouvre.
       */}
      <p className={styles.mention}>
        Votre avis est vérifié : il n&apos;est déposable qu&apos;après une
        commande réellement livrée. Il est relu avant publication, sous{" "}
        {delaiPublicationJours} jours au plus, et aucune contrepartie n&apos;est
        accordée en échange d&apos;un avis.
      </p>

      {/*
       * LA REGION LIVE ANNONCE L'ETAT PENDANT L'APPEL, C35. Sans elle, un
       * lecteur d'ecran n'entend rien entre le clic et la reponse, et rien ne
       * distingue une attente d'un echec silencieux.
       */}
      <p aria-live="polite" className={styles.entreeNote}>
        {enCours ? "Envoi de votre avis en cours…" : ""}
      </p>

      <button
        type="submit"
        className={styles.bouton}
        disabled={enCours || saisies.length === 0}
      >
        {enCours ? "Envoi en cours…" : "Envoyer mon avis"}
      </button>

      {refus !== null && (
        <p role="alert" className={styles.erreur}>
          {refus}
        </p>
      )}
    </form>
  );
}
