"use client";

/**
 * Classement d'un message de contact, LS-97.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION REELLE : un envoi en cours,
 * des boutons desactives pendant, un message de resultat. Il ne requete rien et
 * ne decide rien, l'action portant sa garde de role.
 *
 * LES IDENTIFIANTS SONT SUFFIXES PAR LE MESSAGE, indispensable ici : la page
 * rend UN bloc de classement PAR message. Des `id` fixes rendraient toutes les
 * regions live indiscernables, defaut mesure en LS-130 ou une carte unique
 * masquait le probleme.
 */
import { useRef, useState, useTransition } from "react";

import type { StatutMessage } from "@/generated/prisma/enums";
import { changerStatut } from "./actions";
import styles from "./messages.module.css";

/**
 * Ce que chaque bouton propose, selon l'etat courant.
 *
 * UNE TABLE ET NON UNE SUITE DE `if`, meme motif que
 * `TRANSITIONS_ADMINISTRATRICE` de LS-121 : elle se lit d'un coup d'oeil, et
 * l'ecran n'affiche que des gestes qui ont un sens depuis l'etat courant.
 *
 * `NOUVEAU` RESTE ATTEIGNABLE DEPUIS LES DEUX AUTRES, contrairement aux statuts
 * de commande ou aucun retour en arriere n'existe. La difference tient au fait
 * classe : un colis parti ne revient pas, alors qu'un message mal classe se
 * reclasse sans consequence, et « je le remets de cote » est un geste normal.
 */
const GESTES: Record<StatutMessage, { cible: StatutMessage; verbe: string }[]> =
  {
    NOUVEAU: [{ cible: "LU", verbe: "Marquer comme lu" }],
    LU: [
      { cible: "TRAITE", verbe: "Marquer comme traité" },
      { cible: "NOUVEAU", verbe: "Remettre en non lu" },
    ],
    TRAITE: [{ cible: "LU", verbe: "Rouvrir" }],
  };

export function ClassementMessage({
  messageId,
  statutActuel,
}: {
  messageId: string;
  statutActuel: StatutMessage;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  /*
   * LE FOCUS DOIT ATTERRIR QUELQUE PART, motif de LS-130. Les boutons changent
   * apres un succes, celui qui portait le focus disparaissant de la table :
   * sans point de chute, le focus retombe sur `body` et la tabulation repart du
   * haut du document.
   */
  const conteneur = useRef<HTMLDivElement>(null);

  const idMessage = `message-classement-${messageId}`;

  function soumettre(cible: StatutMessage) {
    const formulaire = new FormData();
    formulaire.set("messageId", messageId);
    formulaire.set("nouveauStatut", cible);

    demarrer(async () => {
      const resultat = await changerStatut(formulaire);

      switch (resultat.statut) {
        case "SUCCES":
          conteneur.current?.focus();
          setMessage({
            texte: "Message classé. Rafraîchir la page pour la mettre à jour.",
            erreur: false,
          });
          break;
        case "INTROUVABLE":
          setMessage({ texte: "Ce message n'existe plus.", erreur: true });
          break;
        case "SESSION_ABSENTE":
          setMessage({
            texte: "Session expirée. Se reconnecter pour continuer.",
            erreur: true,
          });
          break;
        case "INVALIDE":
          setMessage({ texte: "Demande non valide.", erreur: true });
          break;
        case "INDISPONIBLE":
          setMessage({
            texte: "Le service est momentanément indisponible. Réessayer.",
            erreur: true,
          });
          break;
      }
    });
  }

  return (
    <div ref={conteneur} tabIndex={-1} className={styles.classement}>
      <div className={styles.gestes}>
        {GESTES[statutActuel].map((geste) => (
          <button
            key={geste.cible}
            type="button"
            className={styles.bouton}
            disabled={enCours}
            aria-describedby={idMessage}
            onClick={() => {
              soumettre(geste.cible);
            }}
          >
            {geste.verbe}
          </button>
        ))}
      </div>

      {/*
       * LA REGION EST TOUJOURS PRESENTE, MEME VIDE : une region live inseree en
       * meme temps que son contenu n'est pas lue par les lecteurs d'ecran.
       *
       * PAS D'`aria-label`, decision de LS-160 : il annulerait la description
       * des boutons qui pointent ici.
       */}
      <p
        id={idMessage}
        className={`${styles.message} ${message?.erreur === true ? styles.messageErreur : ""}`}
        role="status"
      >
        {enCours ? "Enregistrement en cours…" : (message?.texte ?? "")}
      </p>
    </div>
  );
}
