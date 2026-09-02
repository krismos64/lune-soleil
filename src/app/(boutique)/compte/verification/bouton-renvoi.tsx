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

  if (etat === "envoye") {
    return (
      // `role="status"` et non `alert` : c'est une confirmation attendue, pas
      // une alerte. Le lecteur d'ecran l'annonce sans interrompre.
      <p className={styles.confirmation} role="status">
        Un nouveau message vient de partir. Il peut mettre quelques minutes à
        arriver.
      </p>
    );
  }

  return (
    <button
      type="button"
      className={styles.actionSecondaire}
      onClick={renvoyer}
      disabled={etat === "en-cours"}
    >
      {etat === "en-cours" ? "Envoi en cours…" : "Recevoir un nouveau lien"}
    </button>
  );
}
