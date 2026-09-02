"use client";

/**
 * Fermeture de session depuis l'espace client, LS-54.
 *
 * CE BOUTON MANQUAIT ENTIEREMENT. `signOut` etait exporte par
 * `lib/auth-client.ts` depuis LS-70 sans qu'aucun code ne l'appelle : un client
 * connecte sur un appareil partage n'avait aucun moyen de fermer sa session,
 * sinon supprimer son compte. Une fonction exportee sans appelant se relit comme
 * une fonctionnalite livree, motif deja en fiche.
 *
 * COMPOSANT CLIENT PAR NECESSITE : `signOut` efface le cookie cote navigateur.
 *
 * LA REDIRECTION EST UN RECHARGEMENT COMPLET, `window.location` et non le
 * routeur : le cache de route de Next.js conserverait l'en-tete rendu avec
 * « Mon compte » pour une session qui n'existe plus. Meme motif que l'ecran de
 * changement de mot de passe.
 */
import { useState } from "react";

import { signOut } from "@/lib/auth-client";

import styles from "./compte.module.css";

export function BoutonDeconnexion() {
  const [enCours, setEnCours] = useState(false);

  const deconnecter = async () => {
    setEnCours(true);

    /*
     * L'ECHEC MENE AU MEME ENDROIT QUE LE SUCCES, et ce n'est pas de la
     * negligence. Si l'appel echoue, le cookie peut malgre tout avoir ete
     * invalide cote serveur : laisser la personne sur un ecran qui affiche son
     * adresse email serait pire que de la renvoyer a l'accueil. La page
     * suivante revérifie la session de toute facon.
     */
    await signOut().catch(() => undefined);

    window.location.href = "/";
  };

  return (
    <button
      type="button"
      className={styles.actionSecondaire}
      onClick={deconnecter}
      disabled={enCours}
    >
      {enCours ? "Déconnexion en cours…" : "Se déconnecter"}
    </button>
  );
}
