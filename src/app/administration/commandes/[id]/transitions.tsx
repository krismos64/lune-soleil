"use client";

/**
 * Transitions de statut d'une commande, LS-121.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION REELLE : un envoi en cours,
 * un bouton desactive pendant, un message de resultat. Il ne requete rien
 * lui-meme et ne decide rien : les transitions possibles arrivent en propriete,
 * calculees par le service, et l'action porte sa propre garde de role.
 *
 * LES BOUTONS AFFICHES VIENNENT DE LA MEME SOURCE QUE CE QUE L'ACTION ACCEPTE,
 * `TRANSITIONS_ADMINISTRATRICE`. C'est ce qui empeche l'ecran et le service de
 * diverger : un bouton qui s'afficherait sans etre accepte donnerait un refus
 * incomprehensible, et l'inverse cacherait une action pourtant permise.
 */
import { useState, useTransition } from "react";

import type { StatutCommande } from "@/generated/prisma/enums";
import { changerStatut } from "../actions";
import { LIBELLES_STATUT } from "../affichage";
import styles from "../commandes.module.css";

/** Verbe de l'action, plus parlant qu'un nom d'etat sur un bouton. */
const VERBES: Partial<Record<StatutCommande, string>> = {
  EN_PREPARATION: "Mettre en préparation",
  EXPEDIEE: "Marquer comme expédiée",
  ANNULEE: "Annuler la commande",
};

export function TransitionsCommande({
  commandeId,
  statutActuel,
  transitionsPossibles,
}: {
  commandeId: string;
  statutActuel: StatutCommande;
  transitionsPossibles: StatutCommande[];
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  function soumettre(nouveauStatut: StatutCommande) {
    const formulaire = new FormData();
    formulaire.set("commandeId", commandeId);
    formulaire.set("nouveauStatut", nouveauStatut);

    demarrer(async () => {
      const resultat = await changerStatut(formulaire);

      /*
       * CHAQUE ISSUE A SON MESSAGE, et aucune n'est laissee sans retour :
       * `frontend-design.md` interdit le faux succes optimiste, une erreur
       * serveur devant produire un message visible associe a l'action.
       */
      switch (resultat.statut) {
        case "SUCCES":
          setMessage({
            texte: `Commande ${LIBELLES_STATUT[resultat.nouveauStatut].toLowerCase()}.`,
            erreur: false,
          });
          break;
        case "TRANSITION_REFUSEE":
          /*
           * L'ETAT REEL EST DIT, et c'est utile : entre l'affichage et le clic,
           * un webhook ou une tache a pu faire avancer la commande, et un refus
           * opaque laisserait croire a une panne.
           */
          setMessage({
            texte: `Action impossible, la commande est « ${LIBELLES_STATUT[resultat.statutActuel]} ». Rafraîchir la page.`,
            erreur: true,
          });
          break;
        case "SESSION_ABSENTE":
          setMessage({
            texte: "Session expirée. Se reconnecter pour continuer.",
            erreur: true,
          });
          break;
        case "INTROUVABLE":
          setMessage({ texte: "Cette commande n'existe plus.", erreur: true });
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
    <div>
      {transitionsPossibles.length === 0 ? (
        /*
         * AUCUNE TRANSITION N'EST UN ETAT NORMAL, et le dire evite de laisser
         * croire a un écran cassé. `LIVREE` n'est jamais atteignable d'un clic,
         * `payments.md` : la date de livraison fait courir le délai de
         * rétractation et ne se suppose pas.
         */
        <p className={styles.aucuneTransition}>
          {`Aucune action disponible depuis l'état « ${LIBELLES_STATUT[statutActuel]} ».`}
        </p>
      ) : (
        <div className={styles.transitions}>
          {transitionsPossibles.map((cible) => (
            <button
              key={cible}
              type="button"
              className={`${styles.bouton} ${cible === "ANNULEE" ? styles.boutonAnnuler : ""}`}
              disabled={enCours}
              /*
               * LE MESSAGE EST RATTACHE AU BOUTON, correction du 27 aout 2026 :
               * l'annonce polie passe une fois, mais un lecteur d'ecran qui
               * revient ensuite sur le bouton ne retrouvait aucune trace du
               * refus. `frontend-design.md` demande l'erreur associee a son
               * controle, et un frere dans le DOM ne l'associe pas.
               */
              aria-describedby="message-transition"
              onClick={() => {
                soumettre(cible);
              }}
            >
              {VERBES[cible] ?? LIBELLES_STATUT[cible]}
            </button>
          ))}
        </div>
      )}

      {/*
       * LA REGION EST TOUJOURS PRESENTE, meme vide, et c'est ce qui la rend
       * annoncable : une region live inseree en meme temps que son contenu
       * n'est pas lue par les lecteurs d'ecran.
       *
       * `role="status"` PORTE DEJA `aria-live="polite"` : le second etait
       * redondant et a ete retire. `polite` est le bon niveau, le resultat
       * n'interrompant pas une tache en cours.
       */}
      <p
        id="message-transition"
        className={`${styles.message} ${message?.erreur === true ? styles.messageErreur : ""}`}
        role="status"
      >
        {enCours ? "Enregistrement en cours…" : (message?.texte ?? "")}
      </p>
    </div>
  );
}
