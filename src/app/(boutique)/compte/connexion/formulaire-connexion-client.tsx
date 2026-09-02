"use client";

/**
 * Formulaire de connexion d'un client, LS-54.
 *
 * COMPOSANT CLIENT PAR NECESSITE : `signIn.email` pose le cookie de session
 * cote navigateur.
 *
 * PAS DE PASSKEY ICI, a la difference de l'ecran d'administration. ADR-023
 * tranche l'authentification des clients par email et mot de passe seuls. En
 * ajouter une ouvrirait un moyen d'authentification que ni le modele ni les
 * parcours ne prevoient, donc hors perimetre sans arbitrage.
 */
import { useState } from "react";
import Link from "next/link";

import { signIn } from "@/lib/auth-client";
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/lib/mot-de-passe";

import styles from "../authentification.module.css";

/** Ou l'on arrive une fois connecte. Chemin relatif, jamais une URL fournie. */
const DESTINATION_APRES_CONNEXION = "/compte";

type EtatSoumission = "repos" | "en-cours" | "erreur";

export function FormulaireConnexionClient() {
  const [etat, setEtat] = useState<EtatSoumission>("repos");
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");

  const connecter = async (evenement: React.FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    setEtat("en-cours");
    setMessageErreur(null);

    const { error } = await signIn.email({ email, password: motDePasse });

    if (error) {
      setEtat("erreur");

      /*
       * LE PLAFOND SE DISTINGUE, LE RESTE NON.
       *
       * Un message unique pour toutes les causes d'echec, comme sur l'ecran
       * d'administration : distinguer « compte inconnu » de « mot de passe
       * incorrect » ferait de ce formulaire un outil d'enumeration des clients
       * de la boutique.
       *
       * Le 429 fait exception parce qu'il ne dit RIEN du compte vise, seulement
       * de l'appareil qui insiste, et parce que le confondre avec un echec
       * d'identifiants ferait retaper un mot de passe pourtant juste.
       */
      if (error.status === 429) {
        setMessageErreur(
          "Trop de tentatives depuis cet appareil. Patientez une minute avant de réessayer.",
        );
        return;
      }

      setMessageErreur(
        "La connexion a échoué. Vérifiez vos identifiants et réessayez.",
      );
      return;
    }

    window.location.href = DESTINATION_APRES_CONNEXION;
  };

  const enCours = etat === "en-cours";

  return (
    <form className={styles.formulaire} onSubmit={connecter}>
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
          minLength={LONGUEUR_MINIMALE_MOT_DE_PASSE}
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
        {enCours ? "Connexion en cours…" : "Se connecter"}
      </button>

      {messageErreur && (
        <p className={styles.erreur} role="alert">
          {messageErreur}
        </p>
      )}

      {/*
       * LE LIEN VIT SOUS LE FORMULAIRE ET NON DANS LE MESSAGE D'ERREUR. Le
       * proposer seulement apres un echec le rend introuvable a qui sait deja
       * avoir oublie son mot de passe, et l'afficher dans l'erreur suggererait
       * que la cause est connue, ce que le message unique refuse justement de
       * dire. L'ecran cible est livre par LS-55.
       */}
      <p className={styles.aide}>
        <Link href="/compte/mot-de-passe-oublie" className={styles.lien}>
          Mot de passe oublié ?
        </Link>
      </p>
    </form>
  );
}
