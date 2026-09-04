"use client";

/**
 * Deconnexion de l'administration, LS-181.
 *
 * ELLE N'EXISTAIT PAS. L'administration n'a jamais eu de moyen de se
 * deconnecter depuis LS-70 : il fallait vider les cookies du navigateur. Sur
 * un stand, l'exploitante ferme la boutique et laisse une session ouverte sur
 * un telephone qu'elle range dans un sac.
 *
 * CHEMIN CLIENT ET NON SERVER ACTION, meme raison que `changePassword` en
 * LS-60, verifiee via Context7 sur Next.js 16 : `signOut` supprime la session
 * et retire le cookie. Poser cette suppression depuis une Server Action
 * declenche un re-rendu SERVEUR qui s'execute avec l'ancien cookie encore
 * present, et l'ordre des deux effets n'est pas garanti. Le chemin client passe
 * par une reponse HTTP ordinaire, celui que la bibliotheque prevoit.
 *
 * `router.push` PUIS `router.refresh`, ET LES DEUX SONT NECESSAIRES. La
 * navigation seule laisserait le cache de routeur de Next.js servir une page
 * rendue AVEC la session : le rafraichissement force la relecture cote serveur,
 * donc la redirection vers la connexion si la page est protegee.
 *
 * CE BOUTON N'EST PAS UNE PROTECTION et ne tient pas lieu de garde. Les pages
 * appellent `exigerAdministratrice` et les Server Actions portent la meme
 * garde : ne pas afficher un bouton n'a jamais empeche personne d'appeler une
 * action, motif de LS-89.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/lib/auth-client";

import styles from "./bouton-deconnexion.module.css";

export function BoutonDeconnexion() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function deconnecter() {
    setEnCours(true);
    setErreur(null);

    try {
      await signOut();
      router.push("/administration/connexion");
      router.refresh();
    } catch {
      /*
       * L'ETAT D'ECHEC EST VISIBLE, jamais avale. Une deconnexion qui echoue en
       * silence laisse croire que la session est fermee alors qu'elle est
       * ouverte, ce qui est le pire des deux mondes sur un appareil partage.
       *
       * `frontend-design.md` : jamais de faux succes optimiste, une erreur
       * serveur produit un message visible associe a l'action.
       */
      setErreur("La déconnexion a échoué. Réessayez.");
      setEnCours(false);
    }
  }

  return (
    <span className={styles.bloc}>
      <button
        type="button"
        className={styles.bouton}
        onClick={deconnecter}
        disabled={enCours}
      >
        {enCours ? "Déconnexion…" : "Se déconnecter"}
      </button>

      {/*
       * `role="alert"` PORTE L'ANNONCE. Le message apparait apres coup, donc
       * un lecteur d'ecran ne le lirait pas sans region live. Il n'est rendu
       * que s'il existe : une region vide permanente ajoute une region muette
       * a la page, motif « role alert ambigu ».
       */}
      {erreur ? (
        <span className={styles.erreur} role="alert">
          {erreur}
        </span>
      ) : null}
    </span>
  );
}
