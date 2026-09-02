"use client";

/**
 * Saisie du nouveau mot de passe, LS-55.
 *
 * LE JETON ARRIVE EN PROPRIETE, jamais lu ici depuis l'URL. La page serveur
 * l'extrait et rend l'ecran d'erreur quand il manque : ce composant n'existe
 * que dans le cas ou un jeton est present.
 *
 * IL N'EST NI JOURNALISE NI AFFICHE, critere 6. Aucun `console.log`, aucun
 * champ cache visible dans un rendu, aucune trace en cas d'erreur : un jeton de
 * reinitialisation vaut un mot de passe tant qu'il n'est pas consomme.
 */
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/lib/mot-de-passe";

import styles from "../authentification.module.css";

type EtatSoumission = "repos" | "en-cours" | "change" | "erreur";

export function FormulaireNouveauMotDePasse({
  jeton,
}: Readonly<{ jeton: string }>) {
  const [etat, setEtat] = useState<EtatSoumission>("repos");
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [motDePasse, setMotDePasse] = useState("");

  const changer = async (evenement: React.FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    setEtat("en-cours");
    setMessageErreur(null);

    const { error } = await authClient.resetPassword({
      newPassword: motDePasse,
      token: jeton,
    });

    if (error) {
      setEtat("erreur");

      /*
       * DEUX CAS SEULEMENT, et le second couvre tout le reste. Le jeton
       * invalide merite son propre message parce que la suite a faire differe :
       * redemander un lien plutot que corriger sa saisie.
       */
      if (error.code === "INVALID_TOKEN" || error.status === 400) {
        setMessageErreur(
          "Ce lien n'est plus valable. Demandez-en un nouveau depuis la page « Mot de passe oublié ».",
        );
        return;
      }

      setMessageErreur(
        "Le changement a échoué. Vérifiez votre mot de passe et réessayez.",
      );
      return;
    }

    setEtat("change");
  };

  if (etat === "change") {
    return (
      <div>
        <p className={styles.confirmation} role="status">
          Votre mot de passe est changé.
        </p>

        {/*
         * LA DECONNEXION EST ANNONCEE PLUTOT QUE SUBIE. Toutes les sessions
         * tombent a la reinitialisation, y compris celles d'un autre appareil :
         * c'est voulu, un compte compromis se reprend ainsi. Ne pas le dire
         * ferait passer une protection pour un dysfonctionnement.
         */}
        <p className={styles.texte}>
          Par sécurité, toutes les sessions ouvertes sur vos appareils ont été
          fermées. Connectez-vous avec votre nouveau mot de passe.
        </p>

        {/*
         * `<a>` ET NON `<Link>`, seul endroit du parcours ou c'est vrai. Toutes
         * les sessions viennent d'etre supprimees cote serveur : une navigation
         * client conserverait le cache de route de Next.js, donc un en-tete
         * rendu avec « Mon compte » pour une session qui n'existe plus. Le
         * rechargement complet repart d'un etat serveur juste.
         */}
        <p className={styles.bascule}>
          <a href="/compte/connexion" className={styles.lien}>
            Se connecter
          </a>
        </p>
      </div>
    );
  }

  const enCours = etat === "en-cours";

  return (
    <form className={styles.formulaire} onSubmit={changer}>
      <div className={styles.champ}>
        <label htmlFor="mot-de-passe">Nouveau mot de passe</label>
        <input
          id="mot-de-passe"
          name="mot-de-passe"
          type="password"
          autoComplete="new-password"
          required
          minLength={LONGUEUR_MINIMALE_MOT_DE_PASSE}
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
          disabled={enCours}
          aria-describedby="aide-mot-de-passe"
        />
        <p id="aide-mot-de-passe" className={styles.aideChamp}>
          {LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères minimum. Une phrase dont
          vous vous souvenez vaut mieux qu&apos;un mot compliqué.
        </p>
      </div>

      <button
        type="submit"
        className={styles.actionPrincipale}
        disabled={enCours}
      >
        {enCours ? "Changement en cours…" : "Changer mon mot de passe"}
      </button>

      {messageErreur && (
        <p className={styles.erreur} role="alert">
          {messageErreur}
        </p>
      )}
    </form>
  );
}
