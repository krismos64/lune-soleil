"use client";

/**
 * Renvoi du lien de verification, LS-54.
 *
 * COMPOSANT CLIENT PAR NECESSITE : `authClient.sendVerificationEmail` est la
 * seule API qui declenche ce renvoi, verifie via Context7 sur Better Auth
 * 1.6.23. Elle prend l'adresse et une URL de retour.
 *
 * L'ADRESSE N'EST PAS UN CHAMP DE SAISIE, et c'est le point de securite de ce
 * composant. Elle est relue de la SESSION cote serveur et passee en propriete :
 * un champ libre ferait de ce bouton un moyen d'envoyer un message a n'importe
 * quelle adresse depuis le domaine de la boutique, donc un relais de courrier
 * indesirable signe par notre SPF. Invariant 2, l'identite vient de la session.
 *
 * LE RESULTAT EST TOUJOURS LE MEME A L'ECRAN, succes comme echec cote serveur.
 * Better Auth ne dit pas si l'adresse existe, et cet ecran n'a de toute facon
 * qu'une seule reponse utile a donner : « regardez votre boite ».
 */
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import styles from "../authentification.module.css";

/**
 * Ou le lien du message ramene apres confirmation.
 *
 * CHEMIN RELATIF ET FIXE. Better Auth le transmet au navigateur du client :
 * accepter une valeur fournie ferait de l'email de verification un vecteur de
 * redirection vers un domaine tiers, depuis un message qui inspire confiance.
 */
const RETOUR_APRES_VERIFICATION = "/compte?verifie=1";

type EtatEnvoi = "repos" | "en-cours" | "envoye";

export function BoutonRenvoiVerification({
  /**
   * L'adresse de la session, relue par la page serveur.
   *
   * PROPRIETE ET NON ETAT LOCAL : elle traverse le rendu serveur, donc elle
   * n'est jamais choisie par le navigateur. Un `useState` alimente par une
   * saisie rouvrirait exactement le relais que ce composant ferme.
   */
  adresse,
}: Readonly<{ adresse: string }>) {
  const [etat, setEtat] = useState<EtatEnvoi>("repos");

  const renvoyer = async () => {
    setEtat("en-cours");

    /*
     * L'ECHEC N'EST PAS DISTINGUE DU SUCCES A L'ECRAN, mais il n'est pas tu
     * pour autant : l'envoi laisse une trace en base, LS-82, ou l'exploitante
     * peut constater qu'un message n'est jamais parti. Afficher ici « l'envoi a
     * echoue » ferait recliquer sans effet, et consommerait le quota SMTP.
     */
    await authClient
      .sendVerificationEmail({
        // Better Auth exige l'adresse. Elle vient de la session, relue par la
        // page serveur, jamais d'une saisie.
        email: adresse,
        callbackURL: RETOUR_APRES_VERIFICATION,
      })
      .catch(() => undefined);

    setEtat("envoye");
  };

  return (
    <div>
      {/*
       * LE BOUTON RESTE MONTE APRES L'ENVOI, il n'est pas remplace.
       *
       * Deux defauts en un dans la premiere version : le bouton disparaissait,
       * donc le focus clavier retombait sur `body` et la tabulation suivante
       * repartait du haut de la page ; et l'etat « envoye » etait TERMINAL,
       * alors que le scenario meme de cet ecran est « le message n'arrive
       * pas ». Redemander exigeait de recharger la page.
       */}
      <button
        type="button"
        className={styles.actionSecondaire}
        onClick={renvoyer}
        disabled={etat === "en-cours"}
      >
        {etat === "en-cours"
          ? "Envoi en cours…"
          : etat === "envoye"
            ? "Recevoir un autre lien"
            : "Recevoir un nouveau lien"}
      </button>

      {/*
       * LA REGION LIVE EST TOUJOURS DANS LE DOM, seul son contenu change.
       *
       * Une region inseree EN MEME TEMPS que son texte n'est pas annoncee par
       * plusieurs combinaisons de lecteurs d'ecran : le noeud doit preexister
       * pour que la mutation soit observee. axe-core ne mesure pas ce
       * comportement dynamique, il valide seulement que le role est bien forme,
       * ce qui explique qu'il ne signalait rien.
       */}
      <p className={styles.confirmation} role="status" aria-live="polite">
        {etat === "envoye"
          ? "Un nouveau message vient de partir. Il peut mettre quelques minutes à arriver."
          : ""}
      </p>
    </div>
  );
}
