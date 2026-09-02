"use client";

/**
 * Formulaire de creation de compte client, LS-54.
 *
 * COMPOSANT CLIENT PAR NECESSITE : `signUp.email` pose le cookie de session
 * cote navigateur. Meme partage que l'ecran de connexion de l'administration,
 * LS-70, et le motif n'est pas negociable ici : une Server Action ne peut pas
 * poser ce cookie a la place de Better Auth.
 *
 * CE COMPOSANT N'ACCORDE AUCUN DROIT. Une inscription reussie pose un cookie ;
 * c'est le serveur qui, a la page suivante, verifie la session et le role.
 * Invariant 2.
 *
 * LE ROLE N'EST PAS ENVOYE, et ne doit jamais l'etre. `role` porte
 * `input: false` cote serveur, regle E11, mais la vraie raison de ne pas
 * l'ecrire ici est plus simple : un champ absent ne peut pas etre force. Le
 * test negatif du critere 5 verifie l'autre bout, celui qui compte.
 */
import { useState } from "react";

import { signUp } from "@/lib/auth-client";
// Depuis `lib/mot-de-passe` et NON `lib/auth` : ce dernier tire Prisma,
// l'adaptateur PostgreSQL et BETTER_AUTH_SECRET, qui n'ont rien a faire dans
// un paquet servi au navigateur.
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/lib/mot-de-passe";

import styles from "../authentification.module.css";

/** Ou l'on arrive une fois inscrit. Chemin relatif, jamais une URL fournie. */
const DESTINATION_APRES_INSCRIPTION = "/compte/verification";

type EtatSoumission = "repos" | "en-cours" | "erreur";

export function FormulaireInscription() {
  const [etat, setEtat] = useState<EtatSoumission>("repos");
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");

  const inscrire = async (evenement: React.FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    setEtat("en-cours");
    setMessageErreur(null);

    const { error } = await signUp.email({
      email,
      password: motDePasse,
      name: nom,
    });

    if (error) {
      setEtat("erreur");

      /*
       * TROIS CAS DISTINGUES, ET C'EST DELIBERE A L'INSCRIPTION.
       *
       * L'ecran de CONNEXION confond volontairement toutes les causes, pour ne
       * pas confirmer l'existence d'un compte. Ici la contrainte s'inverse :
       * un formulaire d'inscription qui refuse sans dire pourquoi laisse la
       * personne retaper la meme chose indefiniment.
       *
       * L'ENUMERATION RESTE FERMEE PAR AILLEURS : le message d'adresse deja
       * utilisee ne dit rien de plus que ce qu'une tentative d'inscription
       * revele par nature, et la limitation de debit d'ADR-027 borne le volume
       * a trois par minute et par adresse IP, ce qui rend le balayage
       * inexploitable.
       */
      if (error.status === 429) {
        setMessageErreur(
          "Trop de tentatives depuis cet appareil. Patientez une minute avant de réessayer.",
        );
        return;
      }

      if (error.code === "USER_ALREADY_EXISTS") {
        setMessageErreur(
          "Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez le lien de mot de passe oublié.",
        );
        return;
      }

      setMessageErreur(
        "La création du compte a échoué. Vérifiez vos informations et réessayez.",
      );
      return;
    }

    window.location.href = DESTINATION_APRES_INSCRIPTION;
  };

  const enCours = etat === "en-cours";

  return (
    <form className={styles.formulaire} onSubmit={inscrire}>
      <div className={styles.champ}>
        <label htmlFor="nom">Nom</label>
        <input
          id="nom"
          name="nom"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          disabled={enCours}
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="email">Adresse email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
          disabled={enCours}
          aria-describedby="aide-email"
        />
        <p id="aide-email" className={styles.aideChamp}>
          Elle sert à vous envoyer vos confirmations de commande et vos
          factures.
        </p>
      </div>

      <div className={styles.champ}>
        <label htmlFor="mot-de-passe">Mot de passe</label>
        <input
          id="mot-de-passe"
          name="mot-de-passe"
          type="password"
          autoComplete="new-password"
          required
          // Le serveur reste l'autorite sur cette longueur : cet attribut evite
          // un aller-retour reseau inutile, il ne garantit rien.
          minLength={LONGUEUR_MINIMALE_MOT_DE_PASSE}
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
          disabled={enCours}
          aria-describedby="aide-mot-de-passe"
        />
        {/*
         * LA CONSIGNE EST AFFICHEE AVANT LA SAISIE, jamais seulement en erreur.
         * Seize caracteres surprennent, ADR-023 : decouvrir la regle au refus
         * est ce qui fait abandonner ou choisir une suite triviale.
         */}
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
        {enCours ? "Création en cours…" : "Créer mon compte"}
      </button>

      {/*
       * `role="alert"` et non une simple couleur : l'erreur doit parvenir au
       * lecteur d'ecran, et jamais etre portee par la couleur seule.
       */}
      {messageErreur && (
        <p className={styles.erreur} role="alert">
          {messageErreur}
        </p>
      )}
    </form>
  );
}
