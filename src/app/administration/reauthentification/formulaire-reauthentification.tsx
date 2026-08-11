"use client";

/**
 * Formulaire de reauthentification, LS-89.
 *
 * COMPOSANT CLIENT PAR NECESSITE : la passkey passe par `navigator.credentials`,
 * l'API WebAuthn du navigateur, qui n'existe pas cote serveur.
 *
 * ORDRE DES DEUX METHODES, repris de l'ecran de connexion et pour la meme
 * raison, ADR-021 : la passkey est le chemin nominal, le mot de passe le
 * SECOURS. Les presenter a egalite pousserait vers la methode la plus faible.
 * Avec une passkey, une reauthentification coute un contact du doigt, ce qui
 * est precisement ce qui rend la mesure acceptable au quotidien.
 *
 * CE COMPOSANT N'ACCORDE RIEN. Il declenche une verification serveur et affiche
 * son resultat. La preuve est notee en base par le service, et c'est l'action
 * sensible qui verifiera sa fraicheur au moment de s'executer. Invariant 2.
 */
import { useState } from "react";

import { signIn } from "@/lib/auth-client";

import {
  etablirPreuveParMotDePasse,
  etablirPreuveParPasskey,
  type ResultatReauthentification,
} from "./actions";
import styles from "./reauthentification.module.css";

type EtatSoumission = "repos" | "en-cours" | "erreur" | "etablie";

export function FormulaireReauthentification({ email }: { email: string }) {
  const [etat, setEtat] = useState<EtatSoumission>("repos");
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [motDePasse, setMotDePasse] = useState("");

  /**
   * TRADUCTION DES RESULTATS, et deux d'entre eux ne sont pas des echecs de
   * saisie.
   *
   * `SESSION_ABSENTE` renvoie a la connexion : insister sur ce formulaire
   * n'aboutirait jamais. `INDISPONIBLE` est une panne, et le dire evite que
   * l'exploitante ressaisisse un mot de passe correct en boucle en croyant
   * s'etre trompee.
   */
  const traiter = (resultat: ResultatReauthentification) => {
    switch (resultat.statut) {
      case "ETABLIE":
        setEtat("etablie");
        setMessageErreur(null);
        return;

      case "SESSION_ABSENTE":
        window.location.href = "/administration/connexion";
        return;

      case "INDISPONIBLE":
        setEtat("erreur");
        setMessageErreur(
          "La vérification est momentanément indisponible. Réessayez dans un instant.",
        );
        return;

      default:
        /**
         * UN SEUL MESSAGE pour `REFUSEE` et `INVALIDE`. Distinguer « mot de
         * passe vide » de « mot de passe faux » n'aiderait personne et
         * renseignerait sur ce que le serveur accepte.
         */
        setEtat("erreur");
        setMessageErreur(
          "La vérification a échoué. Vérifiez votre saisie et réessayez.",
        );
    }
  };

  const prouverParPasskey = async () => {
    setEtat("en-cours");
    setMessageErreur(null);

    /**
     * LA NEGOCIATION WEBAUTHN CREE UNE SESSION NEUVE, c'est le fonctionnement
     * du plugin : le serveur ne peut pas la rejouer, il constate qu'elle vient
     * d'etre creee. `etablirPreuveParPasskey` refuse une session qui n'est pas
     * fraiche, ce qui empeche d'appeler ce chemin depuis une session ancienne
     * pour se declarer reauthentifie sans rien prouver.
     */
    const resultat = await signIn.passkey();

    if (resultat?.error) {
      setEtat("erreur");
      setMessageErreur(
        "La vérification a échoué. Vérifiez votre saisie et réessayez.",
      );
      return;
    }

    traiter(await etablirPreuveParPasskey());
  };

  const prouverParMotDePasse = async (
    evenement: React.FormEvent<HTMLFormElement>,
  ) => {
    evenement.preventDefault();
    setEtat("en-cours");
    setMessageErreur(null);

    const resultat = await etablirPreuveParMotDePasse(motDePasse);

    // Le champ est vide quoi qu'il arrive : un mot de passe qui reste dans le
    // DOM apres usage traine dans la page, y compris apres un retour arriere.
    setMotDePasse("");

    traiter(resultat);
  };

  const enCours = etat === "en-cours";

  if (etat === "etablie") {
    return (
      <div className={styles.conteneur}>
        <p className={styles.succes} role="status">
          Identité confirmée. Vous pouvez poursuivre votre action.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.conteneur}>
      <p className={styles.compte}>
        Connecté en tant que <strong>{email}</strong>
      </p>

      <button
        type="button"
        className={styles.actionPrincipale}
        onClick={prouverParPasskey}
        disabled={enCours}
      >
        {enCours ? "Vérification en cours…" : "Confirmer avec une passkey"}
      </button>

      <p className={styles.aide}>
        Touch ID, Face ID ou le code de votre appareil.
      </p>

      {!motDePasseVisible && (
        <button
          type="button"
          className={styles.actionSecondaire}
          onClick={() => setMotDePasseVisible(true)}
          disabled={enCours}
        >
          Utiliser le mot de passe de secours
        </button>
      )}

      {motDePasseVisible && (
        <form className={styles.formulaire} onSubmit={prouverParMotDePasse}>
          <div className={styles.champ}>
            <label htmlFor="mot-de-passe">Mot de passe</label>
            <input
              id="mot-de-passe"
              name="mot-de-passe"
              type="password"
              /**
               * `current-password` et non `new-password` : le gestionnaire de
               * mots de passe doit proposer celui du compte, pas en engendrer
               * un nouveau.
               */
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(evenement) => setMotDePasse(evenement.target.value)}
              disabled={enCours}
            />
          </div>

          <button
            type="submit"
            className={styles.actionPrincipale}
            disabled={enCours}
          >
            {enCours ? "Vérification en cours…" : "Confirmer"}
          </button>
        </form>
      )}

      {messageErreur && (
        /**
         * `role="alert"` et non un simple paragraphe : un lecteur d'ecran doit
         * annoncer l'echec sans que la personne ait a rechercher le message.
         */
        <p className={styles.erreur} role="alert">
          {messageErreur}
        </p>
      )}
    </div>
  );
}
