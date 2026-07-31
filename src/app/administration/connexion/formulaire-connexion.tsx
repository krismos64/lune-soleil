"use client";

/**
 * Formulaire de connexion de l'administration, LS-70.
 *
 * COMPOSANT CLIENT PAR NECESSITE, pas par confort : la passkey passe par
 * l'API WebAuthn du navigateur, `navigator.credentials`, qui n'existe pas cote
 * serveur.
 *
 * ORDRE DES DEUX METHODES. La passkey est en premier et le mot de passe est
 * replie derriere un bouton, ce qui traduit ADR-021 dans l'interface : la
 * passkey est le chemin nominal, le mot de passe est le SECOURS pour l'appareil
 * tiers. Presenter les deux a egalite pousserait vers la methode la plus faible.
 *
 * CE QUE CE COMPOSANT NE DECIDE PAS. Il n'accorde aucun acces. Une connexion
 * reussie ne fait que poser un cookie de session ; c'est le serveur qui, a la
 * page suivante, verifie la session et le role. Invariant 2.
 */
import { useState } from "react";

import { signIn } from "@/lib/auth-client";
// Depuis `lib/mot-de-passe` et NON `lib/auth` : ce dernier tire Prisma,
// l'adaptateur PostgreSQL et BETTER_AUTH_SECRET, qui n'ont rien a faire dans
// un paquet servi au navigateur.
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/lib/mot-de-passe";

import styles from "./formulaire-connexion.module.css";

/** Ou l'on arrive une fois connecte. Chemin relatif, jamais une URL fournie. */
const DESTINATION_APRES_CONNEXION = "/administration";

type EtatSoumission = "repos" | "en-cours" | "erreur";

export function FormulaireConnexion() {
  const [etat, setEtat] = useState<EtatSoumission>("repos");
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");

  /**
   * UN SEUL MESSAGE D'ECHEC pour toutes les causes, et c'est deliberé.
   *
   * Distinguer « compte inconnu » de « mot de passe incorrect » confirmerait a
   * un attaquant l'existence de l'adresse de l'exploitante, seul compte
   * d'administration du site. Le message reste donc identique quelle que soit
   * la cause reelle, y compris l'absence de passkey enregistree.
   */
  const signalerEchec = () => {
    setEtat("erreur");
    setMessageErreur(
      "La connexion a échoué. Vérifiez vos identifiants et réessayez.",
    );
  };

  const connecterParPasskey = async () => {
    setEtat("en-cours");
    setMessageErreur(null);

    const resultat = await signIn.passkey();

    if (resultat?.error) {
      signalerEchec();
      return;
    }

    window.location.href = DESTINATION_APRES_CONNEXION;
  };

  const connecterParMotDePasse = async (
    evenement: React.FormEvent<HTMLFormElement>,
  ) => {
    evenement.preventDefault();
    setEtat("en-cours");
    setMessageErreur(null);

    const { error } = await signIn.email({ email, password: motDePasse });

    if (error) {
      signalerEchec();
      return;
    }

    window.location.href = DESTINATION_APRES_CONNEXION;
  };

  const enCours = etat === "en-cours";

  return (
    <div className={styles.conteneur}>
      <button
        type="button"
        className={styles.actionPrincipale}
        onClick={connecterParPasskey}
        disabled={enCours}
      >
        {enCours ? "Connexion en cours…" : "Se connecter avec une passkey"}
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
        <form className={styles.formulaire} onSubmit={connecterParMotDePasse}>
          <div className={styles.champ}>
            <label htmlFor="email">Adresse email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(evenement) => setEmail(evenement.target.value)}
              disabled={enCours}
            />
          </div>

          <div className={styles.champ}>
            <label htmlFor="mot-de-passe">Mot de passe</label>
            <input
              id="mot-de-passe"
              name="mot-de-passe"
              type="password"
              autoComplete="current-password"
              required
              // Le serveur reste l'autorite sur cette longueur : cet attribut
              // evite un aller-retour reseau inutile, il ne garantit rien.
              minLength={LONGUEUR_MINIMALE_MOT_DE_PASSE}
              value={motDePasse}
              onChange={(evenement) => setMotDePasse(evenement.target.value)}
              disabled={enCours}
              aria-describedby="aide-mot-de-passe"
            />
            <p id="aide-mot-de-passe" className={styles.aideChamp}>
              {LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères minimum.
            </p>
          </div>

          <button
            type="submit"
            className={styles.actionPrincipale}
            disabled={enCours}
          >
            {enCours ? "Connexion en cours…" : "Se connecter"}
          </button>
        </form>
      )}

      {/*
       * `role="alert"` et non une simple couleur : l'erreur doit parvenir au
       * lecteur d'ecran, et jamais etre portee par la couleur seule.
       */}
      {messageErreur && (
        <p className={styles.erreur} role="alert">
          {messageErreur}
        </p>
      )}
    </div>
  );
}
