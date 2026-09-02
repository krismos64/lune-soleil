"use client";

/**
 * Formulaire de reauthentification client, LS-164.
 *
 * COMPOSANT CLIENT PAR NECESSITE : la saisie demande un etat local, et le
 * resultat se traite sans quitter la page. Rien de ce qui decide n'est ici, la
 * Server Action verifie le mot de passe cote serveur, invariant 2.
 *
 * UN SEUL MOYEN, LE MOT DE PASSE, ADR-023. A la difference de l'ecran
 * d'administration, il n'y a ni bouton passkey ni « moyen de secours » : offrir
 * deux chemins vers la meme preuve n'aurait de sens que si le second etait au
 * moins aussi fort, ce qui n'est pas le cas sur un compte client.
 *
 * LA DESTINATION VIENT DU RENDU SERVEUR, jamais de l'URL telle quelle. La page
 * l'a resolue depuis une table de cles : ce composant reçoit un chemin deja
 * choisi par le code, ce qui ferme la redirection ouverte.
 */
import { useState } from "react";

import {
  etablirPreuveClientParMotDePasse,
  type ResultatReauthentificationClient,
} from "./actions";
import styles from "../authentification.module.css";

type EtatSoumission = "repos" | "en-cours" | "erreur" | "etablie";

export function FormulaireReauthentificationClient({
  email,
  destination,
}: Readonly<{ email: string; destination: string }>) {
  const [etat, setEtat] = useState<EtatSoumission>("repos");
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [motDePasse, setMotDePasse] = useState("");

  const soumettre = async (evenement: React.FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    setEtat("en-cours");
    setMessageErreur(null);

    let resultat: ResultatReauthentificationClient;

    try {
      resultat = await etablirPreuveClientParMotDePasse(motDePasse);
    } catch {
      /*
       * LE `catch` EST INDISPENSABLE, lecon de la revue frontend de LS-60 : une
       * Server Action qui echoue au TRANSPORT, coupure reseau ou onglet passe
       * hors ligne, rejette sans que l'adaptateur ait pu traduire quoi que ce
       * soit. Sans lui, la promesse reste pendante, `etat` demeure « en-cours »
       * et le bouton reste bloque a « Vérification en cours… » definitivement.
       */
      setEtat("erreur");
      setMessageErreur(
        "La vérification est momentanément indisponible. Réessayez dans un instant.",
      );
      return;
    }

    // Le champ est vide quoi qu'il arrive : un mot de passe qui reste dans le
    // DOM apres usage traine dans la page, y compris apres un retour arriere.
    setMotDePasse("");

    switch (resultat.statut) {
      case "ETABLIE":
        setEtat("etablie");
        setMessageErreur(null);
        /*
         * RETOUR AUTOMATIQUE VERS LE GESTE INTERROMPU, et c'est le critere 2 :
         * la confirmation n'a d'interet que si elle ramene la ou l'action
         * attend. Laisser la personne chercher son chemin apres avoir saisi son
         * mot de passe recree l'impasse que cette story corrige.
         *
         * `window.location.assign` ET NON `router.push` : la fraicheur de la
         * preuve vient d'etre ecrite en BASE, et les pages concernees sont en
         * `force-dynamic`. Une navigation cote client pourrait servir un rendu
         * deja en memoire, donc l'ecran d'avant la preuve. Une navigation
         * complete relit la session.
         */
        window.location.assign(destination);
        return;

      case "SESSION_ABSENTE":
        /*
         * VERS LA CONNEXION CLIENT, jamais vers l'administration. Insister sur
         * ce formulaire n'aboutirait jamais : sans session, il n'y a pas
         * d'identite a rafraichir.
         */
        window.location.href = "/compte/connexion";
        return;

      case "INDISPONIBLE":
        setEtat("erreur");
        setMessageErreur(
          "La vérification est momentanément indisponible. Réessayez dans un instant.",
        );
        return;

      case "TROP_DE_TENTATIVES":
        /**
         * UN MESSAGE A PART, LS-92, ET NON LE MESSAGE DE SAISIE. Ce cas serait
         * tombe dans le `default`, qui dit « vérifiez votre saisie » : qui tape
         * le BON mot de passe le ressaisirait en boucle sans comprendre, chaque
         * tentative repoussant d'ailleurs la fin de la fenetre.
         *
         * LE DELAI EST DIT, LE PLAFOND NON : un compteur affiche aiderait
         * surtout quelqu'un qui cherche a s'approcher du seuil sans le franchir.
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

  const enCours = etat === "en-cours";

  return (
    <div>
      <p className={styles.texte}>
        Connecté en tant que <strong>{email}</strong>
      </p>

      <form className={styles.formulaire} onSubmit={soumettre}>
        <div className={styles.champ}>
          <label htmlFor="mot-de-passe-reauthentification">Mot de passe</label>
          <input
            id="mot-de-passe-reauthentification"
            name="mot-de-passe-reauthentification"
            type="password"
            /**
             * `current-password` et non `new-password` : le gestionnaire de
             * mots de passe doit proposer celui du compte, pas en engendrer un
             * nouveau.
             */
            autoComplete="current-password"
            required
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
            disabled={enCours || etat === "etablie"}
          />
        </div>

        <button
          type="submit"
          className={styles.actionPrincipale}
          disabled={enCours || etat === "etablie"}
        >
          {enCours ? "Vérification en cours…" : "Confirmer mon identité"}
        </button>
      </form>

      {/*
       * LA REGION LIVE PREEXISTE A SON TEXTE, lecon de la revue frontend de
       * LS-54 : un nœud insere EN MEME TEMPS que son contenu n'est annonce par
       * aucun lecteur d'ecran, faute d'avoir ete observe avant la mutation.
       *
       * `role="alert"` PORTE LES DEUX CAS, echec comme succes : l'un et l'autre
       * doivent parvenir sans que la personne ait a rechercher le message. Le
       * succes est bref, la navigation suivant immediatement.
       */}
      <p
        className={styles.confirmation}
        role="alert"
        data-etat={etat === "erreur" ? "erreur" : undefined}
      >
        {etat === "etablie"
          ? "Identité confirmée. Retour en cours…"
          : (messageErreur ?? "")}
      </p>
    </div>
  );
}
