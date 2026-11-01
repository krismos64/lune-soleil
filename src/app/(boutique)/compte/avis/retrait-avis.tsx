"use client";

/**
 * Retrait d'un avis par son auteur, LS-305, regle R19.
 *
 * DEUX ETAPES, parce que le geste est definitif : le commentaire est efface et
 * un nouvel avis ne peut pas etre depose sur la meme ligne de commande, regle
 * R2. Le premier bouton ouvre la confirmation, qui dit ces deux consequences
 * avant le second.
 *
 * AUCUNE DECISION ICI : la Server Action lit la session, le repository recoupe
 * l'auteur dans son filtre, invariant 2.
 */
import { useActionState, useId, useState } from "react";

import { retirerAvis } from "./actions";
import type { ResultatRetraitAvis } from "./actions";
import styles from "./avis.module.css";
import stylesCompte from "../compte.module.css";

function messageDeRefus(resultat: ResultatRetraitAvis): string {
  switch (resultat.statut) {
    case "REFUSE_INTROUVABLE":
      return "Cet avis ne peut plus être retiré. Rechargez la page pour voir son état à jour.";
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour retirer cet avis.";
    case "INDISPONIBLE":
      return "Le retrait n'a pas pu être enregistré. Réessayez dans un instant.";
  }
}

export function RetraitAvis({
  avisId,
  produitNom,
}: {
  avisId: string;
  /** Il nomme les boutons, plusieurs cartes portant le meme libelle sinon. */
  produitNom: string;
}): React.ReactElement {
  const [ouvert, setOuvert] = useState(false);
  const [resultat, agir, enCours] = useActionState<
    ResultatRetraitAvis | null,
    FormData
  >(retirerAvis, null);
  const identifiantBloc = useId();

  return (
    <div className={styles.modification}>
      <button
        type="button"
        className={styles.boutonModifier}
        aria-expanded={ouvert}
        aria-controls={identifiantBloc}
        onClick={() => setOuvert((precedent) => !precedent)}
      >
        {ouvert ? "Garder cet avis" : "Retirer cet avis"}
        <span className={styles.masqueVisuellement}> de {produitNom}</span>
      </button>

      <div id={identifiantBloc} hidden={!ouvert} className={styles.blocEdition}>
        <p className={styles.avertissement}>
          Votre avis ne sera plus affiché et son commentaire sera effacé. Ce
          retrait est définitif : vous ne pourrez plus déposer d&apos;avis pour
          cet achat.
        </p>

        <form action={agir}>
          <input type="hidden" name="avisId" value={avisId} />
          {/*
            LE STYLE DE L'ACTION DESTRUCTRICE de l'espace client, `.actionDanger`,
            et non celui de « Enregistrer la modification » : le geste est
            definitif, sa couleur le dit. Releve par `ls-frontend-revue`.
          */}
          <button
            type="submit"
            className={stylesCompte.actionDanger}
            disabled={enCours}
          >
            {enCours ? "Retrait en cours…" : "Confirmer le retrait"}
            <span className={styles.masqueVisuellement}>
              {" "}
              de l&apos;avis sur {produitNom}
            </span>
          </button>
        </form>
      </div>

      {/*
        REGION LIVE HORS DU BLOC REPLIABLE, et nommee, regle C39, meme forme
        que le formulaire de modification. Elle ne porte que les refus : le
        succes redirige et la page l'annonce.
      */}
      <p
        role="status"
        aria-live="polite"
        aria-label={`État du retrait de l'avis sur ${produitNom}`}
        className={resultat === null ? styles.masqueVisuellement : styles.refus}
      >
        {resultat === null ? "" : messageDeRefus(resultat)}
      </p>
    </div>
  );
}
