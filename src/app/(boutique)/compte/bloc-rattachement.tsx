"use client";

/**
 * Proposition de rattachement des commandes invitees. LS-56, parcours 6.
 *
 * COMPOSANT CLIENT PAR NECESSITE : le resultat s'affiche sans rechargement, et
 * l'annonce au lecteur d'ecran demande un etat local.
 *
 * IL NE DECIDE RIEN ET NE TRANSMET AUCUN IDENTIFIANT. La Server Action qu'il
 * appelle ne prend aucun parametre : ce qui est rattache se calcule cote
 * serveur depuis la session. Ce composant ne fait que declencher et rendre
 * compte, ce qui ferme le chemin que le parcours 6 nomme « tentative de
 * rattachement par identifiant fourni ».
 *
 * LA REGION LIVE PREEXISTE AU TEXTE, lecon de la revue frontend de LS-54 :
 * inserer le noeud en meme temps que son contenu ne declenche AUCUNE annonce,
 * l'observateur n'ayant rien a observer. Le paragraphe est donc toujours dans
 * le DOM, vide au repos, et `:empty` retire sa boite sans retirer le noeud.
 */
import { useState } from "react";

import { rattacherCommandesAction } from "./actions";
import styles from "./compte.module.css";

type Etat = "repos" | "en-cours" | "fait" | "erreur";

export function BlocRattachement({
  nombreEligibles,
}: {
  nombreEligibles: number;
}) {
  const [etat, setEtat] = useState<Etat>("repos");
  const [message, setMessage] = useState("");

  const enCours = etat === "en-cours";

  const rattacher = async () => {
    setEtat("en-cours");
    setMessage("");

    const resultat = await rattacherCommandesAction();

    switch (resultat.statut) {
      case "RATTACHEES":
        setEtat("fait");
        /*
         * LE PLURIEL EST ACCORDE, ET LE CAS ZERO EST DISTINCT. Zero n'est pas
         * une erreur : entre l'affichage de la page et le clic, un autre onglet
         * a pu rattacher les memes commandes. Dire « aucune commande » est plus
         * juste qu'un faux succes chiffre.
         */
        setMessage(
          resultat.nombre === 0
            ? "Aucune commande à rattacher pour le moment."
            : resultat.nombre === 1
              ? "Une commande a été rattachée à votre compte."
              : `${resultat.nombre} commandes ont été rattachées à votre compte.`,
        );
        break;

      case "ADRESSE_NON_VERIFIEE":
        setEtat("erreur");
        setMessage(
          "Confirmez d'abord votre adresse email pour rattacher vos commandes.",
        );
        break;

      case "SESSION_ABSENTE":
        setEtat("erreur");
        setMessage("Votre session a expiré. Reconnectez-vous pour continuer.");
        break;

      case "INDISPONIBLE":
        setEtat("erreur");
        setMessage(
          "Le rattachement est momentanément indisponible. Réessayez dans quelques instants.",
        );
        break;
    }
  };

  return (
    <div>
      <p className={styles.texte}>
        {nombreEligibles === 1
          ? "Une commande a été passée avec votre adresse email sans être connecté."
          : `${nombreEligibles} commandes ont été passées avec votre adresse email sans être connecté.`}{" "}
        Rattachez-{nombreEligibles === 1 ? "la" : "les"} à votre compte pour
        retrouver {nombreEligibles === 1 ? "son" : "leur"} suivi et{" "}
        {nombreEligibles === 1 ? "sa facture" : "leurs factures"}.
      </p>

      {/*
       * LE BOUTON RESTE ACTIONNABLE APRES UN SUCCES, jamais un etat terminal :
       * defaut trouve par la revue frontend de LS-54 sur le renvoi de lien. Ici
       * une commande peut arriver entre deux clics, et l'action est idempotente.
       */}
      <button
        type="button"
        className={styles.bouton}
        onClick={rattacher}
        disabled={enCours}
      >
        {enCours ? "Rattachement en cours…" : "Rattacher mes commandes"}
      </button>

      <p
        className={styles.annonce}
        role="status"
        data-etat={etat === "erreur" ? "erreur" : undefined}
      >
        {message}
      </p>
    </div>
  );
}
