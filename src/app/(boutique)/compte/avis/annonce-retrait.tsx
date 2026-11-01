"use client";

/**
 * Annonce d'un retrait d'avis abouti, LS-305.
 *
 * LE FOCUS VIENT ICI, et c'est la raison d'etre de ce composant. Le bouton
 * « Confirmer le retrait » disparait avec sa carte : sans focus repose, il
 * retomberait sur `body` et la tabulation repartirait du haut. Le recevoir fait
 * aussi lire le message, qu'une region inseree avec son texte deja present ne
 * garantit pas sur tous les lecteurs d'ecran. Releve par `ls-frontend-revue`.
 *
 * LE PARAMETRE EST RETIRE DE L'ADRESSE apres lecture, motif de
 * `EffacerParametresRetour` : le message ne revient ni au rechargement ni depuis
 * un favori. La page le monte sous une cle neuve a chaque retrait, donc un
 * second retrait de la meme visite reprend le focus.
 */
import { useEffect, useRef } from "react";

import { EffacerParametresRetour } from "../effacer-parametres-retour";
import { PARAMETRE_RETRAIT } from "./parametres";
import stylesCompte from "../compte.module.css";

const PARAMETRES = [PARAMETRE_RETRAIT] as const;

export function AnnonceRetrait(): React.ReactElement {
  const message = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    message.current?.focus();
  }, []);

  return (
    <>
      <EffacerParametresRetour parametres={PARAMETRES} />
      <p
        ref={message}
        tabIndex={-1}
        role="status"
        aria-label="Retrait de l'avis"
        className={`${stylesCompte.succes} ${stylesCompte.accuse}`}
      >
        Votre avis a été retiré et son commentaire effacé.
      </p>
    </>
  );
}
