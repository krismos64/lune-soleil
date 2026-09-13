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

export function FormulaireReauthentification({
  email,
  destination,
}: {
  email: string;
  /**
   * Ou ramener apres une confirmation reussie, LS-227.
   *
   * ELLE ARRIVE RESOLUE PAR LA PAGE, jamais lue ici : la page la choisit dans
   * une table de cles, ce qui interdit qu'un chemin arbitraire atteigne ce
   * composant. Le typer `string` ne l'affaiblit pas, aucun appelant ne pouvant
   * le rendre depuis l'exterieur.
   */
  destination: string;
}) {
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
        /*
         * RETOUR AUTOMATIQUE VERS LE GESTE INTERROMPU, LS-227. Sans lui,
         * l'ecran annonçait « vous pouvez poursuivre votre action » et ne
         * ramenait NULLE PART : le 13 septembre 2026, une configuration
         * d'adresse d'alertes a ete perdue ainsi, l'exploitante concluant que
         * l'enregistrement ne marchait pas alors que sa preuve etait valide.
         *
         * `window.location.assign` ET NON `router.push` : la fraicheur de la
         * preuve vient d'etre ecrite en BASE, et les ecrans d'administration
         * sont en `force-dynamic`. Une navigation cote client pourrait servir
         * un rendu deja en memoire, donc l'ecran d'AVANT la preuve, et la garde
         * refuserait une seconde fois. Une navigation complete relit la
         * session. Meme choix que le formulaire client.
         */
        window.location.assign(destination);
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

      case "TROP_DE_TENTATIVES":
        /**
         * UN MESSAGE A PART, LS-92, ET NON LE MESSAGE DE SAISIE.
         *
         * Ce cas serait tombe dans le `default` ci-dessous, qui dit « vérifiez
         * votre saisie » : l'exploitante qui tape le BON mot de passe le
         * ressaisirait en boucle sans jamais comprendre, chaque tentative
         * repoussant d'ailleurs la fin de la fenetre.
         *
         * LE DELAI EST DIT, LE PLAFOND NON. « Patientez une minute » aide
         * l'exploitante ; « il vous restait deux tentatives » aiderait surtout
         * quelqu'un qui cherche a s'approcher du seuil sans le franchir.
         */
        setEtat("erreur");
        setMessageErreur(
          `Trop de tentatives. Patientez ${resultat.reessayerDansSecondes} secondes avant de réessayer.`,
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
        {/*
          LE MESSAGE ANNONCE LE RETOUR, il ne dit plus « poursuivre votre
          action » sans dire comment. Cette formulation a coute une
          configuration perdue le 13 septembre 2026 : elle se lit comme une fin
          de parcours alors qu'il en restait la moitie.

          IL RESTE AFFICHE PENDANT LA REDIRECTION, qui n'est pas instantanee :
          `window.location.assign` recharge une page `force-dynamic`. Un ecran
          muet pendant ce temps ferait cliquer une seconde fois.
        */}
        <p className={styles.succes} role="status">
          Identité confirmée. Retour à votre action en cours…
        </p>

        {/*
          LE LIEN DE SECOURS EXISTE POUR LE CAS OU LA REDIRECTION NE PART PAS,
          et ce n'est pas theorique : un navigateur peut la retenir, et sans lui
          l'ecran redeviendrait le cul-de-sac que cette story ferme. Il pointe la
          MEME destination, deja resolue par la page.

          `<a>` ET NON `Link`, seule exception assumee de cet ecran :
          @rechargement-delibere la preuve vient d'etre ecrite en base, et une
          navigation client servirait un rendu anterieur, donc l'ecran d'avant la
          preuve, dont la garde refuserait a nouveau.
        */}
        <p className={styles.aide}>
          <a href={destination}>Revenir maintenant</a>
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
